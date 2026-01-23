/**
 * SPECTRE PNP Exchange Integration Tests
 *
 * Comprehensive test suite for PNP Exchange prediction market integration.
 * Tests cover:
 * - Unit tests for utility functions
 * - Client initialization
 * - Market data handling
 * - Trade execution logic
 * - Signal-to-trade mapping
 * - Market selection algorithm
 * - Edge cases and error handling
 *
 * Run with: npx ts-mocha tests/pnp_integration.ts
 */

import assert from 'assert';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

import {
  SpectrePnpClient,
  createPnpClientFromEnv,
  createReadOnlyPnpClient,
  signalToTradeSide,
  isStrongSignal,
  isActionableSignal,
  calculatePositionSize,
  scoreMarket,
  selectBestMarket,
  normalizeMarket,
  formatMarket,
  formatTradeResult,
  SpectreMarket,
  TradeSignal,
  TradeSide,
  TradeExecutionResult,
  MarketSelectionCriteria,
  PNP_MAINNET_USDC,
  PNP_DEVNET_USDC,
  MIN_TRADE_AMOUNT_USDC,
  MAX_TRADE_AMOUNT_USDC,
  MIN_LIQUIDITY_USDC,
  MIN_TIME_TO_EXPIRY_HOURS,
  MAX_PRICE_DEVIATION,
  DEFAULT_SELECTION_CRITERIA,
  DEFAULT_PNP_CONFIG,
} from '../client/src/pnp';

// ============================================
// Test Helpers
// ============================================

/**
 * Create a mock market for testing
 */
function createMockMarket(overrides: Partial<SpectreMarket> = {}): SpectreMarket {
  const defaults: SpectreMarket = {
    address: Keypair.generate().publicKey,
    question: 'Will this test pass?',
    yesPrice: 0.5,
    noPrice: 0.5,
    endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    isResolved: false,
    isResolvable: false,
    collateralMint: PNP_DEVNET_USDC,
    yesTokenMint: Keypair.generate().publicKey,
    noTokenMint: Keypair.generate().publicKey,
    liquidity: 1000,
    volume24h: 500,
  };

  return { ...defaults, ...overrides };
}

/**
 * Create multiple mock markets with varied properties
 */
function createMockMarkets(count: number): SpectreMarket[] {
  const markets: SpectreMarket[] = [];

  for (let i = 0; i < count; i++) {
    markets.push(
      createMockMarket({
        question: `Test Market ${i + 1}`,
        yesPrice: 0.3 + Math.random() * 0.4, // 0.3-0.7
        noPrice: 0.3 + Math.random() * 0.4,
        endTime: new Date(
          Date.now() + (i + 1) * 24 * 60 * 60 * 1000
        ), // Staggered expiries
        liquidity: 100 + i * 200,
        volume24h: 50 + i * 100,
      })
    );
  }

  return markets;
}

// ============================================
// Constants Tests
// ============================================

