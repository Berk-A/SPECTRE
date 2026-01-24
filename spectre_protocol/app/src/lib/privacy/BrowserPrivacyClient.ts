/**
 * Browser-Compatible PrivacyCash Client
 * Handles shielding/unshielding SOL with ZK proofs generated client-side
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getCircuitLoader, type LoadProgress } from './circuitLoader'
import { getProofWorker, generateProofInline, proofToSolanaFormat, type Groth16Proof } from './proofWorker'
import {
  sha256,
  randomBytes,
  encryptNote,
  decryptNote,
  bufferToHex,
  hexToBuffer,
  bufferToBase64,
} from '../crypto/browserCrypto'

// ============================================
// Configuration
// ============================================

// PrivacyCash Relayer API
const RELAYER_API = 'https://api3.privacycash.org'

// PrivacyCash Program ID (devnet)
const PRIVACY_CASH_PROGRAM_ID = new PublicKey('9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD')

// Note storage key in localStorage
const NOTES_STORAGE_KEY = 'spectre:privacy:notes'

// ============================================
// Types
// ============================================

export interface DepositNote {
  commitment: string // hex
  nullifier: string // hex
  secret: string // hex
  amount: number // in lamports
  tokenType: 'SOL'
  createdAt: Date
  spent: boolean
  txSignature?: string
  leafIndex?: number
}

export interface ShieldProgress {
  stage: 'circuits' | 'note' | 'proof' | 'signing' | 'submitting' | 'confirming' | 'done'
  progress: number
  message: string
}

export interface ShieldResult {
  success: boolean
  signature?: string
  note?: DepositNote
  error?: string
}

export interface UnshieldProgress {
  stage: 'loading' | 'merkle' | 'proof' | 'signing' | 'submitting' | 'confirming' | 'done'
  progress: number
  message: string
}

export interface UnshieldResult {
  success: boolean
  signature?: string
  amountReceived?: number
  error?: string
}

// ============================================
// Poseidon Hash (simplified for browser)
// ============================================

// Note: Full Poseidon hash requires circomlibjs
// For demo purposes, we use a simplified commitment scheme
// In production, this should use the actual Poseidon hash from circomlibjs

async function computeCommitment(nullifier: Uint8Array, secret: Uint8Array): Promise<string> {
  // Commitment = H(nullifier || secret)
  const combined = new Uint8Array(nullifier.length + secret.length)
  combined.set(nullifier)
  combined.set(secret, nullifier.length)
  const hash = await sha256(combined)
  return bufferToHex(hash)
}

async function computeNullifierHash(nullifier: Uint8Array): Promise<string> {
  const hash = await sha256(nullifier)
  return bufferToHex(hash)
}

// ============================================
// Browser Privacy Client
// ============================================

export class BrowserPrivacyClient {
  private connection: Connection
  private walletPublicKey: PublicKey | null = null
  private signTransaction: ((tx: Transaction) => Promise<Transaction>) | null = null
  private circuitsLoaded = false
  private useWorker = true // Try worker first, fallback to inline

  constructor(connection: Connection) {
    this.connection = connection
  }

  /**
   * Set wallet for signing transactions
   */
  setWallet(
    publicKey: PublicKey,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): void {
    this.walletPublicKey = publicKey
    this.signTransaction = signTransaction
  }

  /**
   * Preload ZK circuits
   */
  async preloadCircuits(onProgress?: (progress: LoadProgress) => void): Promise<void> {
    const loader = getCircuitLoader()
    await loader.load(onProgress)
    this.circuitsLoaded = true
  }

  /**
   * Check if circuits are loaded
   */
  areCircuitsLoaded(): boolean {
    return this.circuitsLoaded
  }

  /**
   * Generate a new deposit note
   */
  async generateNote(amountLamports: number): Promise<DepositNote> {
    const nullifier = randomBytes(32)
    const secret = randomBytes(32)
    const commitment = await computeCommitment(nullifier, secret)

    return {
      commitment,
      nullifier: bufferToHex(nullifier),
      secret: bufferToHex(secret),
      amount: amountLamports,
      tokenType: 'SOL',
      createdAt: new Date(),
      spent: false,
    }
  }

  /**
   * Shield SOL - Main entry point
   */
  async shieldSol(
    amountSol: number,
    onProgress?: (progress: ShieldProgress) => void
  ): Promise<ShieldResult> {
    if (!this.walletPublicKey || !this.signTransaction) {
      return { success: false, error: 'Wallet not connected' }
    }

    try {
      const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL)

      // Step 1: Ensure circuits are loaded
      onProgress?.({
        stage: 'circuits',
        progress: 10,
        message: 'Loading ZK circuits...',
      })

      if (!this.circuitsLoaded) {
        await this.preloadCircuits()
      }

      // Step 2: Generate note
      onProgress?.({
        stage: 'note',
        progress: 20,
        message: 'Generating deposit note...',
      })

      const note = await this.generateNote(amountLamports)

      // Step 3: Generate deposit proof
      onProgress?.({
        stage: 'proof',
        progress: 30,
        message: 'Generating ZK proof (this may take 15-30 seconds)...',
      })

      const { proof, publicSignals } = await this.generateDepositProof(note, (p) => {
        onProgress?.({
          stage: 'proof',
          progress: 30 + (p.percent * 0.4), // 30-70%
          message: p.stage,
        })
      })

      // Step 4: Build transaction
      onProgress?.({
        stage: 'signing',
        progress: 75,
        message: 'Please sign the transaction in your wallet...',
      })

      const tx = await this.buildDepositTransaction(
        note.commitment,
        amountLamports,
        proof,
        publicSignals
      )

      // Sign transaction
      const signedTx = await this.signTransaction(tx)

      // Step 5: Submit to relayer
      onProgress?.({
        stage: 'submitting',
        progress: 85,
        message: 'Submitting to privacy pool...',
      })

      const signature = await this.submitDeposit(signedTx, note.commitment)

      // Step 6: Wait for confirmation
      onProgress?.({
        stage: 'confirming',
        progress: 90,
        message: 'Waiting for confirmation...',
      })

      await this.connection.confirmTransaction(signature, 'confirmed')

      // Update note with transaction info
      note.txSignature = signature
      note.leafIndex = await this.getLeafIndex(note.commitment)

      // Save note locally
      await this.saveNote(note)

      onProgress?.({
        stage: 'done',
        progress: 100,
        message: 'Shield complete!',
      })

      return {
        success: true,
        signature,
        note,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Unshield SOL
   */
  async unshieldSol(
    note: DepositNote,
    recipient: string,
    onProgress?: (progress: UnshieldProgress) => void
  ): Promise<UnshieldResult> {
    if (!this.walletPublicKey || !this.signTransaction) {
      return { success: false, error: 'Wallet not connected' }
    }

    if (note.spent) {
      return { success: false, error: 'Note has already been spent' }
    }

    try {
      // Step 1: Get merkle proof
      onProgress?.({
        stage: 'merkle',
        progress: 20,
        message: 'Fetching merkle proof...',
      })

      const merkleProof = await this.getMerkleProof(note.commitment)

      // Step 2: Generate withdrawal proof
      onProgress?.({
        stage: 'proof',
        progress: 30,
        message: 'Generating withdrawal proof (this may take 15-30 seconds)...',
      })

      const { proof, publicSignals } = await this.generateWithdrawalProof(
        note,
        recipient,
        merkleProof,
        (p) => {
          onProgress?.({
            stage: 'proof',
            progress: 30 + (p.percent * 0.4),
            message: p.stage,
          })
        }
      )

      // Step 3: Build withdrawal transaction
      onProgress?.({
        stage: 'signing',
        progress: 75,
        message: 'Please sign the transaction in your wallet...',
      })

      const tx = await this.buildWithdrawalTransaction(
        note.nullifier,
        recipient,
        note.amount,
        proof,
        publicSignals
      )

      const signedTx = await this.signTransaction(tx)

      // Step 4: Submit to relayer
      onProgress?.({
        stage: 'submitting',
        progress: 85,
        message: 'Submitting withdrawal...',
      })

      const signature = await this.submitWithdrawal(signedTx)

      // Step 5: Wait for confirmation
      onProgress?.({
        stage: 'confirming',
        progress: 90,
        message: 'Waiting for confirmation...',
      })

      await this.connection.confirmTransaction(signature, 'confirmed')

      // Mark note as spent
      note.spent = true
      await this.updateNote(note)

      onProgress?.({
        stage: 'done',
        progress: 100,
        message: 'Unshield complete!',
      })

      return {
        success: true,
        signature,
        amountReceived: note.amount,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  // ============================================
  // Proof Generation
  // ============================================

  private async generateDepositProof(
    note: DepositNote,
    onProgress?: (progress: { stage: string; percent: number }) => void
  ): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
    const loader = getCircuitLoader()
    const circuits = await loader.load()

    // Prepare input for deposit circuit
    const input = {
      commitment: BigInt('0x' + note.commitment),
      nullifier: BigInt('0x' + note.nullifier),
      secret: BigInt('0x' + note.secret),
      amount: BigInt(note.amount),
    }

    // Try worker first, fallback to inline
    if (this.useWorker) {
      try {
        const worker = getProofWorker()
        return await worker.generateProof(
          input as unknown as Record<string, string | bigint | number>,
          circuits.wasm,
          circuits.zkey,
          onProgress
        )
      } catch (e) {
        console.warn('[BrowserPrivacyClient] Worker failed, falling back to inline:', e)
        this.useWorker = false
      }
    }

    // Inline fallback (blocks main thread)
    return await generateProofInline(
      input as unknown as Record<string, string | bigint | number>,
      circuits.wasm,
      circuits.zkey,
      onProgress
    )
  }

  private async generateWithdrawalProof(
    note: DepositNote,
    recipient: string,
    merkleProof: { root: string; pathElements: string[]; pathIndices: number[] },
    onProgress?: (progress: { stage: string; percent: number }) => void
  ): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
    const loader = getCircuitLoader()
    const circuits = await loader.load()

    const nullifierHash = await computeNullifierHash(hexToBuffer(note.nullifier))

    // Prepare input for withdrawal circuit
    const input = {
      // Private inputs
      nullifier: BigInt('0x' + note.nullifier),
      secret: BigInt('0x' + note.secret),
      pathElements: merkleProof.pathElements.map(e => BigInt('0x' + e)),
      pathIndices: merkleProof.pathIndices,
      // Public inputs
      root: BigInt('0x' + merkleProof.root),
      nullifierHash: BigInt('0x' + nullifierHash),
      recipient: BigInt(new PublicKey(recipient).toBytes().reduce((acc, b) => acc * 256n + BigInt(b), 0n)),
      amount: BigInt(note.amount),
    }

    if (this.useWorker) {
      try {
        const worker = getProofWorker()
        return await worker.generateProof(
          input as unknown as Record<string, string | bigint | number>,
          circuits.wasm,
          circuits.zkey,
          onProgress
        )
      } catch {
        this.useWorker = false
      }
    }

    return await generateProofInline(
      input as unknown as Record<string, string | bigint | number>,
      circuits.wasm,
      circuits.zkey,
      onProgress
    )
  }

  // ============================================
  // Transaction Building
  // ============================================

  private async buildDepositTransaction(
    commitment: string,
    amount: number,
    proof: Groth16Proof,
    publicSignals: string[]
  ): Promise<Transaction> {
    if (!this.walletPublicKey) throw new Error('Wallet not connected')

    // Derive PDAs
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool')],
      PRIVACY_CASH_PROGRAM_ID
    )

    const [commitmentPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('commitment'), hexToBuffer(commitment)],
      PRIVACY_CASH_PROGRAM_ID
    )

    // Build deposit instruction data
    const proofBytes = proofToSolanaFormat(proof)
    const commitmentBytes = hexToBuffer(commitment)
    const signalsBytes = this.encodePublicSignals(publicSignals)

    // Instruction discriminator for 'deposit'
    const discriminator = await sha256('global:deposit')
    const instructionData = Buffer.concat([
      discriminator.slice(0, 8),
      proofBytes,
      commitmentBytes,
      signalsBytes,
    ])

    const tx = new Transaction()

    // Transfer SOL to pool
    tx.add(
      SystemProgram.transfer({
        fromPubkey: this.walletPublicKey,
        toPubkey: poolPda,
        lamports: amount,
      })
    )

    // Add deposit instruction
    tx.add({
      keys: [
        { pubkey: this.walletPublicKey, isSigner: true, isWritable: true },
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: commitmentPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PRIVACY_CASH_PROGRAM_ID,
      data: instructionData,
    })

    // Set recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = this.walletPublicKey

    return tx
  }

  private async buildWithdrawalTransaction(
    nullifier: string,
    recipient: string,
    amount: number,
    proof: Groth16Proof,
    publicSignals: string[]
  ): Promise<Transaction> {
    if (!this.walletPublicKey) throw new Error('Wallet not connected')

    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool')],
      PRIVACY_CASH_PROGRAM_ID
    )

    const nullifierHash = await computeNullifierHash(hexToBuffer(nullifier))
    const [nullifierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('nullifier'), hexToBuffer(nullifierHash)],
      PRIVACY_CASH_PROGRAM_ID
    )

    const recipientPubkey = new PublicKey(recipient)

    const proofBytes = proofToSolanaFormat(proof)
    const signalsBytes = this.encodePublicSignals(publicSignals)

    const discriminator = await sha256('global:withdraw')
    const amountBuffer = Buffer.alloc(8)
    amountBuffer.writeBigUInt64LE(BigInt(amount))

    const instructionData = Buffer.concat([
      discriminator.slice(0, 8),
      proofBytes,
      signalsBytes,
      amountBuffer,
    ])

    const tx = new Transaction()

    tx.add({
      keys: [
        { pubkey: this.walletPublicKey, isSigner: true, isWritable: true },
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: nullifierPda, isSigner: false, isWritable: true },
        { pubkey: recipientPubkey, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PRIVACY_CASH_PROGRAM_ID,
      data: instructionData,
    })

    const { blockhash } = await this.connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = this.walletPublicKey

    return tx
  }

  private encodePublicSignals(signals: string[]): Buffer {
    // Each signal is a 32-byte big-endian integer
    const result = Buffer.alloc(signals.length * 32)
    signals.forEach((signal, i) => {
      const hex = BigInt(signal).toString(16).padStart(64, '0')
      for (let j = 0; j < 32; j++) {
        result[i * 32 + j] = parseInt(hex.substr(j * 2, 2), 16)
      }
    })
    return result
  }

  // ============================================
  // Relayer API
  // ============================================

  private async submitDeposit(signedTx: Transaction, commitment: string): Promise<string> {
    const serialized = signedTx.serialize()

    // Try direct submission first
    try {
      const signature = await this.connection.sendRawTransaction(serialized)
      return signature
    } catch {
      // Fallback to relayer
      console.log('[BrowserPrivacyClient] Direct submission failed, using relayer...')
    }

    const response = await fetch(`${RELAYER_API}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction: bufferToBase64(serialized),
        commitment,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Relayer error: ${error}`)
    }

    const result = await response.json()
    return result.signature
  }

  private async submitWithdrawal(signedTx: Transaction): Promise<string> {
    const serialized = signedTx.serialize()

    // Withdrawal must go through relayer for anonymity
    const response = await fetch(`${RELAYER_API}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction: bufferToBase64(serialized),
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Relayer error: ${error}`)
    }

    const result = await response.json()
    return result.signature
  }

  private async getMerkleProof(commitment: string): Promise<{
    root: string
    pathElements: string[]
    pathIndices: number[]
  }> {
    const response = await fetch(
      `${RELAYER_API}/merkle/proof?commitment=${commitment}`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch merkle proof')
    }

    return response.json()
  }

  private async getLeafIndex(commitment: string): Promise<number> {
    const response = await fetch(
      `${RELAYER_API}/commitment/${commitment}`
    )

    if (!response.ok) return 0

    const data = await response.json()
    return data.leafIndex || 0
  }

  // ============================================
  // Note Storage
  // ============================================

  private async saveNote(note: DepositNote): Promise<void> {
    const notes = await this.loadNotes()
    notes.push(note)
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  }

  private async updateNote(note: DepositNote): Promise<void> {
    const notes = await this.loadNotes()
    const index = notes.findIndex(n => n.commitment === note.commitment)
    if (index >= 0) {
      notes[index] = note
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
    }
  }

  async loadNotes(): Promise<DepositNote[]> {
    const stored = localStorage.getItem(NOTES_STORAGE_KEY)
    if (!stored) return []

    try {
      const notes = JSON.parse(stored)
      return notes.map((n: DepositNote) => ({
        ...n,
        createdAt: new Date(n.createdAt),
      }))
    } catch {
      return []
    }
  }

  /**
   * Encrypt notes with password for backup
   */
  async exportNotes(password: string): Promise<string> {
    const notes = await this.loadNotes()
    const json = JSON.stringify(notes)
    const encrypted = await encryptNote(json, password)
    return JSON.stringify(encrypted)
  }

  /**
   * Import encrypted notes
   */
  async importNotes(encrypted: string, password: string): Promise<void> {
    const encryptedObj = JSON.parse(encrypted)
    const json = await decryptNote(encryptedObj, password)
    const notes = JSON.parse(json)
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  }

  /**
   * Get total shielded balance
   */
  async getShieldedBalance(): Promise<number> {
    const notes = await this.loadNotes()
    return notes
      .filter(n => !n.spent)
      .reduce((sum, n) => sum + n.amount, 0)
  }

  /**
   * Get unspent notes
   */
  async getUnspentNotes(): Promise<DepositNote[]> {
    const notes = await this.loadNotes()
    return notes.filter(n => !n.spent)
  }
}

// ============================================
// Singleton Instance
// ============================================

let clientInstance: BrowserPrivacyClient | null = null

export function getBrowserPrivacyClient(connection: Connection): BrowserPrivacyClient {
  if (!clientInstance) {
    clientInstance = new BrowserPrivacyClient(connection)
  }
  return clientInstance
}
