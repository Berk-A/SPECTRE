/**
 * SPECTRE Crank Script
 *
 * Market monitoring and automated trade execution for SPECTRE protocol.
 *
 * This script:
 * 1. Monitors active prediction markets for trading opportunities
 * 2. Analyzes market conditions using the strategy engine
 * 3. Triggers trade execution when signals indicate action
 *
 * The actual trading strategy runs inside the TEE enclave - this crank
 * only provides market data and triggers the on-chain execution.
 *
 * Usage:
 *   npx ts-node src/crank.ts [--rpc <url>] [--interval <ms>]
 *
 * Environment Variables:
 *   SOLANA_RPC - RPC endpoint (default: localnet)
 *   TEE_RPC - TEE enclave endpoint (for production)
 *   WALLET_PATH - Path to keypair file
 *   POLL_INTERVAL - Market poll interval in ms (default: 30000)
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// Configuration
// ============================================

interface CrankConfig {
  rpcUrl: string;
  teeRpcUrl: string;
  walletPath: string;
  pollInterval: number;
  minVolume: number;
  minPriceMovement: number;
}

const DEFAULT_CONFIG: CrankConfig = {
  rpcUrl: process.env.SOLANA_RPC || 'http://127.0.0.1:8899',
  teeRpcUrl: process.env.TEE_RPC || 'https://tee.magicblock.app/',
  walletPath: process.env.WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`,
  pollInterval: parseInt(process.env.POLL_INTERVAL || '30000'),
  minVolume: 1_000_000_000, // 1 SOL minimum volume
  minPriceMovement: 50, // 5% minimum price movement (scaled by 1000)
};

// ============================================
// Types
// ============================================

interface MarketOpportunity {
  marketId: PublicKey;
  currentPrice: number;
  trend: number;
  volatility: number;
  volume24h: number;
  isActive: boolean;
}

interface CrankStats {
  cyclesRun: number;
  marketsAnalyzed: number;
  tradesTriggered: number;
  lastCycleTime: Date | null;
  errors: number;
}

// ============================================
// PDA Seeds (must match program)
// ============================================

const VAULT_SEED = Buffer.from('spectre_vault');
const STRATEGY_CONFIG_SEED = Buffer.from('strategy_config');
const POSITION_SEED = Buffer.from('position');

// ============================================
// Mock Market Data Provider
// ============================================

/**
 * Simulates PNP market data for testing
 * In production, this would fetch real data from PNP Exchange
 */
class MockMarketProvider {
  private markets: Map<string, MarketOpportunity> = new Map();

  constructor() {
    // Initialize with some mock markets
    this.generateMockMarkets(5);
  }

  private generateMockMarkets(count: number): void {
    for (let i = 0; i < count; i++) {
      const marketId = Keypair.generate().publicKey;
      const basePrice = 300 + Math.random() * 400; // 0.30 - 0.70

      this.markets.set(marketId.toString(), {
        marketId,
        currentPrice: Math.floor(basePrice),
        trend: Math.floor((Math.random() - 0.5) * 200), // -100 to +100
        volatility: Math.floor(Math.random() * 300), // 0 to 300
        volume24h: Math.floor(Math.random() * 10_000_000_000), // 0-10 SOL
        isActive: true,
      });
    }
  }

  async getActiveMarkets(): Promise<MarketOpportunity[]> {
    // Simulate market price changes
    for (const [key, market] of this.markets) {
      // Random price walk
      market.currentPrice += Math.floor((Math.random() - 0.5) * 20);
      market.currentPrice = Math.max(100, Math.min(900, market.currentPrice));

      // Update trend
      market.trend = Math.floor((Math.random() - 0.5) * 200);

      // Update volatility
      market.volatility = Math.floor(Math.random() * 300);

      // Random volume
      market.volume24h = Math.floor(Math.random() * 10_000_000_000);
    }

    return Array.from(this.markets.values());
  }

  async getMarketInfo(marketId: PublicKey): Promise<MarketOpportunity | undefined> {
    return this.markets.get(marketId.toString());
  }
}

// ============================================
// SPECTRE Crank
// ============================================

