/**
 * Browser-compatible PrivacyCash Client
 *
 * Main entry point for shielding/unshielding SOL in the browser.
 * Uses Web Crypto API, localStorage, and SERVER-SIDE proof generation.
 *
 * IMPORTANT: Proof generation is done on the server because:
 * 1. @lightprotocol/hasher.rs produces different Poseidon hashes than circomlibjs
 * 2. The PrivacyCash circuit was built with hasher.rs
 * 3. hasher.rs has WASM bundling issues in Vite/browser environments
 */

import {
    Connection,
    PublicKey,
    LAMPORTS_PER_SOL,
    TransactionInstruction,
    SystemProgram,
    VersionedTransaction,
    TransactionMessage
} from '@solana/web3.js'
import BN from 'bn.js'
import {
    BrowserEncryptionService,
    hexToBytes,
    bytesToHex
} from './browser-encryption'
import {
    browserStorage,
    localstorageKey,
    LSK_ENCRYPTED_OUTPUTS,
    LSK_FETCH_OFFSET,
    getStorage,
} from './browser-storage'
import { BrowserUtxo, BrowserKeypair, type PoseidonHasher } from './browser-utxo'
import {
    SPECTRE_PROGRAM_ID,
    VAULT_SEED,
    USER_DEPOSIT_SEED,
    WITHDRAWAL_SEED,
    FUND_AGENT_IX_DISCRIMINATOR,
    INITIALIZE_IX_DISCRIMINATOR,
    REQUEST_WITHDRAWAL_IX_DISCRIMINATOR
} from '@/lib/config/constants'

// API URLs
// In production: use Vercel serverless proxy
// In development: use direct API (may need CORS proxy)
const RELAYER_API_URL =
    typeof window !== 'undefined' && window.location.hostname !== 'localhost'
        ? '/api/privacy' // Production: Vercel serverless proxy
        : 'https://api3.privacycash.org' // Local dev

// Server-side proof generation API
const PROVE_API_URL =
    typeof window !== 'undefined' && window.location.hostname !== 'localhost'
        ? '/api/privacy/prove' // Production: Vercel serverless
        : '/api/privacy/prove' // Same endpoint for local (needs Vercel dev)

const FETCH_UTXOS_GROUP_SIZE = 2000

// Field size for circuit calculations
const FIELD_SIZE = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617'
)

// Merkle tree depth - must match the circuit (26 levels for PrivacyCash)
const MERKLE_TREE_DEPTH = 26

// Default mint address for SOL
const DEFAULT_MINT_ADDRESS = '11111111111111111111111111111112'

export interface ShieldResult {
    success: boolean
    txHash?: string
    error?: string
    amount?: number
}

export interface UnshieldResult {
    success: boolean
    txHash?: string
    error?: string
    amount?: number
    fee?: number
}

export interface PrivateBalance {
    lamports: number
    sol: number
}

export interface SignMessageFn {
    (message: Uint8Array): Promise<Uint8Array>
}

export interface SignTransactionFn {
    (transaction: VersionedTransaction): Promise<VersionedTransaction>
}

// Constants for transaction building
const PROOF_SIZE = 256

// Server proof request/response types
interface ServerProveRequest {
    operation: 'deposit' | 'withdraw'
    inputs: Array<{
        amount: string
        blinding: string
        privateKey: string
        index: number
        mintAddress?: string
    }>
    outputs: Array<{
        amount: string
        blinding: string
        index: number
    }>
    root: string
    inputMerklePaths: string[][]
    inputMerklePathIndices: number[]
    extData: {
        recipient: string
        extAmount: string
        encryptedOutput1: number[]
        encryptedOutput2: number[]
        fee: string
    }
    publicAmount: string
    utxoPrivateKey: string
}

interface ServerProofResult {
    proof: {
        pi_a: string[]
        pi_b: string[][]
        pi_c: string[]
    }
    publicSignals: string[]
    proofBytes: {
        proofA: number[]
        proofB: number[]
        proofC: number[]
    }
    publicInputsBytes: number[][]
}

/**
 * Browser-compatible PrivacyCash client
 *
 * Handles shielded transactions using server-side ZK proof generation
 */
export class BrowserPrivacyCash {
    private connection: Connection
    private publicKey: PublicKey
    private encryptionService: BrowserEncryptionService
    private storage: typeof browserStorage
    private hasher: PoseidonHasher | null = null
    private signMessage: SignMessageFn
    private signTransaction: SignTransactionFn
    private initialized = false

