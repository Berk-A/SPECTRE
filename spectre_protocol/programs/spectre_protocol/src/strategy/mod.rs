//! SPECTRE Strategy Module
//!
//! Implements trading strategy logic for the SPECTRE protocol.
//! The strategy runs inside the MagicBlock TEE enclave, ensuring
//! that the trading logic and parameters remain confidential.
//!
//! ## Strategy Options
//!
//! - **Decision Tree** (default): Simple, deterministic strategy
//!   with configurable thresholds. Guaranteed to work within
//!   Solana program size limits.
//!
//! - **ONNX** (stretch goal): Neural network inference using
//!   tract-onnx. May exceed binary size limits.

pub mod decision_tree;

pub use decision_tree::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strategy_module_exports() {
        // Verify all types are exported
        let _signal = TradeSignal::Hold;
        let _params = StrategyParams::default();
    }
}
