//! PNP Exchange Interface
//!
//! Provides CPI structures and functions for interacting with PNP Exchange
//! prediction markets. For Phase 3, this includes a mock implementation
//! for testing, with the architecture ready for real PNP integration.
//!
//! ## Architecture
//!
//! ```text
//! SPECTRE Program → PNP CPI → PNP Exchange Program
//!                          → Mock Market (for testing)
//! ```
//!
//! ## Order Types
//!
//! - Market: Execute at current price
//! - Limit: Execute only at specified price or better

use anchor_lang::prelude::*;

// ============================================
// PNP Program ID (placeholder)
// Replace with actual PNP program ID in production
// ============================================
pub const PNP_PROGRAM_ID: &str = "PNPXchgExXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

// ============================================
// Trading Constants
// ============================================

/// Minimum trade amount in lamports (0.001 SOL)
pub const MIN_TRADE_AMOUNT: u64 = 1_000_000;

/// Maximum trade amount in lamports (1000 SOL)
pub const MAX_TRADE_AMOUNT: u64 = 1_000_000_000_000;

/// Price scaling factor (1e6 = 100%)
pub const PRICE_SCALE: u64 = 1_000_000;

/// Maximum slippage allowed for market orders (5%)
pub const MAX_SLIPPAGE_BPS: u64 = 500;

// ============================================
// Trade Side Enum
// ============================================

/// Side of the trade on a prediction market
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum TradeSide {
    /// Betting on YES outcome
    Yes,
    /// Betting on NO outcome
    No,
}

impl Default for TradeSide {
    fn default() -> Self {
        TradeSide::Yes
    }
}

impl TradeSide {
    /// Convert to u8 for instruction data
    pub fn to_u8(&self) -> u8 {
        match self {
            TradeSide::Yes => 0,
            TradeSide::No => 1,
        }
    }

    /// Convert from u8
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(TradeSide::Yes),
            1 => Some(TradeSide::No),
            _ => None,
        }
    }

    /// Get the opposite side
    pub fn opposite(&self) -> Self {
        match self {
            TradeSide::Yes => TradeSide::No,
            TradeSide::No => TradeSide::Yes,
        }
    }
}

// ============================================
// Order Type Enum
// ============================================

/// Type of order to place
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum OrderType {
    /// Execute at current market price
    Market,
    /// Execute only at specified price or better
    Limit,
}

impl Default for OrderType {
    fn default() -> Self {
        OrderType::Market
    }
}

// ============================================
// Trade Parameters
// ============================================

/// Parameters for executing a trade
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct TradeParams {
    /// Side of the trade (YES/NO)
    pub side: TradeSide,

    /// Amount to trade in lamports
    pub amount: u64,

    /// Order type (Market/Limit)
    pub order_type: OrderType,

    /// Limit price (scaled by PRICE_SCALE, only used for Limit orders)
    /// 500_000 = 0.50 = 50%
    pub limit_price: u64,

    /// Maximum slippage in basis points (only for Market orders)
    pub max_slippage_bps: u64,
}

impl Default for TradeParams {
    fn default() -> Self {
        Self {
            side: TradeSide::Yes,
            amount: MIN_TRADE_AMOUNT,
            order_type: OrderType::Market,
            limit_price: 0,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
        }
    }
}

impl TradeParams {
    /// Create new market order params
    pub fn market_order(side: TradeSide, amount: u64) -> Self {
        Self {
            side,
            amount,
            order_type: OrderType::Market,
            limit_price: 0,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
        }
    }

    /// Create new limit order params
    pub fn limit_order(side: TradeSide, amount: u64, limit_price: u64) -> Self {
        Self {
            side,
            amount,
            order_type: OrderType::Limit,
            limit_price,
            max_slippage_bps: 0,
        }
    }

