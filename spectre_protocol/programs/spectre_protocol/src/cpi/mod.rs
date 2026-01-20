//! SPECTRE CPI Module
//!
//! Cross-Program Invocation interfaces for external protocols:
//! - PNP Exchange: Prediction market trading
//!
//! In Phase 3, we provide a mock PNP implementation for testing,
//! with architecture ready for real PNP integration.

pub mod pnp_interface;

pub use pnp_interface::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpi_module_exports() {
        let _side = TradeSide::Yes;
        let _order_type = OrderType::Market;
        let _trade_params = TradeParams::default();
    }
}
