# SPECTRE Master Implementation Plan

> **Strategic Private Execution & Confidential Trading Runtime Environment**
>
> A Confidential Autonomous Market Maker (CAMM) for Solana

**Document Version:** 1.0
**Last Updated:** 2026-01-20
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack Research & Validation](#2-technology-stack-research--validation)
3. [Architecture Deep Dive](#3-architecture-deep-dive)
4. [Implementation Phases](#4-implementation-phases)
5. [Testing Strategy](#5-testing-strategy)
6. [Risk Analysis & Mitigations](#6-risk-analysis--mitigations)
7. [Milestones & Checkpoints](#7-milestones--checkpoints)
8. [Agent Handoff Protocol](#8-agent-handoff-protocol)
9. [Resources & References](#9-resources--references)

---

## 1. Executive Summary

### 1.1 The Problem

On-chain AI trading agents suffer from **Alpha Leakage**: their strategies, logic, and intent are exposed in the public mempool. This enables:
- MEV bots to front-run trades
- Copy-traders to replicate strategies
- Erosion of any trading edge

### 1.2 The Solution

SPECTRE creates a **"Privacy Sandwich"** architecture:

```
[Private Funding] → [Private Execution] → [Public Settlement]
     Layer 1            Layer 2              Layer 3
   "The Shield"       "The Brain"          "The Hand"
```

### 1.3 Key Innovation

SPECTRE is the **first Confidential Autonomous Market Maker** on Solana that:
- Accepts funding without linking to public identity (Privacy Cash)
- Executes strategy logic in encrypted memory (MagicBlock TEE)
- Maintains compliance via on-chain risk verification (Range Protocol)
- Settles trades on permissionless prediction markets (PNP Exchange)

### 1.4 Hackathon Prize Alignment

This project targets **4 prize tracks simultaneously**:
1. **Privacy Track** - TEE + ZK-based private funding
2. **AI/Trading Track** - ONNX model inference for trading signals
3. **DeFi Innovation Track** - Novel market maker architecture
4. **MagicBlock Integration Track** - First TEE-based trading agent

---

## 2. Technology Stack Research & Validation

### 2.1 MagicBlock Private Ephemeral Rollups (TEE)

**Status:** ✅ VALIDATED - Production ready on devnet

**What It Is:**
- Hardware-backed privacy using Intel TDX (Trust Domain Extensions)
- Runs standard Solana transactions inside encrypted enclaves
- State is protected from all unauthorized parties including node operators

**Key Features Confirmed:**
- **Devnet Endpoint:** `https://tee.magicblock.app/`
- **Latency:** 10-50ms (vs 400ms on L1)
- **No bridges or new tokens required**
- **Full Solana composability maintained**

**SDK Details:**
```toml
# Cargo.toml
[dependencies]
ephemeral-rollups-sdk = "x.x.x"  # From crates.io
```

**Integration Pattern:**
```rust
use ephemeral_rollups_sdk::cpi::delegate_account;

// Delegate account to TEE for private execution
delegate_account(
    ctx.accounts.payer,
    ctx.accounts.pda_to_delegate,
    ctx.accounts.owner_program,
    &pda_seeds,
    0,  // time_limit (0 = no limit)
    update_frequency,
)?;
```

**Critical Insight:** The `#[ephemeral]` macro is placed before `#[program]` in Anchor to enable TEE capabilities. Delegation and undelegation are CPIs that can be integrated into existing instructions.

**References:**
- [MagicBlock Documentation](https://docs.magicblock.gg/pages/tools/tee/introduction)
- [Ephemeral Rollups SDK](https://github.com/magicblock-labs/ephemeral-rollups-sdk)
- [MagicBlock Announcement](https://www.magicblock.xyz/blog/institutional-grade-privacy)

---

### 2.2 Privacy Cash SDK

**Status:** ✅ VALIDATED - Live on mainnet since August 2025

**What It Is:**
- Tornado-Cash-style private transfers with ZK proofs
- OFAC-compliant by design (selective disclosure mechanisms)
- Over 10,000 private transactions processed, $121M+ in volume

**SDK Availability:**

| Language | Package | Registry |
|----------|---------|----------|
| Rust | `privacy-cash-sdk` | crates.io |
| TypeScript | `privacycash` v1.1.7 | npm |

**Core API (Rust):**
```rust
use privacy_cash::{PrivacyCash, ZkKeypair};

// Initialize client
let client = PrivacyCash::new(rpc_endpoint, keypair)?;

// Deposit SOL (creates ZK commitment)
let deposit_result = client.deposit(amount_lamports).await?;

// Withdraw with ZK proof
let withdraw_result = client.withdraw(recipient, amount, proof).await?;

// Get private balance
let balance = client.get_private_balance().await?;
```

**Key Types:**
- `ZkKeypair` - Keypair for ZK operations
- `Utxo` - Unspent transaction output (commitment)
- `prover` module - ZK proof generation

**How It Works:**
1. **Shield:** Deposit SOL → Generate commitment → Add to Merkle tree
2. **Unshield:** Prove membership in deposit set without revealing which deposit → Withdraw

**Requirements:**
- Node.js 24+ (for TypeScript SDK)
- Rust 1.79.0+
- Circom v2.2.2 (for ZK circuits)

**References:**
- [Privacy Cash GitHub](https://github.com/Privacy-Cash/privacy-cash)
- [Privacy Cash SDK Docs](https://docs.rs/privacy-cash-sdk/latest/privacy_cash/)
- [npm package](https://libraries.io/npm/privacycash)

---

### 2.3 Range Protocol (Compliance)

**Status:** ✅ VALIDATED - Production infrastructure for $30B+ in assets

**What It Is:**
- Real-time on-chain risk verification via Switchboard oracles
- Tracks OFAC, EU, UK, UN sanctions lists
- Enables programs to reject high-risk/sanctioned addresses

**Integration Architecture:**
```
[Client] → [Range Risk API] → [Switchboard Oracle] → [On-Chain Verification]
```

**API Endpoint:**
```
https://api.range.org/v1/risk/address?address={wallet}&network=solana
```

**Response Format:**
```json
{
  "riskScore": 0-10,
  "riskLevel": "low|medium|high|critical",
  "numHops": 2,
  "maliciousAddressesFound": [],
  "reasoning": "No suspicious activity detected"
}
```

**On-Chain Verification Pattern:**
```rust
// Using Switchboard On-Demand Oracles
1. Client requests signed quote from oracle
2. Oracle executes job in secure enclave
3. Program verifies Ed25519 signature
4. Check quote freshness (max 50 slots old)
5. Match feed hash against quote data
6. Extract and act on risk score
```

**Latency:** 2-3 seconds per verification

**Critical Note:** API keys are passed via Switchboard TEE variable overrides, never exposed publicly.

**References:**
- [Range Risk API Integration](https://www.range.org/blog/integrate-range-onchain-risk-verifier-into-your-solana-program)
- [Range Documentation](https://docs.range.org/reference/risk-introduction)
- [Oracle Example Repository](https://github.com/rangesecurity/oracle-example)

---

### 2.4 PNP Exchange (Prediction Markets)

**Status:** ✅ VALIDATED - Active on Solana with SDK available

**What It Is:**
- Solana-native DEX for prediction markets
- Permissionless market creation (no listing restrictions)
- Integrated with DeFiLlama data feeds

**SDK:**
```typescript
import { PNPClient } from '@pnp/sdk';

const client = new PNPClient({
  rpcUrl: 'https://api.devnet.solana.com',
  privateKey: 'base58_key'
});

// Create market
await client.createMarket({
  question: "Will BTC reach $100k?",
  liquidity: 1000000000,  // lamports
  endTime: Date.now() + 30 * 24 * 60 * 60 * 1000  // 30 days
});

// Place trade
await client.trade({
  marketId: 'xxx',
  side: 'YES',  // or 'NO'
  amount: 100000000,
  orderType: 'market'  // or 'limit'
});
```

**CPI Integration (Anchor):**
```rust
#[derive(Accounts)]
pub struct PlaceBet<'info> {
    pub market: AccountInfo<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub pnp_program: Program<'info, PnpExchange>,
    // ... additional PNP-specific accounts
}

// Invoke via CPI
pnp_program::cpi::trade(
    cpi_ctx,
    market_id,
    side,      // YES or NO
    amount,
    order_type
)?;
```

**References:**
- [PNP SDK Documentation](https://docs.pnp.exchange/pnp-sdk)
- [PNP Twitter/X](https://x.com/predictandpump)

---

### 2.5 tract-onnx (ML Inference)

**Status:** ⚠️ VALIDATED WITH CONSTRAINTS

**What It Is:**
- Tiny, embeddable neural network inference library
- 85% ONNX operator coverage
- Designed for edge/embedded deployment

**Cargo.toml:**
```toml
[dependencies]
tract-onnx = "0.22"
```

**Basic Usage:**
```rust
use tract_onnx::prelude::*;

// Load ONNX model
let model = tract_onnx::onnx()
    .model_for_path("model.onnx")?
    .into_optimized()?
    .into_runnable()?;

// Prepare input tensor
let input = tract_ndarray::arr2(&[[price, trend, volatility]])
    .into_tensor();

// Run inference
let result = model.run(tvec!(input.into()))?;
let output = result[0].to_array_view::<f32>()?;

// Extract prediction
let buy_signal = output[[0, 0]] > 0.5;
```

**CRITICAL CONSTRAINT - Binary Size:**

The `tract` crate compiles to a large binary. Solana programs have a **deployment size limit**.

**Mitigation Strategies:**
1. **Primary:** Use NNEF format (smaller runtime footprint)
2. **Fallback:** Implement decision tree in raw Rust (if/else logic)
3. **Alternative:** Pre-compute model weights, embed as constants

**Recommended Approach for SPECTRE:**
```rust
// Option A: Tiny ONNX model with tract
pub fn run_inference(price: f32, trend: f32, vol: f32) -> bool {
    // Load embedded model bytes
    let model_bytes = include_bytes!("../models/trading_model.onnx");
    // ... inference logic
}

// Option B: Decision Tree Fallback (if tract too large)
pub fn run_inference_dt(price: f32, trend: f32, vol: f32) -> bool {
    if price < 0.4 && trend > 0.0 {
        if vol < 0.3 {
            return true;  // Strong buy signal
        }
        return trend > 0.5;  // Moderate buy signal
    }
    false
}
```

**References:**
- [tract GitHub](https://github.com/sonos/tract)
- [tract-onnx on crates.io](https://crates.io/crates/tract-onnx)
- [tract documentation](https://lib.rs/crates/tract-onnx)

---

## 3. Architecture Deep Dive

### 3.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SPECTRE ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌──────────────────────────────────────┐           │
│  │   USER      │    │        LAYER 1: THE SHIELD           │           │
│  │  (Funder)   │───▶│  ┌─────────────┐  ┌───────────────┐  │           │
│  └─────────────┘    │  │Privacy Cash │  │ Range Protocol│  │           │
│                     │  │(ZK Deposit) │  │ (Compliance)  │  │           │
│                     │  └──────┬──────┘  └───────┬───────┘  │           │
│                     └─────────┼─────────────────┼──────────┘           │
│                               │                 │                       │
│                               ▼                 ▼                       │
│                     ┌──────────────────────────────────────┐           │
│                     │        LAYER 2: THE BRAIN            │           │
│                     │     (MagicBlock TEE Enclave)         │           │
│                     │  ┌────────────────────────────────┐  │           │
│                     │  │   SPECTRE Anchor Program       │  │           │
│                     │  │  ┌──────────────────────────┐  │  │           │
│                     │  │  │  Trading Strategy        │  │  │           │
│                     │  │  │  (ONNX/Decision Tree)    │  │  │           │
│                     │  │  │                          │  │  │           │
│                     │  │  │  Inputs:                 │  │  │           │
│                     │  │  │  - Market Odds           │  │  │           │
│                     │  │  │  - Sentiment Score       │  │  │  ENCRYPTED│
│                     │  │  │  - Volatility Index      │  │  │  MEMORY   │
│                     │  │  │                          │  │  │           │
│                     │  │  │  Output: BUY/SELL Signal │  │  │           │
│                     │  │  └──────────────────────────┘  │  │           │
│                     │  └────────────────────────────────┘  │           │
│                     └─────────────────┬────────────────────┘           │
│                                       │                                 │
│                                       ▼                                 │
│                     ┌──────────────────────────────────────┐           │
│                     │        LAYER 3: THE HAND             │           │
│                     │  ┌──────────────────────────────┐    │           │
│                     │  │    PNP Exchange CPI          │    │           │
│                     │  │    (Trade Execution)         │    │           │
│                     │  └──────────────────────────────┘    │           │
│                     │              │                        │           │
│                     │              ▼                        │           │
│                     │  ┌──────────────────────────────┐    │           │
│                     │  │    Solana L1 Settlement      │    │           │
│                     │  └──────────────────────────────┘    │           │
│                     └──────────────────────────────────────┘           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

```
1. DEPOSIT FLOW
   User → Privacy Cash SDK → ZK Commitment → Spectre Vault → TEE Agent Keypair

2. TRADING FLOW
   Market Data → TEE Enclave → ONNX Inference → Trade Signal → PNP CPI → L1 Settlement

3. WITHDRAWAL FLOW
   Exit Request → Range Compliance Check → Proof of Innocence → ZK Withdrawal → User
```

### 3.3 Account Structure

```rust
// Program Accounts
pub struct SpectreState {
    pub authority: Pubkey,           // TEE-controlled keypair
    pub vault: Pubkey,               // Shielded funds vault
    pub total_deposited: u64,        // Total SOL in vault
    pub active_positions: u32,       // Open market positions
    pub model_hash: [u8; 32],        // Hash of trading model (for attestation)
    pub last_trade_slot: u64,        // Anti-replay
    pub bump: u8,
}

// User Note (Privacy Cash Integration)
pub struct UserNote {
    pub commitment: [u8; 32],        // ZK commitment
    pub delegated_to: Pubkey,        // TEE agent keypair
    pub amount: u64,                 // Shielded amount
    pub created_at: i64,
}

// Position Tracking
pub struct Position {
    pub market_id: Pubkey,
    pub side: Side,                  // YES or NO
    pub shares: u64,
    pub entry_price: u64,
    pub opened_at: i64,
}
```

### 3.4 Instruction Set

```rust
pub enum SpectreInstruction {
    // Layer 1: Funding
    Initialize,                      // Setup vault and TEE authority
    FundAgent { proof: ZkProof },    // Deposit with ZK proof
    RequestWithdrawal { amount: u64 },
    CompleteWithdrawal { compliance_proof: RangeAttestation },

    // Layer 2: Strategy
    UpdateModel { model_hash: [u8; 32] },  // Admin only
    SetParameters { params: StrategyParams },

    // Layer 3: Trading
    ExecuteTrade { market_id: Pubkey, signal: TradeSignal },
    ClosePosition { position_id: Pubkey },

    // TEE Management
    DelegateToTee,
    UndelegateFromTee,
}
```

---

## 4. Implementation Phases

### Phase 1: Foundation & Ghost Vault (Days 1-3)

#### 1.1 Project Scaffolding

```bash
# Create Anchor project
anchor init spectre_protocol
cd spectre_protocol

# Setup directory structure
mkdir -p programs/spectre/src/{instructions,state,utils}
mkdir -p models
mkdir -p tests/integration
mkdir -p client/src
```

**Cargo.toml Dependencies:**
```toml
[dependencies]
anchor-lang = "0.30"
anchor-spl = "0.30"
ephemeral-rollups-sdk = "0.1"
# privacy-cash-sdk = "0.1"  # When available

[dev-dependencies]
solana-program-test = "1.18"
tokio = { version = "1", features = ["full"] }
```

#### 1.2 Core State Implementation

**File:** `programs/spectre/src/state/mod.rs`

```rust
use anchor_lang::prelude::*;

#[account]
pub struct SpectreVault {
    pub authority: Pubkey,
    pub vault_bump: u8,
    pub total_deposited: u64,
    pub model_hash: [u8; 32],
    pub is_active: bool,
    pub created_at: i64,
}

#[account]
pub struct UserDeposit {
    pub owner: Pubkey,
    pub commitment: [u8; 32],
    pub amount: u64,
    pub delegated: bool,
    pub created_at: i64,
}
```

#### 1.3 Privacy Cash Integration

**Approach:** Since Privacy Cash SDK may have limited documentation, we implement a **compatibility layer**:

```rust
// programs/spectre/src/utils/privacy_bridge.rs

pub mod privacy_bridge {
    use anchor_lang::prelude::*;

    /// Verify a ZK deposit proof
    pub fn verify_deposit_proof(
        commitment: &[u8; 32],
        nullifier: &[u8; 32],
        proof: &[u8],
    ) -> Result<bool> {
        // Integration with Privacy Cash verification
        // This will call the Privacy Cash program via CPI
        Ok(true)  // Placeholder for actual verification
    }

    /// Generate delegation note
    pub fn delegate_note_to_agent(
        note_commitment: &[u8; 32],
        agent_pubkey: &Pubkey,
    ) -> Result<()> {
        // Delegate the note to TEE agent
        Ok(())
    }
}
```

#### 1.4 Range Protocol Integration

**File:** `programs/spectre/src/utils/compliance.rs`

```rust
pub mod compliance {
    use anchor_lang::prelude::*;

    #[derive(AnchorSerialize, AnchorDeserialize, Clone)]
    pub struct RangeAttestation {
        pub address: Pubkey,
        pub risk_score: u8,      // 0-100 (scaled from 0-10)
        pub timestamp: i64,
        pub oracle_signature: [u8; 64],
    }

    pub const MAX_RISK_SCORE: u8 = 30;  // Block if risk > 30
    pub const MAX_ATTESTATION_AGE: i64 = 50;  // slots

    pub fn verify_compliance(
        attestation: &RangeAttestation,
        current_slot: u64,
    ) -> Result<bool> {
        // 1. Check attestation freshness
        require!(
            current_slot - attestation.timestamp as u64 <= MAX_ATTESTATION_AGE as u64,
            SpectreError::StaleAttestation
        );

        // 2. Check risk score threshold
        require!(
            attestation.risk_score <= MAX_RISK_SCORE,
            SpectreError::HighRiskAddress
        );

        // 3. Verify oracle signature (Switchboard verification)
        // verify_ed25519_signature(...)?;

        Ok(true)
    }
}
```

#### Phase 1 Checkpoint Tests

```rust
// tests/phase1_vault.rs

#[tokio::test]
async fn test_initialize_vault() {
    // Initialize program and vault
    // Verify state is correct
}

#[tokio::test]
async fn test_deposit_with_mock_proof() {
    // Create mock ZK proof
    // Deposit to vault
    // Verify balance updated
}

#[tokio::test]
async fn test_compliance_check_passes() {
    // Create valid attestation
    // Verify compliance passes
}

#[tokio::test]
async fn test_compliance_check_fails_high_risk() {
    // Create high-risk attestation
    // Verify withdrawal blocked
}
```

---

### Phase 2: The Brain in TEE (Days 4-7)

#### 2.1 MagicBlock TEE Configuration

**Anchor.toml:**
```toml
[features]
seeds = false
skip-lint = false

[programs.devnet]
spectre = "SPEC7r3...YourProgramId"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "https://tee.magicblock.app/"  # TEE Devnet
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

#### 2.2 TEE Delegation Implementation

**File:** `programs/spectre/src/instructions/delegate.rs`

```rust
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::cpi::delegate_account;

#[derive(Accounts)]
pub struct DelegateToTee<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.vault_bump,
    )]
    pub vault: Account<'info, SpectreVault>,

    /// CHECK: Delegation program
    pub delegation_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DelegateToTee>) -> Result<()> {
    let vault = &ctx.accounts.vault;

    // Delegate vault account to TEE
    delegate_account(
        &ctx.accounts.authority,
        &vault.to_account_info(),
        &ctx.program_id,
        &[b"vault", ctx.accounts.authority.key().as_ref()],
        0,  // No time limit
        1,  // Update frequency
    )?;

    msg!("Vault delegated to TEE enclave");
    Ok(())
}
```

#### 2.3 Trading Model Implementation

**Option A: ONNX-based (if binary size permits)**

**File:** `programs/spectre/src/strategy/onnx_strategy.rs`

```rust
#[cfg(feature = "onnx")]
pub mod onnx_strategy {
    use tract_onnx::prelude::*;

    // Embed model at compile time
    const MODEL_BYTES: &[u8] = include_bytes!("../../models/trading_model.onnx");

    pub fn run_inference(
        market_price: f32,      // Current YES price (0-1)
        trend: f32,             // Price trend (-1 to 1)
        volatility: f32,        // Market volatility (0-1)
    ) -> Result<TradeSignal, StrategyError> {
        let model = tract_onnx::onnx()
            .model_for_read(&mut MODEL_BYTES)?
            .into_optimized()?
            .into_runnable()?;

        let input = tract_ndarray::arr2(&[[market_price, trend, volatility]])
            .into_tensor();

        let result = model.run(tvec!(input.into()))?;
        let prediction = result[0].to_scalar::<f32>()?;

        Ok(match prediction {
            p if p > 0.7 => TradeSignal::StrongBuy,
            p if p > 0.5 => TradeSignal::Buy,
            p if p < 0.3 => TradeSignal::StrongSell,
            p if p < 0.5 => TradeSignal::Sell,
            _ => TradeSignal::Hold,
        })
    }
}
```

**Option B: Decision Tree Fallback (guaranteed to work)**

**File:** `programs/spectre/src/strategy/decision_tree.rs`

```rust
pub mod decision_tree {
    use anchor_lang::prelude::*;

    #[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq)]
    pub enum TradeSignal {
        StrongBuy,
        Buy,
        Hold,
        Sell,
        StrongSell,
    }

    #[derive(AnchorSerialize, AnchorDeserialize, Clone)]
    pub struct StrategyParams {
        pub price_threshold_low: f32,   // Default: 0.35
        pub price_threshold_high: f32,  // Default: 0.65
        pub trend_threshold: f32,       // Default: 0.1
        pub volatility_cap: f32,        // Default: 0.4
    }

    impl Default for StrategyParams {
        fn default() -> Self {
            Self {
                price_threshold_low: 0.35,
                price_threshold_high: 0.65,
                trend_threshold: 0.1,
                volatility_cap: 0.4,
            }
        }
    }

    /// Decision tree trading strategy
    ///
    /// Logic:
    /// 1. If price is low (<0.35) and trend is positive → BUY
    /// 2. If price is high (>0.65) and trend is negative → SELL
    /// 3. If volatility is too high → HOLD
    /// 4. Strong signals when multiple conditions align
    pub fn run_inference(
        market_price: f32,
        trend: f32,
        volatility: f32,
        params: &StrategyParams,
    ) -> TradeSignal {
        // High volatility = be cautious
        if volatility > params.volatility_cap {
            return TradeSignal::Hold;
        }

        // Strong buy: underpriced + positive trend + low vol
        if market_price < params.price_threshold_low
           && trend > params.trend_threshold
           && volatility < params.volatility_cap * 0.5
        {
            return TradeSignal::StrongBuy;
        }

        // Buy: underpriced + positive trend
        if market_price < params.price_threshold_low && trend > 0.0 {
            return TradeSignal::Buy;
        }

        // Strong sell: overpriced + negative trend + low vol
        if market_price > params.price_threshold_high
           && trend < -params.trend_threshold
           && volatility < params.volatility_cap * 0.5
        {
            return TradeSignal::StrongSell;
        }

        // Sell: overpriced + negative trend
        if market_price > params.price_threshold_high && trend < 0.0 {
            return TradeSignal::Sell;
        }

        TradeSignal::Hold
    }
}
```

#### 2.4 Model Training (Python - Offline)

**File:** `models/train_model.py`

```python
#!/usr/bin/env python3
"""
Train a simple trading model and export to ONNX.
This runs OFFLINE, not in the TEE.
"""

import numpy as np
from sklearn.linear_model import LogisticRegression
from skl2onnx import to_onnx
import onnx

# Generate synthetic training data
np.random.seed(42)
n_samples = 1000

# Features: [price, trend, volatility]
X = np.random.rand(n_samples, 3)
X[:, 0] = X[:, 0]  # Price: 0-1
X[:, 1] = X[:, 1] * 2 - 1  # Trend: -1 to 1
X[:, 2] = X[:, 2] * 0.5  # Volatility: 0-0.5

# Labels: 1 = buy, 0 = don't buy
# Simple rule: buy if price < 0.4 and trend > 0
y = ((X[:, 0] < 0.4) & (X[:, 1] > 0)).astype(int)

# Train model
model = LogisticRegression()
model.fit(X, y)

# Export to ONNX
onnx_model = to_onnx(model, X[:1].astype(np.float32))
onnx.save(onnx_model, "trading_model.onnx")

print(f"Model exported to trading_model.onnx")
print(f"Model size: {os.path.getsize('trading_model.onnx')} bytes")
```

#### Phase 2 Checkpoint Tests

```rust
// tests/phase2_brain.rs

#[tokio::test]
async fn test_delegate_to_tee() {
    // Initialize vault
    // Delegate to TEE
    // Verify delegation successful
}

#[tokio::test]
async fn test_decision_tree_buy_signal() {
    let params = StrategyParams::default();
    let signal = decision_tree::run_inference(0.30, 0.2, 0.1, &params);
    assert_eq!(signal, TradeSignal::Buy);
}

#[tokio::test]
async fn test_decision_tree_sell_signal() {
    let params = StrategyParams::default();
    let signal = decision_tree::run_inference(0.70, -0.2, 0.1, &params);
    assert_eq!(signal, TradeSignal::Sell);
}

#[tokio::test]
async fn test_decision_tree_hold_high_volatility() {
    let params = StrategyParams::default();
    let signal = decision_tree::run_inference(0.30, 0.2, 0.5, &params);
    assert_eq!(signal, TradeSignal::Hold);
}

#[tokio::test]
async fn test_undelegate_from_tee() {
    // Complete session
    // Undelegate from TEE
    // Verify state committed to L1
}
```

---

### Phase 3: The Hand - Market Integration (Days 8-10)

#### 3.1 PNP Exchange Interface

**File:** `programs/spectre/src/cpi/pnp_interface.rs`

```rust
use anchor_lang::prelude::*;

// PNP Program ID (replace with actual)
declare_id!("PNPxxx...ActualProgramId");

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum Side {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum OrderType {
    Market,
    Limit { price: u64 },
}

/// CPI context for placing trades on PNP
#[derive(Accounts)]
pub struct PnpTrade<'info> {
    /// The prediction market
    pub market: AccountInfo<'info>,

    /// Market authority
    pub market_authority: AccountInfo<'info>,

    /// User placing the trade (TEE agent)
    #[account(mut)]
    pub user: Signer<'info>,

    /// User's token account
    #[account(mut)]
    pub user_token_account: AccountInfo<'info>,

    /// Market's token vault
    #[account(mut)]
    pub market_vault: AccountInfo<'info>,

    /// Shares mint (YES or NO)
    #[account(mut)]
    pub shares_mint: AccountInfo<'info>,

    /// User's shares account
    #[account(mut)]
    pub user_shares_account: AccountInfo<'info>,

    /// PNP program
    pub pnp_program: AccountInfo<'info>,

    /// Token program
    pub token_program: AccountInfo<'info>,
}

pub fn place_trade(
    ctx: CpiContext<'_, '_, '_, '_, PnpTrade<'_>>,
    side: Side,
    amount: u64,
    order_type: OrderType,
) -> Result<()> {
    // Build CPI instruction
    let ix = Instruction {
        program_id: *ctx.accounts.pnp_program.key,
        accounts: vec![
            AccountMeta::new(*ctx.accounts.market.key, false),
            AccountMeta::new_readonly(*ctx.accounts.market_authority.key, false),
            AccountMeta::new(*ctx.accounts.user.key, true),
            AccountMeta::new(*ctx.accounts.user_token_account.key, false),
            AccountMeta::new(*ctx.accounts.market_vault.key, false),
            AccountMeta::new(*ctx.accounts.shares_mint.key, false),
            AccountMeta::new(*ctx.accounts.user_shares_account.key, false),
            AccountMeta::new_readonly(*ctx.accounts.token_program.key, false),
        ],
        data: build_trade_data(side, amount, order_type),
    };

    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[
            ctx.accounts.market.to_account_info(),
            ctx.accounts.user.to_account_info(),
            // ... all accounts
        ],
        ctx.signer_seeds,
    )?;

    Ok(())
}

fn build_trade_data(side: Side, amount: u64, order_type: OrderType) -> Vec<u8> {
    // Serialize instruction data according to PNP IDL
    let mut data = vec![/* instruction discriminator */];
    data.extend(side.try_to_vec().unwrap());
    data.extend(amount.to_le_bytes());
    data.extend(order_type.try_to_vec().unwrap());
    data
}
```

#### 3.2 Trade Execution Instruction

**File:** `programs/spectre/src/instructions/execute_trade.rs`

```rust
use anchor_lang::prelude::*;
use crate::state::*;
use crate::strategy::decision_tree::*;
use crate::cpi::pnp_interface::*;

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault.vault_bump,
        constraint = vault.is_active @ SpectreError::VaultInactive
    )]
    pub vault: Account<'info, SpectreVault>,

    /// CHECK: PNP market account
    #[account(mut)]
    pub pnp_market: AccountInfo<'info>,

    /// Oracle for market data (Pyth/Switchboard)
    pub price_oracle: AccountInfo<'info>,

    // ... additional accounts for PNP CPI

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct MarketData {
    pub current_price: f32,  // YES price 0-1
    pub price_24h_ago: f32,
    pub volume_24h: u64,
}

pub fn handler(ctx: Context<ExecuteTrade>, market_data: MarketData) -> Result<()> {
    let vault = &ctx.accounts.vault;

    // Calculate inputs for strategy
    let trend = market_data.current_price - market_data.price_24h_ago;
    let volatility = calculate_volatility(&market_data);

    // Run trading strategy (inside TEE - encrypted memory)
    let params = StrategyParams::default();
    let signal = run_inference(
        market_data.current_price,
        trend,
        volatility,
        &params,
    );

    msg!("Strategy signal: {:?}", signal);  // Only visible in TEE console

    // Execute trade based on signal
    match signal {
        TradeSignal::StrongBuy | TradeSignal::Buy => {
            execute_buy(ctx, Side::Yes, calculate_position_size(vault, &signal))?;
        }
        TradeSignal::StrongSell | TradeSignal::Sell => {
            execute_sell(ctx, Side::No, calculate_position_size(vault, &signal))?;
        }
        TradeSignal::Hold => {
            msg!("Holding - no trade executed");
        }
    }

    Ok(())
}

fn calculate_volatility(data: &MarketData) -> f32 {
    // Simple volatility proxy
    (data.current_price - data.price_24h_ago).abs()
}

fn calculate_position_size(vault: &SpectreVault, signal: &TradeSignal) -> u64 {
    let base_size = vault.total_deposited / 20;  // 5% per trade

    match signal {
        TradeSignal::StrongBuy | TradeSignal::StrongSell => base_size * 2,  // 10%
        _ => base_size,  // 5%
    }
}
```

#### 3.3 Crank Script (Node.js)

**File:** `client/src/crank.ts`

```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { PNPClient } from '@pnp/sdk';

const TEE_RPC = 'https://tee.magicblock.app/';
const POLL_INTERVAL = 30_000; // 30 seconds

interface MarketOpportunity {
  marketId: PublicKey;
  currentPrice: number;
  trend: number;
  volume24h: number;
}

async function main() {
  // Setup connections
  const connection = new Connection(TEE_RPC, 'confirmed');
  const wallet = Keypair.fromSecretKey(/* load from env */);
  const provider = new AnchorProvider(connection, wallet, {});

  const spectreProgram = new Program(/* IDL */, provider);
  const pnpClient = new PNPClient({ rpcUrl: TEE_RPC, wallet });

  console.log('🔮 SPECTRE Crank started');
  console.log(`   TEE Endpoint: ${TEE_RPC}`);
  console.log(`   Poll Interval: ${POLL_INTERVAL}ms`);

  while (true) {
    try {
      // 1. Fetch active PNP markets
      const markets = await pnpClient.getActiveMarkets();
      console.log(`\n📊 Found ${markets.length} active markets`);

      // 2. Analyze each market for opportunities
      for (const market of markets) {
        const opportunity = await analyzeMarket(pnpClient, market);

        if (shouldTriggerAgent(opportunity)) {
          console.log(`\n⚡ Triggering agent for market: ${market.id}`);

          // 3. Call SPECTRE program to execute trade
          await spectreProgram.methods
            .executeTrade({
              currentPrice: opportunity.currentPrice,
              price24hAgo: opportunity.currentPrice - opportunity.trend,
              volume24h: opportunity.volume24h,
            })
            .accounts({
              vault: /* vault PDA */,
              pnpMarket: market.id,
              priceOracle: /* oracle */,
            })
            .rpc();

          console.log('✅ Trade instruction sent to TEE');
        }
      }
    } catch (error) {
      console.error('❌ Crank error:', error);
    }

    await sleep(POLL_INTERVAL);
  }
}

async function analyzeMarket(
  client: PNPClient,
  market: any
): Promise<MarketOpportunity> {
  const info = await client.getMarketInfo(market.id);
  const history = await client.getPriceHistory(market.id, '24h');

  return {
    marketId: market.id,
    currentPrice: info.yesPrice,
    trend: info.yesPrice - history[0].price,
    volume24h: info.volume24h,
  };
}

function shouldTriggerAgent(opportunity: MarketOpportunity): boolean {
  // Quick pre-filter before sending to TEE
  // Actual decision happens in encrypted memory
  const hasSufficientVolume = opportunity.volume24h > 1_000_000_000; // 1 SOL
  const hasMovement = Math.abs(opportunity.trend) > 0.05;

  return hasSufficientVolume && hasMovement;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
```

#### 3.4 Mock PNP Market (Fallback)

If PNP devnet is unstable, use this mock:

**File:** `programs/mock_pnp/src/lib.rs`

```rust
use anchor_lang::prelude::*;

declare_id!("MockPNP...xxx");

#[program]
pub mod mock_pnp {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        question: String,
        end_time: i64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.question = question;
        market.yes_price = 500_000; // 0.5 SOL (50%)
        market.no_price = 500_000;
        market.end_time = end_time;
        market.total_volume = 0;
        Ok(())
    }

    pub fn trade(
        ctx: Context<Trade>,
        side: u8,  // 0 = YES, 1 = NO
        amount: u64,
    ) -> Result<()> {
        let market = &mut ctx.accounts.market;

        // Simple AMM price impact
        if side == 0 {
            market.yes_price += amount / 1_000_000;
            market.no_price -= amount / 1_000_000;
        } else {
            market.no_price += amount / 1_000_000;
            market.yes_price -= amount / 1_000_000;
        }

        market.total_volume += amount;

        msg!("Trade executed: side={}, amount={}", side, amount);
        Ok(())
    }
}

#[account]
pub struct Market {
    pub question: String,
    pub yes_price: u64,
    pub no_price: u64,
    pub end_time: i64,
    pub total_volume: u64,
}
```

#### Phase 3 Checkpoint Tests

```rust
// tests/phase3_integration.rs

#[tokio::test]
async fn test_full_trading_loop() {
    // 1. Initialize vault
    // 2. Deposit funds (mock ZK)
    // 3. Delegate to TEE
    // 4. Create mock market
    // 5. Execute trade
    // 6. Verify position opened
}

#[tokio::test]
async fn test_cpi_to_pnp() {
    // Test direct CPI to PNP (or mock)
}

#[tokio::test]
async fn test_position_tracking() {
    // Open position
    // Verify tracking
    // Close position
    // Verify PnL calculation
}
```

---

### Phase 4: Polish & Demo (Day 11)

#### 4.1 Spectre Terminal UI

**File:** `client/src/terminal/App.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

const SpectreTerminal: React.FC = () => {
  const [status, setStatus] = useState<'connecting' | 'active' | 'paused'>('connecting');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [vaultBalance, setVaultBalance] = useState<number>(0);

  return (
    <div className="terminal-container">
      <header className="terminal-header">
        <h1>🔮 SPECTRE TERMINAL</h1>
        <StatusIndicator status={status} />
      </header>

      <div className="grid">
        {/* Strategy Status */}
        <div className="panel strategy-panel">
          <h2>Strategy Status</h2>
          <div className="encrypted-badge">
            🔒 ENCRYPTED STRATEGY ACTIVE
          </div>
          <p className="subtext">
            Model running in TEE enclave
          </p>
          <div className="stats">
            <Stat label="Model Hash" value="0x7f3a..." />
            <Stat label="Last Signal" value="HOLD" />
            <Stat label="Confidence" value="HIDDEN" />
          </div>
        </div>

        {/* Vault Status */}
        <div className="panel vault-panel">
          <h2>Shielded Vault</h2>
          <div className="balance">
            <span className="amount">{vaultBalance.toFixed(2)}</span>
            <span className="unit">SOL</span>
          </div>
          <div className="privacy-indicator">
            🛡️ Funding source: PRIVATE
          </div>
        </div>

        {/* Trade Log */}
        <div className="panel trades-panel">
          <h2>Shielded Trades</h2>
          <div className="trade-log">
            {trades.map((trade, i) => (
              <TradeRow key={i} trade={trade} />
            ))}
          </div>
          <p className="subtext">
            * Trade logic hidden in TEE
          </p>
        </div>
      </div>

      <footer>
        <p>Powered by MagicBlock TEE | Privacy Cash | Range Protocol</p>
      </footer>
    </div>
  );
};

const TradeRow: React.FC<{ trade: Trade }> = ({ trade }) => (
  <div className="trade-row">
    <span className="time">{trade.timestamp}</span>
    <span className="market">{trade.marketId.slice(0, 8)}...</span>
    <span className={`side ${trade.side.toLowerCase()}`}>
      {trade.side}
    </span>
    <span className="amount">
      {/* Amount hidden for privacy */}
      🔒 HIDDEN
    </span>
    <span className="status">{trade.status}</span>
  </div>
);
```

#### 4.2 Demo Script

```markdown
## SPECTRE Demo Flow

### 1. Introduction (30 sec)
- Problem: AI trading strategies leak to mempool
- Solution: SPECTRE's "Privacy Sandwich"

### 2. Funding Demo (1 min)
- Show Privacy Cash deposit
- Highlight: "Funding source cannot be traced"
- Show Range compliance check passing

### 3. Strategy Demo (1 min)
- Show TEE enclave initialization
- Highlight: "Strategy weights are encrypted"
- Show decision being made (signal only, not logic)

### 4. Trade Execution Demo (1 min)
- Show trade hitting PNP market
- Highlight: "Observers see the trade, not the why"
- Show position in terminal

### 5. Withdrawal Demo (30 sec)
- Request withdrawal
- Range compliance verification
- Funds released to clean address

### 6. Closing (30 sec)
- Recap: Private Funding → Private Execution → Public Settlement
- "The first institutional-grade confidential trading agent on Solana"
```

---

## 5. Testing Strategy

### 5.1 Test Pyramid

```
                    ┌─────────────┐
                    │   E2E/Demo  │  ← Full flow on devnet
                   ─┴─────────────┴─
                 ┌───────────────────┐
                 │   Integration     │  ← CPI, multi-account
                ─┴───────────────────┴─
              ┌───────────────────────────┐
              │        Unit Tests         │  ← Strategy, utils
             ─┴───────────────────────────┴─
```

### 5.2 Test Matrix

| Component | Test Type | Framework | Coverage Target |
|-----------|-----------|-----------|-----------------|
| Strategy Logic | Unit | `cargo test` | 100% |
| State Management | Unit | `cargo test` | 100% |
| Privacy Bridge | Integration | `solana-program-test` | 80% |
| TEE Delegation | Integration | `@magicblock/sdk` | 80% |
| PNP CPI | Integration | `anchor test` | 80% |
| Full Flow | E2E | Custom script | Critical paths |

### 5.3 Test Commands

```bash
# Unit tests
cargo test --lib

# Integration tests (local validator)
anchor test

# TEE tests (MagicBlock devnet)
TEE_MODE=true anchor test --provider.cluster https://tee.magicblock.app/

# Run specific test suite
cargo test phase1 -- --nocapture
cargo test phase2 -- --nocapture
cargo test phase3 -- --nocapture
```

### 5.4 Key Test Scenarios

```rust
// Critical path tests

#[test]
fn test_privacy_sandwich_full_flow() {
    // 1. User deposits via Privacy Cash → ZK commitment
    // 2. Commitment delegated to TEE agent
    // 3. Market data triggers strategy
    // 4. Strategy runs in TEE (encrypted)
    // 5. Trade executes on PNP
    // 6. User requests withdrawal
    // 7. Range compliance passes
    // 8. Funds released with ZK proof
}

#[test]
fn test_compliance_blocks_sanctioned_address() {
    // Verify high-risk addresses cannot withdraw
}

#[test]
fn test_strategy_determinism() {
    // Same inputs → same outputs (for attestation)
}

#[test]
fn test_tee_state_commitment() {
    // State changes in TEE commit to L1 correctly
}
```

---

## 6. Risk Analysis & Mitigations

### 6.1 Technical Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| tract binary too large | HIGH | MEDIUM | Use decision tree fallback |
| PNP devnet unstable | MEDIUM | MEDIUM | Mock market implementation |
| MagicBlock TEE access | HIGH | LOW | Early application, backup plan |
| Privacy Cash SDK gaps | MEDIUM | MEDIUM | Compatibility layer, mock proofs |
| Range API rate limits | LOW | LOW | Caching, batching |

### 6.2 Mitigation Details

**Binary Size Issue:**
```rust
// Cargo.toml feature flags
[features]
default = ["decision-tree"]
onnx = ["tract-onnx"]
decision-tree = []

// Compile with:
// cargo build --release                    # Uses decision tree
// cargo build --release --features onnx    # Uses ONNX (if size permits)
```

**PNP Fallback:**
```rust
#[cfg(feature = "mock-pnp")]
use crate::mock_pnp as pnp_program;

#[cfg(not(feature = "mock-pnp"))]
use pnp_exchange as pnp_program;
```

### 6.3 Contingency Plans

1. **If TEE access delayed:** Build and demo with encrypted logs instead of full TEE
2. **If Privacy Cash SDK unavailable:** Use mock ZK proofs, document integration path
3. **If PNP down:** Use mock market, show architecture completeness
4. **If time runs out:** Focus on Phase 1-2, mock Phase 3

---

## 7. Milestones & Checkpoints

### 7.1 Timeline Overview

```
Day 1  ████░░░░░░░ Foundation
Day 2  ████████░░░ Ghost Vault core
Day 3  ████████████ Phase 1 complete ✓ CHECKPOINT 1

Day 4  ████░░░░░░░ TEE setup
Day 5  ████████░░░ Strategy implementation
Day 6  ████████████ TEE integration
Day 7  ████████████ Phase 2 complete ✓ CHECKPOINT 2

Day 8  ████░░░░░░░ PNP interface
Day 9  ████████░░░ Crank script
Day 10 ████████████ Phase 3 complete ✓ CHECKPOINT 3

Day 11 ████████████ Polish & demo ✓ FINAL
```

### 7.2 Checkpoint Criteria

#### CHECKPOINT 1: Ghost Vault (End of Day 3)
- [ ] Anchor project scaffolded and compiles
- [ ] SpectreVault state struct defined
- [ ] Initialize instruction working
- [ ] Mock deposit instruction working
- [ ] Range compliance check implemented
- [ ] All Phase 1 tests passing
- [ ] Deployed to Solana devnet

**Deliverable:** Working vault that accepts deposits and checks compliance

#### CHECKPOINT 2: The Brain (End of Day 7)
- [ ] MagicBlock TEE configured
- [ ] Delegation/undelegation working
- [ ] Decision tree strategy implemented
- [ ] (Stretch) ONNX strategy working
- [ ] All Phase 2 tests passing
- [ ] Deployed to TEE devnet

**Deliverable:** Strategy running in TEE, making signals

#### CHECKPOINT 3: The Hand (End of Day 10)
- [ ] PNP CPI interface complete
- [ ] Trade execution working
- [ ] Position tracking implemented
- [ ] Crank script operational
- [ ] Full integration test passing
- [ ] Deployed to TEE devnet with PNP

**Deliverable:** Full trading loop operational

#### FINAL: Demo Ready (Day 11)
- [ ] Terminal UI functional
- [ ] Demo script prepared
- [ ] README updated
- [ ] Video recorded (if required)
- [ ] Submission complete

---

## 8. Agent Handoff Protocol

### 8.1 Context Preservation

If this conversation is interrupted, the next agent should:

1. **Read this document first:** `SPECTRE_MASTER_PLAN.md`
2. **Check current progress:** Review git log and test results
3. **Identify current phase:** Check which checkpoint was last completed
4. **Continue from checkpoint:** Use the test suite to verify state

### 8.2 Key Files Reference

```
spectre_protocol/
├── SPECTRE_MASTER_PLAN.md          # This document
├── README.md                        # Original spec
├── Anchor.toml                      # Project config
├── Cargo.toml                       # Rust dependencies
├── programs/
│   └── spectre/
│       ├── src/
│       │   ├── lib.rs              # Entry point
│       │   ├── instructions/       # Instruction handlers
│       │   │   ├── mod.rs
│       │   │   ├── initialize.rs
│       │   │   ├── fund_agent.rs
│       │   │   ├── execute_trade.rs
│       │   │   └── withdraw.rs
│       │   ├── state/              # Account structs
│       │   │   └── mod.rs
│       │   ├── strategy/           # Trading logic
│       │   │   ├── mod.rs
│       │   │   ├── decision_tree.rs
│       │   │   └── onnx_strategy.rs (optional)
│       │   ├── cpi/                # Cross-program invocation
│       │   │   ├── mod.rs
│       │   │   └── pnp_interface.rs
│       │   └── utils/              # Helpers
│       │       ├── mod.rs
│       │       ├── privacy_bridge.rs
│       │       └── compliance.rs
│       └── Cargo.toml
├── models/
│   ├── train_model.py              # Model training
│   └── trading_model.onnx          # Trained model
├── client/
│   └── src/
│       ├── crank.ts                # Market monitoring
│       └── terminal/               # Demo UI
├── tests/
│   ├── phase1_vault.rs
│   ├── phase2_brain.rs
│   └── phase3_integration.rs
└── migrations/
    └── deploy.ts
```

### 8.3 Critical Commands

```bash
# Build
anchor build

# Test locally
anchor test

# Test on TEE devnet
anchor test --provider.cluster https://tee.magicblock.app/

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to TEE
anchor deploy --provider.cluster https://tee.magicblock.app/

# Run crank
cd client && npx ts-node src/crank.ts
```

### 8.4 Environment Variables

```bash
# .env
SOLANA_RPC=https://api.devnet.solana.com
TEE_RPC=https://tee.magicblock.app/
RANGE_API_KEY=your_key_here
PNP_PROGRAM_ID=PNPxxx...
SPECTRE_PROGRAM_ID=SPECxxx...
WALLET_PATH=~/.config/solana/id.json
```

### 8.5 Handoff Checklist

When handing off to another agent:

- [ ] All code committed to git
- [ ] Current checkpoint status noted
- [ ] Any blockers documented
- [ ] Test results logged
- [ ] Environment variables documented
- [ ] Next steps clearly defined

---

## 9. Resources & References

### 9.1 Official Documentation

- [MagicBlock TEE Docs](https://docs.magicblock.gg/pages/tools/tee/introduction)
- [MagicBlock Ephemeral Rollups SDK](https://github.com/magicblock-labs/ephemeral-rollups-sdk)
- [Privacy Cash GitHub](https://github.com/Privacy-Cash/privacy-cash)
- [Privacy Cash SDK (Rust)](https://docs.rs/privacy-cash-sdk/latest/privacy_cash/)
- [PNP Exchange SDK](https://docs.pnp.exchange/pnp-sdk)
- [Range Protocol](https://www.range.org/)
- [Range Risk API Integration](https://www.range.org/blog/integrate-range-onchain-risk-verifier-into-your-solana-program)
- [tract ONNX](https://github.com/sonos/tract)

### 9.2 Solana/Anchor

- [Anchor Documentation](https://www.anchor-lang.com/docs)
- [Solana CPI Guide](https://solana.com/docs/core/cpi)
- [Anchor CPI Tutorial](https://www.anchor-lang.com/docs/basics/cpi)

### 9.3 Support Channels

- MagicBlock Discord: Request TEE access
- Privacy Cash: GitHub issues
- PNP Exchange: Twitter/X @predictandpump
- Range Protocol: Contact form at range.org

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **CAMM** | Confidential Autonomous Market Maker |
| **TEE** | Trusted Execution Environment (Intel TDX) |
| **PER** | Private Ephemeral Rollup (MagicBlock) |
| **CPI** | Cross-Program Invocation |
| **ZK** | Zero-Knowledge (proofs) |
| **MEV** | Maximal Extractable Value |
| **OFAC** | Office of Foreign Assets Control |
| **PDA** | Program Derived Address |

---

## Appendix B: Architecture Decision Records

### ADR-001: Strategy Implementation

**Decision:** Use decision tree as primary, ONNX as stretch goal

**Rationale:**
- tract-onnx binary size may exceed Solana limits
- Decision tree is provably correct and auditable
- ONNX adds complexity without guaranteed benefit

**Consequences:**
- Simpler implementation
- May miss some edge cases ONNX would catch
- Easier to explain to judges

### ADR-002: Privacy Cash Integration

**Decision:** Build compatibility layer with mock fallback

**Rationale:**
- SDK documentation may be incomplete
- Core functionality can be demonstrated with mocks
- Full integration is "nice to have"

**Consequences:**
- Working demo regardless of SDK status
- Clear path to production integration
- Judges can evaluate architecture vs implementation

### ADR-003: PNP Exchange

**Decision:** Build mock market as fallback

**Rationale:**
- Devnet stability unknown
- Architecture is the innovation, not market integration
- Mock demonstrates same capabilities

**Consequences:**
- Guaranteed working demo
- Can switch to real PNP if stable
- Judges evaluate design, not liquidity

---

*Document ends. Good luck, agent.*
