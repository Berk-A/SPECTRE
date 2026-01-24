/**
 * Browser-Compatible MagicBlock TEE Client
 * Handles delegation to TEE ephemeral rollup for fast trading
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

// ============================================
// Configuration
// ============================================

// MagicBlock Program IDs
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh')
const MAGIC_PROGRAM_ID = new PublicKey('Magic11111111111111111111111111111111111111')
const MAGIC_CONTEXT_ID = new PublicKey('MagicContext1111111111111111111111111111111')

// RPC endpoints
const L1_RPC = 'https://api.devnet.solana.com'
const TEE_RPC = 'https://devnet.magicblock.app'

// SPECTRE Program ID
const SPECTRE_PROGRAM_ID = new PublicKey('6ypxTTHK4q9VC7bABp8U3Sptdt6qNQ7uJHoMqNWKmTuW')

// Poll interval for undelegation confirmation
const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 30 // 60 seconds max wait

// ============================================
// Types
// ============================================

export interface DelegationStatus {
  isDelegated: boolean
  vaultPda: string | null
  owner: string | null
  delegatedAt?: Date
  teeSlot?: number
}

export interface DelegationResult {
  success: boolean
  signature?: string
  vaultPda?: string
  error?: string
}

export interface UndelegationResult {
  success: boolean
  signature?: string
  l1Signature?: string
  error?: string
}

export interface TeeExecutionResult {
  success: boolean
  signature?: string
  l2Slot?: number
  executionTimeMs?: number
  error?: string
}

// ============================================
// Browser TEE Client
// ============================================

export class BrowserTeeClient {
  private l1Connection: Connection
  private teeConnection: Connection
  private walletPublicKey: PublicKey | null = null
  private signTransaction: ((tx: Transaction) => Promise<Transaction>) | null = null
  // signAllTransactions reserved for future batch operations

  constructor(l1Rpc?: string, teeRpc?: string) {
    this.l1Connection = new Connection(l1Rpc || L1_RPC, 'confirmed')
    this.teeConnection = new Connection(teeRpc || TEE_RPC, 'confirmed')
  }

  /**
   * Set wallet for signing transactions
   */
  setWallet(
    publicKey: PublicKey,
    signTransaction: (tx: Transaction) => Promise<Transaction>,
    _signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>
  ): void {
    this.walletPublicKey = publicKey
    this.signTransaction = signTransaction
    // signAllTransactions reserved for future batch operations
  }

  /**
   * Get the vault PDA for a user
   */
  getVaultPda(authority: PublicKey): PublicKey {
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('spectre_vault'), authority.toBuffer()],
      SPECTRE_PROGRAM_ID
    )
    return vaultPda
  }

  /**
   * Get the delegation record PDA
   */
  getDelegationRecordPda(vault: PublicKey): PublicKey {
    const [recordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('delegation'), vault.toBuffer()],
      DELEGATION_PROGRAM_ID
    )
    return recordPda
  }

  /**
   * Check if a vault is delegated to TEE
   */
  async checkDelegationStatus(authority: PublicKey): Promise<DelegationStatus> {
    try {
      const vaultPda = this.getVaultPda(authority)
      const delegationRecord = this.getDelegationRecordPda(vaultPda)

      // Check if delegation record exists
      const recordInfo = await this.l1Connection.getAccountInfo(delegationRecord)

      if (!recordInfo) {
        return {
          isDelegated: false,
          vaultPda: vaultPda.toBase58(),
          owner: authority.toBase58(),
        }
      }

      // Parse delegation record
      // Format: [8 bytes discriminator][32 bytes vault][8 bytes slot][1 byte is_active]
      const data = recordInfo.data

      if (data.length < 49) {
        return {
          isDelegated: false,
          vaultPda: vaultPda.toBase58(),
          owner: authority.toBase58(),
        }
      }

      const teeSlot = new BN(data.slice(40, 48), 'le').toNumber()
      const isActive = data[48] === 1

      return {
        isDelegated: isActive,
        vaultPda: vaultPda.toBase58(),
        owner: authority.toBase58(),
        delegatedAt: new Date(), // Would need to query for actual timestamp
        teeSlot,
      }
    } catch (error) {
      console.error('[BrowserTeeClient] Failed to check delegation status:', error)
      return {
        isDelegated: false,
        vaultPda: null,
        owner: authority.toBase58(),
      }
    }
  }

  /**
   * Delegate vault to TEE
   * This is executed on L1 (Solana mainnet/devnet)
   */
  async delegateVault(authority: PublicKey): Promise<DelegationResult> {
    if (!this.walletPublicKey || !this.signTransaction) {
      return { success: false, error: 'Wallet not connected' }
    }

    if (!authority.equals(this.walletPublicKey)) {
      return { success: false, error: 'Authority must match connected wallet' }
    }

    try {
      const vaultPda = this.getVaultPda(authority)
      const delegationRecord = this.getDelegationRecordPda(vaultPda)

      // Check if vault account exists, create if not
      const vaultInfo = await this.l1Connection.getAccountInfo(vaultPda)

      const tx = new Transaction()

      if (!vaultInfo) {
        // Initialize vault first
        const initVaultIx = await this.buildInitVaultInstruction(authority, vaultPda)
        tx.add(initVaultIx)
      }

      // Add delegation instruction
      const delegateIx = await this.buildDelegateInstruction(
        authority,
        vaultPda,
        delegationRecord
      )
      tx.add(delegateIx)

      // Set blockhash and fee payer
      const { blockhash } = await this.l1Connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = authority

      // Sign
      const signedTx = await this.signTransaction(tx)

      // Send to L1
      const signature = await this.l1Connection.sendRawTransaction(signedTx.serialize())

      // Confirm
      await this.l1Connection.confirmTransaction(signature, 'confirmed')

      // Wait for TEE to pick up delegation
      await this.waitForTeeDelegation(vaultPda)

      return {
        success: true,
        signature,
        vaultPda: vaultPda.toBase58(),
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Undelegate vault from TEE
   * IMPORTANT: This must be executed on the TEE RPC, not L1!
   */
  async undelegateVault(authority: PublicKey): Promise<UndelegationResult> {
    if (!this.walletPublicKey || !this.signTransaction) {
      return { success: false, error: 'Wallet not connected' }
    }

    if (!authority.equals(this.walletPublicKey)) {
      return { success: false, error: 'Authority must match connected wallet' }
    }

    try {
      const vaultPda = this.getVaultPda(authority)

      // Build undelegate instruction
      const undelegateIx = await this.buildUndelegateInstruction(authority, vaultPda)

      const tx = new Transaction().add(undelegateIx)

      // Get blockhash from TEE RPC
      const { blockhash } = await this.teeConnection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = authority

      // Sign
      const signedTx = await this.signTransaction(tx)

      // Send to TEE RPC (not L1!)
      const signature = await this.teeConnection.sendRawTransaction(signedTx.serialize())

      // Confirm on TEE
      await this.teeConnection.confirmTransaction(signature, 'confirmed')

      // Wait for undelegation to sync to L1
      const l1Confirmed = await this.waitForL1Sync(vaultPda)

      return {
        success: true,
        signature,
        l1Signature: l1Confirmed ? 'synced' : undefined,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Execute a transaction on the TEE (L2)
   * Used for fast trading operations
   */
  async executeOnTee(transaction: Transaction): Promise<TeeExecutionResult> {
    if (!this.walletPublicKey || !this.signTransaction) {
      return { success: false, error: 'Wallet not connected' }
    }

    try {
      const startTime = Date.now()

      // Get blockhash from TEE
      const { blockhash } = await this.teeConnection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = this.walletPublicKey

      // Sign
      const signedTx = await this.signTransaction(transaction)

      // Send to TEE
      const signature = await this.teeConnection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true, // TEE handles validation
      })

      // Confirm on TEE (should be ~400ms)
      const confirmation = await this.teeConnection.confirmTransaction(signature, 'confirmed')

      const executionTimeMs = Date.now() - startTime

      return {
        success: true,
        signature,
        l2Slot: confirmation.context.slot,
        executionTimeMs,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Get TEE health status
   */
  async getTeeHealth(): Promise<{
    healthy: boolean
    latencyMs: number
    slot: number
  }> {
    try {
      const startTime = Date.now()
      const slot = await this.teeConnection.getSlot()
      const latencyMs = Date.now() - startTime

      return {
        healthy: true,
        latencyMs,
        slot,
      }
    } catch {
      return {
        healthy: false,
        latencyMs: -1,
        slot: 0,
      }
    }
  }

  // ============================================
  // Instruction Builders
  // ============================================

  private async buildInitVaultInstruction(
    authority: PublicKey,
    vault: PublicKey
  ): Promise<TransactionInstruction> {
    // SPECTRE vault initialization
    // Discriminator for 'init_vault'
    const discriminator = Buffer.from([
      0x4c, 0x88, 0x14, 0x5d, 0x12, 0xb8, 0x71, 0xf3,
    ]) // sha256("global:init_vault")[0:8]

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: SPECTRE_PROGRAM_ID,
      data: discriminator,
    })
  }

  private async buildDelegateInstruction(
    authority: PublicKey,
    vault: PublicKey,
    delegationRecord: PublicKey
  ): Promise<TransactionInstruction> {
    // MagicBlock delegation instruction
    // Discriminator for 'delegate'
    const discriminator = Buffer.from([
      0x90, 0xc1, 0xb8, 0x92, 0x3e, 0x5f, 0x3a, 0xd2,
    ])

    // Delegation args: valid_until (i64), commit_frequency_ms (u32)
    const validUntil = Buffer.alloc(8)
    validUntil.writeBigInt64LE(BigInt(Date.now() + 86400000)) // 24 hours

    const commitFrequency = Buffer.alloc(4)
    commitFrequency.writeUInt32LE(10000) // 10 seconds

    const data = Buffer.concat([discriminator, validUntil, commitFrequency])

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: delegationRecord, isSigner: false, isWritable: true },
        { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: DELEGATION_PROGRAM_ID,
      data,
    })
  }

  private async buildUndelegateInstruction(
    authority: PublicKey,
    vault: PublicKey
  ): Promise<TransactionInstruction> {
    // Undelegate discriminator
    const discriminator = Buffer.from([
      0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x70, 0x81,
    ])

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: DELEGATION_PROGRAM_ID,
      data: discriminator,
    })
  }

  // ============================================
  // Wait/Poll Helpers
  // ============================================

  private async waitForTeeDelegation(vault: PublicKey): Promise<void> {
    // Wait for TEE to pick up the delegation
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      try {
        const accountInfo = await this.teeConnection.getAccountInfo(vault)
        if (accountInfo) {
          console.log('[BrowserTeeClient] TEE has picked up delegation')
          return
        }
      } catch {
        // Expected to fail initially
      }

      await this.sleep(POLL_INTERVAL_MS)
    }

    console.warn('[BrowserTeeClient] TEE delegation pickup timed out')
  }

  private async waitForL1Sync(_vault: PublicKey): Promise<boolean> {
    // Wait for undelegation to sync back to L1
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      try {
        const status = await this.checkDelegationStatus(
          // Get authority from vault PDA (simplified - in practice you'd store this)
          this.walletPublicKey!
        )

        if (!status.isDelegated) {
          console.log('[BrowserTeeClient] Undelegation synced to L1')
          return true
        }
      } catch {
        // Continue polling
      }

      await this.sleep(POLL_INTERVAL_MS)
    }

    console.warn('[BrowserTeeClient] L1 sync timed out')
    return false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get L1 connection
   */
  getL1Connection(): Connection {
    return this.l1Connection
  }

  /**
   * Get TEE connection
   */
  getTeeConnection(): Connection {
    return this.teeConnection
  }

  /**
   * Estimate delegation cost (rent + fees)
   */
  async estimateDelegationCost(): Promise<number> {
    // Vault account rent (~0.002 SOL)
    // Delegation record rent (~0.001 SOL)
    // Transaction fees (~0.000005 SOL)
    return 0.003 * LAMPORTS_PER_SOL
  }
}

// ============================================
// Singleton Instance
// ============================================

let clientInstance: BrowserTeeClient | null = null

export function getBrowserTeeClient(l1Rpc?: string, teeRpc?: string): BrowserTeeClient {
  if (!clientInstance) {
    clientInstance = new BrowserTeeClient(l1Rpc, teeRpc)
  }
  return clientInstance
}