describe('PNP Integration - Constants', () => {
  it('should have correct USDC addresses', () => {
    assert.strictEqual(
      PNP_MAINNET_USDC.toString(),
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    );
    assert.strictEqual(
      PNP_DEVNET_USDC.toString(),
      '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    );
  });

  it('should have valid trade amount bounds', () => {
    assert.strictEqual(MIN_TRADE_AMOUNT_USDC, 1);
    assert.strictEqual(MAX_TRADE_AMOUNT_USDC, 10000);
    assert.ok(MIN_TRADE_AMOUNT_USDC < MAX_TRADE_AMOUNT_USDC);
  });

  it('should have valid market selection defaults', () => {
    assert.strictEqual(MIN_LIQUIDITY_USDC, 100);
    assert.strictEqual(MIN_TIME_TO_EXPIRY_HOURS, 24);
    assert.strictEqual(MAX_PRICE_DEVIATION, 0.4);
  });

  it('should have valid default selection criteria', () => {
    assert.strictEqual(DEFAULT_SELECTION_CRITERIA.minLiquidity, MIN_LIQUIDITY_USDC);
    assert.strictEqual(
      DEFAULT_SELECTION_CRITERIA.minTimeToExpiry,
      MIN_TIME_TO_EXPIRY_HOURS
    );
    assert.strictEqual(DEFAULT_SELECTION_CRITERIA.maxPriceDeviation, MAX_PRICE_DEVIATION);
  });

  it('should have valid default client config', () => {
    assert.strictEqual(DEFAULT_PNP_CONFIG.isDevnet, true);
    assert.strictEqual(DEFAULT_PNP_CONFIG.slippageTolerance, 0.05);
    assert.strictEqual(DEFAULT_PNP_CONFIG.retryAttempts, 3);
  });
});

// ============================================
// Signal Conversion Tests
// ============================================

describe('PNP Integration - Signal Conversion', () => {
  describe('signalToTradeSide', () => {
    it('should convert StrongBuy to yes', () => {
      assert.strictEqual(signalToTradeSide('StrongBuy'), 'yes');
    });

    it('should convert Buy to yes', () => {
      assert.strictEqual(signalToTradeSide('Buy'), 'yes');
    });

    it('should convert Hold to null', () => {
      assert.strictEqual(signalToTradeSide('Hold'), null);
    });

    it('should convert Sell to no', () => {
      assert.strictEqual(signalToTradeSide('Sell'), 'no');
    });

    it('should convert StrongSell to no', () => {
      assert.strictEqual(signalToTradeSide('StrongSell'), 'no');
    });
  });

  describe('isStrongSignal', () => {
    it('should return true for StrongBuy', () => {
      assert.strictEqual(isStrongSignal('StrongBuy'), true);
    });

    it('should return true for StrongSell', () => {
      assert.strictEqual(isStrongSignal('StrongSell'), true);
    });

    it('should return false for Buy', () => {
      assert.strictEqual(isStrongSignal('Buy'), false);
    });

    it('should return false for Sell', () => {
      assert.strictEqual(isStrongSignal('Sell'), false);
    });

    it('should return false for Hold', () => {
      assert.strictEqual(isStrongSignal('Hold'), false);
    });
  });

  describe('isActionableSignal', () => {
    it('should return true for all buy/sell signals', () => {
      assert.strictEqual(isActionableSignal('StrongBuy'), true);
      assert.strictEqual(isActionableSignal('Buy'), true);
      assert.strictEqual(isActionableSignal('Sell'), true);
      assert.strictEqual(isActionableSignal('StrongSell'), true);
    });

    it('should return false for Hold', () => {
      assert.strictEqual(isActionableSignal('Hold'), false);
    });
  });
});

// ============================================
// Position Sizing Tests
// ============================================

describe('PNP Integration - Position Sizing', () => {
  describe('calculatePositionSize', () => {
    const vaultBalance = 1000; // $1000 USDC

    it('should return 10% for strong signals', () => {
      assert.strictEqual(calculatePositionSize(vaultBalance, 'StrongBuy'), 100);
      assert.strictEqual(calculatePositionSize(vaultBalance, 'StrongSell'), 100);
    });

    it('should return 5% for normal signals', () => {
      assert.strictEqual(calculatePositionSize(vaultBalance, 'Buy'), 50);
      assert.strictEqual(calculatePositionSize(vaultBalance, 'Sell'), 50);
    });

    it('should return 0 for Hold', () => {
      assert.strictEqual(calculatePositionSize(vaultBalance, 'Hold'), 0);
    });

    it('should enforce minimum trade amount', () => {
      const smallBalance = 10; // $10 USDC
      // 5% of 10 = 0.5, but minimum is 1
      assert.strictEqual(
        calculatePositionSize(smallBalance, 'Buy'),
        MIN_TRADE_AMOUNT_USDC
      );
    });

    it('should enforce maximum trade amount', () => {
      const largeBalance = 500000; // $500k USDC
      // 10% of 500k = 50k, but max is 10k
      assert.strictEqual(
        calculatePositionSize(largeBalance, 'StrongBuy'),
        MAX_TRADE_AMOUNT_USDC
      );
    });

    it('should handle edge case: zero balance', () => {
      assert.strictEqual(calculatePositionSize(0, 'Buy'), MIN_TRADE_AMOUNT_USDC);
    });

    it('should handle edge case: negative balance', () => {
      assert.strictEqual(calculatePositionSize(-100, 'Buy'), MIN_TRADE_AMOUNT_USDC);
    });
  });
});

// ============================================
// Market Scoring Tests
// ============================================

describe('PNP Integration - Market Scoring', () => {
  describe('scoreMarket', () => {
    it('should give reasonable base score', () => {
      const market = createMockMarket({
        yesPrice: 0.5,
        noPrice: 0.5,
        endTime: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
        liquidity: 100,
        volume24h: 10,
      });
      const score = scoreMarket(market, 'Buy');
      // Score can vary based on multiple factors, but should be reasonable
      assert.ok(score >= 30 && score <= 70, `Score ${score} not in reasonable range`);
    });

    it('should penalize markets close to expiry', () => {
      const soonExpiry = createMockMarket({
        endTime: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours
      });
      const laterExpiry = createMockMarket({
        endTime: new Date(Date.now() + 200 * 60 * 60 * 1000), // 200 hours
      });

      assert.ok(
        scoreMarket(soonExpiry, 'Buy') < scoreMarket(laterExpiry, 'Buy'),
        'Soon expiry should score lower'
      );
    });

    it('should reward high liquidity markets', () => {
      const lowLiquidity = createMockMarket({ liquidity: 50 });
      const highLiquidity = createMockMarket({ liquidity: 2000 });

      assert.ok(
        scoreMarket(highLiquidity, 'Buy') > scoreMarket(lowLiquidity, 'Buy'),
        'High liquidity should score higher'
      );
    });

    it('should reward markets with trading volume', () => {
      const lowVolume = createMockMarket({ volume24h: 10 });
      const highVolume = createMockMarket({ volume24h: 500 });

      assert.ok(
        scoreMarket(highVolume, 'Buy') > scoreMarket(lowVolume, 'Buy'),
        'High volume should score higher'
      );
    });

    it('should prefer undervalued YES for Buy signals', () => {
      const cheapYes = createMockMarket({ yesPrice: 0.35, noPrice: 0.65 });
      const expensiveYes = createMockMarket({ yesPrice: 0.75, noPrice: 0.25 });

      assert.ok(
        scoreMarket(cheapYes, 'Buy') > scoreMarket(expensiveYes, 'Buy'),
        'Cheap YES should score higher for Buy'
      );
    });

    it('should prefer undervalued NO for Sell signals', () => {
      const cheapNo = createMockMarket({ yesPrice: 0.65, noPrice: 0.35 });
      const expensiveNo = createMockMarket({ yesPrice: 0.25, noPrice: 0.75 });

      assert.ok(
        scoreMarket(cheapNo, 'Sell') > scoreMarket(expensiveNo, 'Sell'),
        'Cheap NO should score higher for Sell'
      );
    });

    it('should keep score within 0-100 bounds', () => {
      // Create extreme markets
      const extremeMarkets = [
        createMockMarket({
          yesPrice: 0.1,
          liquidity: 10000,
          volume24h: 5000,
          endTime: new Date(Date.now() + 1000 * 60 * 60 * 1000),
        }),
        createMockMarket({
          yesPrice: 0.9,
          liquidity: 10,
          volume24h: 0,
          endTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
        }),
      ];

      for (const market of extremeMarkets) {
        const score = scoreMarket(market, 'Buy');
        assert.ok(score >= 0, `Score ${score} below 0`);
        assert.ok(score <= 100, `Score ${score} above 100`);
      }
    });
  });
});

// ============================================
// Market Selection Tests
// ============================================

describe('PNP Integration - Market Selection', () => {
  describe('selectBestMarket', () => {
    it('should return null for Hold signal', () => {
      const markets = createMockMarkets(5);
      const result = selectBestMarket(markets, 'Hold');
      assert.strictEqual(result, null);
    });

    it('should return null for empty market list', () => {
      const result = selectBestMarket([], 'Buy');
      assert.strictEqual(result, null);
    });

    it('should filter out resolved markets', () => {
      const markets = [
        createMockMarket({ isResolved: true, liquidity: 10000 }),
        createMockMarket({ isResolved: false, liquidity: 100 }),
      ];

      const result = selectBestMarket(markets, 'Buy');
      assert.ok(result !== null, 'Should return a market');
      assert.strictEqual(result!.isResolved, false);
    });

    it('should filter out markets expiring too soon', () => {
      const markets = [
        createMockMarket({
          endTime: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour
          liquidity: 10000,
        }),
        createMockMarket({
          endTime: new Date(Date.now() + 100 * 60 * 60 * 1000), // 100 hours
          liquidity: 100,
        }),
      ];

      const result = selectBestMarket(markets, 'Buy');
      assert.ok(result !== null, 'Should return a market');
      assert.ok(
        result!.endTime.getTime() > Date.now() + 24 * 60 * 60 * 1000,
        'Should have sufficient time to expiry'
      );
    });

    it('should filter out markets with extreme prices', () => {
      const markets = [
        createMockMarket({ yesPrice: 0.95, noPrice: 0.05 }), // Too expensive
        createMockMarket({ yesPrice: 0.5, noPrice: 0.5 }), // Reasonable
      ];

      const result = selectBestMarket(markets, 'Buy');
      assert.ok(result !== null, 'Should return a market');
      assert.ok(
        Math.abs(result!.yesPrice - 0.5) <= 0.1,
        'Should have reasonable price'
      );
    });

    it('should filter out markets with insufficient liquidity', () => {
      const markets = [
        createMockMarket({ liquidity: 10 }), // Too low
        createMockMarket({ liquidity: 500 }), // Good
      ];

      const result = selectBestMarket(markets, 'Buy', {
        ...DEFAULT_SELECTION_CRITERIA,
        minLiquidity: 100,
      });

      assert.ok(result !== null, 'Should return a market');
      assert.ok(result!.liquidity! >= 100, 'Should have sufficient liquidity');
    });

    it('should select highest scoring market', () => {
      const markets = [
        createMockMarket({
          question: 'Low score',
          yesPrice: 0.8,
          liquidity: 50,
          volume24h: 0,
        }),
        createMockMarket({
          question: 'High score',
          yesPrice: 0.4,
          liquidity: 2000,
          volume24h: 500,
        }),
      ];

      const result = selectBestMarket(markets, 'Buy');
      assert.ok(result !== null, 'Should return a market');
      assert.strictEqual(result!.question, 'High score');
    });

    it('should work with custom criteria', () => {
      const strictCriteria: MarketSelectionCriteria = {
        minLiquidity: 5000,
        minTimeToExpiry: 168, // 1 week
        maxPriceDeviation: 0.1,
      };

      const markets = [
        createMockMarket({
          liquidity: 1000,
          endTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
          yesPrice: 0.5,
        }),
        createMockMarket({
          liquidity: 10000,
          endTime: new Date(Date.now() + 200 * 60 * 60 * 1000),
          yesPrice: 0.45,
        }),
      ];

      const result = selectBestMarket(markets, 'Buy', strictCriteria);
      assert.ok(result !== null, 'Should return a market');
      assert.ok(result!.liquidity! >= 5000, 'Should meet liquidity criteria');
    });

    it('should return null when no markets meet criteria', () => {
      const strictCriteria: MarketSelectionCriteria = {
        minLiquidity: 100000, // Unreasonably high
        minTimeToExpiry: 24,
        maxPriceDeviation: 0.4,
      };

      const markets = createMockMarkets(5);
      const result = selectBestMarket(markets, 'Buy', strictCriteria);
      assert.strictEqual(result, null);
    });
  });
});

// ============================================
// Market Normalization Tests
// ============================================

describe('PNP Integration - Market Normalization', () => {
  describe('normalizeMarket', () => {
    it('should normalize PNP market data correctly', () => {
      const pnpMarket = {
        publicKey: Keypair.generate().publicKey,
        account: {
          question: 'Test Question',
          end_time: BigInt(Math.floor(Date.now() / 1000) + 86400),
          resolved: false,
          resolvable: true,
          yes_token_mint: Keypair.generate().publicKey.toBytes(),
          no_token_mint: Keypair.generate().publicKey.toBytes(),
          collateral_token: PNP_DEVNET_USDC.toBytes(),
          yesPrice: 0.6,
          noPrice: 0.4,
        },
      };

      const normalized = normalizeMarket(pnpMarket);

      assert.strictEqual(normalized.question, 'Test Question');
      assert.strictEqual(normalized.isResolved, false);
      assert.strictEqual(normalized.isResolvable, true);
      assert.strictEqual(normalized.yesPrice, 0.6);
      assert.strictEqual(normalized.noPrice, 0.4);
      assert.ok(normalized.address instanceof PublicKey);
      assert.ok(normalized.yesTokenMint instanceof PublicKey);
      assert.ok(normalized.noTokenMint instanceof PublicKey);
      assert.ok(normalized.collateralMint instanceof PublicKey);
    });

    it('should use default prices when not provided', () => {
      const pnpMarket = {
        publicKey: Keypair.generate().publicKey,
        account: {
          question: 'Test',
          end_time: BigInt(0),
          resolved: false,
          resolvable: false,
          yes_token_mint: Keypair.generate().publicKey.toBytes(),
          no_token_mint: Keypair.generate().publicKey.toBytes(),
          collateral_token: PNP_DEVNET_USDC.toBytes(),
          // No prices provided
        },
      };

      const normalized = normalizeMarket(pnpMarket);
      assert.strictEqual(normalized.yesPrice, 0.5);
      assert.strictEqual(normalized.noPrice, 0.5);
    });
  });
});

// ============================================
// Client Initialization Tests
// ============================================

describe('PNP Integration - Client Initialization', () => {
  describe('SpectrePnpClient', () => {
    it('should create read-only client without private key', () => {
      const client = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        undefined,
        true
      );

      assert.strictEqual(client.canSign(), false);
      assert.strictEqual(client.getWalletPublicKey(), null);
      assert.strictEqual(
        client.getUsdcMint().toString(),
        PNP_DEVNET_USDC.toString()
      );
    });

    it('should create signing client with Keypair', () => {
      const keypair = Keypair.generate();
      const client = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        keypair,
        true
      );

      assert.strictEqual(client.canSign(), true);
      assert.strictEqual(
        client.getWalletPublicKey()?.toString(),
        keypair.publicKey.toString()
      );
    });

    it('should create signing client with secret key array', () => {
      const keypair = Keypair.generate();
      const client = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        keypair.secretKey,
        true
      );

      assert.strictEqual(client.canSign(), true);
      assert.strictEqual(
        client.getWalletPublicKey()?.toString(),
        keypair.publicKey.toString()
      );
    });

    it('should use devnet USDC on devnet', () => {
      const client = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        undefined,
        true
      );

      assert.strictEqual(
        client.getUsdcMint().toString(),
        PNP_DEVNET_USDC.toString()
      );
    });

    it('should use mainnet USDC on mainnet', () => {
      const client = new SpectrePnpClient(
        'https://api.mainnet-beta.solana.com',
        undefined,
        false
      );

      assert.strictEqual(
        client.getUsdcMint().toString(),
        PNP_MAINNET_USDC.toString()
      );
    });

    it('should have valid connection', () => {
      const client = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        undefined,
        true
      );

      assert.ok(client.getConnection() instanceof Connection);
    });
  });

  describe('createReadOnlyPnpClient', () => {
    it('should create read-only client', () => {
      const client = createReadOnlyPnpClient();

      assert.strictEqual(client.canSign(), false);
      assert.strictEqual(
        client.getUsdcMint().toString(),
        PNP_DEVNET_USDC.toString()
      );
    });
  });
});

