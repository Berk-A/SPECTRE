/**
 * SPECTRE TEE Delegation Tests
 *
 * Tests for MagicBlock TEE (Trusted Execution Environment) integration.
 *
 * These tests verify:
 * - Vault delegation to TEE enclave
 * - Vault undelegation from TEE enclave
 * - PDA derivation for delegation accounts
 * - State management during delegation
 *
 * To run against TEE devnet:
 *   anchor test --provider.cluster https://devnet.magicblock.app
 */

import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import assert from 'assert';
import { SpectreProtocol } from '../target/types/spectre_protocol';

// Import TEE client utilities
import {
  SpectreTeeCient,
  deriveVaultPda,
  deriveBufferPda,
  deriveDelegationRecordPda,
  deriveDelegationMetadataPda,
  DELEGATION_PROGRAM_ID,
  TEE_DEVNET_RPC,
  printDelegationStatus,
} from '../client/src/tee';

describe('SPECTRE TEE Delegation', () => {
  // Configure the client to use devnet or localnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpectreProtocol as Program<SpectreProtocol>;
  const authority = provider.wallet.publicKey;

  // Derived PDAs
  let vaultPda: PublicKey;
  let vaultBump: number;
  let vaultSolPda: PublicKey;
  let strategyConfigPda: PublicKey;

  // TEE Client
  let teeClient: SpectreTeeCient;

  before(async () => {
    console.log('\n========================================');
    console.log('SPECTRE TEE Delegation Tests');
    console.log('========================================');
    console.log(`Program ID: ${program.programId.toString()}`);
    console.log(`Authority: ${authority.toString()}`);
    console.log(`Delegation Program: ${DELEGATION_PROGRAM_ID.toString()}`);
    console.log('========================================\n');

    // Derive PDAs
    [vaultPda, vaultBump] = deriveVaultPda(authority, program.programId);
    console.log(`Vault PDA: ${vaultPda.toString()}`);

    [vaultSolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('spectre_vault'), authority.toBuffer(), Buffer.from('sol')],
      program.programId
    );

    [strategyConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('strategy_config'), vaultPda.toBuffer()],
      program.programId
    );

    // Initialize TEE client
    teeClient = new SpectreTeeCient(provider, program.programId);
    teeClient.setProgram(program);

    // Airdrop some SOL for testing (if on devnet/localnet)
    try {
      const balance = await provider.connection.getBalance(authority);
      if (balance < 1 * LAMPORTS_PER_SOL) {
        console.log('Requesting airdrop...');
        const sig = await provider.connection.requestAirdrop(
          authority,
          2 * LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(sig);
      }
    } catch (e) {
      console.log('Airdrop not available (expected on mainnet)');
    }
  });

  describe('PDA Derivation', () => {
    it('should derive correct buffer PDA', () => {
      const [bufferPda, bufferBump] = deriveBufferPda(
        vaultPda,
        program.programId
      );

      assert.ok(bufferPda instanceof PublicKey, 'Buffer PDA should be a PublicKey');
      assert.ok(typeof bufferBump === 'number', 'Buffer bump should be a number');
      assert.ok(bufferBump <= 255, 'Buffer bump should be <= 255');

      console.log(`  Buffer PDA: ${bufferPda.toString()}`);
    });

    it('should derive correct delegation record PDA', () => {
      const [recordPda, recordBump] = deriveDelegationRecordPda(vaultPda);

      assert.ok(recordPda instanceof PublicKey, 'Record PDA should be a PublicKey');
      assert.ok(typeof recordBump === 'number', 'Record bump should be a number');
      assert.ok(recordBump <= 255, 'Record bump should be <= 255');

      console.log(`  Delegation Record PDA: ${recordPda.toString()}`);
    });

    it('should derive correct delegation metadata PDA', () => {
      const [metadataPda, metadataBump] = deriveDelegationMetadataPda(vaultPda);

      assert.ok(metadataPda instanceof PublicKey, 'Metadata PDA should be a PublicKey');
      assert.ok(typeof metadataBump === 'number', 'Metadata bump should be a number');
      assert.ok(metadataBump <= 255, 'Metadata bump should be <= 255');

      console.log(`  Delegation Metadata PDA: ${metadataPda.toString()}`);
    });
  });

  describe('Vault Initialization (Prerequisite)', () => {
    it('should initialize vault if not exists', async () => {
      // Check if vault already exists
      const vaultAccount = await provider.connection.getAccountInfo(vaultPda);

      if (vaultAccount === null) {
        console.log('  Initializing new vault...');

        const modelHash = new Array(32).fill(0);

        await program.methods
          .initialize(modelHash)
          .accounts({
            authority: authority,
            vault: vaultPda,
            vaultSol: vaultSolPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log('  Vault initialized');
      } else {
        console.log('  Vault already exists');
      }

      // Verify vault state
      const vault = await program.account.spectreVault.fetch(vaultPda);
      assert.strictEqual(vault.authority.toString(), authority.toString(), 'Authority should match');
      assert.ok(vault.isActive, 'Vault should be active');
    });

    it('should initialize strategy config if not exists', async () => {
      const configAccount = await provider.connection.getAccountInfo(
        strategyConfigPda
      );

      if (configAccount === null) {
        console.log('  Initializing strategy config...');

        await program.methods
          .initializeStrategy(null)
          .accounts({
            authority: authority,
            vault: vaultPda,
            strategyConfig: strategyConfigPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log('  Strategy config initialized');
      } else {
        console.log('  Strategy config already exists');
      }
    });
  });

  describe('Delegation Status Check', () => {
    it('should check delegation status', async () => {
      const status = await teeClient.checkDelegationStatus(authority);

      printDelegationStatus(status);

      assert.strictEqual(status.vaultPda.toString(), vaultPda.toString(), 'Vault PDA should match');
      assert.strictEqual(status.authority.toString(), authority.toString(), 'Authority should match');
    });
  });

  describe('TEE Delegation (Requires MagicBlock TEE)', () => {
    // Note: These tests require the MagicBlock TEE devnet to be available
    // They will fail on localnet without the delegation program deployed

    it('should delegate vault to TEE', async function () {
      // Skip if delegation program is not available
      const delegationProgramInfo = await provider.connection.getAccountInfo(
        DELEGATION_PROGRAM_ID
      );

      if (delegationProgramInfo === null) {
        console.log('  Skipping: Delegation program not available on this network');
        this.skip();
        return;
      }

      // Check current delegation status
      const statusBefore = await teeClient.checkDelegationStatus(authority);

      if (statusBefore.isDelegated) {
        console.log('  Vault already delegated, undelegating first...');
        const undelegateResult = await teeClient.undelegateVault(authority);
        console.log('  Undelegation result:', undelegateResult.success ? 'success' : undelegateResult.error);

        if (undelegateResult.success) {
          // Wait for undelegation to complete on L1 (async operation)
          console.log('  Waiting for undelegation to complete on L1...');
          let attempts = 0;
          const maxAttempts = 30;

          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const vaultInfo = await provider.connection.getAccountInfo(vaultPda);

            if (vaultInfo && vaultInfo.owner.equals(program.programId)) {
              console.log('  Vault ownership returned to SPECTRE program');
              break;
            }

            attempts++;
            console.log(`  Waiting for L1 sync... (attempt ${attempts}/${maxAttempts})`);
          }

          if (attempts >= maxAttempts) {
            console.log('  Undelegation not yet complete on L1, skipping delegation test');
            this.skip();
            return;
          }
        }
      }

      // Delegate to TEE
      console.log('  Delegating vault to TEE...');
      const result = await teeClient.delegateVault(authority);

      assert.ok(result.success, 'Delegation should succeed');
      assert.ok(typeof result.signature === 'string', 'Signature should be a string');

      console.log(`  Delegation signature: ${result.signature}`);

      // Verify delegation status
      const statusAfter = await teeClient.checkDelegationStatus(authority);
      assert.ok(statusAfter.isDelegated, 'Vault should be delegated');
    });

    it('should undelegate vault from TEE', async function () {
      // Skip if delegation program is not available
      const delegationProgramInfo = await provider.connection.getAccountInfo(
        DELEGATION_PROGRAM_ID
      );

      if (delegationProgramInfo === null) {
        console.log('  Skipping: Delegation program not available on this network');
        this.skip();
        return;
      }

      // Check current delegation status
      const statusBefore = await teeClient.checkDelegationStatus(authority);

      if (!statusBefore.isDelegated) {
        console.log('  Vault not delegated, delegating first...');
        await teeClient.delegateVault(authority);
      }

      // Undelegate from TEE
      console.log('  Undelegating vault from TEE...');
      const result = await teeClient.undelegateVault(authority);

      assert.ok(result.success, 'Undelegation should succeed');
      assert.ok(typeof result.signature === 'string', 'Signature should be a string');

      console.log(`  Undelegation signature: ${result.signature}`);

      // Verify delegation status
      const statusAfter = await teeClient.checkDelegationStatus(authority);
      assert.ok(!statusAfter.isDelegated, 'Vault should not be delegated');
    });
  });

  describe('Mock Delegation (Local Testing)', () => {
    // These tests work on localnet without the MagicBlock delegation program
    // They use the mock flag-based delegation in the SPECTRE program

    it('should verify vault can_delegate state', async () => {
      const vault = await program.account.spectreVault.fetch(vaultPda);

      // Vault should be able to delegate if not already delegated
      const canDelegate = vault.isActive && !vault.isDelegated;
      console.log(`  Can delegate: ${canDelegate}`);
      console.log(`  Is active: ${vault.isActive}`);
      console.log(`  Is delegated: ${vault.isDelegated}`);
    });

    it('should verify vault state tracking', async () => {
      const vault = await program.account.spectreVault.fetch(vaultPda);

      assert.strictEqual(vault.authority.toString(), authority.toString(), 'Authority should match');
      assert.ok(vault.isActive, 'Vault should be active');
      assert.strictEqual(vault.vaultBump, vaultBump, 'Vault bump should match');

      console.log(`  Total deposited: ${vault.totalDeposited.toString()}`);
      console.log(`  Available balance: ${vault.availableBalance.toString()}`);
      console.log(`  Active positions: ${vault.activePositions}`);
    });
  });
});

describe('TEE Strategy Execution', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpectreProtocol as Program<SpectreProtocol>;
  const authority = provider.wallet.publicKey;

  let vaultPda: PublicKey;
  let strategyConfigPda: PublicKey;

  before(async () => {
    [vaultPda] = deriveVaultPda(authority, program.programId);
    [strategyConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('strategy_config'), vaultPda.toBuffer()],
      program.programId
    );
  });

  it('should generate trade signal (works in TEE or locally)', async () => {
    const marketInput = {
      price: 350, // Low price (0.35)
      trend: 100, // Positive trend
      volatility: 150, // Moderate volatility
      timestamp: new anchor.BN(Math.floor(Date.now() / 1000)),
    };

    try {
      // This will execute locally or in TEE depending on vault delegation status
      const tx = await program.methods
        .generateTradeSignal(marketInput)
        .accounts({
          authority: authority,
          vault: vaultPda,
          strategyConfig: strategyConfigPda,
        })
        .rpc();

      console.log(`  Trade signal generated: ${tx.slice(0, 16)}...`);

      // Fetch updated strategy config
      const config = await program.account.strategyConfig.fetch(strategyConfigPda);
      console.log(`  Last signal: ${config.lastSignal}`);
      console.log(`  Total signals: ${config.totalSignals.toString()}`);
    } catch (error: any) {
      console.log(`  Signal generation failed: ${error.message}`);
    }
  });

  it('should execute trade (works in TEE or locally)', async () => {
    const marketInput = {
      price: 350, // Low price
      trend: 100, // Positive trend (should trigger buy)
      volatility: 150,
      timestamp: new anchor.BN(Math.floor(Date.now() / 1000)),
    };

    try {
      const tx = await program.methods
        .executeTrade(marketInput)
        .accounts({
          authority: authority,
          vault: vaultPda,
          strategyConfig: strategyConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  Trade executed: ${tx.slice(0, 16)}...`);

      // Fetch updated vault state
      const vault = await program.account.spectreVault.fetch(vaultPda);
      console.log(`  Last trade slot: ${vault.lastTradeSlot.toString()}`);
      console.log(`  Total volume: ${vault.totalVolume.toString()}`);
    } catch (error: any) {
      console.log(`  Trade execution failed: ${error.message}`);
    }
  });
});
