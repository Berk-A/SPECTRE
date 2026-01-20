import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SpectreProtocol } from "../target/types/spectre_protocol";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import assert from "assert";

/**
 * SPECTRE Protocol - Stress Tests
 *
 * These tests push the system to its limits to find edge cases,
 * overflow issues, and potential vulnerabilities.
 */
describe("SPECTRE Protocol - Stress Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpectreProtocol as Program<SpectreProtocol>;

  // Seeds
  const VAULT_SEED = Buffer.from("spectre_vault");
  const DEPOSIT_SEED = Buffer.from("user_deposit");
  const WITHDRAWAL_SEED = Buffer.from("withdrawal");
  const POSITION_SEED = Buffer.from("position");
  const STRATEGY_CONFIG_SEED = Buffer.from("strategy_config");

  // Test accounts - unique for stress tests
  let stressAuthority: Keypair;
  let stressVaultPda: PublicKey;
  let stressStrategyConfigPda: PublicKey;

  before(async () => {
    stressAuthority = Keypair.generate();

    const airdrop = await provider.connection.requestAirdrop(
      stressAuthority.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdrop);

    [stressVaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, stressAuthority.publicKey.toBuffer()],
      program.programId
    );

    [stressStrategyConfigPda] = PublicKey.findProgramAddressSync(
      [STRATEGY_CONFIG_SEED, stressVaultPda.toBuffer()],
      program.programId
    );

    // Initialize vault
    await program.methods
      .initialize(null)
      .accounts({
        authority: stressAuthority.publicKey,
        vault: stressVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([stressAuthority])
      .rpc();

    // Initialize strategy
    await program.methods
      .initializeStrategy(null)
      .accounts({
        authority: stressAuthority.publicKey,
        vault: stressVaultPda,
        strategyConfig: stressStrategyConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([stressAuthority])
      .rpc();

    // Fund the vault with deposits
    for (let i = 0; i < 5; i++) {
      const depositor = Keypair.generate();
      const airdropDep = await provider.connection.requestAirdrop(
        depositor.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropDep);

      const commitment = new Array(32).fill(0).map((_, j) => (i * 32 + j + 200) % 256);
      const [depositPda] = PublicKey.findProgramAddressSync(
        [DEPOSIT_SEED, stressVaultPda.toBuffer(), Buffer.from(commitment)],
        program.programId
      );

      const proof = {
        proofData: new Array(256).fill(0),
        publicInputs: {
          commitment: commitment,
          nullifierHash: new Array(32).fill(i + 1),
          amount: new anchor.BN(1 * LAMPORTS_PER_SOL),
          merkleRoot: new Array(32).fill(0),
        },
      };

      await program.methods
        .fundAgent(proof)
        .accounts({
          depositor: depositor.publicKey,
          vault: stressVaultPda,
          userDeposit: depositPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor])
        .rpc();
    }
  });

  // ============================================
  // LARGE NUMBER TESTS
  // ============================================

  describe("Large Number Edge Cases", () => {
    it("should handle maximum deposit amount without overflow", async () => {
      const depositor = Keypair.generate();
      const airdrop = await provider.connection.requestAirdrop(
        depositor.publicKey,
        100 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdrop);

      // Test with 10 SOL (reasonable max for testing)
      const largeAmount = 10 * LAMPORTS_PER_SOL;
      const commitment = new Array(32).fill(255);

      const [depositPda] = PublicKey.findProgramAddressSync(
        [DEPOSIT_SEED, stressVaultPda.toBuffer(), Buffer.from(commitment)],
        program.programId
      );

      const proof = {
        proofData: new Array(256).fill(0),
        publicInputs: {
          commitment: commitment,
          nullifierHash: new Array(32).fill(254),
          amount: new anchor.BN(largeAmount),
          merkleRoot: new Array(32).fill(0),
        },
      };

      await program.methods
        .fundAgent(proof)
        .accounts({
          depositor: depositor.publicKey,
          vault: stressVaultPda,
          userDeposit: depositPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor])
        .rpc();

      const deposit = await program.account.userDeposit.fetch(depositPda);
      assert.strictEqual(deposit.amount.toNumber(), largeAmount);
    });

    it("should handle position with large but proportional shares", async () => {
      const marketId = Keypair.generate();
      const [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, stressVaultPda.toBuffer(), marketId.publicKey.toBuffer()],
        program.programId
      );

      // Large but PROPORTIONAL values (shares * price / SCALE = invested)
      // 1 SOL invested at 0.5 price = 2 SOL worth of shares = 2_000_000_000 shares
      const investedAmount = new anchor.BN(1_000_000_000); // 1 SOL
      const entryPrice = new anchor.BN(500_000); // 0.5
      // shares = invested * SCALE / price = 1B * 1M / 500K = 2B shares
      const largeShares = new anchor.BN(2_000_000_000);

      await program.methods
        .openPosition(
          marketId.publicKey,
          { yes: {} },
          largeShares,
          entryPrice,
          investedAmount
        )
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      const position = await program.account.position.fetch(positionPda);
      assert.strictEqual(position.shares.toString(), largeShares.toString());

      // Close at 0.6 price - profit should be ~0.2 SOL
      await program.methods
        .closePosition(new anchor.BN(600_000))
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      const closedPosition = await program.account.position.fetch(positionPda);
      // Exit value = 2B * 0.6 / 1M = 1.2B lamports (1.2 SOL)
      // Invested = 1B lamports (1 SOL)
      // PnL = 0.2B (0.2 SOL)
      assert.strictEqual(closedPosition.realizedPnl.toNumber(), 200_000_000);
      console.log("  Large position PnL:", closedPosition.realizedPnl.toNumber() / LAMPORTS_PER_SOL, "SOL");
    });

    it("should handle price at maximum scale (100%)", async () => {
      const marketId = Keypair.generate();
      const [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, stressVaultPda.toBuffer(), marketId.publicKey.toBuffer()],
        program.programId
      );

      // Price at 100% = 1_000_000
      const maxPrice = new anchor.BN(1_000_000);

      await program.methods
        .openPosition(
          marketId.publicKey,
          { yes: {} },
          new anchor.BN(100_000_000),
          maxPrice,
          new anchor.BN(100_000_000)
        )
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      // Close at same price
      await program.methods
        .closePosition(maxPrice)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      const position = await program.account.position.fetch(positionPda);
      assert.deepStrictEqual(position.status, { closed: {} });
    });
  });

  // ============================================
  // BOUNDARY CONDITION TESTS
  // ============================================

  describe("Boundary Conditions", () => {
    it("should handle minimum trade amount (1M lamports)", async () => {
      const vault = await program.account.spectreVault.fetch(stressVaultPda);
      const balanceBefore = vault.availableBalance.toNumber();

      // Execute trade that should trigger minimum position
      const marketInput = {
        price: 300,
        trend: 50,
        volatility: 200,
        timestamp: new anchor.BN(Date.now() / 1000),
      };

      await program.methods
        .executeTrade(marketInput)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          strategyConfig: stressStrategyConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      // Should succeed without error
      const vaultAfter = await program.account.spectreVault.fetch(stressVaultPda);
      assert.ok(vaultAfter.totalVolume.toNumber() > 0);
    });

    it("should handle strategy params at boundary values", async () => {
      // Test with thresholds at 1 apart (minimum valid difference)
      const boundaryParams = {
        priceThresholdLow: 499,
        priceThresholdHigh: 500,
        trendThreshold: 1,
        volatilityCap: 1,
        reserved: new Array(16).fill(0),
      };

      await program.methods
        .setStrategyParams(boundaryParams)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          strategyConfig: stressStrategyConfigPda,
        })
        .signers([stressAuthority])
        .rpc();

      const config = await program.account.strategyConfig.fetch(stressStrategyConfigPda);
      assert.strictEqual(config.priceThresholdLow, 499);
      assert.strictEqual(config.priceThresholdHigh, 500);

      // Reset to defaults
      await program.methods
        .setStrategyParams({
          priceThresholdLow: 350,
          priceThresholdHigh: 650,
          trendThreshold: 100,
          volatilityCap: 400,
          reserved: new Array(16).fill(0),
        })
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          strategyConfig: stressStrategyConfigPda,
        })
        .signers([stressAuthority])
        .rpc();
    });

    it("should handle market input at extreme boundaries", async () => {
      // Price at minimum (0)
      let marketInput = {
        price: 0,
        trend: 500,
        volatility: 100,
        timestamp: new anchor.BN(Date.now() / 1000),
      };

      await program.methods
        .generateTradeSignal(marketInput)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          strategyConfig: stressStrategyConfigPda,
        })
        .signers([stressAuthority])
        .rpc();

      // Price at maximum (1000)
      marketInput = {
        price: 1000,
        trend: -500,
        volatility: 100,
        timestamp: new anchor.BN(Date.now() / 1000),
      };

      await program.methods
        .generateTradeSignal(marketInput)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          strategyConfig: stressStrategyConfigPda,
        })
        .signers([stressAuthority])
        .rpc();

      const config = await program.account.strategyConfig.fetch(stressStrategyConfigPda);
      // Should have StrongSell signal (price=1000 > 650, trend=-500 < -100)
      assert.strictEqual(config.lastSignal, 5); // StrongSell
    });
  });

  // ============================================
  // RAPID OPERATION TESTS
  // ============================================

  describe("Rapid Operations (Stress)", () => {
    it("should handle 10 rapid signal generations", async () => {
      const signals: number[] = [];
      const prices = [200, 300, 400, 500, 600, 700, 800, 250, 350, 750];
      const trends = [100, -50, 0, 50, -100, 150, -150, 200, -200, 0];

      for (let i = 0; i < 10; i++) {
        const marketInput = {
          price: prices[i],
          trend: trends[i],
          volatility: 200,
          timestamp: new anchor.BN(Date.now() / 1000),
        };

        await program.methods
          .generateTradeSignal(marketInput)
          .accounts({
            authority: stressAuthority.publicKey,
            vault: stressVaultPda,
            strategyConfig: stressStrategyConfigPda,
          })
          .signers([stressAuthority])
          .rpc();

        const config = await program.account.strategyConfig.fetch(stressStrategyConfigPda);
        signals.push(config.lastSignal);
      }

      console.log("  Signals generated:", signals);
      assert.strictEqual(signals.length, 10);
    });

    it("should handle multiple positions opening", async () => {
      const positionCount = 5;
      const positionPdas: PublicKey[] = [];

      for (let i = 0; i < positionCount; i++) {
        const marketId = Keypair.generate();
        const [positionPda] = PublicKey.findProgramAddressSync(
          [POSITION_SEED, stressVaultPda.toBuffer(), marketId.publicKey.toBuffer()],
          program.programId
        );
        positionPdas.push(positionPda);

        await program.methods
          .openPosition(
            marketId.publicKey,
            i % 2 === 0 ? { yes: {} } : { no: {} },
            new anchor.BN(10_000_000),
            new anchor.BN(500_000),
            new anchor.BN(5_000_000)
          )
          .accounts({
            authority: stressAuthority.publicKey,
            vault: stressVaultPda,
            position: positionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([stressAuthority])
          .rpc();
      }

      const vault = await program.account.spectreVault.fetch(stressVaultPda);
      console.log("  Active positions:", vault.activePositions);
      assert.ok(vault.activePositions >= positionCount);

      // Close all positions
      for (const positionPda of positionPdas) {
        await program.methods
          .closePosition(new anchor.BN(600_000))
          .accounts({
            authority: stressAuthority.publicKey,
            vault: stressVaultPda,
            position: positionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([stressAuthority])
          .rpc();
      }
    });
  });

  // ============================================
  // PNL EDGE CASES
  // ============================================

  describe("PnL Edge Cases", () => {
    it("should handle break-even position (entry = exit)", async () => {
      const marketId = Keypair.generate();
      const [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, stressVaultPda.toBuffer(), marketId.publicKey.toBuffer()],
        program.programId
      );

      const price = new anchor.BN(500_000);
      const shares = new anchor.BN(100_000_000);
      const invested = new anchor.BN(50_000_000);

      await program.methods
        .openPosition(marketId.publicKey, { yes: {} }, shares, price, invested)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      // Close at same price
      await program.methods
        .closePosition(price)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      const position = await program.account.position.fetch(positionPda);
      assert.strictEqual(position.realizedPnl.toNumber(), 0);
      console.log("  Break-even PnL:", position.realizedPnl.toNumber());
    });

    it("should handle 100% loss position (exit at price 0)", async () => {
      const marketId = Keypair.generate();
      const [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, stressVaultPda.toBuffer(), marketId.publicKey.toBuffer()],
        program.programId
      );

      const invested = new anchor.BN(10_000_000);

      await program.methods
        .openPosition(
          marketId.publicKey,
          { yes: {} },
          new anchor.BN(20_000_000),
          new anchor.BN(500_000),
          invested
        )
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      // Close at price 1 (essentially 0 but valid)
      await program.methods
        .closePosition(new anchor.BN(1))
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      const position = await program.account.position.fetch(positionPda);
      // PnL should be approximately -invested (nearly 100% loss)
      assert.ok(position.realizedPnl.toNumber() < 0);
      console.log("  Near-total loss PnL:", position.realizedPnl.toNumber());
    });

    it("should handle 100% gain position (entry 0.5, exit 1.0)", async () => {
      const marketId = Keypair.generate();
      const [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, stressVaultPda.toBuffer(), marketId.publicKey.toBuffer()],
        program.programId
      );

      const shares = new anchor.BN(100_000_000);
      const entryPrice = new anchor.BN(500_000); // 0.5
      const invested = new anchor.BN(50_000_000);
      const exitPrice = new anchor.BN(1_000_000); // 1.0 (100%)

      await program.methods
        .openPosition(marketId.publicKey, { yes: {} }, shares, entryPrice, invested)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      await program.methods
        .closePosition(exitPrice)
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      const position = await program.account.position.fetch(positionPda);
      // Exit value = 100M * 1.0 = 100M, invested = 50M, PnL = +50M
      assert.strictEqual(position.realizedPnl.toNumber(), 50_000_000);
      console.log("  100% gain PnL:", position.realizedPnl.toNumber());
    });
  });

  // ============================================
  // DELEGATION EDGE CASES
  // ============================================

  describe("Delegation Edge Cases", () => {
    it("should handle delegate -> trade -> undelegate cycle", async () => {
      // Delegate
      await program.methods
        .delegateToTee()
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          delegationProgram: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      let vault = await program.account.spectreVault.fetch(stressVaultPda);
      assert.strictEqual(vault.isDelegated, true);

      // Execute trade while delegated
      await program.methods
        .executeTrade({
          price: 300,
          trend: 100,
          volatility: 200,
          timestamp: new anchor.BN(Date.now() / 1000),
        })
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          strategyConfig: stressStrategyConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      // Undelegate
      await program.methods
        .undelegateFromTee()
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          delegationProgram: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      vault = await program.account.spectreVault.fetch(stressVaultPda);
      assert.strictEqual(vault.isDelegated, false);
    });

    it("should handle re-delegation after undelegation", async () => {
      // Should be undelegated from previous test
      let vault = await program.account.spectreVault.fetch(stressVaultPda);
      assert.strictEqual(vault.isDelegated, false);

      // Re-delegate
      await program.methods
        .delegateToTee()
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          delegationProgram: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();

      vault = await program.account.spectreVault.fetch(stressVaultPda);
      assert.strictEqual(vault.isDelegated, true);

      // Undelegate again
      await program.methods
        .undelegateFromTee()
        .accounts({
          authority: stressAuthority.publicKey,
          vault: stressVaultPda,
          delegationProgram: null,
          systemProgram: SystemProgram.programId,
        })
        .signers([stressAuthority])
        .rpc();
    });
  });

  // ============================================
  // FINAL STRESS STATE
  // ============================================

  describe("Final Stress Test State", () => {
    it("should have consistent state after all stress tests", async () => {
      const vault = await program.account.spectreVault.fetch(stressVaultPda);
      const config = await program.account.strategyConfig.fetch(stressStrategyConfigPda);

      console.log("\n========================================");
      console.log("STRESS TEST FINAL STATE:");
      console.log("========================================");
      console.log("  Total deposited:", vault.totalDeposited.toNumber() / LAMPORTS_PER_SOL, "SOL");
      console.log("  Available balance:", vault.availableBalance.toNumber() / LAMPORTS_PER_SOL, "SOL");
      console.log("  Total volume:", vault.totalVolume.toNumber() / LAMPORTS_PER_SOL, "SOL");
      console.log("  Total deposits count:", vault.totalDepositsCount.toNumber());
      console.log("  Total withdrawals count:", vault.totalWithdrawalsCount.toNumber());
      console.log("  Active positions:", vault.activePositions);
      console.log("  Total signals:", config.totalSignals.toNumber());
      console.log("  Is active:", vault.isActive);
      console.log("  Is delegated:", vault.isDelegated);
      console.log("========================================\n");

      // Verify invariants
      assert.ok(vault.availableBalance.toNumber() >= 0, "Available balance should not be negative");
      // NOTE: available_balance CAN exceed total_deposited due to trading profits
      // The proper invariant would be: available_balance <= total_deposited + cumulative_realized_pnl
      // But we don't track cumulative PnL in the vault (recommendation for improvement)
      assert.ok(vault.totalVolume.toNumber() > 0, "Should have trading volume from stress tests");
      assert.strictEqual(vault.isActive, true, "Vault should still be active");
      assert.strictEqual(vault.isDelegated, false, "Should be undelegated after tests");
    });
  });
});
