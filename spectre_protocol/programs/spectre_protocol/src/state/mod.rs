//! SPECTRE State Module
//!
//! Defines all account structures for the SPECTRE protocol:
//! - SpectreVault: Main vault holding shielded funds
//! - UserDeposit: Individual user deposit with ZK commitment
//! - WithdrawalRequest: Pending withdrawal with compliance check status
//! - Position: Active trading position tracking

use anchor_lang::prelude::*;

/// Seeds for PDA derivation
pub const VAULT_SEED: &[u8] = b"spectre_vault";
pub const DEPOSIT_SEED: &[u8] = b"user_deposit";
pub const WITHDRAWAL_SEED: &[u8] = b"withdrawal";
pub const POSITION_SEED: &[u8] = b"position";
pub const STRATEGY_CONFIG_SEED: &[u8] = b"strategy_config";

/// Maximum number of active positions per vault
pub const MAX_POSITIONS: usize = 100;

/// Delegation program ID for MagicBlock TEE (placeholder)
/// In production, this would be the actual delegation program
pub const DELEGATION_PROGRAM_ID: &str = "DELegateXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

/// Main vault account that holds shielded funds and manages trading state
#[account]
#[derive(InitSpace)]
pub struct SpectreVault {
    /// Authority that controls the vault (TEE-controlled keypair in production)
    pub authority: Pubkey,

    /// Bump seed for the vault PDA
    pub vault_bump: u8,

    /// Bump seed for the vault's SOL holding account
    pub vault_sol_bump: u8,

    /// Total SOL deposited in the vault (lamports)
    pub total_deposited: u64,

    /// Total SOL available for trading (lamports)
    pub available_balance: u64,

    /// Number of active trading positions
    pub active_positions: u32,

    /// Hash of the trading model for attestation (Phase 2)
    pub model_hash: [u8; 32],

    /// Last slot when a trade was executed (anti-replay)
    pub last_trade_slot: u64,

    /// Whether the vault is active and accepting deposits
    pub is_active: bool,

    /// Whether the vault is delegated to TEE (Phase 2)
    pub is_delegated: bool,

    /// Unix timestamp of vault creation
    pub created_at: i64,

    /// Total number of deposits received
    pub total_deposits_count: u64,

    /// Total number of withdrawals completed
    pub total_withdrawals_count: u64,

    /// Total trading volume (lamports)
    pub total_volume: u64,
}

impl SpectreVault {
    /// Check if the vault has sufficient balance for a trade
    pub fn has_sufficient_balance(&self, amount: u64) -> bool {
        self.available_balance >= amount
    }

    /// Calculate position size based on signal strength
    pub fn calculate_position_size(&self, is_strong_signal: bool) -> u64 {
        let base_size = self.available_balance / 20; // 5% per trade
        if is_strong_signal {
            base_size.saturating_mul(2) // 10% for strong signals
        } else {
            base_size
        }
    }

    /// Check if vault can be delegated
    pub fn can_delegate(&self) -> bool {
        self.is_active && !self.is_delegated
    }

    /// Check if vault can be undelegated
    pub fn can_undelegate(&self) -> bool {
        self.is_active && self.is_delegated
    }
}

/// Strategy configuration stored on-chain
/// Allows updating strategy parameters without recompiling
#[account]
#[derive(InitSpace)]
pub struct StrategyConfig {
    /// Associated vault
    pub vault: Pubkey,

    /// Authority that can update strategy params
    pub authority: Pubkey,

    /// Price threshold below which we consider buying (scaled by 1000)
    pub price_threshold_low: u32,

    /// Price threshold above which we consider selling (scaled by 1000)
    pub price_threshold_high: u32,

    /// Minimum trend magnitude for strong signals (scaled by 1000)
    pub trend_threshold: u32,

    /// Maximum volatility above which we hold (scaled by 1000)
    pub volatility_cap: u32,

    /// Whether the strategy is active
    pub is_active: bool,

    /// Last time parameters were updated
    pub updated_at: i64,

    /// Last signal generated (for logging/monitoring)
    pub last_signal: u8,

    /// Last signal timestamp
    pub last_signal_at: i64,

    /// Total signals generated
    pub total_signals: u64,

    /// Bump seed
    pub bump: u8,

    /// Reserved for future use
    pub _reserved: [u8; 32],
}

