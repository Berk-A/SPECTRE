/**
 * SPECTRE TEE Client
 *
 * TypeScript client for MagicBlock TEE (Trusted Execution Environment) operations.
 *
 * This module provides:
 * - Account delegation to TEE enclaves
 * - Account undelegation from TEE enclaves
 * - TEE connection management
 * - PDA derivation for delegation accounts
 *
 * ## Important: Async Behavior
 *
 * MagicBlock's ephemeral rollups work asynchronously:
 *
 * 1. **Delegation**: Happens synchronously on L1, transfers ownership to delegation program
 * 2. **TEE Operations**: Execute on TEE devnet (https://devnet.magicblock.app)
 * 3. **Undelegation**: SCHEDULES a commit - actual L1 sync is async
 * 4. **L1 Sync**: TEE validator processes commits at its own pace
 *
 * After undelegation, you must wait for the vault ownership to return to SPECTRE
 * before performing further operations. This can take time depending on TEE validator load.
 *
 * Usage:
 *   import { SpectreTeeCient } from './tee';
 *
 *   const teeClient = new SpectreTeeCient(provider, programId);
 *
 *   // Delegation (on L1)
 *   await teeClient.delegateVault(authority);
 *
 *   // Operations happen on TEE devnet...
 *
 *   // Undelegation (on TEE devnet - async!)
 *   await teeClient.undelegateVault(authority);
 *
 *   // Wait for L1 sync before next operation
 *   await teeClient.waitForUndelegation(authority);
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { Program, AnchorProvider, BN, Idl } from '@coral-xyz/anchor';

// ============================================
// Constants
// ============================================

/**
 * MagicBlock Delegation Program ID
 * This is the program that manages account delegation to TEE enclaves
 */
export const DELEGATION_PROGRAM_ID = new PublicKey(
  'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
);

/**
 * MagicBlock Magic Program ID
 * Used for ephemeral operations like commit and undelegate
 */
export const MAGIC_PROGRAM_ID = new PublicKey(
  'Magic11111111111111111111111111111111111111'
);

/**
 * MagicBlock Magic Context Account
 * Stores scheduling information for commits
 */
export const MAGIC_CONTEXT_ID = new PublicKey(
  'MagicContext1111111111111111111111111111111'
);

/**
 * TEE Devnet RPC Endpoint
 */
export const TEE_DEVNET_RPC = 'https://devnet.magicblock.app';

/**
 * Standard Solana Devnet RPC
 */
export const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';

// PDA Seeds for delegation accounts
// These must match the seeds in the MagicBlock delegation program
const DELEGATE_BUFFER_TAG = Buffer.from('buffer');
const DELEGATION_RECORD_TAG = Buffer.from('delegation');  // Note: NOT 'delegation-record'
const DELEGATION_METADATA_TAG = Buffer.from('delegation-metadata');

// SPECTRE Program PDA Seeds
const VAULT_SEED = Buffer.from('spectre_vault');
const STRATEGY_CONFIG_SEED = Buffer.from('strategy_config');

// ============================================
// Types
// ============================================

export interface TeeClientConfig {
  /** L1 Solana RPC endpoint */
  l1RpcUrl: string;
  /** MagicBlock TEE RPC endpoint */
  teeRpcUrl: string;
  /** SPECTRE program ID */
  programId: PublicKey;
  /** Default commit frequency in ms (how often TEE commits state to L1) */
  commitFrequencyMs: number;
}

export interface DelegationResult {
  success: boolean;
  signature?: string;
  error?: string;
  vaultPda: PublicKey;
  delegatedAt?: Date;
}

export interface UndelegationResult {
  success: boolean;
  signature?: string;
  error?: string;
  vaultPda: PublicKey;
  undelegatedAt?: Date;
}

export interface VaultDelegationStatus {
  isDelegated: boolean;
  vaultPda: PublicKey;
  authority: PublicKey;
  delegationRecord?: PublicKey;
  delegationMetadata?: PublicKey;
}

// ============================================
// PDA Derivation Functions
// ============================================

/**
 * Derive the buffer PDA for a delegated account
 *
 * The buffer PDA is owned by the owner program (SPECTRE), NOT the delegation program.
 * Seeds: ["buffer", delegated_account]
 * Program: owner_program (SPECTRE program ID)
 */
