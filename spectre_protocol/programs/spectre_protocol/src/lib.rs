//! SPECTRE Protocol - Strategic Private Execution & Confidential Trading Runtime Environment
//!
//! A Confidential Autonomous Market Maker (CAMM) for Solana that creates
//! a "Privacy Sandwich" architecture:
//!
//! ```text
//! [Private Funding] → [Private Execution] → [Public Settlement]
//!      Layer 1            Layer 2              Layer 3
//!    "The Shield"       "The Brain"          "The Hand"
//! ```
//!
//! ## Architecture
//!
//! - **Layer 1 (The Shield)**: Private funding via Privacy Cash ZK proofs
//!   with Range Protocol compliance verification
//!
//! - **Layer 2 (The Brain)**: Trading strategy execution in MagicBlock TEE
//!   (Phase 2)
//!
//! - **Layer 3 (The Hand)**: Trade execution on PNP Exchange prediction
//!   markets (Phase 3)
//!
//! ## Phase 1 Features
//!
//! - Vault initialization and management
//! - ZK-proof verified deposits (mock for Phase 1)
//! - Compliance-checked withdrawals via Range Protocol
//! - Full state tracking for deposits, withdrawals, and positions

use anchor_lang::prelude::*;
use anchor_lang::system_program;

pub mod state;
pub mod strategy;
pub mod utils;

use state::*;
use strategy::{TradeSignal, StrategyParams, MarketInput, run_inference};
use utils::privacy_bridge::{ZkProof, verify_deposit_proof, DepositError};
use utils::compliance::{RangeAttestation, verify_compliance};

declare_id!("B2at4oGQFPAbuH2wMMpBsFrTvJi71GUvR7jyxny7HaGf");

/// SPECTRE Program Entry Points
#[program]
pub mod spectre_protocol {
    use super::*;

    // ============================================
    // LAYER 1: THE SHIELD - Funding Instructions
    // ============================================

    /// Initialize the SPECTRE vault
    pub fn initialize(ctx: Context<Initialize>, model_hash: Option<[u8; 32]>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let clock = Clock::get()?;

        vault.authority = ctx.accounts.authority.key();
        vault.vault_bump = ctx.bumps.vault;
        vault.vault_sol_bump = ctx.bumps.vault_sol;
        vault.total_deposited = 0;
        vault.available_balance = 0;
        vault.active_positions = 0;
        vault.model_hash = model_hash.unwrap_or([0u8; 32]);
        vault.last_trade_slot = 0;
        vault.is_active = true;
        vault.is_delegated = false;
        vault.created_at = clock.unix_timestamp;
        vault.total_deposits_count = 0;
        vault.total_withdrawals_count = 0;
        vault.total_volume = 0;

        msg!("SPECTRE Vault initialized");
        msg!("  Authority: {}", vault.authority);
        msg!("  Vault PDA: {}", ctx.accounts.vault.key());

        Ok(())
    }

    /// Fund the agent with a ZK-proven deposit
    pub fn fund_agent(ctx: Context<FundAgent>, proof: ZkProof) -> Result<()> {
        // 1. Verify the ZK proof
        let verification = verify_deposit_proof(&proof);

        if !verification.valid {
            return Err(match verification.error {
                Some(DepositError::AmountTooLow) => SpectreError::DepositTooLow.into(),
                Some(DepositError::AmountTooHigh) => SpectreError::DepositTooHigh.into(),
                Some(DepositError::InvalidProof) => SpectreError::InvalidZkProof.into(),
                Some(DepositError::NullifierUsed) => SpectreError::NullifierAlreadyUsed.into(),
                Some(DepositError::InvalidCommitment) => SpectreError::InvalidCommitment.into(),
                Some(DepositError::InvalidMerkleRoot) => SpectreError::InvalidMerkleRoot.into(),
                None => SpectreError::InvalidZkProof.into(),
            });
        }

        let amount = verification.amount;
        let commitment = verification.commitment;
        let nullifier_hash = verification.nullifier_hash;

        // 2. Transfer SOL from depositor to vault (the vault account holds SOL)
        let transfer_cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );
        system_program::transfer(transfer_cpi_context, amount)?;

        // 3. Initialize user deposit record
        let clock = Clock::get()?;
        let user_deposit = &mut ctx.accounts.user_deposit;