/// Individual user deposit with ZK commitment
/// Links a Privacy Cash commitment to the SPECTRE vault
#[account]
#[derive(InitSpace)]
pub struct UserDeposit {
    /// The user's wallet (for administrative purposes only, not linked on-chain)
    pub owner: Pubkey,

    /// ZK commitment from Privacy Cash deposit
    pub commitment: [u8; 32],

    /// Nullifier hash to prevent double-spending
    pub nullifier_hash: [u8; 32],

    /// Amount deposited (lamports)
    pub amount: u64,

    /// Whether this deposit has been delegated to the TEE agent
    pub delegated: bool,

    /// Unix timestamp of deposit
    pub created_at: i64,

    /// Whether this deposit is active (not withdrawn)
    pub is_active: bool,

    /// Associated vault
    pub vault: Pubkey,

    /// Bump seed for this deposit PDA
    pub bump: u8,
}

impl UserDeposit {
    /// Check if the deposit can be withdrawn
    pub fn can_withdraw(&self, amount: u64) -> bool {
        self.is_active && self.amount >= amount
    }
}

/// Withdrawal request status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum WithdrawalStatus {
    /// Request submitted, pending compliance check
    Pending,
    /// Compliance check passed, ready for completion
    Approved,
    /// Compliance check failed, withdrawal blocked
    Rejected,
    /// Withdrawal completed successfully
    Completed,
    /// Withdrawal cancelled by user
    Cancelled,
}

impl Default for WithdrawalStatus {
    fn default() -> Self {
        WithdrawalStatus::Pending
    }
}

/// Pending withdrawal request
#[account]
#[derive(InitSpace)]
pub struct WithdrawalRequest {
    /// User requesting withdrawal
    pub requester: Pubkey,

    /// Associated deposit
    pub deposit: Pubkey,

    /// Associated vault
    pub vault: Pubkey,

    /// Amount requested (lamports)
    pub amount: u64,

    /// Recipient address for withdrawal
    pub recipient: Pubkey,

    /// Current status of the request
    pub status: WithdrawalStatus,

    /// Risk score from Range Protocol (0-100, scaled from 0-10)
    pub risk_score: u8,

    /// Unix timestamp of request creation
    pub created_at: i64,

    /// Unix timestamp of last status update
    pub updated_at: i64,

    /// Slot when compliance was verified
    pub compliance_verified_slot: u64,

    /// Bump seed for this withdrawal PDA
    pub bump: u8,
}

impl WithdrawalRequest {
    /// Check if the withdrawal can be completed
    pub fn can_complete(&self) -> bool {
        self.status == WithdrawalStatus::Approved
    }

    /// Check if the compliance attestation is still fresh
    pub fn is_attestation_fresh(&self, current_slot: u64, max_age: u64) -> bool {
        if self.compliance_verified_slot == 0 {
            return false;
        }
        current_slot.saturating_sub(self.compliance_verified_slot) <= max_age
    }
}

/// Trading side for prediction markets
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Side {
    /// Betting on YES outcome
    Yes,
    /// Betting on NO outcome
    No,
}

impl Default for Side {
    fn default() -> Self {
        Side::Yes
    }
}

/// Position status
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum PositionStatus {
    /// Position is open
    Open,
    /// Position is closed
    Closed,
    /// Position was liquidated
    Liquidated,
}

impl Default for PositionStatus {
    fn default() -> Self {
        PositionStatus::Open
    }
}

/// Active trading position on a prediction market
#[account]
#[derive(InitSpace)]
pub struct Position {
    /// Associated vault
    pub vault: Pubkey,

    /// Market ID on PNP Exchange
    pub market_id: Pubkey,

    /// Side of the position (YES/NO)
    pub side: Side,

    /// Number of shares held
    pub shares: u64,

    /// Entry price in lamports per share (scaled by 1e6)
    pub entry_price: u64,

    /// Amount invested (lamports)
    pub invested_amount: u64,

    /// Current status
    pub status: PositionStatus,

    /// Unix timestamp when position was opened
    pub opened_at: i64,

    /// Unix timestamp when position was closed (0 if still open)
    pub closed_at: i64,

    /// Exit price (0 if still open)
    pub exit_price: u64,

    /// Realized PnL (0 if still open)
    pub realized_pnl: i64,

    /// Bump seed for this position PDA
    pub bump: u8,
}

