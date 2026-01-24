/**
 * SPECTRE PNP Exchange Client
 *
 * TypeScript client for PNP Exchange prediction market integration.
 * This module wraps the PNP SDK for SPECTRE-specific use cases including:
 * - Market discovery and selection
 * - Strategy-based trade execution
 * - Position tracking and management
 * - Redemption of winning positions
 *
 * ## Usage
 * ```typescript
 * import { SpectrePnpClient, signalToTradeSide } from './pnp';
 *
 * const client = new SpectrePnpClient(rpcUrl, privateKey, true); // devnet
 *
 * // Fetch active markets
 * const markets = await client.fetchActiveMarkets();
 *
 * // Execute a trade based on strategy signal
 * const result = await client.executeSignalTrade('StrongBuy', 10, market.address);
 * ```
 */

import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

// ============================================
// Constants
// ============================================

/**
 * USDC mint address on Solana mainnet
 */
export const PNP_MAINNET_USDC = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

/**
 * USDC mint address on Solana devnet
 */
export const PNP_DEVNET_USDC = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);

/**
 * Minimum trade amount in USDC (1 USDC)
 */
export const MIN_TRADE_AMOUNT_USDC = 1;

/**
 * Maximum trade amount in USDC (10,000 USDC)
 */
export const MAX_TRADE_AMOUNT_USDC = 10000;

/**
 * Minimum liquidity required for market selection (100 USDC)
 */
export const MIN_LIQUIDITY_USDC = 100;

/**
 * Minimum time to expiry for market selection (24 hours)
 */
export const MIN_TIME_TO_EXPIRY_HOURS = 24;

/**
 * Default maximum price deviation from 50% for selection
 */
export const MAX_PRICE_DEVIATION = 0.4;

// ============================================
// Types
// ============================================

/**
 * Trade signal types from SPECTRE strategy
 */
export type TradeSignal =
  | 'StrongBuy'
  | 'Buy'
  | 'Hold'
  | 'Sell'
  | 'StrongSell';

/**
 * Trade side for PNP markets
 */
export type TradeSide = 'yes' | 'no';

/**
 * Normalized market data from PNP
 */
export interface SpectreMarket {
  /** Market address on Solana */
  address: PublicKey;
  /** Market question/title */
  question: string;
  /** Current YES token price (0-1) */
  yesPrice: number;
  /** Current NO token price (0-1) */
  noPrice: number;
  /** Market end timestamp */
  endTime: Date;
  /** Whether market is resolved */
  isResolved: boolean;
  /** Whether market is resolvable */
  isResolvable: boolean;
  /** Collateral token mint */
  collateralMint: PublicKey;
  /** YES token mint */
  yesTokenMint: PublicKey;
  /** NO token mint */
  noTokenMint: PublicKey;
  /** Estimated liquidity (if available) */
  liquidity?: number;
  /** 24h volume (if available) */
  volume24h?: number;
}

/**
 * Result of a trade execution
 */
export interface TradeExecutionResult {
  /** Whether the trade was successful */
  success: boolean;
  /** Transaction signature */
  signature?: string;
  /** Number of shares received */
  sharesReceived?: number;
  /** Execution price (0-1) */
  executionPrice?: number;
  /** Error message if failed */
  error?: string;
  /** Market address traded on */
  marketAddress?: PublicKey;
  /** Side of the trade */
  side: TradeSide;
  /** Amount in USDC */
  amountUsdc: number;
  /** Timestamp of execution */
  executedAt?: Date;
}

/**
 * Position information for a market
 */
export interface PositionInfo {
  /** Market address */
  market: PublicKey;
  /** YES token balance */
  yesShares: number;
  /** NO token balance */
  noShares: number;
  /** Entry price for YES position */
  entryPriceYes?: number;
  /** Entry price for NO position */
  entryPriceNo?: number;
  /** Estimated unrealized PnL */
  unrealizedPnl?: number;
  /** Total invested */
  totalInvested?: number;
}

/**
 * Criteria for market selection
 */