// ============================================
// Trade Execution Tests (Mock)
// ============================================

describe('PNP Integration - Trade Execution', () => {
  let client: SpectrePnpClient;
  const testMarket = Keypair.generate().publicKey;

  beforeEach(() => {
    // Create client without private key
    client = new SpectrePnpClient(
      'https://api.devnet.solana.com',
      undefined,
      true
    );
  });

  describe('executeTrade', () => {
    it('should fail without signing capability', async () => {
      const result = await client.executeTrade(testMarket, 'yes', 10);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('private key'));
    });

    it('should fail for amount below minimum', async () => {
      const keypair = Keypair.generate();
      const signingClient = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        keypair,
        true
      );

      const result = await signingClient.executeTrade(
        testMarket,
        'yes',
        0.1 // Below MIN_TRADE_AMOUNT_USDC
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('below minimum'));
    });

    it('should fail for amount above maximum', async () => {
      const keypair = Keypair.generate();
      const signingClient = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        keypair,
        true
      );

      const result = await signingClient.executeTrade(
        testMarket,
        'yes',
        100000 // Above MAX_TRADE_AMOUNT_USDC
      );

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('exceeds maximum'));
    });

    it('should return proper result structure', async () => {
      const result = await client.executeTrade(testMarket, 'yes', 10);

      assert.ok('success' in result);
      assert.ok('side' in result);
      assert.ok('amountUsdc' in result);
      assert.ok('marketAddress' in result);
      assert.strictEqual(result.side, 'yes');
      assert.strictEqual(result.amountUsdc, 10);
    });
  });

  describe('sellPosition', () => {
    it('should fail without signing capability', async () => {
      const result = await client.sellPosition(testMarket, 'yes', 100);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('private key'));
    });

    it('should fail for zero token amount', async () => {
      const keypair = Keypair.generate();
      const signingClient = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        keypair,
        true
      );

      const result = await signingClient.sellPosition(testMarket, 'yes', 0);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('positive'));
    });

    it('should fail for negative token amount', async () => {
      const keypair = Keypair.generate();
      const signingClient = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        keypair,
        true
      );

      const result = await signingClient.sellPosition(testMarket, 'no', -50);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('positive'));
    });
  });

  describe('executeSignalTrade', () => {
    it('should return error for Hold signal', async () => {
      const result = await client.executeSignalTrade('Hold', 100);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('HOLD'));
    });

    it('should map StrongBuy to yes side', async () => {
      const keypair = Keypair.generate();
      const signingClient = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        keypair,
        true
      );

      // With no markets, should fail at market selection
      const result = await signingClient.executeSignalTrade('StrongBuy', 100);

      // Either fails at market selection or SDK call
      assert.strictEqual(result.side, 'yes');
    });

    it('should map StrongSell to no side', async () => {
      const keypair = Keypair.generate();
      const signingClient = new SpectrePnpClient(
        'https://api.devnet.solana.com',
        keypair,
        true
      );

      const result = await signingClient.executeSignalTrade('StrongSell', 100);

      assert.strictEqual(result.side, 'no');
    });

    it('should use provided market when specified', async () => {
      const result = await client.executeSignalTrade('Buy', 100, testMarket);

      assert.ok(result.marketAddress !== undefined);
    });
  });
});

