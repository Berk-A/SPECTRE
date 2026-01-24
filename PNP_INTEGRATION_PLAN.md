# PNP Exchange Integration Plan

## Overview

This plan outlines the integration of PNP Exchange SDK into SPECTRE Protocol for real prediction market trading. The integration follows established patterns from the Range Protocol and MagicBlock TEE integrations.

---

## Architecture

```
                    SPECTRE Protocol
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
    ▼                     ▼                     ▼
[TEE Client]      [Range Client]        [PNP Client]    <-- NEW
    │                     │                     │
    │                     │                     │
MagicBlock           Range API           PNP Exchange
  Devnet              (REST)             (Solana SDK)
```

### Integration Points

1. **TypeScript Client** (`client/src/pnp.ts`)
   - Wrap PNP SDK for SPECTRE-specific use cases
   - Market discovery and selection
   - Trade execution aligned with strategy signals
   - Position tracking and redemption

2. **On-Chain Interface** (existing `cpi/pnp_interface.rs`)
   - Already has mock market implementation
   - Position tracking structures ready
   - Trade parameters and results defined

3. **Strategy Integration**
   - Connect `TradeSignal` from strategy to PNP trades
   - Map Strong Buy/Buy → YES tokens
   - Map Strong Sell/Sell → NO tokens

---

## Implementation Tasks

### Task 1: Install PNP SDK and Dependencies

**Files Modified:**
- `spectre_protocol/package.json`

**Changes:**
```json
{
  "dependencies": {
    "pnp-sdk": "latest"
  }
}
```

---

### Task 2: Create PNP Client Module

**File:** `spectre_protocol/client/src/pnp.ts`

**Components:**

#### 2.1 Constants & Configuration
```typescript
// PNP Program Configuration
export const PNP_MAINNET_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const PNP_DEVNET_USDC = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
```

#### 2.2 Types & Interfaces
```typescript
export interface SpectreMarket {
  address: PublicKey;
  question: string;
  yesPrice: number;
  noPrice: number;
  endTime: Date;
  isResolved: boolean;
  liquidity: number;
  volume24h: number;
}

export interface TradeExecutionResult {
  success: boolean;
  signature?: string;
  sharesReceived?: number;
  executionPrice?: number;
  error?: string;
  marketAddress?: PublicKey;
  side: 'yes' | 'no';
  amountUsdc: number;
}

export interface PositionInfo {
  market: PublicKey;
  yesShares: number;
  noShares: number;
  entryPriceYes?: number;
  entryPriceNo?: number;
  unrealizedPnl?: number;
}
```

#### 2.3 SpectrePnpClient Class
```typescript
export class SpectrePnpClient {
  private pnpClient: PNPClient;
  private connection: Connection;
  private usdcMint: PublicKey;

  constructor(rpcUrl: string, privateKey?: Uint8Array | string, isDevnet?: boolean);

  // Market Discovery
  async fetchActiveMarkets(): Promise<SpectreMarket[]>;
  async fetchMarket(address: PublicKey): Promise<SpectreMarket | null>;

  // Trading
  async executeTrade(
    market: PublicKey,
    side: 'yes' | 'no',
    amountUsdc: number
  ): Promise<TradeExecutionResult>;

  async sellPosition(
    market: PublicKey,
    side: 'yes' | 'no',
    tokenAmount: number
  ): Promise<TradeExecutionResult>;

  // Position Management
  async getPositions(): Promise<PositionInfo[]>;
  async getPosition(market: PublicKey): Promise<PositionInfo | null>;

  // Redemption
  async redeemWinnings(market: PublicKey): Promise<{success: boolean; signature?: string}>;

  // Strategy Integration
  async executeSignalTrade(
    signal: TradeSignal,
    positionSizeUsdc: number,
    market?: PublicKey
  ): Promise<TradeExecutionResult>;

  // Market Selection
  selectMarketForSignal(
    markets: SpectreMarket[],
    signal: TradeSignal,
    minLiquidity?: number
  ): SpectreMarket | null;
}
```

---

### Task 3: Strategy-to-Trade Integration

**Purpose:** Connect the decision tree strategy signals to PNP trades

**Mapping:**
| Strategy Signal | PNP Action | Token Side |
|-----------------|------------|------------|
| StrongBuy | Buy | YES |
| Buy | Buy | YES |
| Hold | No trade | - |
| Sell | Buy | NO |
| StrongSell | Buy | NO |

**Position Sizing:**
| Signal Strength | Position Size |
|-----------------|---------------|
| Strong (StrongBuy/StrongSell) | 10% of vault balance |
| Normal (Buy/Sell) | 5% of vault balance |
| Hold | 0% (no trade) |

---

### Task 4: Market Selection Logic

**File:** Integrated into `SpectrePnpClient`

**Algorithm:**
1. Filter markets by:
   - Not resolved
   - Has sufficient liquidity (configurable minimum)
   - End time > current time + buffer

2. Score markets by:
   - Price opportunity (deviation from 50%)
   - Liquidity depth
   - Volume activity

3. Select highest scoring market that matches signal direction

```typescript
interface MarketSelectionCriteria {
  minLiquidity: number;           // Minimum USDC liquidity (default: 100)
  minTimeToExpiry: number;        // Minimum hours until expiry (default: 24)
  maxPriceDeviation: number;      // Max deviation from 50% for selection (default: 0.4)
  preferredCategories?: string[]; // Optional category filter
}
```

---

### Task 5: Create Comprehensive Test Suite

**File:** `spectre_protocol/tests/pnp_integration.ts`

#### Test Categories:

**5.1 Unit Tests (Mock SDK)**
- Client initialization
- Market data parsing
- Trade parameter validation
- Position size calculation
- Market selection algorithm
- Signal-to-trade mapping

