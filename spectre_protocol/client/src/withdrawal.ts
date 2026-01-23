/**
 * SPECTRE Withdrawal Client
 *
 * Comprehensive client for managing compliant withdrawals from SPECTRE vault.
 * Integrates Range Protocol compliance verification with on-chain transactions.
 *
 * ## Withdrawal Flow
 * 1. Request withdrawal (creates pending withdrawal request on-chain)
 * 2. Get compliance attestation from Range Protocol
 * 3. Complete withdrawal with attestation (transfers funds if compliant)
 *
 * ## Usage
 * ```typescript
 * import { SpectreWithdrawalClient } from './withdrawal';
 *
 * const client = new SpectreWithdrawalClient(provider, program);
 * await client.initializeRangeClient(apiKey);
 *
 * // Full flow
 * const result = await client.executeCompliantWithdrawal(recipient, amount);
 * if (result.success) {
 *   console.log('Withdrawal complete:', result.signature);
 * }
 * ```
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
} from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';

// Import Range Protocol client
import {
  RangeClient,
  RangeAttestation,
  RiskAssessment,
  createRangeAttestation,
  createCleanAttestation,
  passesCompliance,
  isAttestationFresh,
  formatRiskAssessment,
  MAX_ALLOWED_RISK_SCORE,
  MAX_ATTESTATION_AGE_SLOTS,
} from './range';

// ============================================
// Types
// ============================================

export interface WithdrawalResult {
  success: boolean;
  signature?: string;
  requestPda?: PublicKey;
  riskAssessment?: RiskAssessment;
  error?: string;
  complianceStatus?: 'passed' | 'failed' | 'pending';
}

export interface WithdrawalRequest {
  pda: PublicKey;
  bump: number;
  amount: BN;
  requester: PublicKey;
  recipient: PublicKey;
  status: WithdrawalStatus;
  riskScore: number;
  requestedAt: BN;
  updatedAt: BN;
  complianceVerifiedSlot: BN;
}

export enum WithdrawalStatus {
  Pending = 'pending',
  Approved = 'approved',
  Completed = 'completed',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

// ============================================
// PDA Derivation
// ============================================

/**
 * Derive vault PDA
 */
export function deriveVaultPda(
  authority: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('spectre_vault'), authority.toBuffer()],
    programId
  );
}

/**
 * Derive user deposit PDA
 */
export function deriveUserDepositPda(
  vault: PublicKey,
  user: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_deposit'), vault.toBuffer(), user.toBuffer()],
    programId
  );
}

/**
 * Derive withdrawal request PDA
 */
export function deriveWithdrawalRequestPda(
  vault: PublicKey,
  requester: PublicKey,
  nonce: BN,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('withdrawal_request'),
      vault.toBuffer(),
      requester.toBuffer(),
      nonce.toArrayLike(Buffer, 'le', 8),
    ],
    programId
  );
}

// ============================================
// Withdrawal Client
// ============================================

/**
 * SPECTRE Withdrawal Client
 *
 * Manages compliant withdrawals with Range Protocol integration.
 */
export class SpectreWithdrawalClient {
  private provider: AnchorProvider;
  private program: Program;
  private rangeClient: RangeClient | null = null;

  constructor(provider: AnchorProvider, program: Program) {
    this.provider = provider;
    this.program = program;
  }

  /**
   * Initialize the Range Protocol client
   */
  initializeRangeClient(apiKey: string): void {
    if (!apiKey) {
      throw new Error('Range API key is required');
    }
    this.rangeClient = new RangeClient(apiKey);
  }

  /**
   * Get current slot from the blockchain
   */
  async getCurrentSlot(): Promise<number> {
    return await this.provider.connection.getSlot();
  }