export interface MarketSelectionCriteria {
  /** Minimum USDC liquidity */
  minLiquidity: number;
  /** Minimum hours until expiry */
  minTimeToExpiry: number;
  /** Maximum deviation from 50% for selection */
  maxPriceDeviation: number;
  /** Optional category filter */
  preferredCategories?: string[];
  /** Exclude already-held markets */
  excludeHeldMarkets?: boolean;
}

/**
 * Default market selection criteria
 */
export const DEFAULT_SELECTION_CRITERIA: MarketSelectionCriteria = {
  minLiquidity: MIN_LIQUIDITY_USDC,
  minTimeToExpiry: MIN_TIME_TO_EXPIRY_HOURS,
  maxPriceDeviation: MAX_PRICE_DEVIATION,
  excludeHeldMarkets: false,
};

/**
 * PNP client configuration
 */
export interface PnpClientConfig {
  /** Solana RPC URL */
  rpcUrl: string;
  /** Use devnet (affects USDC address) */
  isDevnet: boolean;
  /** Default slippage tolerance (0-1) */
  slippageTolerance: number;
  /** Retry attempts for failed operations */
  retryAttempts: number;
  /** Retry delay in ms */
  retryDelayMs: number;
}

/**
 * Default PNP client configuration
 */
export const DEFAULT_PNP_CONFIG: PnpClientConfig = {
  rpcUrl: 'https://api.devnet.solana.com',
  isDevnet: true,
  slippageTolerance: 0.05, // 5%
  retryAttempts: 3,
  retryDelayMs: 1000,
};

// ============================================
// PNP SDK Type Stubs (since SDK exports may vary)
// ============================================

/**
 * PNP Market account data structure (from SDK)
 */
interface PnpMarketAccount {
  creator: Uint8Array;
  question: string;
  end_time: bigint;
  resolved: boolean;
  winning_token_id?: string;
  resolvable: boolean;
  yes_token_mint: Uint8Array;
  no_token_mint: Uint8Array;
  collateral_token: Uint8Array;
}

/**
 * PNP Market with public key
 */