**5.2 Integration Tests (Devnet)**
- Fetch real markets from PNP
- Execute test trades with small amounts
- Verify position tracking
- Test redemption flow

**5.3 Edge Cases**
- No suitable market available
- Insufficient liquidity
- Market about to expire
- Trade amount below minimum
- Network errors and retries
- Slippage protection

**5.4 Error Handling**
- Invalid market address
- Wallet without USDC balance
- PNP SDK errors
- Timeout handling

---

### Task 6: Update Index Exports

**File:** `spectre_protocol/client/src/index.ts`

Add PNP exports:
```typescript
export {
  // Client
  SpectrePnpClient,
  createPnpClientFromEnv,
  // Types
  SpectreMarket,
  TradeExecutionResult,
  PositionInfo,
  MarketSelectionCriteria,
  // Utilities
  signalToTradeSide,
  calculatePositionSize,
  selectBestMarket,
  // Constants
  PNP_MAINNET_USDC,
  PNP_DEVNET_USDC,
  DEFAULT_SELECTION_CRITERIA,
} from './pnp';
```

---

## Implementation Order

1. **Phase 1: Core Client** (Task 2)
   - Create basic PnpClient wrapper
   - Implement market fetching
   - Implement basic trade execution

2. **Phase 2: Strategy Integration** (Tasks 3, 4)
   - Add signal-to-trade mapping
   - Implement market selection logic
   - Connect to strategy outputs

3. **Phase 3: Testing** (Task 5)
   - Write comprehensive test suite
   - Test on devnet with real PNP markets

4. **Phase 4: Polish** (Tasks 1, 6)
   - Update package.json
   - Export from index.ts
   - Documentation updates

---

## Key Technical Decisions

### 1. SDK vs Direct Calls
**Decision:** Use PNP SDK
**Rationale:**
- Official SDK handles complex account derivation
- Built-in transaction building
- Maintained by PNP team
- Reduced integration complexity

### 2. USDC vs SOL
**Decision:** Use USDC as collateral
**Rationale:**
- PNP markets use USDC as standard collateral
- Stable value for position tracking
- Matches existing vault structure

### 3. Market Selection Strategy
**Decision:** Automated selection based on liquidity and timing
**Rationale:**
- Strategy signals don't specify markets
- Need intelligent market matching
- Configurable criteria for flexibility

### 4. Error Recovery
**Decision:** Fail-safe with detailed error reporting
**Rationale:**
- Trading errors should not crash vault
- Detailed errors help debugging
- Allows retry logic at caller level

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| PNP SDK breaking changes | Pin specific version, have fallback |
| Market illiquidity | Minimum liquidity requirements, graceful skip |
| Slippage | Configurable slippage tolerance, market orders only initially |
| USDC availability | Pre-check balance before trade |
| Network issues | Retry logic with exponential backoff |

---

## Testing Checklist

### Unit Tests
- [ ] Client initialization (with/without private key)
- [ ] Market data transformation
- [ ] Signal-to-side mapping (all 5 signals)
- [ ] Position size calculation (strong vs normal)
- [ ] Market selection (various scenarios)
- [ ] Trade validation (amount bounds, slippage)

### Integration Tests (Devnet)
- [ ] Fetch real markets from PNP devnet
- [ ] Buy YES tokens on test market
- [ ] Buy NO tokens on test market
- [ ] Sell position back to market
- [ ] Check positions after trade
- [ ] Redeem from resolved market

### Edge Cases
- [ ] No markets available → graceful return
- [ ] All markets expired → graceful return
- [ ] Insufficient USDC → clear error
- [ ] Below minimum trade → validation error
- [ ] Network timeout → retry/fail gracefully
- [ ] PNP program unavailable → error handling

### End-to-End Flow
- [ ] Strategy signal → market selection → trade execution → position tracking
- [ ] Full cycle: deposit → trade → close position → withdrawal

---

## Success Criteria

### Minimum Viable Integration
- [x] PNP SDK installed and configured
- [x] Can fetch active markets from PNP
- [x] Can execute a trade (buy YES/NO)
- [x] Trade execution returns proper result
- [x] 20+ unit tests passing

### Full Integration
- [x] All unit tests passing
- [x] Devnet integration tests passing
- [x] Strategy signals map to trades
- [x] Market selection works intelligently
- [x] Position tracking accurate
- [x] Error handling comprehensive

---

## API Reference (PNP SDK)

### PNPClient Constructor
```typescript
new PNPClient(rpcUrl: string, privateKey?: string | Uint8Array)
```

### Trading Methods
```typescript
// Buy tokens
client.trading.buyTokensUsdc({
  market: PublicKey,
  buyYesToken: boolean,
  amountUsdc: number  // In USDC units (not base units)
})

// Sell tokens
client.trading.sellOutcome({
  market: PublicKey,
  outcome: 'yes' | 'no',
  tokenAmount: number
})
```

### Market Methods
```typescript
// Fetch all markets
client.fetchMarkets()

// Fetch specific market
client.fetchMarket(market: PublicKey)

// Fetch market addresses
client.fetchMarketAddresses()
```

### Redemption
```typescript
client.redeemPosition(market: PublicKey)
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add pnp-sdk dependency |
| `client/src/pnp.ts` | Create | Main PNP client implementation |
| `client/src/index.ts` | Modify | Add PNP exports |
| `tests/pnp_integration.ts` | Create | Comprehensive test suite |

---

## Dependencies

- `pnp-sdk`: PNP Exchange SDK
- `@solana/web3.js`: Solana Web3 (already installed)
- `@coral-xyz/anchor`: Anchor framework (already installed)

---

*Plan created for SPECTRE Protocol PNP Exchange integration*
