/**
 * SPECTRE Withdrawal Compliance Tests
 *
 * End-to-end tests for compliant withdrawals integrating:
 * - Range Protocol compliance verification
 * - On-chain withdrawal flow
 * - Compliance attestation verification
 */

import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import assert from 'assert';
import { SpectreProtocol } from '../target/types/spectre_protocol';

// Import withdrawal client
import {
  SpectreWithdrawalClient,
  deriveVaultPda,
  deriveUserDepositPda,
} from '../client/src/withdrawal';

// Import Range utilities
import {
  passesCompliance,
  formatRiskAssessment,
  MAX_ALLOWED_RISK_SCORE,
} from '../client/src/range';

// Test configuration
const RANGE_API_KEY = process.env.RANGE_PROTOCOL_API_KEY || 'cmkmprr1d002cns0190metogx.yj3hFQk2jW2zCZtGlg1RdF89hrFJ6lSV';

describe('SPECTRE Withdrawal Compliance', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpectreProtocol as Program<SpectreProtocol>;
  const authority = provider.wallet.publicKey;

  let withdrawalClient: SpectreWithdrawalClient;
  let vaultPda: PublicKey;
  let vaultSolPda: PublicKey;
  let userDepositPda: PublicKey;

  before(async () => {
    console.log('\n========================================');
    console.log('SPECTRE Withdrawal Compliance Tests');
    console.log('========================================');
    console.log(`Program ID: ${program.programId.toString()}`);
    console.log(`Authority: ${authority.toString()}`);
    console.log('========================================\n');

    // Initialize withdrawal client
    withdrawalClient = new SpectreWithdrawalClient(provider, program);
    withdrawalClient.initializeRangeClient(RANGE_API_KEY);

    // Derive PDAs
    [vaultPda] = deriveVaultPda(authority, program.programId);
    [vaultSolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('spectre_vault'), authority.toBuffer(), Buffer.from('sol')],
      program.programId
    );
    [userDepositPda] = deriveUserDepositPda(vaultPda, authority, program.programId);
  });

  describe('Client Initialization', () => {
    it('should initialize withdrawal client', () => {
      assert.ok(withdrawalClient, 'Withdrawal client should be initialized');
    });

    it('should require Range API key', () => {
      const newClient = new SpectreWithdrawalClient(provider, program);
      assert.throws(
        () => newClient.initializeRangeClient(''),
        /Range API key is required/,
        'Should require API key'
      );
    });
  });

  describe('Compliance Checking', () => {
    it('should check address compliance', async function () {
      this.timeout(15000);

      const result = await withdrawalClient.checkAddressCompliance(authority);

      console.log(`  Compliant: ${result.compliant}`);
      console.log(`  Message: ${result.message}`);
      console.log(formatRiskAssessment(result.assessment));

      assert.ok(typeof result.compliant === 'boolean', 'Should have compliance status');
      assert.ok(result.assessment, 'Should have risk assessment');
      assert.ok(result.message, 'Should have message');
    });

    it('should get compliance attestation', async function () {
      this.timeout(15000);

      const { assessment, attestation } = await withdrawalClient.getComplianceAttestation(authority);

      assert.ok(assessment, 'Should have assessment');
      assert.ok(attestation, 'Should have attestation');
      assert.ok(attestation.address.equals(authority), 'Attestation address should match');
      assert.ok(typeof attestation.riskScore === 'number', 'Should have risk score');
      assert.ok(attestation.attestationSlot, 'Should have attestation slot');

      console.log(`  Risk Score: ${attestation.riskScore}`);
      console.log(`  Slot: ${attestation.attestationSlot.toString()}`);
    });

    it('should correctly determine compliance pass/fail', () => {
      // Low risk should pass
      const lowRiskAssessment = {
        passed: true,
        riskScore: 10,
        riskLevel: 'low' as any,
        isSanctioned: false,
        hasMaliciousConnections: false,
        numHops: 0,
      };
      assert.ok(passesCompliance(lowRiskAssessment), 'Low risk should pass');

      // High risk should fail
      const highRiskAssessment = {
        passed: false,
        riskScore: 50,
        riskLevel: 'medium' as any,
        isSanctioned: false,
        hasMaliciousConnections: false,
        numHops: 0,
      };
      assert.ok(!passesCompliance(highRiskAssessment), 'High risk should fail');

      // Sanctioned should fail regardless of score
      const sanctionedAssessment = {
        passed: false,
        riskScore: 5,
        riskLevel: 'low' as any,
        isSanctioned: true,
        hasMaliciousConnections: false,
        numHops: 0,
      };
      assert.ok(!passesCompliance(sanctionedAssessment), 'Sanctioned should fail');
    });
  });

  describe('Vault Prerequisites', () => {
    it('should initialize vault if not exists', async function () {
      this.timeout(30000);

      const vaultAccount = await provider.connection.getAccountInfo(vaultPda);

      if (vaultAccount === null) {
        console.log('  Initializing vault...');

        const modelHash = new Array(32).fill(0);

        await program.methods
          .initialize(modelHash)
          .accounts({
            authority,
            vault: vaultPda,
            vaultSol: vaultSolPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log('  Vault initialized');
      } else {
        console.log('  Vault already exists');
      }
    });

    it('should have vault state', async function () {
      const vault = await withdrawalClient.getVault(authority);

      assert.ok(vault, 'Vault should exist');
      assert.ok(vault.isActive, 'Vault should be active');

      console.log(`  Available balance: ${vault.availableBalance.toString()} lamports`);
    });

    it('should check deposit account or vault delegation status', async function () {
      this.timeout(30000);

      // Check if vault is delegated to TEE
      const vaultInfo = await provider.connection.getAccountInfo(vaultPda);
      if (vaultInfo && !vaultInfo.owner.equals(program.programId)) {
        console.log('  Vault is delegated to TEE');
        console.log(`  Current owner: ${vaultInfo.owner.toString()}`);
        console.log('  Skipping deposit check - vault operations handled by TEE');
        return;
      }

      const depositAccount = await provider.connection.getAccountInfo(userDepositPda);

      if (depositAccount === null) {
        console.log('  No user deposit account found');
        console.log('  Use fund_agent instruction with ZK proof to add funds');
      } else {
        try {
          const deposit = await program.account.userDeposit.fetch(userDepositPda);
          console.log(`  Existing deposit: ${deposit.amount.toString()} lamports`);
        } catch (error) {
          console.log('  Deposit account exists but cannot be deserialized');
        }
      }
    });
  });

  describe('Withdrawal Flow', () => {
    it('should pre-check compliance before withdrawal', async function () {
      this.timeout(15000);

      const { compliant, assessment, message } = await withdrawalClient.checkAddressCompliance(
        authority
      );

      console.log(`  Pre-check result: ${compliant ? 'PASS' : 'FAIL'}`);
      console.log(`  Message: ${message}`);

      if (!compliant) {
        console.log('  Skipping withdrawal test - authority not compliant');
        this.skip();
      }
    });

    it('should execute compliant withdrawal flow', async function () {
      this.timeout(60000);

      // Check if we have balance to withdraw
      const deposit = await withdrawalClient.getUserDeposit(vaultPda, authority);

      if (!deposit || deposit.amount.toNumber() === 0) {
        console.log('  No balance to withdraw, skipping test');
        this.skip();
        return;
      }

      // Withdraw a small amount
      const withdrawAmount = new BN(Math.min(deposit.amount.toNumber(), 0.01 * LAMPORTS_PER_SOL));

      console.log(`  Attempting withdrawal of ${withdrawAmount.toString()} lamports`);

      const result = await withdrawalClient.executeCompliantWithdrawal(withdrawAmount);

      console.log(`  Success: ${result.success}`);
      console.log(`  Compliance: ${result.complianceStatus}`);

      if (result.success) {
        console.log(`  Signature: ${result.signature?.slice(0, 32)}...`);
      } else {
        console.log(`  Error: ${result.error}`);
      }

      // Result may fail due to program constraints, but compliance flow should work
      assert.ok(result.complianceStatus !== 'pending', 'Compliance should be determined');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amount withdrawal', async function () {
      this.timeout(15000);

      // Note: This should fail at the program level, not compliance
      const result = await withdrawalClient.requestWithdrawal(new BN(0));

      assert.ok(!result.success, 'Zero withdrawal should fail');
      console.log(`  Expected error: ${result.error}`);
    });

    it('should handle excessive withdrawal amount', async function () {
      this.timeout(15000);

      const excessiveAmount = new BN(1000000 * LAMPORTS_PER_SOL);
      const result = await withdrawalClient.requestWithdrawal(excessiveAmount);

      assert.ok(!result.success, 'Excessive withdrawal should fail');
      console.log(`  Expected error: ${result.error}`);
    });
  });
});