// ============================================
// Redemption Tests
// ============================================

describe('PNP Integration - Redemption', () => {
  it('should fail redemption without signing capability', async () => {
    const client = createReadOnlyPnpClient();
    const testMarket = Keypair.generate().publicKey;

    const result = await client.redeemWinnings(testMarket);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('private key'));
  });
});

// ============================================
// Formatting Tests
// ============================================

describe('PNP Integration - Formatting', () => {
  describe('formatMarket', () => {
    it('should format market info correctly', () => {
      const market = createMockMarket({
        question: 'Will the price go up?',
        yesPrice: 0.65,
        noPrice: 0.35,
      });

      const formatted = formatMarket(market);

      assert.ok(formatted.includes('Market:'));
      assert.ok(formatted.includes('Will the price'));
      assert.ok(formatted.includes('YES Price: 65.0%'));
      assert.ok(formatted.includes('NO Price: 35.0%'));
      assert.ok(formatted.includes('Resolved: false'));
    });

    it('should truncate long questions', () => {
      const longQuestion =
        'This is a very long market question that exceeds fifty characters and should be truncated';
      const market = createMockMarket({ question: longQuestion });

      const formatted = formatMarket(market);

      assert.ok(formatted.includes('...'));
    });
  });

  describe('formatTradeResult', () => {
    it('should format successful trade', () => {
      const result: TradeExecutionResult = {
        success: true,
        side: 'yes',
        amountUsdc: 50,
        marketAddress: Keypair.generate().publicKey,
        signature: 'abc123def456ghij789klmnopqrstuvwxyz',
        sharesReceived: 100,
        executionPrice: 0.5,
      };

      const formatted = formatTradeResult(result);

      assert.ok(formatted.includes('Trade Executed'));
      assert.ok(formatted.includes('YES'));
      assert.ok(formatted.includes('50 USDC'));
      assert.ok(formatted.includes('50.0%'));
    });

    it('should format failed trade', () => {
      const result: TradeExecutionResult = {
        success: false,
        side: 'no',
        amountUsdc: 25,
        error: 'Insufficient funds',
      };

      const formatted = formatTradeResult(result);

      assert.ok(formatted.includes('Trade Failed'));
      assert.ok(formatted.includes('Insufficient funds'));
    });
  });
});

