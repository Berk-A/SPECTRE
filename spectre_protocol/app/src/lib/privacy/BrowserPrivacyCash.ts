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

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { BrowserEncryptionService, hexToBytes, bytesToHex } from './browser-encryption'
import {
    browserStorage,
    localstorageKey,
    LSK_ENCRYPTED_OUTPUTS,
    LSK_FETCH_OFFSET,
    getStorage,
} from './browser-storage'
import { BrowserUtxo, BrowserKeypair, type PoseidonHasher } from './browser-utxo'
import { PRIVACY_CASH_PROGRAM_ID } from '@/lib/config/constants'

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
    private initialized = false

    constructor(options: {
        connection: Connection
        publicKey: PublicKey
        signMessage: SignMessageFn
    }) {
        this.connection = options.connection
        this.publicKey = options.publicKey
        this.signMessage = options.signMessage
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
    async unshield(
        lamports: number,
        recipient?: string,
        onProgress?: (stage: string, percent: number) => void
    ): Promise<UnshieldResult> {
        this.ensureInitialized()

        try {
            onProgress?.('Fetching UTXOs', 10)

            const existingUtxos = await this.fetchUtxos((msg) => onProgress?.(msg, 15))

            // Check balance
            const totalBalance = existingUtxos.reduce((sum, utxo) => sum + utxo.amount, BigInt(0))
            if (totalBalance < BigInt(lamports)) {
                return {
                    success: false,
                    error: `Insufficient shielded balance: ${Number(totalBalance) / LAMPORTS_PER_SOL} SOL`,
                }
            }

            onProgress?.('Building proof inputs', 20)

            const utxoPrivateKey = this.encryptionService.getUtxoPrivateKey('v2')
            const utxoKeypair = new BrowserKeypair(utxoPrivateKey, this.hasher!)

            // Build proof request for server
            const proofRequest = await this.buildWithdrawProofRequest(
                lamports,
                existingUtxos,
                utxoKeypair,
                utxoPrivateKey,
                recipient ?? this.publicKey.toBase58()
            )

            onProgress?.('Generating ZK proof (server-side)', 40)

            // Generate proof on server
            const proofResult = await this.generateProofOnServer(proofRequest, (stage, percent) =>
                onProgress?.(stage, 40 + percent * 0.4)
            )

            onProgress?.('Submitting to relayer', 85)

            // Submit withdraw to relayer
            const result = await this.submitWithdraw(
                proofResult,
                proofRequest.extData,
                lamports,
                recipient ?? this.publicKey.toBase58()
            )

            onProgress?.('Withdraw complete', 100)

            return {
                success: true,
                txHash: result.signature,
                amount: lamports,
                fee: result.fee,
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
     * Clear cached UTXOs
     */
    clearCache(): void {
        const key = localstorageKey(this.publicKey.toBase58())
        this.storage.removeItem(LSK_FETCH_OFFSET + key)
        this.storage.removeItem(LSK_ENCRYPTED_OUTPUTS + key)
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
    private async isUtxoSpent(utxo: BrowserUtxo): Promise<boolean> {
        const nullifier = utxo.getNullifier()

        // Convert to bytes for PDA derivation
        const nullifierBytes = new Uint8Array(32)
        const nullifierBigInt = BigInt(nullifier)
        for (let i = 31; i >= 0; i--) {
            nullifierBytes[i] = Number((nullifierBigInt >> BigInt((31 - i) * 8)) & BigInt(0xff))
        }

        // Check both nullifier PDAs
        const [nullifier0PDA] = PublicKey.findProgramAddressSync(
            [Buffer.from('nullifier0'), Buffer.from(nullifierBytes)],
            PRIVACY_CASH_PROGRAM_ID
        )
        const [nullifier1PDA] = PublicKey.findProgramAddressSync(
            [Buffer.from('nullifier1'), Buffer.from(nullifierBytes)],
            PRIVACY_CASH_PROGRAM_ID
        )

        const accounts = await this.connection.getMultipleAccountsInfo([nullifier0PDA, nullifier1PDA])

        return accounts.some((acc) => acc !== null)
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
     * Build withdraw proof request for server
     */
    private async buildWithdrawProofRequest(
        lamports: number,
        existingUtxos: BrowserUtxo[],
        keypair: BrowserKeypair,
        utxoPrivateKey: string,
        recipient: string
    ): Promise<ServerProveRequest> {
        const treeState = await this.queryTreeState()
        const currentIndex = treeState.nextIndex

        // Use up to 2 UTXOs as inputs
        const inputs = [
            existingUtxos[0],
            existingUtxos.length > 1
                ? existingUtxos[1]
                : BrowserUtxo.dummy(keypair, this.hasher!),
        ]

        // Fetch Merkle proofs for real UTXOs
        const proofs = await Promise.all(
            inputs.map((utxo) =>
                utxo.amount > BigInt(0)
                    ? this.fetchMerkleProof(utxo.getCommitment())
                    : { pathIndices: 0, pathElements: new Array(MERKLE_TREE_DEPTH).fill('0') }
            )
        )

        const inputMerklePathIndices = inputs.map((u) => u.index || 0)
        const inputMerklePaths = proofs.map((p) => p.pathElements)

        // Calculate amounts
        const inputSum = inputs.reduce((sum, u) => sum + u.amount, BigInt(0))
        const fee = BigInt(Math.floor(lamports * 0.003)) // 0.3% fee
        const changeAmount = inputSum - BigInt(lamports)
        const publicAmount = ((FIELD_SIZE - BigInt(lamports) + fee) % FIELD_SIZE).toString()

        // Build outputs
        const outputBlinding1 = Math.floor(Math.random() * 1000000000).toString()
        const outputBlinding2 = Math.floor(Math.random() * 1000000000).toString()

        // Build output UTXOs for encryption
        const outputs = [
            new BrowserUtxo({
                hasher: this.hasher!,
                amount: changeAmount,
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

        const extData = {
            recipient,
            extAmount: (-lamports).toString(), // Negative for withdraw
            encryptedOutput1: Array.from(encryptedOutput1),
            encryptedOutput2: Array.from(encryptedOutput2),
            fee: fee.toString(),
        }

        return {
            operation: 'withdraw',
            inputs: inputs.map((u) => ({
                amount: u.amount.toString(),
                blinding: u.blinding.toString(),
                privateKey: u.keypair.privkey.toString(),
                index: u.index || 0,
                mintAddress: u.mintAddress || DEFAULT_MINT_ADDRESS,
            })),
            outputs: [
                {
                    amount: changeAmount.toString(),
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
     * Query Merkle tree state from relayer
     */
    private async queryTreeState(): Promise<{ root: string; nextIndex: number }> {
        try {
            const response = await this.fetchWithRetry(`${RELAYER_API_URL}/tree/state`)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
        } catch (error) {
            console.warn('[BrowserPrivacyCash] Relayer unavailable, using mock tree state:', error)
            // For fresh deposit, use the computed empty root
            // NOTE: The server will compute this correctly using hasher.rs
            return {
                root: '0', // Server will compute correct empty root
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
     * Submit deposit transaction via relayer
     */
    private async submitDeposit(
        proofResult: ServerProofResult,
        extData: ServerProveRequest['extData'],
        lamports: number
    ): Promise<string> {
        try {
            const response = await this.fetchWithRetry(`${RELAYER_API_URL}/deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proof: {
                        proofA: proofResult.proofBytes.proofA,
                        proofB: proofResult.proofBytes.proofB,
                        proofC: proofResult.proofBytes.proofC,
                        root: proofResult.publicInputsBytes[0],
                        publicAmount: proofResult.publicInputsBytes[1],
                        extDataHash: proofResult.publicInputsBytes[2],
                        inputNullifiers: [
                            proofResult.publicInputsBytes[3],
                            proofResult.publicInputsBytes[4],
                        ],
                        outputCommitments: [
                            proofResult.publicInputsBytes[5],
                            proofResult.publicInputsBytes[6],
                        ],
                    },
                    extData,
                    senderAddress: this.publicKey.toBase58(),
                    amount: lamports,
                }),
            })

            if (!response.ok) {
                const error = await response.text()
                throw new Error(`Deposit failed: ${error}`)
            }

            const result = await response.json()
            return result.signature
        } catch (error) {
            console.error('[BrowserPrivacyCash] Relayer submission failed:', error)
            throw new Error(
                error instanceof Error
                    ? error.message
                    : 'PrivacyCash relayer submission failed. Please try again.'
            )
        }
    }

    /**
     * Submit withdraw transaction via relayer
     */
    private async submitWithdraw(
        proofResult: ServerProofResult,
        extData: ServerProveRequest['extData'],
        lamports: number,
        recipient: string
    ): Promise<{ signature: string; fee: number }> {
        const response = await this.fetchWithRetry(`${RELAYER_API_URL}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proof: {
                    proofA: proofResult.proofBytes.proofA,
                    proofB: proofResult.proofBytes.proofB,
                    proofC: proofResult.proofBytes.proofC,
                    root: proofResult.publicInputsBytes[0],
                    publicAmount: proofResult.publicInputsBytes[1],
                    extDataHash: proofResult.publicInputsBytes[2],
                    inputNullifiers: [
                        proofResult.publicInputsBytes[3],
                        proofResult.publicInputsBytes[4],
                    ],
                    outputCommitments: [
                        proofResult.publicInputsBytes[5],
                        proofResult.publicInputsBytes[6],
                    ],
                },
                extData,
                recipient,
                amount: lamports,
            }),
        })

        if (!response.ok) {
            const error = await response.text()
            throw new Error(`Withdraw failed: ${error}`)
        }

        const result = await response.json()
        return {
            signature: result.signature,
            fee: result.fee || Math.floor(lamports * 0.003),
        }
    }
}