        user_deposit.owner = ctx.accounts.depositor.key();
        user_deposit.commitment = commitment;
        user_deposit.nullifier_hash = nullifier_hash;
        user_deposit.amount = amount;
        user_deposit.delegated = false;
        user_deposit.created_at = clock.unix_timestamp;
        user_deposit.is_active = true;
        user_deposit.vault = ctx.accounts.vault.key();
        user_deposit.bump = ctx.bumps.user_deposit;

        // 4. Update vault totals
        let vault = &mut ctx.accounts.vault;
        vault.total_deposited = vault.total_deposited.checked_add(amount)
            .ok_or(SpectreError::MathOverflow)?;
        vault.available_balance = vault.available_balance.checked_add(amount)
            .ok_or(SpectreError::MathOverflow)?;
        vault.total_deposits_count = vault.total_deposits_count.checked_add(1)
            .ok_or(SpectreError::MathOverflow)?;

        msg!("Deposit successful");
        msg!("  Amount: {} lamports", amount);
        msg!("  Vault total: {} lamports", vault.total_deposited);

        Ok(())
    }

    /// Request a withdrawal from the vault
    pub fn request_withdrawal(ctx: Context<RequestWithdrawal>, amount: u64) -> Result<()> {
        require!(amount > 0, SpectreError::InvalidAmount);

        let clock = Clock::get()?;
        let withdrawal = &mut ctx.accounts.withdrawal_request;

        withdrawal.requester = ctx.accounts.requester.key();
        withdrawal.deposit = ctx.accounts.user_deposit.key();
        withdrawal.vault = ctx.accounts.vault.key();
        withdrawal.amount = amount;
        withdrawal.recipient = ctx.accounts.recipient.key();
        withdrawal.status = WithdrawalStatus::Pending;
        withdrawal.risk_score = 0;
        withdrawal.created_at = clock.unix_timestamp;
        withdrawal.updated_at = clock.unix_timestamp;
        withdrawal.compliance_verified_slot = 0;
        withdrawal.bump = ctx.bumps.withdrawal_request;

        msg!("Withdrawal request created");
        msg!("  Amount: {} lamports", amount);
        msg!("  Recipient: {}", withdrawal.recipient);

        Ok(())
    }

    /// Complete a withdrawal with compliance verification
    pub fn complete_withdrawal(
        ctx: Context<CompleteWithdrawal>,
        attestation: RangeAttestation,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_slot = clock.slot;
        let withdrawal = &mut ctx.accounts.withdrawal_request;

        // 1. Verify the withdrawal is in correct state
        require!(
            withdrawal.status == WithdrawalStatus::Pending
                || withdrawal.status == WithdrawalStatus::Approved,
            SpectreError::InvalidWithdrawalStatus
        );

        // 2. Verify compliance attestation
        let compliance_result = verify_compliance(
            &attestation,
            &ctx.accounts.recipient.key(),
            current_slot,
        );

        withdrawal.risk_score = attestation.risk_score;
        withdrawal.compliance_verified_slot = current_slot;
        withdrawal.updated_at = clock.unix_timestamp;

        if !compliance_result.passed {
            withdrawal.status = WithdrawalStatus::Rejected;
            msg!("Compliance check failed");
            msg!("  Risk score: {}", attestation.risk_score);
            return Err(SpectreError::ComplianceCheckFailed.into());
        }

        withdrawal.status = WithdrawalStatus::Approved;

        let amount = withdrawal.amount;

        // 3. Verify sufficient balance
        require!(
            ctx.accounts.user_deposit.amount >= amount,
            SpectreError::InsufficientBalance
        );
        require!(
            ctx.accounts.vault.available_balance >= amount,
            SpectreError::InsufficientVaultBalance
        );

        // 4. Transfer funds from vault to recipient
        // The vault account is owned by our program, so we can directly modify its lamports
        {
            let vault_info = ctx.accounts.vault.to_account_info();
            let recipient_info = ctx.accounts.recipient.to_account_info();

            **vault_info.try_borrow_mut_lamports()? = vault_info
                .lamports()
                .checked_sub(amount)
                .ok_or(SpectreError::MathOverflow)?;

            **recipient_info.try_borrow_mut_lamports()? = recipient_info
                .lamports()
                .checked_add(amount)
                .ok_or(SpectreError::MathOverflow)?;
        }

        // 5. Update state
        let user_deposit = &mut ctx.accounts.user_deposit;
        user_deposit.amount = user_deposit.amount
            .checked_sub(amount)
            .ok_or(SpectreError::MathOverflow)?;

        if user_deposit.amount == 0 {
            user_deposit.is_active = false;
        }

        let vault = &mut ctx.accounts.vault;
        vault.available_balance = vault.available_balance
            .checked_sub(amount)
            .ok_or(SpectreError::MathOverflow)?;
        vault.total_withdrawals_count = vault.total_withdrawals_count
            .checked_add(1)
            .ok_or(SpectreError::MathOverflow)?;

        withdrawal.status = WithdrawalStatus::Completed;

        msg!("Withdrawal completed successfully");
        msg!("  Amount: {} lamports", amount);
        msg!("  Recipient: {}", ctx.accounts.recipient.key());

        Ok(())
    }

    /// Verify compliance for a pending withdrawal (without completing it)
    pub fn verify_withdrawal_compliance(
        ctx: Context<VerifyWithdrawalCompliance>,
        attestation: RangeAttestation,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let current_slot = clock.slot;
        let withdrawal = &mut ctx.accounts.withdrawal_request;

        let compliance_result = verify_compliance(
            &attestation,
            &withdrawal.recipient,
            current_slot,
        );

        withdrawal.risk_score = attestation.risk_score;
        withdrawal.compliance_verified_slot = current_slot;
        withdrawal.updated_at = clock.unix_timestamp;

        if compliance_result.passed {
            withdrawal.status = WithdrawalStatus::Approved;
            msg!("Compliance verified - withdrawal approved");
        } else {
            withdrawal.status = WithdrawalStatus::Rejected;
            msg!("Compliance check failed - withdrawal rejected");
            return Err(SpectreError::ComplianceCheckFailed.into());
        }

        Ok(())
    }

    // ============================================
    // LAYER 2: THE BRAIN - TEE & Strategy Instructions
    // ============================================

    /// Initialize strategy configuration for a vault
    pub fn initialize_strategy(
        ctx: Context<InitializeStrategy>,
        params: Option<StrategyParams>,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.strategy_config;
        let params = params.unwrap_or_default();

        // Validate params
        require!(params.validate(), SpectreError::InvalidStrategyParams);

        config.vault = ctx.accounts.vault.key();
        config.authority = ctx.accounts.authority.key();
        config.price_threshold_low = params.price_threshold_low;
        config.price_threshold_high = params.price_threshold_high;
        config.trend_threshold = params.trend_threshold;
        config.volatility_cap = params.volatility_cap;
        config.is_active = true;
        config.updated_at = clock.unix_timestamp;
        config.last_signal = 0;
        config.last_signal_at = 0;
        config.total_signals = 0;
        config.bump = ctx.bumps.strategy_config;
        config._reserved = [0u8; 32];

        msg!("Strategy initialized for vault");
        msg!("  Price thresholds: {} - {}", params.price_threshold_low, params.price_threshold_high);
        msg!("  Volatility cap: {}", params.volatility_cap);

        Ok(())
    }

    /// Delegate vault to TEE enclave for private execution
    ///
    /// In production with MagicBlock:
    /// - Calls ephemeral_rollups_sdk::cpi::delegate_account
    /// - Vault state becomes encrypted in TEE memory
    /// - Only the TEE can modify vault state until undelegation
    pub fn delegate_to_tee(ctx: Context<DelegateToTee>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        // Check vault can be delegated
        require!(vault.can_delegate(), SpectreError::VaultAlreadyDelegated);

        // In production, this would call MagicBlock's delegation CPI:
        // ephemeral_rollups_sdk::cpi::delegate_account(
        //     &ctx.accounts.authority,
        //     &vault.to_account_info(),
        //     &ctx.program_id,
        //     &[VAULT_SEED, ctx.accounts.authority.key().as_ref()],
        //     0,  // No time limit
        //     1,  // Update frequency
        // )?;

        vault.is_delegated = true;

        msg!("Vault delegated to TEE enclave");
        msg!("  Vault: {}", ctx.accounts.vault.key());
        msg!("  Authority: {}", ctx.accounts.authority.key());

        Ok(())
    }

    /// Undelegate vault from TEE enclave
    ///
    /// Returns vault control to L1 Solana.
    /// In production, state changes are committed to L1.
    pub fn undelegate_from_tee(ctx: Context<UndelegateFromTee>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        // Check vault is delegated
        require!(vault.can_undelegate(), SpectreError::VaultNotDelegated);

        // In production, this would call MagicBlock's undelegation CPI:
        // ephemeral_rollups_sdk::cpi::undelegate_account(
        //     &ctx.accounts.authority,
        //     &vault.to_account_info(),
        //     &ctx.program_id,
        // )?;

        vault.is_delegated = false;

        msg!("Vault undelegated from TEE enclave");
        msg!("  Vault: {}", ctx.accounts.vault.key());

        Ok(())
    }

    /// Update the trading model hash (admin only)
    ///
    /// The model hash is used for attestation - proving which
    /// model version generated trading signals.
    pub fn update_model(
        ctx: Context<UpdateModel>,
        model_hash: [u8; 32],
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        // Update model hash
        vault.model_hash = model_hash;

        msg!("Model hash updated");
        msg!("  New hash: {:?}", &model_hash[..8]); // First 8 bytes for logging

        Ok(())
    }

    /// Update strategy parameters
    pub fn set_strategy_params(
        ctx: Context<SetStrategyParams>,
        params: StrategyParams,
    ) -> Result<()> {
        let clock = Clock::get()?;

        // Validate params
        require!(params.validate(), SpectreError::InvalidStrategyParams);

        let config = &mut ctx.accounts.strategy_config;

        config.price_threshold_low = params.price_threshold_low;
        config.price_threshold_high = params.price_threshold_high;
        config.trend_threshold = params.trend_threshold;
        config.volatility_cap = params.volatility_cap;
        config.updated_at = clock.unix_timestamp;

        msg!("Strategy parameters updated");
        msg!("  Price thresholds: {} - {}", params.price_threshold_low, params.price_threshold_high);
        msg!("  Trend threshold: {}", params.trend_threshold);
        msg!("  Volatility cap: {}", params.volatility_cap);

        Ok(())
    }

    /// Generate a trade signal from market data
    ///
    /// This runs the decision tree inference inside the TEE (when delegated).
    /// The signal is logged and stored, but execution happens separately.
    pub fn generate_trade_signal(
        ctx: Context<GenerateTradeSignal>,
        input: MarketInput,
    ) -> Result<TradeSignal> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.strategy_config;
        let vault = &ctx.accounts.vault;

        // Build strategy params from config
        let params = StrategyParams::new(
            config.price_threshold_low,
            config.price_threshold_high,
            config.trend_threshold,
            config.volatility_cap,
        );

        // Run inference
        let signal = run_inference(&input, &params);

        // Update stats
        config.last_signal = match signal {
            TradeSignal::StrongBuy => 1,
            TradeSignal::Buy => 2,
            TradeSignal::Hold => 3,
            TradeSignal::Sell => 4,
            TradeSignal::StrongSell => 5,
        };
        config.last_signal_at = clock.unix_timestamp;
        config.total_signals = config.total_signals.saturating_add(1);

        msg!("Trade signal generated");
        msg!("  Signal: {:?}", signal);
        msg!("  Vault delegated: {}", vault.is_delegated);
        msg!("  Input: price={}, trend={}, vol={}", input.price, input.trend, input.volatility);

        Ok(signal)
    }
}