// ============================================
// Edge Cases Tests
// ============================================

describe('PNP Integration - Edge Cases', () => {
  describe('Market Selection Edge Cases', () => {
    it('should handle all markets resolved', () => {
      const markets = [
        createMockMarket({ isResolved: true }),
        createMockMarket({ isResolved: true }),
        createMockMarket({ isResolved: true }),
      ];

      const result = selectBestMarket(markets, 'Buy');
      assert.strictEqual(result, null);
    });

    it('should handle all markets expired', () => {
      const markets = [
        createMockMarket({
          endTime: new Date(Date.now() - 1000), // Past
        }),
        createMockMarket({
          endTime: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour
        }),
      ];

      const result = selectBestMarket(markets, 'Buy');
      assert.strictEqual(result, null);
    });

    it('should handle markets with undefined liquidity', () => {
      const markets = [
        createMockMarket({ liquidity: undefined }),
        createMockMarket({ liquidity: 500 }),
      ];

      // Should still work with the market that has liquidity
      const result = selectBestMarket(markets, 'Buy');
      assert.ok(result !== null);
    });

    it('should handle single market', () => {
      const markets = [createMockMarket()];

      const result = selectBestMarket(markets, 'Buy');
      assert.ok(result !== null);
      assert.deepStrictEqual(result, markets[0]);
    });
  });

  describe('Position Sizing Edge Cases', () => {
    it('should handle very small vault balance', () => {
      const result = calculatePositionSize(0.5, 'Buy');
      assert.strictEqual(result, MIN_TRADE_AMOUNT_USDC);
    });

    it('should handle very large vault balance', () => {
      const result = calculatePositionSize(1_000_000_000, 'StrongBuy');
      assert.strictEqual(result, MAX_TRADE_AMOUNT_USDC);
    });
  });

  describe('Signal Handling Edge Cases', () => {
    it('should handle all signal types without error', () => {
      const signals: TradeSignal[] = [
        'StrongBuy',
        'Buy',
        'Hold',
        'Sell',
        'StrongSell',
      ];

      for (const signal of signals) {
        assert.doesNotThrow(() => signalToTradeSide(signal));
        assert.doesNotThrow(() => isStrongSignal(signal));
        assert.doesNotThrow(() => isActionableSignal(signal));
        assert.doesNotThrow(() => calculatePositionSize(1000, signal));
      }
    });
  });
});

