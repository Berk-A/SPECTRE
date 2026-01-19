# Project Spectre: The Confidential Autonomous Market Maker (CAMM)

## 1. Executive Summary

**Project Spectre** (Strategic Private Execution & Confidential Trading Runtime Environment) is a **Confidential Autonomous Market Maker** designed to solve the "Alpha Leakage" problem in on-chain prediction markets. Currently, any AI agent trading on-chain reveals its strategy (logic, weights, and intent) to the public mempool, allowing MEV bots and copy-traders to front-run and erode its edge.

Spectre operates as a "Dark Pool" for prediction market liquidity. It encapsulates a Rust-based quantitative trading strategy inside a **MagicBlock Trusted Execution Environment (TEE)**. This agent is funded via **Privacy Cash** (shielded deposits) and executes trades on **PNP Exchange** (prediction markets). By keeping the strategy logic and the capital source opaque, Spectre creates the first institutional-grade, privacy-preserving trading bot on Solana.

**Why this wins:** It creates a "Privacy Sandwich" (Private Funding  Private Execution  Public Settlement) that hits four separate prize tracks simultaneously.

---

## 2. Technical Architecture

The architecture follows a three-layer design: **The Shield (Funding)**, **The Brain (Execution)**, and **The Hand (Settlement)**.

### Layer 1: The Shield (Funding & Compliance)

**Goal:** Fund the bot without linking the wallet to a known public identity.

* **Technology:** `privacy-cash` SDK (Rust) + **Range Protocol** API.
* **Workflow:**
1. **Deposit:** User deposits SOL/USDC into the Spectre Vault via `privacy-cash` SDK. This generates a ZK "note" (commitment) representing the claim to funds.
2. **Delegation:** The user "delegates" this note to the TEE Agent's keypair.
3. **Withdrawal/Exit:** When a user wants to withdraw profits, the system calls **Range Protocol** to verify the withdrawal address is not sanctioned (OFAC check), generating a "Proof of Innocence" before releasing funds.



### Layer 2: The Brain (Confidential Compute)

**Goal:** Execute trading logic without revealing the algorithm.

* **Technology:** **MagicBlock Private Ephemeral Rollup (PER)** running on **Intel TDX**.
* **The Engine:** A standard Solana Anchor program deployed to the Ephemeral Rollup.
* **The Logic:** Instead of a heavy LLM (which is too slow/expensive), use **Rust-native inference** via the `tract` crate (a tiny, embeddable neural network runner).
* **Input:** Market Odds (from PNP), Sentiment Score (Oracle), Volatility.
* **Model:** A pre-trained ONNX model (Logistic Regression or Simple Neural Net) loaded into the TEE memory.
* **Output:** Buy/Sell Signal.


* **Privacy Guarantee:** Because this runs in a TEE, the memory is encrypted. Observers see the *result* (a trade instruction), but not the *weights* or *logic* that triggered it.

### Layer 3: The Hand (Market Settlement)

**Goal:** Execute the trade on a permissionless market.

* **Technology:** **PNP Exchange** Program via Cross-Program Invocation (CPI).
* **Mechanism:**
1. The TEE Agent signs a transaction.
2. MagicBlock settles this transaction to Solana L1.
3. The transaction calls `pnp_program::cpi::trade()` to buy "YES" or "NO" shares on a specific market.



---

## 3. Engineering Scaffold & Implementation Plan

**Prerequisites:**

* Rust 1.85+, Solana CLI 1.18+, Anchor 0.30+
* Node.js 20+
* MagicBlock SDK (`ephemeral-rollups-sdk`)

### Phase 1: The "Ghost Vault" (Days 1-3)

**Objective:** Create a program that accepts private funding.

1. **Scaffold Anchor Project:**
```bash
anchor init spectre_protocol

```


2. **Integrate Privacy Cash:**
* *Note:* Since Privacy Cash has no frontend, you must build a simple CLI or UI for the deposit.
* Use the `privacy-cash` crate to generate a "Note".
* Create an Anchor instruction `fund_agent` that accepts a ZK proof of deposit.