    /// Validate trade parameters
    pub fn validate(&self) -> bool {
        // Check amount bounds
        if self.amount < MIN_TRADE_AMOUNT || self.amount > MAX_TRADE_AMOUNT {
            return false;
        }

        // For limit orders, price must be valid (0-100%)
        if self.order_type == OrderType::Limit {
            if self.limit_price == 0 || self.limit_price > PRICE_SCALE {
                return false;
            }
        }

        // For market orders, slippage must be reasonable
        if self.order_type == OrderType::Market {
            if self.max_slippage_bps > 10000 {
                return false;
            }
        }

        true
    }
}

// ============================================
// Trade Result
// ============================================

/// Result of a trade execution
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct TradeResult {
    /// Whether the trade was successful
    pub success: bool,

    /// Amount actually traded (may differ from requested for partial fills)
    pub amount_traded: u64,

    /// Number of shares received
    pub shares_received: u64,

    /// Actual execution price (scaled by PRICE_SCALE)
    pub execution_price: u64,

    /// Any fees paid
    pub fees_paid: u64,
}

impl Default for TradeResult {
    fn default() -> Self {
        Self {
            success: false,
            amount_traded: 0,
            shares_received: 0,
            execution_price: 0,
            fees_paid: 0,
        }
    }
}

impl TradeResult {
    /// Create a successful trade result
    pub fn success(
        amount_traded: u64,
        shares_received: u64,
        execution_price: u64,
        fees_paid: u64,
    ) -> Self {
        Self {
            success: true,
            amount_traded,
            shares_received,
            execution_price,
            fees_paid,
        }
    }

    /// Create a failed trade result
    pub fn failed() -> Self {
        Self::default()
    }
}

// ============================================
// Market Data Structures
// ============================================

/// Market data input for trading decisions
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct PnpMarketData {
    /// Current YES price (scaled by PRICE_SCALE)
    pub yes_price: u64,

    /// Current NO price (scaled by PRICE_SCALE)
    pub no_price: u64,

    /// 24-hour trading volume
    pub volume_24h: u64,

    /// Total liquidity in the market
    pub liquidity: u64,

    /// Market end timestamp
    pub end_time: i64,

    /// Whether the market is active
    pub is_active: bool,
}

impl Default for PnpMarketData {
    fn default() -> Self {
        Self {
            yes_price: PRICE_SCALE / 2, // 50%
            no_price: PRICE_SCALE / 2,
            volume_24h: 0,
            liquidity: 0,
            end_time: 0,
            is_active: true,
        }
    }
}

impl PnpMarketData {
    /// Get price for a given side
    pub fn get_price(&self, side: TradeSide) -> u64 {
        match side {
            TradeSide::Yes => self.yes_price,
            TradeSide::No => self.no_price,
        }
    }

    /// Check if market has sufficient liquidity
    pub fn has_sufficient_liquidity(&self, amount: u64) -> bool {
        self.is_active && self.liquidity >= amount
    }

    /// Check if price is within slippage tolerance
    pub fn is_within_slippage(
        &self,
        side: TradeSide,
        expected_price: u64,
        max_slippage_bps: u64,
    ) -> bool {
        let current_price = self.get_price(side);
        let price_diff = if current_price > expected_price {
            current_price - expected_price
        } else {
            expected_price - current_price
        };

        let max_diff = expected_price * max_slippage_bps / 10000;
        price_diff <= max_diff
    }
}

// ============================================
// Mock Market Implementation
// ============================================

/// Mock PNP market for testing
/// Simulates a simple AMM with constant product formula
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct MockMarket {
    /// YES token reserve
    pub yes_reserve: u64,

    /// NO token reserve
    pub no_reserve: u64,

    /// Total SOL liquidity
    pub sol_liquidity: u64,

    /// Total trading volume
    pub total_volume: u64,

    /// Market end timestamp
    pub end_time: i64,

    /// Whether market is resolved
    pub is_resolved: bool,

    /// Winning side (only valid if resolved)
    pub winning_side: TradeSide,

    /// Fee in basis points (e.g., 30 = 0.3%)
    pub fee_bps: u64,
}

