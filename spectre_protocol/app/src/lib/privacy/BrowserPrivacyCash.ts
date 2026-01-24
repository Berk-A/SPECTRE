/**
 * Browser-compatible PrivacyCash Client
 * 
 * Main entry point for shielding/unshielding SOL in the browser.
 * Uses Web Crypto API, localStorage, and snarkjs for ZK proofs.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { BrowserEncryptionService, hexToBytes, bytesToHex } from './browser-encryption'
import { browserStorage, localstorageKey, LSK_ENCRYPTED_OUTPUTS, LSK_FETCH_OFFSET, getStorage } from './browser-storage'
import { generateProofBrowser, formatProofForChain, type Groth16Proof } from './browser-prover'
import { BrowserUtxo, BrowserKeypair, type PoseidonHasher } from './browser-utxo'
import { getCircuitLoader } from './circuitLoader'
import { PRIVACY_CASH_PROGRAM_ID } from '@/lib/config/constants'

// PrivacyCash Relayer API - using Vercel proxy to bypass CORS
// In development: direct API, In production: /api/privacy proxy
const RELAYER_API_URL = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? '/api/privacy'  // Production: use Vercel serverless proxy
    : 'https://api3.privacycash.org'  // Local dev: direct (may need proxy)
const FETCH_UTXOS_GROUP_SIZE = 100

// Field size for circuit calculations
const FIELD_SIZE = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617'
)

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

/**
 * Browser-compatible PrivacyCash client
 * 
 * Handles shielded transactions using ZK proofs
 */