    constructor(options: {
        connection: Connection
        publicKey: PublicKey
        signMessage: SignMessageFn
        signTransaction: SignTransactionFn
    }) {
        this.connection = options.connection
        this.publicKey = options.publicKey
        this.signMessage = options.signMessage
        this.signTransaction = options.signTransaction
        this.encryptionService = new BrowserEncryptionService()
        this.storage = getStorage()
    }

    /**
     * Helper to fetch with exponential backoff retry
     */
    private async fetchWithRetry(
        url: string,
        options?: RequestInit,
        retries = 3,
        backoff = 500
    ): Promise<Response> {
        try {
            const response = await fetch(url, options)

            // Retry on 429 or 5xx errors
            if (!response.ok && (response.status === 429 || response.status >= 500) && retries > 0) {
                console.warn(`[BrowserPrivacyCash] Request failed with ${response.status}, retrying in ${backoff}ms...`)
                await new Promise(resolve => setTimeout(resolve, backoff))
                return this.fetchWithRetry(url, options, retries - 1, backoff * 2)
            }

            return response
        } catch (error) {
            // Retry on network errors
            if (retries > 0) {
                console.warn(`[BrowserPrivacyCash] Network error, retrying in ${backoff}ms...`, error)
                await new Promise(resolve => setTimeout(resolve, backoff))
                return this.fetchWithRetry(url, options, retries - 1, backoff * 2)
            }
            throw error
        }
    }

    /**
     * Initialize the client (must be called before use)
     */
    async initialize(onProgress?: (stage: string, percent: number) => void): Promise<void> {
        if (this.initialized) return

        onProgress?.('Deriving encryption keys', 10)

        // Derive encryption keys from wallet signature
        const walletAddress = this.publicKey.toBase58()
        await this.encryptionService.deriveEncryptionKeyFromWallet(this.signMessage, walletAddress)

        onProgress?.('Loading Poseidon hasher', 50)

        // Load browser-compatible Poseidon hasher (circomlibjs)
        // NOTE: This is only used for local operations like UTXO deserialization
        // Server uses @lightprotocol/hasher.rs for proof generation
        try {
            const { getPoseidonHasher } = await import('./browser-poseidon')
            this.hasher = await getPoseidonHasher()
        } catch (error) {
            console.error('[BrowserPrivacyCash] Failed to load Poseidon hasher:', error)
            throw new Error('Failed to load cryptographic components')
        }

        onProgress?.('Ready', 100)
        this.initialized = true
        console.log('[BrowserPrivacyCash] Initialized (server-side proof generation mode)')
    }

    /**
     * Check if client is initialized
     */
    isInitialized(): boolean {
        return this.initialized
    }

    /**
     * Get the private (shielded) balance
     */
    async getPrivateBalance(onProgress?: (message: string) => void): Promise<PrivateBalance> {
        this.ensureInitialized()

        onProgress?.('Fetching UTXOs...')

        const utxos = await this.fetchUtxos(onProgress)
        const totalLamports = utxos.reduce((sum, utxo) => sum + utxo.amount, BigInt(0))

        return {
            lamports: Number(totalLamports),
            sol: Number(totalLamports) / LAMPORTS_PER_SOL,
        }
    }

