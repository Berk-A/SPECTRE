import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SpectreProtocol } from "../target/types/spectre_protocol";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import assert from "assert";

/**
 * SPECTRE Protocol - Devnet Integration Test
 *
 * This test uses the pre-funded wallet instead of airdrops to avoid rate limits.
 * Run with: anchor test --skip-local-validator
 */
describe("SPECTRE Protocol - Devnet Integration", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpectreProtocol as Program<SpectreProtocol>;

  // Use the provider wallet (already funded)
  const authority = provider.wallet;

  // Seeds
  const VAULT_SEED = Buffer.from("spectre_vault");
  const DEPOSIT_SEED = Buffer.from("user_deposit");
  const POSITION_SEED = Buffer.from("position");
  const STRATEGY_CONFIG_SEED = Buffer.from("strategy_config");

  // PDAs
  let vaultPda: PublicKey;
  let strategyConfigPda: PublicKey;

  // Use unique commitment for this test run (based on timestamp)
  const testId = Date.now() % 1000000;
  const testCommitment = new Array(32).fill(0).map((_, i) => (testId + i) % 256);

  before(async () => {
    console.log("\n🔮 SPECTRE Devnet Test");
    console.log("=".repeat(50));
    console.log(`Authority: ${authority.publicKey.toString()}`);

    const balance = await provider.connection.getBalance(authority.publicKey);
    console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    console.log(`Test ID: ${testId}`);
    console.log("=".repeat(50));

    // Derive PDAs
    [vaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED, authority.publicKey.toBuffer()],
      program.programId
    );

    [strategyConfigPda] = PublicKey.findProgramAddressSync(
      [STRATEGY_CONFIG_SEED, vaultPda.toBuffer()],
      program.programId
    );

    console.log(`Vault PDA: ${vaultPda.toString()}`);
    console.log(`Strategy PDA: ${strategyConfigPda.toString()}\n`);
  });

  describe("Phase 1: Vault Operations", () => {
    it("should initialize vault (or skip if exists)", async () => {
      try {
        // Check if vault already exists
        const existingVault = await program.account.spectreVault.fetchNullable(vaultPda);
        if (existingVault) {
          console.log("  ⏭️  Vault already exists, skipping initialization");
          return;
        }

        const modelHash = new Array(32).fill(42);
        const tx = await program.methods
          .initialize(modelHash)
          .accounts({
            authority: authority.publicKey,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(`  ✅ Vault initialized: ${tx.slice(0, 20)}...`);

        const vault = await program.account.spectreVault.fetch(vaultPda);
        assert.strictEqual(vault.authority.toString(), authority.publicKey.toString());
        assert.strictEqual(vault.isActive, true);
      } catch (err: any) {
        if (err.toString().includes("already in use")) {
          console.log("  ⏭️  Vault already exists");
        } else {
          throw err;
        }
      }
    });

    it("should fund the vault with a deposit", async () => {
      const [depositPda] = PublicKey.findProgramAddressSync(
        [DEPOSIT_SEED, vaultPda.toBuffer(), Buffer.from(testCommitment)],
        program.programId
      );

      // Check if this deposit already exists
      const existingDeposit = await program.account.userDeposit.fetchNullable(depositPda);
      if (existingDeposit) {
        console.log("  ⏭️  Deposit already exists for this test ID");
        return;
      }

      const depositAmount = 0.05 * LAMPORTS_PER_SOL;

      const proof = {
        proofData: new Array(256).fill(0),
        publicInputs: {
          commitment: testCommitment,
          nullifierHash: new Array(32).fill(testId % 256),
          amount: new anchor.BN(depositAmount),
          merkleRoot: new Array(32).fill(0),
        },
      };

      const tx = await program.methods
        .fundAgent(proof)
        .accounts({
          depositor: authority.publicKey,
          vault: vaultPda,
          userDeposit: depositPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  ✅ Deposited 0.05 SOL: ${tx.slice(0, 20)}...`);

      const deposit = await program.account.userDeposit.fetch(depositPda);
      assert.strictEqual(deposit.amount.toNumber(), depositAmount);
      assert.strictEqual(deposit.isActive, true);
    });

    it("should verify vault state", async () => {
      const vault = await program.account.spectreVault.fetch(vaultPda);

      console.log(`  📊 Vault State:`);
      console.log(`     Total Deposited: ${vault.totalDeposited.toNumber() / LAMPORTS_PER_SOL} SOL`);
      console.log(`     Available Balance: ${vault.availableBalance.toNumber() / LAMPORTS_PER_SOL} SOL`);
      console.log(`     Deposits Count: ${vault.totalDepositsCount.toNumber()}`);
      console.log(`     Is Active: ${vault.isActive}`);

      assert.strictEqual(vault.isActive, true);
      assert.ok(vault.totalDeposited.toNumber() > 0);
    });
  });

  describe("Phase 2: Strategy Operations", () => {
    it("should initialize strategy (or skip if exists)", async () => {
      try {
        const existingConfig = await program.account.strategyConfig.fetchNullable(strategyConfigPda);
        if (existingConfig) {
          console.log("  ⏭️  Strategy already initialized");
          return;
        }

        const tx = await program.methods
          .initializeStrategy(null)
          .accounts({
            authority: authority.publicKey,
            vault: vaultPda,
            strategyConfig: strategyConfigPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(`  ✅ Strategy initialized: ${tx.slice(0, 20)}...`);
      } catch (err: any) {
        if (err.toString().includes("already in use")) {
          console.log("  ⏭️  Strategy already exists");
        } else {
          throw err;
        }
      }
    });

    it("should generate trade signals", async () => {
      // Test BUY signal
      let marketInput = {
        price: 300,
        trend: 50,
        volatility: 200,
        timestamp: new anchor.BN(Date.now() / 1000),
      };

      let tx = await program.methods
        .generateTradeSignal(marketInput)
        .accounts({
          authority: authority.publicKey,
          vault: vaultPda,
          strategyConfig: strategyConfigPda,
        })
        .rpc();

      let config = await program.account.strategyConfig.fetch(strategyConfigPda);
      console.log(`  ✅ BUY signal generated (${config.lastSignal}): ${tx.slice(0, 20)}...`);

      // Test SELL signal
      marketInput = {
        price: 700,
        trend: -50,
        volatility: 200,
        timestamp: new anchor.BN(Date.now() / 1000),
      };

      tx = await program.methods
        .generateTradeSignal(marketInput)
        .accounts({
          authority: authority.publicKey,
          vault: vaultPda,
          strategyConfig: strategyConfigPda,
        })
        .rpc();

      config = await program.account.strategyConfig.fetch(strategyConfigPda);
      console.log(`  ✅ SELL signal generated (${config.lastSignal}): ${tx.slice(0, 20)}...`);

      assert.ok(config.totalSignals.toNumber() > 0);
    });

    it("should verify strategy state", async () => {
      const config = await program.account.strategyConfig.fetch(strategyConfigPda);

      console.log(`  📊 Strategy State:`);
      console.log(`     Total Signals: ${config.totalSignals.toNumber()}`);
      console.log(`     Last Signal: ${config.lastSignal}`);
      console.log(`     Price Thresholds: ${config.priceThresholdLow} - ${config.priceThresholdHigh}`);
      console.log(`     Is Active: ${config.isActive}`);

      assert.strictEqual(config.isActive, true);
    });
  });

  describe("Phase 3: Trading Operations", () => {
    let positionPda: PublicKey;
    let marketId: Keypair;

    before(() => {
      marketId = Keypair.generate();
      [positionPda] = PublicKey.findProgramAddressSync(
        [POSITION_SEED, vaultPda.toBuffer(), marketId.publicKey.toBuffer()],
        program.programId
      );
    });

    it("should execute a trade", async () => {
      const marketInput = {
        price: 300,
        trend: 100,
        volatility: 150,
        timestamp: new anchor.BN(Date.now() / 1000),
      };

      const tx = await program.methods
        .executeTrade(marketInput)
        .accounts({
          authority: authority.publicKey,
          vault: vaultPda,
          strategyConfig: strategyConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  ✅ Trade executed: ${tx.slice(0, 20)}...`);

      const vault = await program.account.spectreVault.fetch(vaultPda);
      assert.ok(vault.totalVolume.toNumber() > 0);
    });

    it("should open a position", async () => {
      const tx = await program.methods
        .openPosition(
          marketId.publicKey,
          { yes: {} },
          new anchor.BN(10_000_000), // 10M shares
          new anchor.BN(500_000), // 0.5 price
          new anchor.BN(5_000_000) // 0.005 SOL invested
        )
        .accounts({
          authority: authority.publicKey,
          vault: vaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  ✅ Position opened: ${tx.slice(0, 20)}...`);

      const position = await program.account.position.fetch(positionPda);
      assert.deepStrictEqual(position.status, { open: {} });
    });

    it("should close position with profit", async () => {
      const exitPrice = new anchor.BN(700_000); // 0.7 (profit)

      const tx = await program.methods
        .closePosition(exitPrice)
        .accounts({
          authority: authority.publicKey,
          vault: vaultPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  ✅ Position closed: ${tx.slice(0, 20)}...`);

      const position = await program.account.position.fetch(positionPda);
      assert.deepStrictEqual(position.status, { closed: {} });
      console.log(`     Realized PnL: ${position.realizedPnl.toNumber()} lamports`);
    });
  });

  describe("Final State", () => {
    it("should display final protocol state", async () => {
      const vault = await program.account.spectreVault.fetch(vaultPda);
      const config = await program.account.strategyConfig.fetch(strategyConfigPda);
      const balance = await provider.connection.getBalance(authority.publicKey);

      console.log("\n" + "=".repeat(50));
      console.log("🎉 DEVNET TEST COMPLETE");
      console.log("=".repeat(50));
      console.log(`\n📊 Final Vault State:`);
      console.log(`   Total Deposited: ${vault.totalDeposited.toNumber() / LAMPORTS_PER_SOL} SOL`);
      console.log(`   Available Balance: ${vault.availableBalance.toNumber() / LAMPORTS_PER_SOL} SOL`);
      console.log(`   Total Volume: ${vault.totalVolume.toNumber() / LAMPORTS_PER_SOL} SOL`);
      console.log(`   Active Positions: ${vault.activePositions}`);
      console.log(`   Total Signals: ${config.totalSignals.toNumber()}`);
      console.log(`\n💰 Wallet Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
      console.log("=".repeat(50) + "\n");

      assert.strictEqual(vault.isActive, true);
    });
  });
});