export function deriveBufferPda(
  delegatedAccount: PublicKey,
  ownerProgram: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DELEGATE_BUFFER_TAG, delegatedAccount.toBuffer()],
    ownerProgram  // Buffer is a PDA of the owner program, NOT delegation program
  );
}

/**
 * Derive the delegation record PDA for a delegated account
 */
export function deriveDelegationRecordPda(
  delegatedAccount: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_RECORD_TAG, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

/**
 * Derive the delegation metadata PDA for a delegated account
 */
export function deriveDelegationMetadataPda(
  delegatedAccount: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_METADATA_TAG, delegatedAccount.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
}

/**
 * Derive the SPECTRE vault PDA for an authority
 */
export function deriveVaultPda(
  authority: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, authority.toBuffer()],
    programId
  );
}

/**
 * Derive the strategy config PDA for a vault
 */
export function deriveStrategyConfigPda(
  vault: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STRATEGY_CONFIG_SEED, vault.toBuffer()],
    programId
  );
}

// ============================================
// TEE Client Class
// ============================================

/**
 * SPECTRE TEE Client
 *
 * Manages delegation and undelegation of SPECTRE accounts to/from
 * MagicBlock's TEE (Trusted Execution Environment).
 */
export class SpectreTeeCient {
  private config: TeeClientConfig;
  private l1Connection: Connection;
  private teeConnection: Connection;
  private provider: AnchorProvider;
  private program: Program | null = null;

  constructor(
    provider: AnchorProvider,
    programId: PublicKey,
    config: Partial<TeeClientConfig> = {}
  ) {
    this.provider = provider;
    this.config = {
      l1RpcUrl: config.l1RpcUrl || SOLANA_DEVNET_RPC,
      teeRpcUrl: config.teeRpcUrl || TEE_DEVNET_RPC,
      programId: programId,
      commitFrequencyMs: config.commitFrequencyMs || 3000,
    };

    this.l1Connection = new Connection(this.config.l1RpcUrl, 'confirmed');
    this.teeConnection = new Connection(this.config.teeRpcUrl, 'confirmed');
  }

  /**
   * Set the SPECTRE program instance
   */
  setProgram(program: Program): void {
    this.program = program;
  }

  /**
   * Get the L1 (Solana mainnet/devnet) connection
   */
  getL1Connection(): Connection {
    return this.l1Connection;
  }

  /**
   * Get the TEE (MagicBlock) connection
   */
  getTeeConnection(): Connection {
    return this.teeConnection;
  }