impl Position {
    /// Calculate unrealized PnL given current price
    pub fn calculate_unrealized_pnl(&self, current_price: u64) -> i64 {
        if self.status != PositionStatus::Open {
            return 0;
        }

        let current_value = (self.shares as u128)
            .saturating_mul(current_price as u128)
            .saturating_div(1_000_000) as u64;

        (current_value as i64).saturating_sub(self.invested_amount as i64)
    }

    /// Check if the position is profitable at current price
    pub fn is_profitable(&self, current_price: u64) -> bool {
        self.calculate_unrealized_pnl(current_price) > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_has_sufficient_balance() {
        let vault = SpectreVault {
            authority: Pubkey::default(),
            vault_bump: 0,
            vault_sol_bump: 0,
            total_deposited: 1_000_000_000,
            available_balance: 500_000_000,
            active_positions: 0,
            model_hash: [0u8; 32],
            last_trade_slot: 0,
            is_active: true,
            is_delegated: false,
            created_at: 0,
            total_deposits_count: 0,
            total_withdrawals_count: 0,
            total_volume: 0,
        };

        assert!(vault.has_sufficient_balance(100_000_000));
        assert!(vault.has_sufficient_balance(500_000_000));
        assert!(!vault.has_sufficient_balance(600_000_000));
    }

    #[test]
    fn test_vault_calculate_position_size() {
        let vault = SpectreVault {
            authority: Pubkey::default(),
            vault_bump: 0,
            vault_sol_bump: 0,
            total_deposited: 1_000_000_000,
            available_balance: 1_000_000_000, // 1 SOL
            active_positions: 0,
            model_hash: [0u8; 32],
            last_trade_slot: 0,
            is_active: true,
            is_delegated: false,
            created_at: 0,
            total_deposits_count: 0,
            total_withdrawals_count: 0,
            total_volume: 0,
        };

        // Normal signal: 5% = 50_000_000 lamports
        assert_eq!(vault.calculate_position_size(false), 50_000_000);

        // Strong signal: 10% = 100_000_000 lamports
        assert_eq!(vault.calculate_position_size(true), 100_000_000);
    }

    #[test]
    fn test_user_deposit_can_withdraw() {
        let deposit = UserDeposit {
            owner: Pubkey::default(),
            commitment: [0u8; 32],
            nullifier_hash: [0u8; 32],
            amount: 100_000_000,
            delegated: false,
            created_at: 0,
            is_active: true,
            vault: Pubkey::default(),
            bump: 0,
        };

        assert!(deposit.can_withdraw(50_000_000));
        assert!(deposit.can_withdraw(100_000_000));
        assert!(!deposit.can_withdraw(150_000_000));
    }

    #[test]
    fn test_withdrawal_request_can_complete() {
        let mut request = WithdrawalRequest {
            requester: Pubkey::default(),
            deposit: Pubkey::default(),
            vault: Pubkey::default(),
            amount: 100_000_000,
            recipient: Pubkey::default(),
            status: WithdrawalStatus::Pending,
            risk_score: 0,
            created_at: 0,
            updated_at: 0,
            compliance_verified_slot: 0,
            bump: 0,
        };

        assert!(!request.can_complete());

        request.status = WithdrawalStatus::Approved;
        assert!(request.can_complete());

        request.status = WithdrawalStatus::Rejected;
        assert!(!request.can_complete());
    }

    #[test]
    fn test_position_calculate_pnl() {
        let position = Position {
            vault: Pubkey::default(),
            market_id: Pubkey::default(),
            side: Side::Yes,
            shares: 100_000_000, // 100 shares
            entry_price: 500_000, // 0.5 per share
            invested_amount: 50_000_000, // 0.05 SOL invested
            status: PositionStatus::Open,
            opened_at: 0,
            closed_at: 0,
            exit_price: 0,
            realized_pnl: 0,
            bump: 0,
        };

        // Price went up to 0.7: profit
        let pnl = position.calculate_unrealized_pnl(700_000);
        assert_eq!(pnl, 20_000_000); // 0.02 SOL profit

        // Price went down to 0.3: loss
        let pnl = position.calculate_unrealized_pnl(300_000);
        assert_eq!(pnl, -20_000_000); // 0.02 SOL loss

        assert!(position.is_profitable(700_000));
        assert!(!position.is_profitable(300_000));
    }
}