class SpectreCrank {
  private config: CrankConfig;
  private connection: Connection;
  private wallet: Wallet;
  private provider: AnchorProvider;
  private program: Program | null = null;
  private marketProvider: MockMarketProvider;
  private stats: CrankStats;
  private isRunning: boolean = false;
  private vaultPda: PublicKey | null = null;
  private strategyConfigPda: PublicKey | null = null;

  constructor(config: Partial<CrankConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connection = new Connection(this.config.rpcUrl, 'confirmed');
    this.wallet = this.loadWallet();
    this.provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: 'confirmed',
    });
    this.marketProvider = new MockMarketProvider();
    this.stats = {
      cyclesRun: 0,
      marketsAnalyzed: 0,
      tradesTriggered: 0,
      lastCycleTime: null,
      errors: 0,
    };
  }

  private loadWallet(): Wallet {
    try {
      const keypairData = JSON.parse(
        fs.readFileSync(this.config.walletPath, 'utf-8')
      );
      const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
      return new Wallet(keypair);
    } catch (error) {
      console.error('Failed to load wallet:', error);
      // Use a random keypair for testing
      return new Wallet(Keypair.generate());
    }
  }

  async initialize(): Promise<void> {
    console.log('🔮 SPECTRE Crank Initializing...');
    console.log(`   RPC: ${this.config.rpcUrl}`);
    console.log(`   TEE RPC: ${this.config.teeRpcUrl}`);
    console.log(`   Wallet: ${this.wallet.publicKey.toString()}`);
    console.log(`   Poll Interval: ${this.config.pollInterval}ms`);

    // Load the program IDL
    try {
      const idlPath = path.join(__dirname, '../../target/idl/spectre_protocol.json');
      if (fs.existsSync(idlPath)) {
        const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
        const programId = new PublicKey(idl.address || idl.metadata?.address);
        this.program = new Program(idl, this.provider);
        console.log(`   Program ID: ${programId.toString()}`);
      } else {
        console.warn('   IDL not found, running in simulation mode');
      }
    } catch (error) {
      console.warn('   Failed to load IDL, running in simulation mode');
    }

    // Derive PDAs
    if (this.program) {
      [this.vaultPda] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, this.wallet.publicKey.toBuffer()],
        this.program.programId
      );

      [this.strategyConfigPda] = PublicKey.findProgramAddressSync(
        [STRATEGY_CONFIG_SEED, this.vaultPda.toBuffer()],
        this.program.programId
      );

      console.log(`   Vault PDA: ${this.vaultPda.toString()}`);
      console.log(`   Strategy Config PDA: ${this.strategyConfigPda.toString()}`);
    }

    console.log('✅ Crank initialized successfully\n');
  }

  /**
   * Main crank loop
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log('🚀 Starting SPECTRE Crank...\n');

    while (this.isRunning) {
      try {
        await this.runCycle();
      } catch (error) {
        console.error('❌ Crank cycle error:', error);
        this.stats.errors++;
      }

      // Wait for next cycle
      await this.sleep(this.config.pollInterval);
    }

    console.log('\n🛑 Crank stopped');
    this.printStats();
  }

  /**
   * Run a single crank cycle
   */
  async runCycle(): Promise<void> {
    this.stats.cyclesRun++;
    this.stats.lastCycleTime = new Date();

    console.log(`\n📊 Cycle ${this.stats.cyclesRun} - ${this.stats.lastCycleTime.toISOString()}`);

    // 1. Fetch active markets
    const markets = await this.marketProvider.getActiveMarkets();
    console.log(`   Found ${markets.length} active markets`);

    // 2. Analyze each market for opportunities
    for (const market of markets) {
      this.stats.marketsAnalyzed++;

      const shouldTrade = this.shouldTriggerAgent(market);

      if (shouldTrade) {
        console.log(`\n   ⚡ Opportunity detected:`);
        console.log(`      Market: ${market.marketId.toString().slice(0, 8)}...`);
        console.log(`      Price: ${(market.currentPrice / 1000).toFixed(3)}`);
        console.log(`      Trend: ${(market.trend / 1000).toFixed(3)}`);
        console.log(`      Volume: ${(market.volume24h / LAMPORTS_PER_SOL).toFixed(2)} SOL`);

        // 3. Trigger trade execution
        await this.executeTrade(market);
      }
    }
  }

  /**
   * Pre-filter to determine if we should trigger the agent
   * The actual strategy decision happens in the TEE
   */
  shouldTriggerAgent(market: MarketOpportunity): boolean {
    // Must be active
    if (!market.isActive) return false;

    // Must have sufficient volume
    if (market.volume24h < this.config.minVolume) return false;

    // Must have significant price movement
    const priceMovement = Math.abs(market.trend);
    if (priceMovement < this.config.minPriceMovement) return false;

    // Price should be in actionable range
    // Low price with positive trend = potential buy
    // High price with negative trend = potential sell
    const isLowPrice = market.currentPrice < 400; // Below 0.40
    const isHighPrice = market.currentPrice > 600; // Above 0.60
    const isPositiveTrend = market.trend > 0;
    const isNegativeTrend = market.trend < 0;

    return (isLowPrice && isPositiveTrend) || (isHighPrice && isNegativeTrend);
  }

  /**
   * Execute trade on the SPECTRE program
   */
  async executeTrade(market: MarketOpportunity): Promise<void> {
    if (!this.program || !this.vaultPda || !this.strategyConfigPda) {
      console.log('      [SIMULATION] Would execute trade');
      this.stats.tradesTriggered++;
      return;
    }

    try {
      const marketInput = {
        price: market.currentPrice,
        trend: market.trend,
        volatility: market.volatility,
        timestamp: new BN(Math.floor(Date.now() / 1000)),
      };

      const tx = await this.program.methods
        .executeTrade(marketInput)
        .accounts({
          authority: this.wallet.publicKey,
          vault: this.vaultPda,
          strategyConfig: this.strategyConfigPda,
        })
        .rpc();

      console.log(`      ✅ Trade executed: ${tx.slice(0, 16)}...`);
      this.stats.tradesTriggered++;
    } catch (error: any) {
      console.error(`      ❌ Trade failed:`, error.message || error);
      this.stats.errors++;
    }
  }

  /**
   * Stop the crank
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Print crank statistics
   */
  printStats(): void {
    console.log('\n========================================');
    console.log('📈 SPECTRE Crank Statistics');
    console.log('========================================');
    console.log(`   Cycles run: ${this.stats.cyclesRun}`);
    console.log(`   Markets analyzed: ${this.stats.marketsAnalyzed}`);
    console.log(`   Trades triggered: ${this.stats.tradesTriggered}`);
    console.log(`   Errors: ${this.stats.errors}`);
    console.log(`   Last cycle: ${this.stats.lastCycleTime?.toISOString() || 'N/A'}`);
    console.log('========================================\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// CLI Entry Point
// ============================================

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const config: Partial<CrankConfig> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--rpc':
        config.rpcUrl = args[++i];
        break;
      case '--tee-rpc':
        config.teeRpcUrl = args[++i];
        break;
      case '--interval':
        config.pollInterval = parseInt(args[++i]);
        break;
      case '--wallet':
        config.walletPath = args[++i];
        break;
      case '--help':
        printHelp();
        return;
    }
  }

  // Create and start crank
  const crank = new SpectreCrank(config);
  await crank.initialize();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, stopping crank...');
    crank.stop();
  });

  process.on('SIGTERM', () => {
    console.log('\n\nReceived SIGTERM, stopping crank...');
    crank.stop();
  });

  // Start the crank
  await crank.start();
}

function printHelp(): void {
  console.log(`
SPECTRE Crank - Automated market monitoring and trade execution

Usage: npx ts-node src/crank.ts [options]

Options:
  --rpc <url>       Solana RPC endpoint (default: http://127.0.0.1:8899)
  --tee-rpc <url>   TEE enclave RPC endpoint
  --interval <ms>   Poll interval in milliseconds (default: 30000)
  --wallet <path>   Path to wallet keypair file
  --help            Show this help message

Environment Variables:
  SOLANA_RPC        Solana RPC endpoint
  TEE_RPC           TEE enclave RPC endpoint
  WALLET_PATH       Path to wallet keypair file
  POLL_INTERVAL     Poll interval in milliseconds

Example:
  npx ts-node src/crank.ts --rpc https://api.devnet.solana.com --interval 60000
`);
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { SpectreCrank, CrankConfig, MarketOpportunity };