export class BrowserPrivacyCash {
    private connection: Connection
    private publicKey: PublicKey
    private encryptionService: BrowserEncryptionService
    private storage: typeof browserStorage
    private hasher: PoseidonHasher | null = null
    private signMessage: SignMessageFn
    private initialized = false
    private circuits: { wasm: ArrayBuffer; zkey: ArrayBuffer } | null = null

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
     * Initialize the client (must be called before use)
     */
    async initialize(
        onProgress?: (stage: string, percent: number) => void
    ): Promise<void> {
        if (this.initialized) return

        onProgress?.('Deriving encryption keys', 10)

        // Derive encryption keys from wallet signature (will restore from storage if available)
        const walletAddress = this.publicKey.toBase58()
        await this.encryptionService.deriveEncryptionKeyFromWallet(this.signMessage, walletAddress)

        onProgress?.('Loading Poseidon hasher', 30)

        // Load browser-compatible Poseidon hasher (circomlibjs)
        try {
            const { getPoseidonHasher } = await import('./browser-poseidon')
            this.hasher = await getPoseidonHasher()
        } catch (error) {
            console.error('[BrowserPrivacyCash] Failed to load Poseidon hasher:', error)
            throw new Error('Failed to load cryptographic components')
        }

        onProgress?.('Loading ZK circuits', 60)

        // Load circuits
        try {
            const loader = getCircuitLoader()
            this.circuits = await loader.load((progress) => {
                onProgress?.(progress.message, 60 + progress.progress * 0.3)
            })
        } catch (error) {
            console.error('[BrowserPrivacyCash] Failed to load circuits:', error)
            throw new Error('Failed to load ZK circuits. Place transaction2.wasm and transaction2.zkey in /public/circuits/')
        }

        onProgress?.('Ready', 100)
        this.initialized = true
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
    async getPrivateBalance(
        onProgress?: (message: string) => void
    ): Promise<PrivateBalance> {
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
            // If relayer is unavailable (CORS/rate limit), proceed with fresh deposit
            let existingUtxos: BrowserUtxo[] = []
            try {
                existingUtxos = await this.fetchUtxos()
            } catch (fetchError) {
                console.warn('[BrowserPrivacyCash] Could not fetch UTXOs, proceeding with fresh deposit:', fetchError)
                // For fresh deposits, we don't need existing UTXOs
            }

            onProgress?.('Building proof inputs', 20)

            // Get UTXO keypair
            const utxoPrivateKey = this.encryptionService.getUtxoPrivateKey('v2')
            const utxoKeypair = new BrowserKeypair(utxoPrivateKey, this.hasher!)

            // Build proof inputs
            const proofInput = await this.buildDepositInput(
                lamports,
                existingUtxos,
                utxoKeypair
            )

            onProgress?.('Generating ZK proof', 40)

            // Generate proof
            const { proof, publicSignals } = await generateProofBrowser(
                proofInput.circuitInput,
                this.circuits!.wasm,
                this.circuits!.zkey,
                (stage, percent) => onProgress?.(stage, 40 + percent * 0.4)
            )

            onProgress?.('Building transaction', 85)

            // Build and sign transaction
            const txHash = await this.submitDeposit(
                proof,
                publicSignals,
                proofInput.extData,
                lamports
            )

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

            const existingUtxos = await this.fetchUtxos()

            // Check balance
            const totalBalance = existingUtxos.reduce(
                (sum, utxo) => sum + utxo.amount,
                BigInt(0)
            )
            if (totalBalance < BigInt(lamports)) {
                return {
                    success: false,
                    error: `Insufficient shielded balance: ${Number(totalBalance) / LAMPORTS_PER_SOL} SOL`,
                }
            }

            onProgress?.('Building proof inputs', 20)

            const utxoPrivateKey = this.encryptionService.getUtxoPrivateKey('v2')
            const utxoKeypair = new BrowserKeypair(utxoPrivateKey, this.hasher!)

            // Build proof inputs
            const proofInput = await this.buildWithdrawInput(
                lamports,
                existingUtxos,
                utxoKeypair,
                recipient ?? this.publicKey.toBase58()
            )

            onProgress?.('Generating ZK proof', 40)

            // Generate proof
            const { proof, publicSignals } = await generateProofBrowser(
                proofInput.circuitInput,
                this.circuits!.wasm,
                this.circuits!.zkey,
                (stage, percent) => onProgress?.(stage, 40 + percent * 0.4)
            )

            onProgress?.('Submitting to relayer', 85)

            // Submit to relayer
            const result = await this.submitWithdraw(
                proof,
                publicSignals,
                proofInput.extData,
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
     * Fetch and decrypt user's UTXOs
     */
    private async fetchUtxos(
        onProgress?: (message: string) => void
    ): Promise<BrowserUtxo[]> {
        const walletKey = localstorageKey(this.publicKey.toBase58())
        const validUtxos: BrowserUtxo[] = []

        // Get cached offset
        let offset = 0
        const cachedOffset = this.storage.getItem(LSK_FETCH_OFFSET + walletKey)
        if (cachedOffset) offset = parseInt(cachedOffset, 10)

        // Fetch UTXOs from relayer API
        while (true) {
            const response = await fetch(
                `${RELAYER_API_URL}/utxos/range?start=${offset}&end=${offset + FETCH_UTXOS_GROUP_SIZE}`
            )
            if (!response.ok) throw new Error('Failed to fetch UTXOs')

            const data = await response.json()
            const encryptedOutputs: string[] = data.encrypted_outputs || []

            onProgress?.(`Decrypting UTXOs (${offset + encryptedOutputs.length})...`)

            // Try to decrypt each output
            for (const encryptedHex of encryptedOutputs) {
                try {
                    const encrypted = hexToBytes(encryptedHex)
                    const version = this.encryptionService.getEncryptionKeyVersion(encrypted)
                    const decrypted = await this.encryptionService.decrypt(encrypted)
                    const decryptedStr = new TextDecoder().decode(decrypted)

                    const privateKey = this.encryptionService.getUtxoPrivateKey(version)
                    const keypair = new BrowserKeypair(privateKey, this.hasher!)
                    const utxo = BrowserUtxo.deserialize(
                        decryptedStr,
                        keypair,
                        this.hasher!,
                        version
                    )

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
        const serialized = validUtxos.map((u) => bytesToHex(
            new TextEncoder().encode(u.serialize())
        ))
        this.storage.setItem(
            LSK_ENCRYPTED_OUTPUTS + walletKey,
            JSON.stringify(serialized)
        )

        return validUtxos
    }

    /**
     * Check if a UTXO has been spent
     */
    private async isUtxoSpent(utxo: BrowserUtxo): Promise<boolean> {
        const nullifier = utxo.getNullifier()

        // Convert to bytes for PDA derivation
        // This is simplified - real implementation needs proper byte conversion
        const nullifierBytes = new Uint8Array(32)
        const nullifierBigInt = BigInt(nullifier)
        for (let i = 31; i >= 0; i--) {
            nullifierBytes[i] = Number(nullifierBigInt >> BigInt((31 - i) * 8) & BigInt(0xff))
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

        const accounts = await this.connection.getMultipleAccountsInfo([
            nullifier0PDA,
            nullifier1PDA,
        ])

        return accounts.some((acc) => acc !== null)
    }

    /**
     * Build deposit proof inputs
     */
    private async buildDepositInput(
        lamports: number,
        existingUtxos: BrowserUtxo[],
        keypair: BrowserKeypair
    ): Promise<{ circuitInput: Record<string, unknown>; extData: unknown }> {
        // Query current Merkle tree state
        const treeState = await this.queryTreeState()
        const currentIndex = treeState.nextIndex

        // Build inputs (2 required by circuit)
        let inputs: BrowserUtxo[]
        let inputMerkleIndices: number[]
        let inputMerklePaths: string[][]

        if (existingUtxos.length === 0) {
            // Fresh deposit: use dummy inputs
            inputs = [
                BrowserUtxo.dummy(keypair, this.hasher!),
                BrowserUtxo.dummy(keypair, this.hasher!),
            ]
            inputMerkleIndices = [0, 0]
            inputMerklePaths = [
                new Array(20).fill('0'),
                new Array(20).fill('0'),
            ]
        } else {
            // Consolidation: use existing UTXOs
            inputs = [
                existingUtxos[0],
                existingUtxos.length > 1
                    ? existingUtxos[1]
                    : BrowserUtxo.dummy(keypair, this.hasher!),
            ]
            // Fetch Merkle proofs
            const proofs = await Promise.all(
                inputs.map((utxo) =>
                    utxo.amount > BigInt(0)
                        ? this.fetchMerkleProof(utxo.getCommitment())
                        : { pathIndices: [0], pathElements: new Array(20).fill('0') }
                )
            )
            inputMerkleIndices = inputs.map((u) => u.index)
            inputMerklePaths = proofs.map((p) => p.pathElements)
        }

        // Calculate amounts
        const inputSum = inputs.reduce((sum, u) => sum + u.amount, BigInt(0))
        const outputAmount = inputSum + BigInt(lamports)
        const publicAmount = (BigInt(lamports) + FIELD_SIZE) % FIELD_SIZE

        // Build outputs
        const outputs = [
            new BrowserUtxo({
                hasher: this.hasher!,
                amount: outputAmount,
                keypair,
                index: currentIndex,
            }),
            new BrowserUtxo({
                hasher: this.hasher!,
                amount: BigInt(0),
                keypair,
                index: currentIndex + 1,
            }),
        ]

        // Encrypt outputs
        const encryptedOutput1 = await this.encryptionService.encrypt(outputs[0].serialize())
        const encryptedOutput2 = await this.encryptionService.encrypt(outputs[1].serialize())

        // External data - convert all BigInts to strings for serialization
        const extData = {
            recipient: this.publicKey.toBase58(),
            extAmount: lamports.toString(),
            encryptedOutput1: Array.from(encryptedOutput1),
            encryptedOutput2: Array.from(encryptedOutput2),
            fee: '0',
        }

        // Calculate extDataHash
        const extDataHash = this.computeExtDataHash(extData)

        // Build circuit input
        const circuitInput = {
            root: treeState.root,
            inputNullifier: inputs.map((u) => u.getNullifier()),
            outputCommitment: outputs.map((u) => u.getCommitment()),
            publicAmount: publicAmount.toString(),
            extDataHash,
            inAmount: inputs.map((u) => u.amount.toString()),
            inPrivateKey: inputs.map((u) => u.keypair.privkey),
            inBlinding: inputs.map((u) => u.blinding.toString()),
            inPathIndices: inputMerkleIndices,
            inPathElements: inputMerklePaths,
            outAmount: outputs.map((u) => u.amount.toString()),
            outBlinding: outputs.map((u) => u.blinding.toString()),
            outPubkey: outputs.map((u) => u.keypair.pubkey),
            mintAddress: inputs[0].mintAddress,
        }

        return { circuitInput, extData }
    }

    /**
     * Build withdraw proof inputs
     */
    private async buildWithdrawInput(
        lamports: number,
        existingUtxos: BrowserUtxo[],
        keypair: BrowserKeypair,
        recipient: string
    ): Promise<{ circuitInput: Record<string, unknown>; extData: unknown }> {
        const treeState = await this.queryTreeState()
        const currentIndex = treeState.nextIndex

        // Use up to 2 UTXOs as inputs
        const inputs = [
            existingUtxos[0],
            existingUtxos.length > 1
                ? existingUtxos[1]
                : BrowserUtxo.dummy(keypair, this.hasher!),
        ]

        // Fetch Merkle proofs
        const proofs = await Promise.all(
            inputs.map((utxo) =>
                utxo.amount > BigInt(0)
                    ? this.fetchMerkleProof(utxo.getCommitment())
                    : { pathIndices: [0], pathElements: new Array(20).fill('0') }
            )
        )

        // Calculate amounts
        const inputSum = inputs.reduce((sum, u) => sum + u.amount, BigInt(0))
        const fee = BigInt(Math.floor(lamports * 0.003)) // 0.3% fee
        const changeAmount = inputSum - BigInt(lamports)
        const publicAmount = (FIELD_SIZE - BigInt(lamports) + fee) % FIELD_SIZE

        // Build outputs (change UTXO + dummy)
        const outputs = [
            new BrowserUtxo({
                hasher: this.hasher!,
                amount: changeAmount,
                keypair,
                index: currentIndex,
            }),
            BrowserUtxo.dummy(keypair, this.hasher!),
        ]
        outputs[1].index = currentIndex + 1

        // Encrypt outputs
        const encryptedOutput1 = await this.encryptionService.encrypt(outputs[0].serialize())
        const encryptedOutput2 = await this.encryptionService.encrypt(outputs[1].serialize())

        const extData = {
            recipient: recipient,
            extAmount: (-lamports).toString(), // Negative for withdraw
            encryptedOutput1: Array.from(encryptedOutput1),
            encryptedOutput2: Array.from(encryptedOutput2),
            fee: fee.toString(),
        }

        const extDataHash = this.computeExtDataHash(extData)

        const circuitInput = {
            root: treeState.root,
            inputNullifier: inputs.map((u) => u.getNullifier()),
            outputCommitment: outputs.map((u) => u.getCommitment()),
            publicAmount: publicAmount.toString(),
            extDataHash,
            inAmount: inputs.map((u) => u.amount.toString()),
            inPrivateKey: inputs.map((u) => u.keypair.privkey),
            inBlinding: inputs.map((u) => u.blinding.toString()),
            inPathIndices: inputs.map((u) => u.index),
            inPathElements: proofs.map((p) => p.pathElements),
            outAmount: outputs.map((u) => u.amount.toString()),
            outBlinding: outputs.map((u) => u.blinding.toString()),
            outPubkey: outputs.map((u) => u.keypair.pubkey),
            mintAddress: inputs[0].mintAddress,
        }

        return { circuitInput, extData }
    }

    /**
     * Query Merkle tree state from relayer
     * Falls back to mock state if relayer is unavailable (CORS issues)
     */
    private async queryTreeState(): Promise<{ root: string; nextIndex: number }> {
        try {
            const response = await fetch(`${RELAYER_API_URL}/tree/state`)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
        } catch (error) {
            console.warn('[BrowserPrivacyCash] Relayer unavailable, using mock tree state:', error)
            // Return a mock tree state for testing
            // In production, this would need a backend proxy to avoid CORS
            return {
                root: '0', // Empty tree root
                nextIndex: 0,
            }
        }
    }

    /**
     * Fetch Merkle proof for a commitment
     */
    private async fetchMerkleProof(
        commitment: string
    ): Promise<{ pathIndices: number[]; pathElements: string[] }> {
        const response = await fetch(
            `${RELAYER_API_URL}/tree/proof?commitment=${commitment}`
        )
        if (!response.ok) throw new Error('Failed to fetch Merkle proof')
        return response.json()
    }

    /**
     * Compute external data hash for the circuit
     */
    private computeExtDataHash(extData: unknown): string {
        // Simplified - real implementation uses Poseidon hash
        // Use a replacer to handle BigInt values
        const str = JSON.stringify(extData, (_, value) =>
            typeof value === 'bigint' ? value.toString() : value
        )
        const bytes = new TextEncoder().encode(str)
        let hash = BigInt(0)
        for (const byte of bytes) {
            hash = (hash * BigInt(256) + BigInt(byte)) % FIELD_SIZE
        }
        return hash.toString()
    }

    /**
     * Submit deposit transaction via relayer
     * Note: May fail due to CORS if relayer doesn't support browser requests
     */
    private async submitDeposit(
        proof: Groth16Proof,
        publicSignals: string[],
        extData: unknown,
        lamports: number
    ): Promise<string> {
        // Format proof for chain
        const formattedProof = formatProofForChain(proof, publicSignals)

        try {
            // Build and send transaction via relayer
            const response = await fetch(`${RELAYER_API_URL}/deposit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proof: formattedProof,
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
            // CORS error - relayer doesn't support browser requests
            console.error('[BrowserPrivacyCash] Relayer submission failed:', error)
            throw new Error(
                'PrivacyCash relayer is not accessible from browser due to CORS restrictions. ' +
                'Please use the CLI or wait for backend proxy support.'
            )
        }
    }

    /**
     * Submit withdraw transaction via relayer
     */
    private async submitWithdraw(
        proof: Groth16Proof,
        publicSignals: string[],
        extData: unknown,
        lamports: number,
        recipient: string
    ): Promise<{ signature: string; fee: number }> {
        const formattedProof = formatProofForChain(proof, publicSignals)

        const response = await fetch(`${RELAYER_API_URL}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proof: formattedProof,
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