    /**
     * Shield (deposit) SOL
     */
    async shield(
        lamports: number,
        onProgress?: (stage: string, percent: number) => void
    ): Promise<ShieldResult> {
        this.ensureInitialized()

        // 1. Initialize Vault if needed (Spectre Protocol specific)
        try {
            await this.initializeVault((msg, pct) => onProgress?.(msg, pct * 0.1))
        } catch (e) {
            console.warn('[BrowserPrivacyCash] Vault init check failed (might already exist):', e)
        }

        try {
            onProgress?.('Preparing deposit', 10)

            // Try to fetch existing UTXOs for consolidation
            let existingUtxos: BrowserUtxo[] = []
            try {
                existingUtxos = await this.fetchUtxos((msg) => onProgress?.(msg, 12))
            } catch (fetchError) {
                console.warn(
                    '[BrowserPrivacyCash] Could not fetch UTXOs, proceeding with fresh deposit:',
                    fetchError
                )
            }

            onProgress?.('Building proof inputs', 20)

            // Get UTXO keypair
            const utxoPrivateKey = this.encryptionService.getUtxoPrivateKey('v2')
            const utxoKeypair = new BrowserKeypair(utxoPrivateKey, this.hasher!)

            // Build proof request for server
            const proofRequest = await this.buildDepositProofRequest(
                lamports,
                existingUtxos,
                utxoKeypair,
                utxoPrivateKey
            )

            onProgress?.('Generating ZK proof (server-side)', 40)

            // Generate proof on server
            const proofResult = await this.generateProofOnServer(proofRequest, (stage, percent) =>
                onProgress?.(stage, 40 + percent * 0.4)
            )

            onProgress?.('Building transaction', 85)

            // Submit deposit to relayer
            const txHash = await this.submitDeposit(proofResult, proofRequest.extData, lamports)

            onProgress?.('Deposit complete', 100)

            return {
                success: true,
                txHash,
                amount: lamports,
            }
        } catch (error) {
            console.error('[BrowserPrivacyCash] Shield failed:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Unshield (withdraw) SOL
     */
    /**
     * Unshield (withdraw) SOL
     */
    async unshield(
        lamports: number,
        _recipient?: string, // Not used in Phase 1 (withdraws to requester)
        onProgress?: (stage: string, percent: number) => void
    ): Promise<UnshieldResult> {
        this.ensureInitialized()

        try {
            onProgress?.('Fetching UTXOs', 10)

            const existingUtxos = await this.fetchUtxos((msg) => onProgress?.(msg, 15))

            // Find a UTXO with sufficient balance
            // Phase 1 Limitation: Can only withdraw from a single deposit at a time
            const targetUtxo = existingUtxos.find(u => u.amount >= BigInt(lamports))

            if (!targetUtxo) {
                return {
                    success: false,
                    error: `No single deposit has sufficient funds (${lamports} lamports). Consolidation not yet supported.`,
                }
            }

            onProgress?.('Requesting withdrawal', 30)

            const txHash = await this.requestWithdrawal(targetUtxo, lamports, (msg, pct) =>
                onProgress?.(msg, 30 + pct * 0.7)
            )

            onProgress?.('Withdrawal requested', 100)

            return {
                success: true,
                txHash,
                amount: lamports,
                fee: 0, // Transaction fee paid by user
            }
        } catch (error) {
            console.error('[BrowserPrivacyCash] Unshield failed:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Initialize the Spectre Vault (if not already initialized)
     * This is required for Phase 1 testing on Devnet
     */
    async initializeVault(onProgress?: (stage: string, percent: number) => void): Promise<string> {
        this.ensureInitialized()

        onProgress?.('Deriving Vault PDA', 10)

        // Derive Vault PDA: [VAULT_SEED, authority]
        // We assume the current user is the authority for their own vault
        const [vaultPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_SEED), this.publicKey.toBuffer()],
            SPECTRE_PROGRAM_ID
        )

        // Derive Vault SOL PDA: [VAULT_SEED, authority, "sol"]
        const [vaultSolPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_SEED), this.publicKey.toBuffer(), Buffer.from('sol')],
            SPECTRE_PROGRAM_ID
        )

        console.log(`[BrowserPrivacyCash] Initializing Vault: ${vaultPDA.toBase58()}`)

        // Check if already initialized
        const accountInfo = await this.connection.getAccountInfo(vaultPDA)
        if (accountInfo) {
            console.log('[BrowserPrivacyCash] Vault already initialized')
            onProgress?.('Vault already initialized', 100)
            return vaultPDA.toBase58()
        }

        onProgress?.('Building initialization transaction', 30)

        // Initialize Instruction Data: [Discriminator (8), Option<ModelHash> (1 + 32)]
        // We use None (0) for model hash
        const instructionData = Buffer.concat([
            INITIALIZE_IX_DISCRIMINATOR,
            Buffer.from([0]) // Option::None
        ])

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: this.publicKey, isSigner: true, isWritable: true }, // authority
                { pubkey: vaultPDA, isSigner: false, isWritable: true }, // vault
                { pubkey: vaultSolPDA, isSigner: false, isWritable: true }, // vault_sol
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
            ],
            programId: SPECTRE_PROGRAM_ID,
            data: instructionData,
        })

        const latestBlockhash = await this.connection.getLatestBlockhash()
        const messageV0 = new TransactionMessage({
            payerKey: this.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [instruction],
        }).compileToV0Message()

        const transaction = new VersionedTransaction(messageV0)

        onProgress?.('Requesting signature', 50)
        const signedTx = await this.signTransaction(transaction)

        onProgress?.('Sending transaction', 70)
        const txHash = await this.connection.sendTransaction(signedTx)

        console.log(`[BrowserPrivacyCash] Initialization TX: https://explorer.solana.com/tx/${txHash}?cluster=devnet`)

        await this.connection.confirmTransaction({
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            signature: txHash,
        })

        onProgress?.('Vault initialized', 100)
        return txHash
    }

    /**
     * Submit deposit (fund_agent) to Spectre Protocol
     */
    private async submitDeposit(
        proof: ServerProofResult,
        _extDataEncoded: any, // Not used in Spectre v1 (we use ZkProof struct)
        amount: number
    ): Promise<string> {
        console.log('[BrowserPrivacyCash] Constructing fund_agent transaction...')

        // 1. Derive PDAs
        // Vault PDA
        const [vaultPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_SEED), this.publicKey.toBuffer()],
            SPECTRE_PROGRAM_ID
        )

        // Parse outputs to get commitment (Output[0] is the deposit UTXO)
        // Public Inputs are in proof.publicInputsBytes
        // [0]=root, [1]=publicAmount, [2]=extDataHash, [3]=inputNullifier0, [4]=inputNullifier1, [5]=outputCommitment0, [6]=outputCommitment1

        // Ensure proper byte arrays
        const commitmentBytes = new Uint8Array(proof.publicInputsBytes[5]) // Output 0 Commitment
        // const nullifierHashBytes = new Uint8Array(proof.publicInputsBytes[3]) // Input Nullifier 0 (we use this as the unique ID?)
        // WAIT: fund_agent expects a NEW commitment. 
        // In the circuit, outputCommitment[0] is the new note.
        // We should use outputCommitment[0] for the UserDeposit PDA.

        // UserDeposit PDA: [DEPOSIT_SEED, Vault, Commitment]
        const [userDepositPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(USER_DEPOSIT_SEED), vaultPDA.toBuffer(), commitmentBytes],
            SPECTRE_PROGRAM_ID
        )

        console.log(`[BrowserPrivacyCash] Vault: ${vaultPDA.toBase58()}`)
        console.log(`[BrowserPrivacyCash] User Deposit: ${userDepositPDA.toBase58()}`)

        // 2. Serialize ZkProof struct
        // struct ZkProof {
        //     proof_data: [u8; 256],
        //     public_inputs: ZkPublicInputs { commitment, nullifier_hash, amount, merkle_root }
        // }

        // Construct Proof Data (256 bytes)
        // Groth16 proof from snarkjs is: A(64) + B(128) + C(64) = 256 bytes (compressed?) or uncompressed.
        // hasher.rs / PrivacyCash usually implies:
        // A (32*2 = 64), B (32*4 = 128), C (32*2 = 64) -> Total 256 bytes.
        // proof.proofBytes contains proofA (number[]), proofB, proofC.

        const proofData = new Uint8Array(PROOF_SIZE)
        let offset = 0
        const writeFn = (arr: number[]) => {
            proofData.set(arr, offset)
            offset += arr.length
        }
        writeFn(proof.proofBytes.proofA)
        writeFn(proof.proofBytes.proofB) // Note: proofB is often flattened
        writeFn(proof.proofBytes.proofC)

        // Pad checks? 
        // proofA = 2 elements * 32 = 64
        // proofB = 2 elements * 2 sub-elements * 32 = 128
        // proofC = 2 elements * 32 = 64
        // Total = 256. Perfect.

        // Construct Public Inputs
        // commitment: [u8; 32]
        // nullifier_hash: [u8; 32] (This is tricky. We need a unique nullifier. Spectre uses this to prevent double-spending? No, it's just stored.)
        // amount: u64
        // merkle_root: [u8; 32]

        const publicInputsBuffer = Buffer.concat([
            Buffer.from(commitmentBytes),                  // commitment (32)
            Buffer.from(new Uint8Array(32).fill(1)),       // nullifier_hash (32) - Mock for now (phase 1)
            new BN(amount).toArrayLike(Buffer, 'le', 8),   // amount (8)
            Buffer.from(new Uint8Array(32))                // merkle_root (32) - Mock for now
        ])

        const zkProofBuffer = Buffer.concat([
            proofData,
            publicInputsBuffer
        ])

        // 3. Construct Instruction
        const instructionData = Buffer.concat([
            FUND_AGENT_IX_DISCRIMINATOR,
            zkProofBuffer
        ])

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: this.publicKey, isSigner: true, isWritable: true }, // depositor
                { pubkey: vaultPDA, isSigner: false, isWritable: true },      // vault
                { pubkey: userDepositPDA, isSigner: false, isWritable: true }, // user_deposit
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
            ],
            programId: SPECTRE_PROGRAM_ID,
            data: instructionData,
        })

        // 4. Send Transaction
        const recentBlockhash = await this.connection.getLatestBlockhash()
        const messageV0 = new TransactionMessage({
            payerKey: this.publicKey,
            recentBlockhash: recentBlockhash.blockhash,
            instructions: [instruction],
        }).compileToV0Message()

        const transaction = new VersionedTransaction(messageV0)

        console.log('[BrowserPrivacyCash] Requesting signature...')
        const signedTx = await this.signTransaction(transaction)

        console.log('[BrowserPrivacyCash] Submitting fund_agent transaction...')
        const signature = await this.connection.sendTransaction(signedTx)

        console.log(`[BrowserPrivacyCash] Success! https://explorer.solana.com/tx/${signature}?cluster=devnet`)

        // Wait for confirmation
        await this.connection.confirmTransaction({
            signature,
            blockhash: recentBlockhash.blockhash,
            lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
        })

        return signature
    }

    // ========================================
    // Private Methods
    // ========================================

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error('Client not initialized. Call initialize() first.')
        }
    }

    /**
     * Generate proof using server-side API
     */
    private async generateProofOnServer(
        request: ServerProveRequest,
        onProgress?: (stage: string, percent: number) => void
    ): Promise<ServerProofResult> {
        onProgress?.('Connecting to proof server', 10)

        const startTime = Date.now()
        console.log('[BrowserPrivacyCash] Sending proof request to server...')

        const response = await this.fetchWithRetry(PROVE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }))
            throw new Error(
                `Server proof generation failed: ${errorData.message || errorData.error || response.statusText}`
            )
        }

        const result = (await response.json()) as ServerProofResult

        const elapsed = Date.now() - startTime
        console.log(`[BrowserPrivacyCash] Proof generated in ${elapsed}ms`)

        onProgress?.('Proof generated', 100)
        return result
    }

    /**
     * Fetch and decrypt user's UTXOs
     */
    private async fetchUtxos(onProgress?: (message: string) => void): Promise<BrowserUtxo[]> {
        const walletKey = localstorageKey(this.publicKey.toBase58())
        const validUtxos: BrowserUtxo[] = []

        // Get cached offset
        let offset = 0
        const cachedOffset = this.storage.getItem(LSK_FETCH_OFFSET + walletKey)
        if (cachedOffset) offset = parseInt(cachedOffset, 10)

        // Fetch UTXOs from relayer API
        while (true) {
            const response = await this.fetchWithRetry(
                `${RELAYER_API_URL}/utxos/range?start=${offset}&end=${offset + FETCH_UTXOS_GROUP_SIZE}`
            )
            if (!response.ok) throw new Error('Failed to fetch UTXOs')

            const data = await response.json()
            const encryptedOutputs: string[] = data.encrypted_outputs || []

            onProgress?.(`Decrypting UTXOs (${offset + encryptedOutputs.length})...`)

            // Try to decrypt each output
            let processedCount = 0
            for (const encryptedHex of encryptedOutputs) {
                // Yield to event loop every 50 items to keep UI responsive
                if (++processedCount % 50 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0))
                }

                try {
                    const encrypted = hexToBytes(encryptedHex)
                    const version = this.encryptionService.getEncryptionKeyVersion(encrypted)
                    const decrypted = await this.encryptionService.decrypt(encrypted)
                    const decryptedStr = new TextDecoder().decode(decrypted)

                    const privateKey = this.encryptionService.getUtxoPrivateKey(version)
                    const keypair = new BrowserKeypair(privateKey, this.hasher!)
                    const utxo = BrowserUtxo.deserialize(decryptedStr, keypair, this.hasher!, version)

                    if (utxo.amount > BigInt(0)) {
                        // Check if spent
                        const isSpent = await this.isUtxoSpent(utxo)
                        if (!isSpent) {
                            validUtxos.push(utxo)
                        }
                    }
                } catch {
                    // Not our UTXO, skip
                }
            }

            // Update offset
            offset += encryptedOutputs.length
            this.storage.setItem(LSK_FETCH_OFFSET + walletKey, offset.toString())

            if (!data.hasMore) break
        }

        // Cache valid UTXOs
        const serialized = validUtxos.map((u) =>
            bytesToHex(new TextEncoder().encode(u.serialize()))
        )
        this.storage.setItem(LSK_ENCRYPTED_OUTPUTS + walletKey, JSON.stringify(serialized))

        return validUtxos
    }

    /**
     * Check if a UTXO has been spent
     */
    /**
     * Check if a UTXO has been spent
     */
    private async isUtxoSpent(_utxo: BrowserUtxo): Promise<boolean> {
        return false // Mock for Phase 1 (Spectre doesn't track spent nullifiers on client yet)
    }

    /**
     * Clear cached UTXOs
     */
    clearCache(): void {
        const walletKey = localstorageKey(this.publicKey.toBase58())
        this.storage.removeItem(LSK_ENCRYPTED_OUTPUTS + walletKey)
        this.storage.removeItem(LSK_FETCH_OFFSET + walletKey)
        console.log('[BrowserPrivacyCash] Cache cleared')
    }

    /**
     * Build deposit proof request for server
     */
    private async buildDepositProofRequest(
        lamports: number,
        existingUtxos: BrowserUtxo[],
        keypair: BrowserKeypair,
        utxoPrivateKey: string
    ): Promise<ServerProveRequest> {
        // Query current Merkle tree state
        const treeState = await this.queryTreeState()
        const currentIndex = treeState.nextIndex

        // Build inputs (2 required by circuit)
        let inputs: BrowserUtxo[]
        let inputMerklePaths: string[][]

        if (existingUtxos.length === 0) {
            // Fresh deposit: use dummy inputs
            inputs = [
                BrowserUtxo.dummy(keypair, this.hasher!),
                BrowserUtxo.dummy(keypair, this.hasher!),
            ]
            inputMerklePaths = [
                new Array(MERKLE_TREE_DEPTH).fill('0'),
                new Array(MERKLE_TREE_DEPTH).fill('0'),
            ]
        } else {
            // Consolidation: use existing UTXOs
            inputs = [
                existingUtxos[0],
                existingUtxos.length > 1
                    ? existingUtxos[1]
                    : BrowserUtxo.dummy(keypair, this.hasher!),
            ]
            const proofs = await Promise.all(
                inputs.map((utxo) =>
                    utxo.amount > BigInt(0)
                        ? this.fetchMerkleProof(utxo.getCommitment())
                        : { pathIndices: 0, pathElements: new Array(MERKLE_TREE_DEPTH).fill('0') }
                )
            )
            inputMerklePaths = proofs.map((p) => p.pathElements)
        }

        const inputMerklePathIndices = inputs.map((u) => u.index || 0)

        // Calculate amounts
        const inputSum = inputs.reduce((sum, u) => sum + u.amount, BigInt(0))
        const outputAmount = inputSum + BigInt(lamports)
        const publicAmount = ((BigInt(lamports) + FIELD_SIZE) % FIELD_SIZE).toString()

        // Build outputs
        const outputBlinding1 = Math.floor(Math.random() * 1000000000).toString()
        const outputBlinding2 = Math.floor(Math.random() * 1000000000).toString()

        // Build output UTXOs for encryption
        const outputs = [
            new BrowserUtxo({
                hasher: this.hasher!,
                amount: outputAmount,
                keypair,
                blinding: BigInt(outputBlinding1),
                index: currentIndex,
            }),
            new BrowserUtxo({
                hasher: this.hasher!,
                amount: BigInt(0),
                keypair,
                blinding: BigInt(outputBlinding2),
                index: currentIndex + 1,
            }),
        ]

        // Encrypt outputs
        const encryptedOutput1 = await this.encryptionService.encrypt(outputs[0].serialize())
        const encryptedOutput2 = await this.encryptionService.encrypt(outputs[1].serialize())

        // External data
        const extData = {
            recipient: this.publicKey.toBase58(),
            extAmount: lamports.toString(),
            encryptedOutput1: Array.from(encryptedOutput1),
            encryptedOutput2: Array.from(encryptedOutput2),
            fee: '0',
        }

        return {
            operation: 'deposit',
            inputs: inputs.map((u) => ({
                amount: u.amount.toString(),
                blinding: u.blinding.toString(),
                privateKey: u.keypair.privkey.toString(),
                index: u.index || 0,
                mintAddress: u.mintAddress || DEFAULT_MINT_ADDRESS,
            })),
            outputs: [
                {
                    amount: outputAmount.toString(),
                    blinding: outputBlinding1,
                    index: currentIndex,
                },
                {
                    amount: '0',
                    blinding: outputBlinding2,
                    index: currentIndex + 1,
                },
            ],
            root: treeState.root,
            inputMerklePaths,
            inputMerklePathIndices,
            extData,
            publicAmount,
            utxoPrivateKey,
        }
    }



    /**
     * Fetch Merkle tree state directly from on-chain PDA
     * Fallback for when Relayer is unavailable or for Devnet
     */
    private async fetchTreeStateFromChain(): Promise<{ root: string; nextIndex: number } | null> {
        try {
            const [treeAddress] = PublicKey.findProgramAddressSync(
                [Buffer.from('merkle_tree')],
                SPECTRE_PROGRAM_ID
            )
            const accountInfo = await this.connection.getAccountInfo(treeAddress)
            if (!accountInfo) {
                console.warn('[BrowserPrivacyCash] Tree account not found on chain')
                return null
            }

            // Layout Assumptions based on 4136 byte account:
            // 0-8: Discriminator
            // 8-40: Authority (32 bytes)
            // 40-72: Root (32 bytes)
            // 72-80: NextIndex (8 bytes LE)

            // Extract Root
            const rootBytes = accountInfo.data.subarray(40, 72)
            // Convert to decimal string for the circuit (Little Endian bytes from BN field element)
            const root = new BN(rootBytes, 'le').toString()

            // Extract Next Index
            const nextIndexBytes = accountInfo.data.subarray(72, 80)
            const nextIndex = new BN(nextIndexBytes, 'le').toNumber()

            console.log(`[BrowserPrivacyCash] Fetched tree state from chain: root=${root}, nextIndex=${nextIndex}`)
            return { root, nextIndex }

        } catch (error) {
            console.error('[BrowserPrivacyCash] Failed to fetch tree state from chain:', error)
            return null
        }
    }

    /**
     * Query Merkle tree state from relayer (fallback to chain)
     */
    private async queryTreeState(): Promise<{ root: string; nextIndex: number }> {
        try {
            // Priority 1: Try Relayer (Standard path)
            const response = await this.fetchWithRetry(`${RELAYER_API_URL}/tree/state`)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
        } catch (error) {
            console.warn('[BrowserPrivacyCash] Relayer unavailable, trying on-chain state fetch:', error)

            // Priority 2: Try On-Chain Fetch (Devnet/Fallback path)
            try {
                const chainState = await this.fetchTreeStateFromChain()
                if (chainState) {
                    return chainState
                }
            } catch (chainError) {
                console.error('[BrowserPrivacyCash] Chain fetch also failed:', chainError)
            }

            // Priority 3: Mock State (Fresh Tree / Emergency)
            // NOTE: The server will compute this correctly using hasher.rs
            return {
                root: '0',
                nextIndex: 0,
            }
        }
    }

    /**
     * Fetch Merkle proof for a commitment
     */
    private async fetchMerkleProof(
        commitment: string
    ): Promise<{ pathIndices: number; pathElements: string[] }> {
        const response = await this.fetchWithRetry(`${RELAYER_API_URL}/tree/proof?commitment=${commitment}`)
        if (!response.ok) throw new Error('Failed to fetch Merkle proof')
        return response.json()
    }





    /**
     * Submit withdraw transaction via relayer
     */
    /**
     * Submit request_withdrawal transaction to Spectre Protocol
     */
    private async requestWithdrawal(
        utxo: BrowserUtxo,
        amount: number,
        onProgress?: (stage: string, percent: number) => void
    ): Promise<string> {
        console.log('[BrowserPrivacyCash] Constructing request_withdrawal transaction...')

        onProgress?.('Deriving PDAs', 10)

        // 1. Derive PDAs
        // Vault PDA
        const [vaultPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_SEED), this.publicKey.toBuffer()],
            SPECTRE_PROGRAM_ID
        )

        // UserDeposit PDA: [DEPOSIT_SEED, Vault, Commitment]
        const commitmentBytes = hexToBytes(utxo.getCommitment())
        const [userDepositPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(USER_DEPOSIT_SEED), vaultPDA.toBuffer(), commitmentBytes],
            SPECTRE_PROGRAM_ID
        )

        // WithdrawalRequest PDA: [WITHDRAWAL_SEED, Vault, Requester, UserDeposit]
        const [withdrawalRequestPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from(WITHDRAWAL_SEED),
                vaultPDA.toBuffer(),
                this.publicKey.toBuffer(),
                userDepositPDA.toBuffer()
            ],
            SPECTRE_PROGRAM_ID
        )

        console.log(`[BrowserPrivacyCash] Withdrawal Request PDA: ${withdrawalRequestPDA.toBase58()}`)

        // 2. Construct Instruction data (Discriminator + amount)
        const instructionData = Buffer.concat([
            REQUEST_WITHDRAWAL_IX_DISCRIMINATOR,
            new BN(amount).toArrayLike(Buffer, 'le', 8)
        ])

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: this.publicKey, isSigner: true, isWritable: true }, // requester
                { pubkey: vaultPDA, isSigner: false, isWritable: false },     // vault
                { pubkey: userDepositPDA, isSigner: false, isWritable: true }, // user_deposit
                { pubkey: withdrawalRequestPDA, isSigner: false, isWritable: true }, // withdrawal_request
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
            ],
            programId: SPECTRE_PROGRAM_ID,
            data: instructionData,
        })

        // 3. Send Transaction
        onProgress?.('Sending transaction', 50)

        const recentBlockhash = await this.connection.getLatestBlockhash()
        const messageV0 = new TransactionMessage({
            payerKey: this.publicKey,
            recentBlockhash: recentBlockhash.blockhash,
            instructions: [instruction],
        }).compileToV0Message()

        const transaction = new VersionedTransaction(messageV0)

        const signedTx = await this.signTransaction(transaction)
        const signature = await this.connection.sendTransaction(signedTx)

        console.log(`[BrowserPrivacyCash] Withdrawal Requested: https://explorer.solana.com/tx/${signature}?cluster=devnet`)

        await this.connection.confirmTransaction({
            signature,
            blockhash: recentBlockhash.blockhash,
            lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
        })

        return signature
    }

    /**
     * Submit complete_withdrawal transaction
     */
    async completeWithdrawal(
        utxo: BrowserUtxo,
        onProgress?: (stage: string, percent: number) => void
    ): Promise<string> {
        console.log('[BrowserPrivacyCash] Constructing complete_withdrawal transaction...')
        const {
            COMPLETE_WITHDRAWAL_IX_DISCRIMINATOR: DISC
        } = await import('@/lib/config/constants')

        onProgress?.('Deriving PDAs', 10)

        // Vault
        const [vaultPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_SEED), this.publicKey.toBuffer()],
            SPECTRE_PROGRAM_ID
        )

        // UserDeposit
        const commitmentBytes = hexToBytes(utxo.getCommitment())
        const [userDepositPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from(USER_DEPOSIT_SEED), vaultPDA.toBuffer(), commitmentBytes],
            SPECTRE_PROGRAM_ID
        )

        // WithdrawalRequest: [WITHDRAWAL_SEED, Vault, Requester, UserDeposit]
        const [withdrawalRequestPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from(WITHDRAWAL_SEED),
                vaultPDA.toBuffer(),
                this.publicKey.toBuffer(),
                userDepositPDA.toBuffer()
            ],
            SPECTRE_PROGRAM_ID
        )

        console.log(`[BrowserPrivacyCash] Completing withdrawal for: ${withdrawalRequestPDA.toBase58()}`)

        // Instruction: [Discriminator]
        const instructionData = DISC

        const instruction = new TransactionInstruction({
            keys: [
                { pubkey: this.publicKey, isSigner: true, isWritable: true }, // requester
                { pubkey: vaultPDA, isSigner: false, isWritable: true }, // vault (mut)
                { pubkey: userDepositPDA, isSigner: false, isWritable: true }, // user_deposit (mut)
                { pubkey: withdrawalRequestPDA, isSigner: false, isWritable: true }, // withdrawal_request (mut)
                { pubkey: this.publicKey, isSigner: false, isWritable: true }, // recipient (mut, requester receives funds)
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
            ],
            programId: SPECTRE_PROGRAM_ID,
            data: instructionData,
        })

        onProgress?.('Sending transaction', 50)

        const recentBlockhash = await this.connection.getLatestBlockhash()
        const messageV0 = new TransactionMessage({
            payerKey: this.publicKey,
            recentBlockhash: recentBlockhash.blockhash,
            instructions: [instruction],
        }).compileToV0Message()

        const transaction = new VersionedTransaction(messageV0)

        const signedTx = await this.signTransaction(transaction)
        const signature = await this.connection.sendTransaction(signedTx)

        console.log(`[BrowserPrivacyCash] Withdrawal Completed: https://explorer.solana.com/tx/${signature}?cluster=devnet`)

        await this.connection.confirmTransaction({
            signature,
            blockhash: recentBlockhash.blockhash,
            lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
        })

        return signature
    }
}