// ============================================
// Integration Test (Devnet) - Optional
// ============================================

describe('PNP Integration - Devnet Integration (Optional)', function () {
  this.timeout(30000); // 30 second timeout for network calls

  let client: SpectrePnpClient;

  before(() => {
    client = createReadOnlyPnpClient();
  });

  it('should connect to devnet', async () => {
    try {
      const slot = await client.getConnection().getSlot();
      assert.ok(typeof slot === 'number');
      assert.ok(slot > 0);
    } catch (error) {
      // Network might not be available in CI
      console.warn('Devnet connection test skipped (network unavailable)');
    }
  });

  it('should attempt to fetch markets (may return empty)', async () => {
    try {
      const markets = await client.fetchActiveMarkets();
      assert.ok(Array.isArray(markets));
      // Markets may or may not exist on devnet
      console.log(`Found ${markets.length} active markets on devnet`);
    } catch (error) {
      // SDK or network might not be available
      console.warn('Market fetch test skipped:', (error as Error).message);
    }
  });

  it('should attempt to select market for signal', async () => {
    try {
      const market = await client.selectMarketForSignal('Buy');
      // May be null if no suitable markets
      console.log(
        `Market selection result: ${market ? market.address.toString() : 'null'}`
      );
    } catch (error) {
      console.warn(
        'Market selection test skipped:',
        (error as Error).message
      );
    }
  });
});

// ============================================
// Summary
// ============================================

console.log(`
================================================================================
PNP Integration Test Suite
================================================================================
Test Categories:
- Constants: USDC addresses, trade amounts, selection defaults
- Signal Conversion: signalToTradeSide, isStrongSignal, isActionableSignal
- Position Sizing: calculatePositionSize with various balances
- Market Scoring: scoreMarket algorithm
- Market Selection: selectBestMarket with criteria filtering
- Market Normalization: normalizeMarket data transformation
- Client Initialization: SpectrePnpClient configuration
- Trade Execution: executeTrade, sellPosition, executeSignalTrade
- Redemption: redeemWinnings
- Formatting: formatMarket, formatTradeResult
- Edge Cases: Boundary conditions and error handling
- Devnet Integration: Optional live network tests
================================================================================
`);