interface PnpMarketWithKey {
  publicKey: PublicKey;
  account: PnpMarketAccount;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Convert a strategy signal to a trade side
 *
 * @param signal - Strategy signal (StrongBuy/Buy/Hold/Sell/StrongSell)
 * @returns Trade side ('yes' | 'no') or null for Hold
 */
export function signalToTradeSide(signal: TradeSignal): TradeSide | null {
  switch (signal) {
    case 'StrongBuy':
    case 'Buy':
      return 'yes';
    case 'StrongSell':
    case 'Sell':
      return 'no';
    case 'Hold':
      return null;
  }
}

/**
 * Check if a signal is a "strong" signal
 *
 * @param signal - Strategy signal
 * @returns true if signal is StrongBuy or StrongSell
 */
export function isStrongSignal(signal: TradeSignal): boolean {
  return signal === 'StrongBuy' || signal === 'StrongSell';
}

/**
 * Check if a signal is actionable (not Hold)
 *
 * @param signal - Strategy signal
 * @returns true if signal requires action
 */
export function isActionableSignal(signal: TradeSignal): boolean {
  return signal !== 'Hold';
}

/**
 * Calculate position size based on signal strength
 *
 * @param vaultBalance - Total vault balance in USDC
 * @param signal - Strategy signal
 * @returns Position size in USDC
 */
export function calculatePositionSize(
  vaultBalance: number,
  signal: TradeSignal
): number {
  if (!isActionableSignal(signal)) {
    return 0;
  }

  // Strong signals get 10%, normal signals get 5%
  const percentage = isStrongSignal(signal) ? 0.10 : 0.05;
  const size = vaultBalance * percentage;

  // Ensure within bounds
  return Math.max(MIN_TRADE_AMOUNT_USDC, Math.min(MAX_TRADE_AMOUNT_USDC, size));
}

/**
 * Score a market for selection
 *
 * Higher score = better candidate
 *
 * @param market - Market to score
 * @param signal - Trade signal (affects scoring based on price)
 * @returns Score (0-100)
 */
export function scoreMarket(market: SpectreMarket, signal: TradeSignal): number {
  let score = 50; // Base score

  // Penalize markets close to expiry
  const hoursToExpiry =
    (market.endTime.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursToExpiry < 24) {
    score -= 20;
  } else if (hoursToExpiry < 48) {
    score -= 10;
  } else if (hoursToExpiry > 168) {
    // > 1 week
    score += 10;
  }

  // Reward markets with good liquidity
  if (market.liquidity && market.liquidity > 1000) {
    score += 15;
  } else if (market.liquidity && market.liquidity > 500) {
    score += 10;
  }

  // Reward markets with volume
  if (market.volume24h && market.volume24h > 100) {
    score += 10;
  }

  // Price opportunity scoring
  // For YES side, lower price = more upside potential
  // For NO side, lower no price (higher yes price) = more upside potential
  const side = signalToTradeSide(signal);
  if (side === 'yes') {
    // Prefer markets where YES is undervalued (price < 0.5)
    if (market.yesPrice < 0.4) {
      score += 15;
    } else if (market.yesPrice < 0.5) {
      score += 10;
    } else if (market.yesPrice > 0.7) {
      score -= 10; // Expensive
    }
  } else if (side === 'no') {
    // Prefer markets where NO is undervalued (price < 0.5)
    if (market.noPrice < 0.4) {
      score += 15;
    } else if (market.noPrice < 0.5) {
      score += 10;
    } else if (market.noPrice > 0.7) {
      score -= 10; // Expensive
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Select the best market for a given signal
 *
 * @param markets - Available markets
 * @param signal - Trade signal
 * @param criteria - Selection criteria
 * @returns Best market or null if none suitable
 */
export function selectBestMarket(
  markets: SpectreMarket[],
  signal: TradeSignal,
  criteria: MarketSelectionCriteria = DEFAULT_SELECTION_CRITERIA
): SpectreMarket | null {
  if (!isActionableSignal(signal)) {
    return null;
  }

  const now = Date.now();
  const minExpiryMs = criteria.minTimeToExpiry * 60 * 60 * 1000;

  // Filter valid markets
  const validMarkets = markets.filter((market) => {
    // Must not be resolved
    if (market.isResolved) return false;

    // Must have sufficient time to expiry
    if (market.endTime.getTime() - now < minExpiryMs) return false;

    // Check price deviation (not too extreme)
    const price =
      signalToTradeSide(signal) === 'yes' ? market.yesPrice : market.noPrice;
    if (Math.abs(price - 0.5) > criteria.maxPriceDeviation) return false;

    // Check minimum liquidity (if available)
    if (
      market.liquidity !== undefined &&
      market.liquidity < criteria.minLiquidity
    ) {
      return false;
    }

    return true;
  });

  if (validMarkets.length === 0) {
    return null;
  }

  // Score and sort markets
  const scoredMarkets = validMarkets.map((market) => ({
    market,
    score: scoreMarket(market, signal),
  }));

  scoredMarkets.sort((a, b) => b.score - a.score);

  return scoredMarkets[0].market;
}

/**
 * Convert PNP SDK market to SpectreMarket
 */
export function normalizeMarket(
  pnpMarket: PnpMarketWithKey | any
): SpectreMarket {
  const account = pnpMarket.account;

  // Handle different possible formats
  const yesTokenMint =
    account.yes_token_mint instanceof Uint8Array
      ? new PublicKey(account.yes_token_mint)
      : new PublicKey(account.yesTokenMint || account.yes_token_mint);

  const noTokenMint =
    account.no_token_mint instanceof Uint8Array
      ? new PublicKey(account.no_token_mint)
      : new PublicKey(account.noTokenMint || account.no_token_mint);

  const collateralMint =
    account.collateral_token instanceof Uint8Array
      ? new PublicKey(account.collateral_token)
      : new PublicKey(account.collateralToken || account.collateral_token);

  // Calculate prices from reserves or use defaults
  // PNP uses AMM so prices are derived from reserves
  const yesPrice = account.yesPrice || 0.5;
  const noPrice = account.noPrice || 0.5;

  return {
    address:
      pnpMarket.publicKey instanceof PublicKey
        ? pnpMarket.publicKey
        : new PublicKey(pnpMarket.publicKey),
    question: account.question || '',
    yesPrice: typeof yesPrice === 'number' ? yesPrice : 0.5,
    noPrice: typeof noPrice === 'number' ? noPrice : 0.5,
    endTime: new Date(
      Number(account.end_time || account.endTime || 0) * 1000
    ),
    isResolved: account.resolved || false,
    isResolvable: account.resolvable || false,
    collateralMint,
    yesTokenMint,
    noTokenMint,
    liquidity: account.liquidity,
    volume24h: account.volume24h,
  };
}

/**
 * Format a market for display
 */
export function formatMarket(market: SpectreMarket): string {
  const expiry = market.endTime.toISOString().split('T')[0];
  return `
Market: ${market.address.toString().slice(0, 8)}...
  Question: ${market.question.slice(0, 50)}...
  YES Price: ${(market.yesPrice * 100).toFixed(1)}%
  NO Price: ${(market.noPrice * 100).toFixed(1)}%
  Expires: ${expiry}
  Resolved: ${market.isResolved}
`.trim();
}

/**
 * Format a trade result for display
 */
export function formatTradeResult(result: TradeExecutionResult): string {
  if (!result.success) {
    return `Trade Failed: ${result.error}`;
  }
  return `
Trade Executed:
  Market: ${result.marketAddress?.toString().slice(0, 8)}...
  Side: ${result.side.toUpperCase()}
  Amount: ${result.amountUsdc} USDC
  Shares: ${result.sharesReceived?.toFixed(2) || 'N/A'}
  Price: ${result.executionPrice ? (result.executionPrice * 100).toFixed(1) + '%' : 'N/A'}
  Signature: ${result.signature?.slice(0, 16)}...
`.trim();
}

// ============================================
// PNP Client Class
// ============================================

/**
 * SPECTRE PNP Exchange Client
 *
 * Wraps the PNP SDK for SPECTRE-specific prediction market operations.
 */
export class SpectrePnpClient {
  private pnpClient: any; // PNPClient from SDK
  private connection: Connection;
  private config: PnpClientConfig;
  private usdcMint: PublicKey;
  private keypair: Keypair | null = null;

  /**
   * Create a new SpectrePnpClient
   *
   * @param rpcUrl - Solana RPC endpoint
   * @param privateKey - Private key (optional, required for trading)
   * @param isDevnet - Use devnet configuration
   */
  constructor(
    rpcUrl: string,
    privateKey?: Uint8Array | string | Keypair,
    isDevnet: boolean = true
  ) {
    this.config = {
      ...DEFAULT_PNP_CONFIG,
      rpcUrl,
      isDevnet,
    };

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.usdcMint = isDevnet ? PNP_DEVNET_USDC : PNP_MAINNET_USDC;

    // Handle different private key formats
    if (privateKey) {
      if (privateKey instanceof Keypair) {
        this.keypair = privateKey;
      } else if (typeof privateKey === 'string') {
        // Base58 encoded
        const bs58 = require('bs58');
        this.keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
      } else {
        this.keypair = Keypair.fromSecretKey(privateKey);
      }
    }

    // Initialize PNP client
    this.initializePnpClient(rpcUrl, privateKey);
  }

  /**
   * Initialize the underlying PNP SDK client
   */
  private initializePnpClient(
    rpcUrl: string,
    privateKey?: Uint8Array | string | Keypair
  ): void {
    try {
      // Dynamic import to handle SDK variations
      const { PNPClient } = require('pnp-sdk');

      if (privateKey && this.keypair) {
        this.pnpClient = new PNPClient(rpcUrl, this.keypair.secretKey);
      } else {
        this.pnpClient = new PNPClient(rpcUrl);
      }
    } catch (error: any) {
      console.warn('PNP SDK initialization warning:', error.message);
      // Create a mock client for testing if SDK fails
      this.pnpClient = this.createMockClient();
    }
  }

  /**
   * Create a mock client for testing when SDK is unavailable
   */
  private createMockClient(): any {
    return {
      fetchMarkets: async () => [],
      fetchMarket: async () => null,
      fetchMarketAddresses: async () => [],
      trading: {
        buyTokensUsdc: async () => ({ success: false, error: 'Mock client' }),
        sellOutcome: async () => ({ success: false, error: 'Mock client' }),
        getMarketInfo: async () => null,
      },
      redeemPosition: async () => ({ success: false }),
    };
  }

  /**
   * Get the Solana connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get the USDC mint address
   */
  getUsdcMint(): PublicKey {
    return this.usdcMint;
  }

  /**
   * Check if client has signing capability
   */
  canSign(): boolean {
    return this.keypair !== null;
  }

  /**
   * Get the wallet public key
   */
  getWalletPublicKey(): PublicKey | null {
    return this.keypair?.publicKey || null;
  }

  // ============================================
  // Market Discovery
  // ============================================

  /**
   * Fetch all active (unresolved) markets
   *
   * @returns Array of active markets
   */
  async fetchActiveMarkets(): Promise<SpectreMarket[]> {
    try {
      const markets = await this.pnpClient.fetchMarkets();

      if (!markets || !Array.isArray(markets)) {
        console.warn('No markets returned from PNP');
        return [];
      }

      return markets
        .map((m: any) => normalizeMarket(m))
        .filter((m: SpectreMarket) => !m.isResolved);
    } catch (error: any) {
      console.error('Failed to fetch markets:', error.message);
      return [];
    }
  }

  /**
   * Fetch all markets (including resolved)
   *
   * @returns Array of all markets
   */
  async fetchAllMarkets(): Promise<SpectreMarket[]> {
    try {
      const markets = await this.pnpClient.fetchMarkets();

      if (!markets || !Array.isArray(markets)) {
        return [];
      }

      return markets.map((m: any) => normalizeMarket(m));
    } catch (error: any) {
      console.error('Failed to fetch all markets:', error.message);
      return [];
    }
  }

  /**
   * Fetch a specific market by address
   *
   * @param address - Market address
   * @returns Market data or null if not found
   */
  async fetchMarket(address: PublicKey): Promise<SpectreMarket | null> {
    try {
      const market = await this.pnpClient.fetchMarket(address);

      if (!market) {
        return null;
      }

      return normalizeMarket(market);
    } catch (error: any) {
      console.error('Failed to fetch market:', error.message);
      return null;
    }
  }

  /**
   * Fetch market addresses from proxy server
   *
   * @returns Array of market addresses
   */
  async fetchMarketAddresses(): Promise<PublicKey[]> {
    try {
      const addresses = await this.pnpClient.fetchMarketAddresses();

      if (!addresses || !Array.isArray(addresses)) {
        return [];
      }

      // Filter and convert addresses, handling invalid base58 strings
      const validAddresses: PublicKey[] = [];
      for (const a of addresses) {
        try {
          if (a instanceof PublicKey) {
            validAddresses.push(a);
          } else if (typeof a === 'string' && a.length > 0) {
            validAddresses.push(new PublicKey(a));
          }
        } catch {
          // Skip invalid addresses (e.g., test-defillama-xx placeholders)
          continue;
        }
      }

      return validAddresses;
    } catch (error: any) {
      console.error('Failed to fetch market addresses:', error.message);
      return [];
    }
  }

  // ============================================
  // Trading
  // ============================================

  /**
   * Execute a trade on a market
   *
   * @param market - Market address
   * @param side - Trade side ('yes' or 'no')
   * @param amountUsdc - Amount in USDC
   * @returns Trade execution result
   */
  async executeTrade(
    market: PublicKey,
    side: TradeSide,
    amountUsdc: number
  ): Promise<TradeExecutionResult> {
    const baseResult: TradeExecutionResult = {
      success: false,
      side,
      amountUsdc,
      marketAddress: market,
    };

    // Validate inputs
    if (!this.canSign()) {
      return {
        ...baseResult,
        error: 'No private key provided. Cannot sign transactions.',
      };
    }

    if (amountUsdc < MIN_TRADE_AMOUNT_USDC) {
      return {
        ...baseResult,
        error: `Amount ${amountUsdc} USDC below minimum ${MIN_TRADE_AMOUNT_USDC} USDC`,
      };
    }

    if (amountUsdc > MAX_TRADE_AMOUNT_USDC) {
      return {
        ...baseResult,
        error: `Amount ${amountUsdc} USDC exceeds maximum ${MAX_TRADE_AMOUNT_USDC} USDC`,
      };
    }

    try {
      const result = await this.pnpClient.trading.buyTokensUsdc({
        market,
        buyYesToken: side === 'yes',
        amountUsdc,
      });

      // Handle different response formats from SDK
      if (result && (result.signature || result.success)) {
        return {
          ...baseResult,
          success: true,
          signature: result.signature || result.txSignature,
          sharesReceived: result.sharesReceived || result.tokensReceived,
          executionPrice: result.executionPrice || result.price,
          executedAt: new Date(),
        };
      }

      return {
        ...baseResult,
        error: result?.error || 'Trade execution failed',
      };
    } catch (error: any) {
      return {
        ...baseResult,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Sell a position on a market
   *
   * @param market - Market address
   * @param side - Side to sell ('yes' or 'no')
   * @param tokenAmount - Amount of tokens to sell
   * @returns Trade execution result
   */
  async sellPosition(
    market: PublicKey,
    side: TradeSide,
    tokenAmount: number
  ): Promise<TradeExecutionResult> {
    const baseResult: TradeExecutionResult = {
      success: false,
      side,
      amountUsdc: 0,
      marketAddress: market,
    };

    if (!this.canSign()) {
      return {
        ...baseResult,
        error: 'No private key provided. Cannot sign transactions.',
      };
    }

    if (tokenAmount <= 0) {
      return {
        ...baseResult,
        error: 'Token amount must be positive',
      };
    }

    try {
      const result = await this.pnpClient.trading.sellOutcome({
        market,
        outcome: side,
        tokenAmount,
      });

      if (result && (result.signature || result.success)) {
        return {
          ...baseResult,
          success: true,
          signature: result.signature || result.txSignature,
          amountUsdc: result.amountReceived || result.usdcReceived || 0,
          executionPrice: result.executionPrice || result.price,
          executedAt: new Date(),
        };
      }

      return {
        ...baseResult,
        error: result?.error || 'Sell execution failed',
      };
    } catch (error: any) {
      return {
        ...baseResult,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Execute a trade based on a strategy signal
   *
   * @param signal - Strategy signal
   * @param positionSizeUsdc - Position size in USDC
   * @param market - Optional specific market (auto-selects if not provided)
   * @returns Trade execution result
   */
  async executeSignalTrade(
    signal: TradeSignal,
    positionSizeUsdc: number,
    market?: PublicKey
  ): Promise<TradeExecutionResult> {
    const baseResult: TradeExecutionResult = {
      success: false,
      side: 'yes',
      amountUsdc: positionSizeUsdc,
    };

    // Check if signal is actionable
    const side = signalToTradeSide(signal);
    if (!side) {
      return {
        ...baseResult,
        error: 'Signal is HOLD - no trade required',
      };
    }

    baseResult.side = side;

    // Find a market if not specified
    let targetMarket: PublicKey;
    if (market) {
      targetMarket = market;
    } else {
      const markets = await this.fetchActiveMarkets();
      const selectedMarket = selectBestMarket(markets, signal);

      if (!selectedMarket) {
        return {
          ...baseResult,
          error: 'No suitable market found for signal',
        };
      }

      targetMarket = selectedMarket.address;
    }

    // Execute the trade
    return this.executeTrade(targetMarket, side, positionSizeUsdc);
  }

  // ============================================
  // Position Management
  // ============================================

  /**
   * Get all positions for the current wallet
   *
   * Note: This is a simplified implementation. Full position tracking
   * would require indexing all markets and checking token balances.
   *
   * @returns Array of positions
   */
  async getPositions(): Promise<PositionInfo[]> {
    if (!this.canSign()) {
      return [];
    }

    // This would need to iterate through markets and check token balances
    // For now, return empty array - full implementation requires token balance checks
    console.warn(
      'getPositions: Full implementation requires token balance indexing'
    );
    return [];
  }

  /**
   * Get position for a specific market
   *
   * @param market - Market address
   * @returns Position info or null
   */
  async getPosition(market: PublicKey): Promise<PositionInfo | null> {
    if (!this.canSign()) {
      return null;
    }

    try {
      const marketData = await this.fetchMarket(market);
      if (!marketData) {
        return null;
      }

      // Get token balances for YES and NO tokens
      const walletPubkey = this.getWalletPublicKey()!;

      // Would need to fetch token account balances here
      // Simplified for now
      return {
        market,
        yesShares: 0,
        noShares: 0,
      };
    } catch (error) {
      console.error('Failed to get position:', error);
      return null;
    }
  }

  // ============================================
  // Redemption
  // ============================================

  /**
   * Redeem winnings from a resolved market
   *
   * @param market - Market address
   * @returns Redemption result
   */
  async redeemWinnings(
    market: PublicKey
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (!this.canSign()) {
      return { success: false, error: 'No private key provided' };
    }

    try {
      const result = await this.pnpClient.redeemPosition(market);

      if (result && (result.signature || result.success)) {
        return {
          success: true,
          signature: result.signature || result.txSignature,
        };
      }

      return {
        success: false,
        error: result?.error || 'Redemption failed',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  // ============================================
  // Market Selection
  // ============================================

  /**
   * Select the best market for a given signal
   *
   * @param signal - Trade signal
   * @param criteria - Selection criteria
   * @returns Best market or null
   */
  async selectMarketForSignal(
    signal: TradeSignal,
    criteria: MarketSelectionCriteria = DEFAULT_SELECTION_CRITERIA
  ): Promise<SpectreMarket | null> {
    const markets = await this.fetchActiveMarkets();
    return selectBestMarket(markets, signal, criteria);
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Check USDC balance for the wallet
   *
   * @returns USDC balance in decimal units
   */
  async getUsdcBalance(): Promise<number> {
    if (!this.canSign()) {
      return 0;
    }

    try {
      const walletPubkey = this.getWalletPublicKey()!;
      const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

      // Find associated token account
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { mint: this.usdcMint }
      );

      if (tokenAccounts.value.length === 0) {
        return 0;
      }

      const balance =
        tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      return balance || 0;
    } catch (error) {
      console.error('Failed to get USDC balance:', error);
      return 0;
    }
  }

  /**
   * Retry an operation with exponential backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = this.config.retryAttempts
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (attempt < maxAttempts) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a PNP client from environment variables
 *
 * Environment variables:
 * - PNP_RPC_URL: Solana RPC URL (default: devnet)
 * - PNP_PRIVATE_KEY: Base58 encoded private key
 * - PNP_NETWORK: 'devnet' or 'mainnet' (default: devnet)
 */
export function createPnpClientFromEnv(): SpectrePnpClient {
  const rpcUrl =
    process.env.PNP_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    'https://api.devnet.solana.com';

  const privateKey = process.env.PNP_PRIVATE_KEY;
  const isDevnet = (process.env.PNP_NETWORK || 'devnet') === 'devnet';

  return new SpectrePnpClient(rpcUrl, privateKey, isDevnet);
}

/**
 * Create a read-only PNP client (no trading capability)
 *
 * @param rpcUrl - Solana RPC URL
 * @param isDevnet - Use devnet configuration
 */
export function createReadOnlyPnpClient(
  rpcUrl: string = 'https://api.devnet.solana.com',
  isDevnet: boolean = true
): SpectrePnpClient {
  return new SpectrePnpClient(rpcUrl, undefined, isDevnet);
}

export default SpectrePnpClient;