  /**
   * Get vault state
   */
  async getVault(authority: PublicKey): Promise<any> {
    const [vaultPda] = deriveVaultPda(authority, this.program.programId);
    try {
      return await this.program.account.spectreVault.fetch(vaultPda);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user deposit state
   */
  async getUserDeposit(vault: PublicKey, user: PublicKey): Promise<any> {
    const [depositPda] = deriveUserDepositPda(vault, user, this.program.programId);
    try {
      return await this.program.account.userDeposit.fetch(depositPda);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get compliance attestation from Range Protocol
   */
  async getComplianceAttestation(
    address: PublicKey
  ): Promise<{ assessment: RiskAssessment; attestation: RangeAttestation }> {
    if (!this.rangeClient) {
      throw new Error('Range client not initialized. Call initializeRangeClient first.');
    }

    const currentSlot = await this.getCurrentSlot();
    const assessment = await this.rangeClient.getAddressRisk(address);

    const attestation = createRangeAttestation(address, assessment, currentSlot);

    return { assessment, attestation };
  }

  /**
   * Request a withdrawal from the vault
   *
   * @param amount - Amount to withdraw in lamports
   * @param recipient - Optional different recipient address
   * @returns Withdrawal result with request PDA
   */
  async requestWithdrawal(
    amount: BN,
    recipient?: PublicKey
  ): Promise<WithdrawalResult> {
    try {
      const authority = this.provider.wallet.publicKey;
      const recipientAddress = recipient || authority;

      const [vaultPda] = deriveVaultPda(authority, this.program.programId);

      // Get vault to determine nonce for withdrawal request
      const vault = await this.getVault(authority);
      if (!vault) {
        return {
          success: false,
          error: 'Vault not found',
          complianceStatus: 'pending',
        };
      }

      // Use total withdrawals as nonce for unique PDA
      const nonce = new BN(vault.totalWithdrawals || 0);
      const [withdrawalRequestPda] = deriveWithdrawalRequestPda(
        vaultPda,
        authority,
        nonce,
        this.program.programId
      );

      const [userDepositPda] = deriveUserDepositPda(
        vaultPda,
        authority,
        this.program.programId
      );

      const signature = await this.program.methods
        .requestWithdrawal(amount)
        .accounts({
          requester: authority,
          recipient: recipientAddress,
          vault: vaultPda,
          userDeposit: userDepositPda,
          withdrawalRequest: withdrawalRequestPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return {
        success: true,
        signature,
        requestPda: withdrawalRequestPda,
        complianceStatus: 'pending',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        complianceStatus: 'pending',
      };
    }
  }

  /**
   * Complete a withdrawal with compliance verification
   *
   * @param withdrawalRequestPda - PDA of the withdrawal request
   * @param recipient - Recipient address for compliance check
   * @returns Withdrawal result
   */
  async completeWithdrawal(
    withdrawalRequestPda: PublicKey,
    recipient: PublicKey
  ): Promise<WithdrawalResult> {
    try {
      const authority = this.provider.wallet.publicKey;

      // Get compliance attestation
      const { assessment, attestation } = await this.getComplianceAttestation(recipient);

      console.log(formatRiskAssessment(assessment));

      // Check if compliance passes
      if (!passesCompliance(assessment)) {
        return {
          success: false,
          riskAssessment: assessment,
          error: `Compliance check failed: Risk score ${assessment.riskScore}/100 (max: ${MAX_ALLOWED_RISK_SCORE})`,
          complianceStatus: 'failed',
        };
      }

      const [vaultPda] = deriveVaultPda(authority, this.program.programId);
      const [userDepositPda] = deriveUserDepositPda(
        vaultPda,
        authority,
        this.program.programId
      );

      // Complete withdrawal on-chain
      const signature = await this.program.methods
        .completeWithdrawal(attestation)
        .accounts({
          authority,
          recipient,
          vault: vaultPda,
          userDeposit: userDepositPda,
          withdrawalRequest: withdrawalRequestPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return {
        success: true,
        signature,
        riskAssessment: assessment,
        complianceStatus: 'passed',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        complianceStatus: 'failed',
      };
    }
  }

  /**
   * Execute a complete compliant withdrawal flow
   *
   * This is the main method that:
   * 1. Requests a withdrawal
   * 2. Gets compliance attestation from Range
   * 3. Completes the withdrawal if compliant
   *
   * @param amount - Amount to withdraw in lamports
   * @param recipient - Optional different recipient address
   * @returns Withdrawal result
   */
  async executeCompliantWithdrawal(
    amount: BN,
    recipient?: PublicKey
  ): Promise<WithdrawalResult> {
    const authority = this.provider.wallet.publicKey;
    const recipientAddress = recipient || authority;

    console.log('\n========================================');
    console.log('SPECTRE Compliant Withdrawal Flow');
    console.log('========================================');
    console.log(`Amount: ${amount.toString()} lamports`);
    console.log(`Recipient: ${recipientAddress.toString()}`);
    console.log('========================================\n');

    // Step 1: Pre-check compliance before even requesting
    console.log('Step 1: Pre-checking recipient compliance...');
    const { assessment, attestation } = await this.getComplianceAttestation(recipientAddress);

    console.log(formatRiskAssessment(assessment));

    if (!passesCompliance(assessment)) {
      console.log('\n❌ Recipient failed compliance check. Withdrawal blocked.');
      return {
        success: false,
        riskAssessment: assessment,
        error: `Pre-check failed: Risk score ${assessment.riskScore}/100 exceeds maximum ${MAX_ALLOWED_RISK_SCORE}`,
        complianceStatus: 'failed',
      };
    }

    console.log('✓ Recipient passed compliance pre-check\n');

    // Step 2: Request withdrawal
    console.log('Step 2: Requesting withdrawal on-chain...');
    const requestResult = await this.requestWithdrawal(amount, recipientAddress);

    if (!requestResult.success) {
      console.log(`\n❌ Withdrawal request failed: ${requestResult.error}`);
      return requestResult;
    }

    console.log(`✓ Withdrawal requested: ${requestResult.signature?.slice(0, 16)}...`);
    console.log(`  Request PDA: ${requestResult.requestPda?.toString()}\n`);

    // Step 3: Complete withdrawal with attestation
    console.log('Step 3: Completing withdrawal with attestation...');
    const completeResult = await this.completeWithdrawal(
      requestResult.requestPda!,
      recipientAddress
    );

    if (!completeResult.success) {
      console.log(`\n❌ Withdrawal completion failed: ${completeResult.error}`);
      return completeResult;
    }

    console.log(`✓ Withdrawal completed: ${completeResult.signature?.slice(0, 16)}...`);
    console.log('\n========================================');
    console.log('Withdrawal Successful!');
    console.log('========================================\n');

    return {
      success: true,
      signature: completeResult.signature,
      requestPda: requestResult.requestPda,
      riskAssessment: assessment,
      complianceStatus: 'passed',
    };
  }

  /**
   * Check if an address is compliant without executing a withdrawal
   */
  async checkAddressCompliance(address: PublicKey): Promise<{
    compliant: boolean;
    assessment: RiskAssessment;
    message: string;
  }> {
    const { assessment } = await this.getComplianceAttestation(address);
    const compliant = passesCompliance(assessment);

    let message: string;
    if (compliant) {
      message = `Address is compliant. Risk score: ${assessment.riskScore}/100`;
    } else if (assessment.isSanctioned) {
      message = 'Address is on OFAC sanctions list';
    } else if (assessment.hasMaliciousConnections) {
      message = 'Address has malicious connections';
    } else {
      message = `Risk score ${assessment.riskScore}/100 exceeds maximum ${MAX_ALLOWED_RISK_SCORE}`;
    }

    return { compliant, assessment, message };
  }

  /**
   * Get all withdrawal requests for a user
   */
  async getUserWithdrawalRequests(user: PublicKey): Promise<any[]> {
    const [vaultPda] = deriveVaultPda(user, this.program.programId);

    try {
      // Fetch all withdrawal request accounts
      const accounts = await this.program.account.withdrawalRequest.all([
        {
          memcmp: {
            offset: 8 + 32, // After discriminator and vault pubkey
            bytes: user.toBase58(),
          },
        },
      ]);

      return accounts.map((account) => ({
        pda: account.publicKey,
        ...account.account,
      }));
    } catch (error) {
      console.error('Error fetching withdrawal requests:', error);
      return [];
    }
  }
}

// ============================================
// Export factory function
// ============================================

/**
 * Create a withdrawal client from environment
 */
export function createWithdrawalClientFromEnv(
  provider: AnchorProvider,
  program: Program
): SpectreWithdrawalClient {
  const client = new SpectreWithdrawalClient(provider, program);

  const apiKey = process.env.RANGE_PROTOCOL_API_KEY;
  if (apiKey) {
    client.initializeRangeClient(apiKey);
  }

  return client;
}

export default SpectreWithdrawalClient;