// ============================================
// Account Contexts
// ============================================

/// Accounts for initializing the SPECTRE vault
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + SpectreVault::INIT_SPACE,
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, SpectreVault>,

    /// CHECK: PDA that will hold SOL
    #[account(
        seeds = [VAULT_SEED, authority.key().as_ref(), b"sol"],
        bump
    )]
    pub vault_sol: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Accounts for funding the agent
#[derive(Accounts)]
#[instruction(proof: ZkProof)]
pub struct FundAgent<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref()],
        bump = vault.vault_bump,
        constraint = vault.is_active @ SpectreError::VaultInactive
    )]
    pub vault: Account<'info, SpectreVault>,

    #[account(
        init,
        payer = depositor,
        space = 8 + UserDeposit::INIT_SPACE,
        seeds = [DEPOSIT_SEED, vault.key().as_ref(), &proof.public_inputs.commitment],
        bump
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    pub system_program: Program<'info, System>,
}

/// Accounts for requesting a withdrawal
#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct RequestWithdrawal<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.as_ref()],
        bump = vault.vault_bump,
        constraint = vault.is_active @ SpectreError::VaultInactive
    )]
    pub vault: Account<'info, SpectreVault>,

    #[account(
        mut,
        seeds = [DEPOSIT_SEED, vault.key().as_ref(), &user_deposit.commitment],
        bump = user_deposit.bump,
        constraint = user_deposit.owner == requester.key() @ SpectreError::UnauthorizedWithdrawal,
        constraint = user_deposit.is_active @ SpectreError::DepositNotActive,
        constraint = user_deposit.amount >= amount @ SpectreError::InsufficientBalance
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    #[account(
        init,
        payer = requester,
        space = 8 + WithdrawalRequest::INIT_SPACE,
        seeds = [
            WITHDRAWAL_SEED,
            vault.key().as_ref(),
            requester.key().as_ref(),
            user_deposit.key().as_ref()
        ],
        bump
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

    /// CHECK: Any valid Solana address can receive funds
    pub recipient: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Accounts for completing a withdrawal