impl Default for MockMarket {
    fn default() -> Self {
        Self {
            yes_reserve: 1_000_000_000, // 1 SOL worth of YES tokens
            no_reserve: 1_000_000_000,  // 1 SOL worth of NO tokens
            sol_liquidity: 2_000_000_000, // 2 SOL total liquidity
            total_volume: 0,
            end_time: i64::MAX,
            is_resolved: false,
            winning_side: TradeSide::Yes,
            fee_bps: 30, // 0.3% fee
        }
    }
}

impl MockMarket {
    /// Create a new mock market with initial liquidity
    pub fn new(initial_liquidity: u64, end_time: i64) -> Self {
        let half_liquidity = initial_liquidity / 2;
        Self {
            yes_reserve: half_liquidity,
            no_reserve: half_liquidity,
            sol_liquidity: initial_liquidity,
            total_volume: 0,
            end_time,
            is_resolved: false,
            winning_side: TradeSide::Yes,
            fee_bps: 30,
        }
    }

    /// Calculate current YES price using AMM formula
    pub fn yes_price(&self) -> u64 {
        if self.yes_reserve + self.no_reserve == 0 {
            return PRICE_SCALE / 2;
        }
        (self.no_reserve as u128 * PRICE_SCALE as u128 /
            (self.yes_reserve + self.no_reserve) as u128) as u64
    }

    /// Calculate current NO price
    pub fn no_price(&self) -> u64 {
        PRICE_SCALE - self.yes_price()
    }

    /// Get price for a side
    pub fn get_price(&self, side: TradeSide) -> u64 {
        match side {
            TradeSide::Yes => self.yes_price(),
            TradeSide::No => self.no_price(),
        }
    }

    /// Calculate shares received for a given amount
    pub fn calculate_shares_out(&self, side: TradeSide, amount_in: u64) -> (u64, u64) {
        // Apply fee
        let fee = amount_in * self.fee_bps / 10000;
        let amount_after_fee = amount_in.saturating_sub(fee);

        // Constant product AMM formula: x * y = k
        // shares_out = reserve_out - (k / (reserve_in + amount_in))
        let (reserve_in, reserve_out) = match side {
            TradeSide::Yes => (self.no_reserve, self.yes_reserve),
            TradeSide::No => (self.yes_reserve, self.no_reserve),
        };

        let k = (reserve_in as u128) * (reserve_out as u128);
        let new_reserve_in = reserve_in.saturating_add(amount_after_fee);

        if new_reserve_in == 0 {
            return (0, fee);
        }

        let new_reserve_out = (k / new_reserve_in as u128) as u64;
        let shares_out = reserve_out.saturating_sub(new_reserve_out);

        (shares_out, fee)
    }

    /// Execute a mock trade
    pub fn execute_trade(&mut self, params: &TradeParams) -> TradeResult {
        // Validate market is active
        if self.is_resolved {
            return TradeResult::failed();
        }

        // Validate params
        if !params.validate() {
            return TradeResult::failed();
        }

        // Calculate shares and execution
        let (shares_out, fees) = self.calculate_shares_out(params.side, params.amount);

        if shares_out == 0 {
            return TradeResult::failed();
        }

        // Calculate execution price
        let execution_price = (params.amount as u128 * PRICE_SCALE as u128 / shares_out as u128) as u64;

        // For limit orders, check price
        if params.order_type == OrderType::Limit {
            // For buying, execution price must be at or below limit
            if execution_price > params.limit_price {
                return TradeResult::failed();
            }
        }

        // Update reserves
        let amount_after_fee = params.amount.saturating_sub(fees);
        match params.side {
            TradeSide::Yes => {
                self.no_reserve = self.no_reserve.saturating_add(amount_after_fee);
                self.yes_reserve = self.yes_reserve.saturating_sub(shares_out);
            }
            TradeSide::No => {
                self.yes_reserve = self.yes_reserve.saturating_add(amount_after_fee);
                self.no_reserve = self.no_reserve.saturating_sub(shares_out);
            }
        }

        // Update volume
        self.total_volume = self.total_volume.saturating_add(params.amount);

        TradeResult::success(params.amount, shares_out, execution_price, fees)
    }