  /**
   * Delegate a vault to the TEE enclave
   *
   * This transfers ownership of the vault account to the delegation program,
   * allowing it to be processed in encrypted TEE memory.
   */
  async delegateVault(
    authority: PublicKey
  ): Promise<DelegationResult> {
    if (!this.program) {
      return {
        success: false,
        error: 'Program not set. Call setProgram() first.',
        vaultPda: PublicKey.default,
      };
    }

    try {
      // Derive PDAs
      const [vaultPda] = deriveVaultPda(authority, this.config.programId);
      const [bufferPda] = deriveBufferPda(vaultPda, this.config.programId);
      const [delegationRecordPda] = deriveDelegationRecordPda(vaultPda);
      const [delegationMetadataPda] = deriveDelegationMetadataPda(vaultPda);

      console.log('Delegating vault to TEE:');
      console.log('  Vault PDA:', vaultPda.toString());
      console.log('  Buffer PDA:', bufferPda.toString());
      console.log('  Delegation Record:', delegationRecordPda.toString());
      console.log('  Delegation Metadata:', delegationMetadataPda.toString());

      // Call the delegate_to_tee instruction
      // Note: account names must match Rust struct field names (snake_case -> camelCase)
      const signature = await this.program.methods
        .delegateToTee()
        .accounts({
          payer: authority,  // Rust uses 'payer', not 'authority'
          vault: vaultPda,
          ownerProgram: this.config.programId,
          buffer: bufferPda,
          delegationRecord: delegationRecordPda,
          delegationMetadata: delegationMetadataPda,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Delegation successful:', signature);

      return {
        success: true,
        signature,
        vaultPda,
        delegatedAt: new Date(),
      };
    } catch (error: any) {
      console.error('Delegation failed:', error);
      return {
        success: false,
        error: error.message || String(error),
        vaultPda: PublicKey.default,
      };
    }
  }

  /**
   * Undelegate a vault from the TEE enclave
   *
   * This returns ownership of the vault account back to the SPECTRE program,
   * committing the final state to L1 Solana.
   *
   * IMPORTANT: This operation MUST be executed on the TEE devnet endpoint,
   * not on L1 Solana devnet. The commit_and_undelegate function requires
   * access to the MagicContext account which is only available in the TEE runtime.
   *
   * @param authority - The authority/payer public key
   * @param useTeeConnection - If true, uses TEE devnet connection (required for actual undelegation)
   */
  async undelegateVault(
    authority: PublicKey,
    useTeeConnection: boolean = true
  ): Promise<UndelegationResult> {
    if (!this.program) {
      return {
        success: false,
        error: 'Program not set. Call setProgram() first.',
        vaultPda: PublicKey.default,
      };
    }

    try {
      // Derive PDAs
      const [vaultPda] = deriveVaultPda(authority, this.config.programId);

      console.log('Undelegating vault from TEE:');
      console.log('  Vault PDA:', vaultPda.toString());
      console.log('  Magic Context:', MAGIC_CONTEXT_ID.toString());
      console.log('  Magic Program:', MAGIC_PROGRAM_ID.toString());
      console.log('  Using TEE connection:', useTeeConnection);
      console.log('  TEE RPC:', this.config.teeRpcUrl);

      // For undelegation, we need to use the TEE connection
      // The magic context account only exists in the TEE runtime
      if (useTeeConnection) {
        // Create a provider with TEE connection
        const teeProvider = new AnchorProvider(
          this.teeConnection,
          this.provider.wallet,
          { commitment: 'confirmed' }
        );

        // Create a new program instance with TEE provider
        const teeProgram = new Program(
          this.program.idl,
          teeProvider
        );

        // Call undelegation on TEE devnet
        const signature = await teeProgram.methods
          .undelegateFromTee()
          .accounts({
            payer: authority,
            vault: vaultPda,
            magicContext: MAGIC_CONTEXT_ID,
            magicProgram: MAGIC_PROGRAM_ID,
          })
          .rpc();

        console.log('Undelegation successful:', signature);

        return {
          success: true,
          signature,
          vaultPda,
          undelegatedAt: new Date(),
        };
      } else {
        // Fall back to L1 (will fail, but useful for testing error handling)
        const signature = await this.program.methods
          .undelegateFromTee()
          .accounts({
            payer: authority,
            vault: vaultPda,
            magicContext: MAGIC_CONTEXT_ID,
            magicProgram: MAGIC_PROGRAM_ID,
          })
          .rpc();

        console.log('Undelegation successful:', signature);

        return {
          success: true,
          signature,
          vaultPda,
          undelegatedAt: new Date(),
        };
      }
    } catch (error: any) {
      console.error('Undelegation failed:', error);
      return {
        success: false,
        error: error.message || String(error),
        vaultPda: PublicKey.default,
      };
    }
  }

  /**
   * Check if a vault is currently delegated to the TEE
   */
  async checkDelegationStatus(
    authority: PublicKey
  ): Promise<VaultDelegationStatus> {
    const [vaultPda] = deriveVaultPda(authority, this.config.programId);
    const [delegationRecordPda] = deriveDelegationRecordPda(vaultPda);
    const [delegationMetadataPda] = deriveDelegationMetadataPda(vaultPda);

    // Check if the delegation record exists
    const delegationRecordInfo = await this.l1Connection.getAccountInfo(
      delegationRecordPda
    );

    const isDelegated = delegationRecordInfo !== null;

    return {
      isDelegated,
      vaultPda,
      authority,
      delegationRecord: isDelegated ? delegationRecordPda : undefined,
      delegationMetadata: isDelegated ? delegationMetadataPda : undefined,
    };
  }

  /**
   * Wait for undelegation to complete on L1
   *
   * After calling undelegateVault(), the actual L1 sync is asynchronous.
   * This method polls the vault's ownership until it returns to SPECTRE
   * or times out.
   *
   * @param authority - The authority public key
   * @param timeoutMs - Maximum time to wait (default: 120000ms / 2 minutes)
   * @param pollIntervalMs - Time between checks (default: 3000ms)
   * @returns true if undelegation completed, false if timed out
   */
  async waitForUndelegation(
    authority: PublicKey,
    timeoutMs: number = 120000,
    pollIntervalMs: number = 3000
  ): Promise<boolean> {
    const [vaultPda] = deriveVaultPda(authority, this.config.programId);
    const startTime = Date.now();

    console.log(`Waiting for undelegation to complete (timeout: ${timeoutMs / 1000}s)...`);

    while (Date.now() - startTime < timeoutMs) {
      const vaultInfo = await this.l1Connection.getAccountInfo(vaultPda);

      if (vaultInfo && vaultInfo.owner.equals(this.config.programId)) {
        console.log('Undelegation complete - vault ownership restored to SPECTRE');
        return true;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  Waiting for L1 sync... (${elapsed}s elapsed)`);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    console.log('Undelegation timeout - vault still owned by delegation program');
    return false;
  }

  /**
   * Execute a transaction on the TEE
   *
   * This sends a transaction to the TEE endpoint for execution
   * in the encrypted enclave.
   */
  async executeOnTee(
    transaction: Transaction,
    signers: Keypair[]
  ): Promise<string> {
    // Use the TEE connection for execution
    const blockhash = await this.teeConnection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.feePayer = this.provider.wallet.publicKey;

    // Sign and send
    const signature = await this.teeConnection.sendTransaction(
      transaction,
      signers,
      { skipPreflight: false }
    );

    await this.teeConnection.confirmTransaction(signature, 'confirmed');

    return signature;
  }

  /**
   * Get vault account data from the TEE
   *
   * When the vault is delegated, its state lives in the TEE.
   * This method fetches the current state from the TEE endpoint.
   */
  async getVaultFromTee(authority: PublicKey): Promise<any | null> {
    if (!this.program) {
      throw new Error('Program not set. Call setProgram() first.');
    }

    const [vaultPda] = deriveVaultPda(authority, this.config.programId);

    try {
      // Create a provider with TEE connection
      const teeProvider = new AnchorProvider(
        this.teeConnection,
        this.provider.wallet,
        { commitment: 'confirmed' }
      );

      // Fetch account using TEE connection
      const accountInfo = await this.teeConnection.getAccountInfo(vaultPda);

      if (!accountInfo) {
        return null;
      }

      // Decode the account data using the program's account coder
      return this.program.coder.accounts.decode('SpectreVault', accountInfo.data);
    } catch (error) {
      console.error('Failed to fetch vault from TEE:', error);
      return null;
    }
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a TEE-aware provider that can switch between L1 and TEE connections
 */
export function createTeeAwareProvider(
  l1Connection: Connection,
  teeConnection: Connection,
  wallet: any,
  useTee: boolean = false
): AnchorProvider {
  const connection = useTee ? teeConnection : l1Connection;
  return new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
}

/**
 * Wait for a delegation to be confirmed on both L1 and TEE
 */
export async function waitForDelegation(
  l1Connection: Connection,
  teeConnection: Connection,
  vaultPda: PublicKey,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const [delegationRecordPda] = deriveDelegationRecordPda(vaultPda);

    // Check if delegation record exists on L1
    const l1Record = await l1Connection.getAccountInfo(delegationRecordPda);

    if (l1Record !== null) {
      // Also verify the account is accessible on TEE
      const teeAccount = await teeConnection.getAccountInfo(vaultPda);

      if (teeAccount !== null) {
        return true;
      }
    }

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

/**
 * Print delegation status for debugging
 */
export function printDelegationStatus(status: VaultDelegationStatus): void {
  console.log('\n========================================');
  console.log('Vault Delegation Status');
  console.log('========================================');
  console.log(`  Authority: ${status.authority.toString()}`);
  console.log(`  Vault PDA: ${status.vaultPda.toString()}`);
  console.log(`  Is Delegated: ${status.isDelegated}`);

  if (status.isDelegated) {
    console.log(`  Delegation Record: ${status.delegationRecord?.toString()}`);
    console.log(`  Delegation Metadata: ${status.delegationMetadata?.toString()}`);
  }

  console.log('========================================\n');
}

export default SpectreTeeCient;