3. **Setup Range Protocol:**
* Register for a Range API key.
* Create a helper function `check_compliance(address)` that queries Range before allowing any `withdraw` instruction.



### Phase 2: The "Brain" in the TEE (Days 4-7)

**Objective:** Deploy the trading logic to MagicBlock's TEE.

1. **Configure MagicBlock:**
* Update `Anchor.toml` to point to the MagicBlock TEE Devnet:
```toml
[programs.devnet]
spectre = "Your_Program_ID"
[validator]
url = "https://tee.magicblock.app"

```




2. **Implement Trading Logic (The "Alpha"):**
* Add `tract-onnx` to `Cargo.toml`.
* **Crucial Step:** Train a tiny model in Python (scikit-learn) to predict a simple outcome (e.g., "If YES price < 0.4 and trend is UP, buy YES"). Export as `.onnx`.
* Embed the `.onnx` file into your Rust binary using `include_bytes!`.
* Write the inference function:
```rust
pub fn run_inference(price: f32, trend: f32) -> bool {
    let model = tract_onnx::onnx().model_for_read(&mut ONNX_BYTES).unwrap();
    //... run inference...
    return result > 0.5; // Buy signal
}

```




3. **Deploy to TEE:**
* Use the `#[ephemeral]` macro from MagicBlock SDK to mark your program as capable of running in the rollup.
* Deploy and verify attestation (MagicBlock provides a CLI tool for this).



### Phase 3: The "Hand" Integration (Days 8-10)

**Objective:** Connect the brain to PNP Markets.

1. **PNP Interface:**
* Fetch the **PNP Exchange IDL** (from their devnet program address).
* Generate the CPI helper using `anchor-gen` or manually define the interface:
```rust
#[derive(Accounts)]
pub struct PlaceBet<'info> {
    pub market: AccountInfo<'info>,
    pub user: Signer<'info>,
    //... PNP specific accounts
}

```




2. **The Loop:**
* Create a "Crank" script (Node.js) that runs locally.
* The Crank watches PNP markets. When a condition is met (e.g., new market created), it pings your TEE agent.
* The TEE agent runs `run_inference` internally.
* If `true`, it fires the CPI to PNP to execute the trade.



### Phase 4: Final Polish (Day 11)

* **UI:** Build a "Spectre Terminal" dashboard. It should show "Encrypted Strategy Active" and a log of "Shielded Trades" (where amounts/logic are hidden).
* **Submission:** Ensure your README clearly links the repositories for the Contract, the UI, and the ZK Circuits (from Privacy Cash).

## 4. Feasibility Checklist & "Gotchas"

* **Tract Size:** The `tract` crate is heavy. If you hit the Solana program size limit (deployment fails), switch to a simple **Decision Tree** implemented in raw Rust (if/else logic). Do not get stuck fighting the compiler.
* **PNP Devnet:** If PNP Exchange devnet is unstable, **mock it**. Create a simple "Mock Market" program that accepts bets. Judges care about the *architecture* (TEE + Privacy), not the liquidity of the test market.
* **MagicBlock TEE:** You must use their specific devnet RPC (`https://tee.magicblock.app`). Standard devnet will not give you the privacy features.

## 5. Version Control & Debugging

* **Branching:** Use `feature/layer-1-funding`, `feature/layer-2-brain` branches.
* **Debugging TEE:** You cannot `msg!()` log from inside the encrypted memory easily visible to the public explorer. Use the MagicBlock "Console" or local emulation mode (`solana-test-validator` with the TEE flag) to see logs during development.

This project is a high-conviction winner because it doesn't just "add privacy"—it creates a **new financial primitive** (Confidential AMM) that is impossible on Ethereum (too slow/expensive) and impossible on standard Solana (too transparent). It fits perfectly into the "Privacy Hack" narrative.