#[derive(Accounts)]
pub struct CompleteWithdrawal<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.authority.as_ref()],
        bump = vault.vault_bump
    )]
    pub vault: Account<'info, SpectreVault>,

    #[account(
        mut,
        seeds = [DEPOSIT_SEED, vault.key().as_ref(), &user_deposit.commitment],
        bump = user_deposit.bump,
        constraint = user_deposit.owner == requester.key() @ SpectreError::UnauthorizedWithdrawal
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    #[account(
        mut,
        seeds = [
            WITHDRAWAL_SEED,
            vault.key().as_ref(),
            requester.key().as_ref(),
            user_deposit.key().as_ref()
        ],
        bump = withdrawal_request.bump,
        constraint = withdrawal_request.requester == requester.key() @ SpectreError::UnauthorizedWithdrawal
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,

    /// CHECK: Must match the recipient in the withdrawal request
    #[account(
        mut,
        constraint = recipient.key() == withdrawal_request.recipient @ SpectreError::RecipientMismatch
    )]
    pub recipient: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Accounts for verifying withdrawal compliance
#[derive(Accounts)]
pub struct VerifyWithdrawalCompliance<'info> {
    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.as_ref()],
        bump = vault.vault_bump
    )]
    pub vault: Account<'info, SpectreVault>,

    #[account(
        seeds = [DEPOSIT_SEED, vault.key().as_ref(), &user_deposit.commitment],
        bump = user_deposit.bump
    )]
    pub user_deposit: Account<'info, UserDeposit>,

    #[account(
        mut,
        seeds = [
            WITHDRAWAL_SEED,
            vault.key().as_ref(),
            requester.key().as_ref(),
            user_deposit.key().as_ref()
        ],
        bump = withdrawal_request.bump,
        constraint = withdrawal_request.requester == requester.key() @ SpectreError::UnauthorizedWithdrawal,
        constraint = withdrawal_request.status == WithdrawalStatus::Pending @ SpectreError::InvalidWithdrawalStatus
    )]
    pub withdrawal_request: Account<'info, WithdrawalRequest>,
}