    /// Get market data
    pub fn get_market_data(&self) -> PnpMarketData {
        PnpMarketData {
            yes_price: self.yes_price(),
            no_price: self.no_price(),
            volume_24h: self.total_volume, // Simplified: using total volume
            liquidity: self.sol_liquidity,
            end_time: self.end_time,
            is_active: !self.is_resolved,
        }
    }

    /// Resolve the market with a winning side
    pub fn resolve(&mut self, winning_side: TradeSide) {
        self.is_resolved = true;
        self.winning_side = winning_side;
    }

    /// Calculate payout for shares if market is resolved
    pub fn calculate_payout(&self, side: TradeSide, shares: u64) -> u64 {
        if !self.is_resolved {
            return 0;
        }

        if side == self.winning_side {
            // Winning side gets full value
            shares
        } else {
            // Losing side gets nothing
            0
        }
    }
}

// ============================================
// CPI Data Building
// ============================================

/// Build instruction data for PNP trade CPI
/// This would be used when calling the actual PNP program
pub fn build_trade_instruction_data(params: &TradeParams) -> Vec<u8> {
    // Instruction discriminator for "trade" instruction
    // In real implementation, this would match PNP's IDL
    let mut data = Vec::with_capacity(32);

    // Add discriminator (first 8 bytes)
    // This is a placeholder - real implementation would use actual discriminator
    data.extend_from_slice(&[0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

    // Add serialized params
    data.extend_from_slice(&params.try_to_vec().unwrap_or_default());

    data
}

// ============================================
// Unit Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trade_side_conversion() {
        assert_eq!(TradeSide::Yes.to_u8(), 0);
        assert_eq!(TradeSide::No.to_u8(), 1);
        assert_eq!(TradeSide::from_u8(0), Some(TradeSide::Yes));
        assert_eq!(TradeSide::from_u8(1), Some(TradeSide::No));
        assert_eq!(TradeSide::from_u8(2), None);
    }

    #[test]
    fn test_trade_side_opposite() {
        assert_eq!(TradeSide::Yes.opposite(), TradeSide::No);
        assert_eq!(TradeSide::No.opposite(), TradeSide::Yes);
    }

    #[test]
    fn test_trade_params_validation() {
        // Valid market order
        let valid_market = TradeParams::market_order(TradeSide::Yes, MIN_TRADE_AMOUNT);
        assert!(valid_market.validate());

        // Valid limit order
        let valid_limit = TradeParams::limit_order(TradeSide::No, MIN_TRADE_AMOUNT, 500_000);
        assert!(valid_limit.validate());

        // Invalid: amount too low
        let mut invalid = TradeParams::default();
        invalid.amount = MIN_TRADE_AMOUNT - 1;
        assert!(!invalid.validate());

        // Invalid: amount too high
        invalid.amount = MAX_TRADE_AMOUNT + 1;
        assert!(!invalid.validate());

        // Invalid: limit order with zero price
        let invalid_limit = TradeParams {
            side: TradeSide::Yes,
            amount: MIN_TRADE_AMOUNT,
            order_type: OrderType::Limit,
            limit_price: 0, // Invalid
            max_slippage_bps: 0,
        };
        assert!(!invalid_limit.validate());

        // Invalid: limit price > 100%
        let invalid_limit_high = TradeParams {
            side: TradeSide::Yes,
            amount: MIN_TRADE_AMOUNT,
            order_type: OrderType::Limit,
            limit_price: PRICE_SCALE + 1,
            max_slippage_bps: 0,
        };
        assert!(!invalid_limit_high.validate());
    }

    #[test]
    fn test_mock_market_initial_prices() {
        let market = MockMarket::default();

        // Initial prices should be 50/50
        assert_eq!(market.yes_price(), 500_000); // 50%
        assert_eq!(market.no_price(), 500_000); // 50%
    }

    #[test]
    fn test_mock_market_trade_updates_price() {
        let mut market = MockMarket::default();
        let initial_yes_price = market.yes_price();

        // Buy YES tokens
        let params = TradeParams::market_order(TradeSide::Yes, 100_000_000); // 0.1 SOL
        let result = market.execute_trade(&params);

        assert!(result.success);
        assert!(result.shares_received > 0);

        // YES price should increase after buying YES
        assert!(market.yes_price() > initial_yes_price);
    }

    #[test]
    fn test_mock_market_fee_collection() {
        let mut market = MockMarket::default();

        let params = TradeParams::market_order(TradeSide::Yes, 100_000_000);
        let result = market.execute_trade(&params);

        assert!(result.success);
        // Fee should be 0.3% of 0.1 SOL = 300_000 lamports
        assert_eq!(result.fees_paid, 300_000);
    }

    #[test]
    fn test_mock_market_limit_order_rejected() {
        let mut market = MockMarket::default();

        // Set a limit price below current market price (should fail)
        let params = TradeParams::limit_order(
            TradeSide::Yes,
            100_000_000,
            100_000, // 10% - way below 50% market price
        );

        let result = market.execute_trade(&params);
        assert!(!result.success);
    }

    #[test]
    fn test_mock_market_resolution() {
        let mut market = MockMarket::default();

        // Resolve in favor of YES
        market.resolve(TradeSide::Yes);

        assert!(market.is_resolved);
        assert_eq!(market.winning_side, TradeSide::Yes);

        // Check payouts
        assert_eq!(market.calculate_payout(TradeSide::Yes, 100), 100);
        assert_eq!(market.calculate_payout(TradeSide::No, 100), 0);
    }

    #[test]
    fn test_mock_market_no_trade_after_resolution() {
        let mut market = MockMarket::default();
        market.resolve(TradeSide::Yes);

        let params = TradeParams::market_order(TradeSide::Yes, MIN_TRADE_AMOUNT);
        let result = market.execute_trade(&params);

        assert!(!result.success);
    }

    #[test]
    fn test_pnp_market_data_slippage_check() {
        let data = PnpMarketData {
            yes_price: 500_000, // 50%
            no_price: 500_000,
            volume_24h: 1_000_000_000,
            liquidity: 10_000_000_000,
            end_time: i64::MAX,
            is_active: true,
        };

        // 5% slippage from 50% price
        assert!(data.is_within_slippage(TradeSide::Yes, 500_000, 500));
        assert!(data.is_within_slippage(TradeSide::Yes, 525_000, 500)); // Within 5%
        assert!(!data.is_within_slippage(TradeSide::Yes, 600_000, 500)); // > 5%
    }

    #[test]
    fn test_trade_result_creation() {
        let success = TradeResult::success(100_000, 200_000, 500_000, 300);
        assert!(success.success);
        assert_eq!(success.amount_traded, 100_000);
        assert_eq!(success.shares_received, 200_000);
        assert_eq!(success.execution_price, 500_000);
        assert_eq!(success.fees_paid, 300);

        let failed = TradeResult::failed();
        assert!(!failed.success);
        assert_eq!(failed.shares_received, 0);
    }

    #[test]
    fn test_build_trade_instruction_data() {
        let params = TradeParams::market_order(TradeSide::Yes, MIN_TRADE_AMOUNT);
        let data = build_trade_instruction_data(&params);

        // Should have at least discriminator (8 bytes) + params
        assert!(data.len() >= 8);
    }

    #[test]
    fn test_mock_market_volume_tracking() {
        let mut market = MockMarket::default();
        assert_eq!(market.total_volume, 0);

        let params1 = TradeParams::market_order(TradeSide::Yes, 100_000_000);
        market.execute_trade(&params1);
        assert_eq!(market.total_volume, 100_000_000);

        let params2 = TradeParams::market_order(TradeSide::No, 50_000_000);
        market.execute_trade(&params2);
        assert_eq!(market.total_volume, 150_000_000);
    }

    #[test]
    fn test_mock_market_get_market_data() {
        let market = MockMarket::new(2_000_000_000, 1000000);
        let data = market.get_market_data();

        assert_eq!(data.yes_price, 500_000);
        assert_eq!(data.no_price, 500_000);
        assert_eq!(data.liquidity, 2_000_000_000);
        assert!(data.is_active);
        assert_eq!(data.end_time, 1000000);
    }
}