describe('Compliance Integration Scenarios', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpectreProtocol as Program<SpectreProtocol>;
  let withdrawalClient: SpectreWithdrawalClient;

  before(() => {
    withdrawalClient = new SpectreWithdrawalClient(provider, program);
    withdrawalClient.initializeRangeClient(RANGE_API_KEY);
  });

  it('should handle compliance check for known exchange address', async function () {
    this.timeout(15000);

    // Binance hot wallet - should be known but not sanctioned
    const exchangeAddress = new PublicKey('FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5');

    const result = await withdrawalClient.checkAddressCompliance(exchangeAddress);

    console.log(`  Exchange Address: ${exchangeAddress.toString()}`);
    console.log(`  Compliant: ${result.compliant}`);
    console.log(`  Risk Score: ${result.assessment.riskScore}`);
    console.log(`  Message: ${result.message}`);

    // Exchange addresses may have higher risk scores but typically not sanctioned
    assert.ok(typeof result.compliant === 'boolean', 'Should determine compliance');
  });

  it('should provide detailed risk assessment', async function () {
    this.timeout(15000);

    const { assessment } = await withdrawalClient.getComplianceAttestation(
      provider.wallet.publicKey
    );

    console.log('\n  Detailed Risk Assessment:');
    console.log(`    Risk Score: ${assessment.riskScore}/100`);
    console.log(`    Risk Level: ${assessment.riskLevel}`);
    console.log(`    Sanctioned: ${assessment.isSanctioned}`);
    console.log(`    Malicious Connections: ${assessment.hasMaliciousConnections}`);
    console.log(`    Passes Compliance: ${passesCompliance(assessment)}`);
    console.log(`    Max Allowed Score: ${MAX_ALLOWED_RISK_SCORE}`);

    assert.ok(assessment.riskScore >= 0 && assessment.riskScore <= 100, 'Score should be 0-100');
  });
});