// ============================================
// Phase 2: TEE & Strategy Account Contexts
// ============================================

/// Accounts for initializing strategy configuration
#[derive(Accounts)]
pub struct InitializeStrategy<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.authority == authority.key() @ SpectreError::Unauthorized
    )]
    pub vault: Account<'info, SpectreVault>,

    #[account(
        init,
        payer = authority,
        space = 8 + StrategyConfig::INIT_SPACE,
        seeds = [STRATEGY_CONFIG_SEED, vault.key().as_ref()],
        bump
    )]
    pub strategy_config: Account<'info, StrategyConfig>,

    pub system_program: Program<'info, System>,
}

/// Accounts for delegating vault to TEE
#[derive(Accounts)]
pub struct DelegateToTee<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.authority == authority.key() @ SpectreError::Unauthorized,
        constraint = vault.is_active @ SpectreError::VaultInactive,
        constraint = !vault.is_delegated @ SpectreError::VaultAlreadyDelegated
    )]
    pub vault: Account<'info, SpectreVault>,

    /// CHECK: MagicBlock delegation program (not validated in mock mode)
    pub delegation_program: Option<AccountInfo<'info>>,

    pub system_program: Program<'info, System>,
}

/// Accounts for undelegating vault from TEE
#[derive(Accounts)]
pub struct UndelegateFromTee<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.authority == authority.key() @ SpectreError::Unauthorized,
        constraint = vault.is_delegated @ SpectreError::VaultNotDelegated
    )]
    pub vault: Account<'info, SpectreVault>,

    /// CHECK: MagicBlock delegation program (not validated in mock mode)
    pub delegation_program: Option<AccountInfo<'info>>,

    pub system_program: Program<'info, System>,
}

/// Accounts for updating model hash
#[derive(Accounts)]
pub struct UpdateModel<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.authority == authority.key() @ SpectreError::Unauthorized
    )]
    pub vault: Account<'info, SpectreVault>,
}

/// Accounts for updating strategy parameters
#[derive(Accounts)]
pub struct SetStrategyParams<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump = vault.vault_bump,
        constraint = vault.authority == authority.key() @ SpectreError::Unauthorized
    )]
    pub vault: Account<'info, SpectreVault>,

    #[account(
        mut,
        seeds = [STRATEGY_CONFIG_SEED, vault.key().as_ref()],
        bump = strategy_config.bump,
        constraint = strategy_config.authority == authority.key() @ SpectreError::Unauthorized
    )]
    pub strategy_config: Account<'info, StrategyConfig>,
}

/// Accounts for generating trade signal
#[derive(Accounts)]
pub struct GenerateTradeSignal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.authority.as_ref()],
        bump = vault.vault_bump,
        constraint = vault.is_active @ SpectreError::VaultInactive
    )]
    pub vault: Account<'info, SpectreVault>,

    #[account(
        mut,
        seeds = [STRATEGY_CONFIG_SEED, vault.key().as_ref()],
        bump = strategy_config.bump,
        constraint = strategy_config.is_active @ SpectreError::StrategyNotActive
    )]
    pub strategy_config: Account<'info, StrategyConfig>,
}

// ============================================
// Error Definitions
// ============================================

#[error_code]
pub enum SpectreError {
    // ============================================
    // Vault Errors
    // ============================================
    #[msg("Vault is not currently active")]
    VaultInactive,

    #[msg("Vault is not delegated to TEE")]
    VaultNotDelegated,

    #[msg("Vault is already delegated to TEE")]
    VaultAlreadyDelegated,

    #[msg("Insufficient balance in vault")]
    InsufficientVaultBalance,

    // ============================================
    // Deposit Errors
    // ============================================
    #[msg("Deposit amount is below minimum")]
    DepositTooLow,

    #[msg("Deposit amount exceeds maximum")]
    DepositTooHigh,

    #[msg("Invalid ZK proof provided")]
    InvalidZkProof,

    #[msg("This nullifier has already been used")]
    NullifierAlreadyUsed,

    #[msg("Invalid commitment provided")]
    InvalidCommitment,

    #[msg("Invalid Merkle root in proof")]
    InvalidMerkleRoot,

    #[msg("Deposit is not active")]
    DepositNotActive,

    // ============================================
    // Withdrawal Errors
    // ============================================
    #[msg("Not authorized to withdraw from this deposit")]
    UnauthorizedWithdrawal,

    #[msg("Insufficient balance for withdrawal")]
    InsufficientBalance,

    #[msg("Invalid amount specified")]
    InvalidAmount,

    #[msg("Withdrawal is not in correct status for this operation")]
    InvalidWithdrawalStatus,

    #[msg("Recipient does not match withdrawal request")]
    RecipientMismatch,

    // ============================================
    // Compliance Errors
    // ============================================
    #[msg("Compliance check failed - address may be high risk")]
    ComplianceCheckFailed,

    #[msg("Compliance attestation is too old")]
    StaleAttestation,

    #[msg("Address is flagged as high risk")]
    HighRiskAddress,

    #[msg("Invalid oracle signature on attestation")]
    InvalidOracleSignature,

    // ============================================
    // Trading Errors
    // ============================================
    #[msg("Position not found")]
    PositionNotFound,

    #[msg("Position is already closed")]
    PositionAlreadyClosed,

    #[msg("Invalid trade signal")]
    InvalidTradeSignal,

    #[msg("Market not found")]
    MarketNotFound,

    // ============================================
    // Strategy Errors (Phase 2)
    // ============================================
    #[msg("Invalid strategy parameters")]
    InvalidStrategyParams,

    #[msg("Strategy is not active")]
    StrategyNotActive,

    #[msg("Invalid market input data")]
    InvalidMarketInput,

    // ============================================
    // Authorization Errors
    // ============================================
    #[msg("Not authorized to perform this action")]
    Unauthorized,

    // ============================================
    // Math Errors
    // ============================================
    #[msg("Mathematical overflow occurred")]
    MathOverflow,

    #[msg("Mathematical underflow occurred")]
    MathUnderflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_program_id() {
        assert_eq!(
            ID.to_string(),
            "B2at4oGQFPAbuH2wMMpBsFrTvJi71GUvR7jyxny7HaGf"
        );
    }
}
