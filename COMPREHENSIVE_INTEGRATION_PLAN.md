# SPECTRE Protocol - Comprehensive Integration Plan

## Executive Summary

This document provides a rigorous, step-by-step plan to fully integrate all four external systems (MagicBlock TEE, Range Protocol, PNP Exchange, PrivacyCash) into SPECTRE Protocol. The goal is to transform the current "beautiful POC" into a fully functional system suitable for hackathon demonstration and future production use.

---

## Current State Analysis

### Integration Status Matrix

| Component | Code Complete | SDK Connected | Tested on Devnet | Production Ready |
|-----------|---------------|---------------|------------------|------------------|
| MagicBlock TEE | 90% | YES | PARTIAL | NO |
| Range Protocol | 95% | YES | YES | YES |
| PNP Exchange | 85% | FALLBACK MOCK | NO | NO |
| PrivacyCash | 80% | FALLBACK MOCK | NO | NO |
| Frontend | 85% | N/A | DEMO ONLY | NO |

### Key Issues Identified

1. **PNP Exchange**: SDK import fails silently, falls back to mock client
2. **PrivacyCash**: SDK import fails silently, uses SHA-256 instead of Poseidon
3. **MagicBlock TEE**: Delegation works but strategy execution in TEE not implemented
4. **Frontend**: DEMO_MODE = true, all operations mocked
5. **Program IDs**: Some placeholders remain in Rust code

---

## Phase 1: PNP Exchange Integration (Priority: HIGH)

### 1.1 Verify SDK Installation and Import

**File:** `spectre_protocol/client/src/pnp.ts`

**Issue:** Line 578 uses dynamic `require('pnp-sdk')` which fails silently

**Fix:**
```typescript
// Current (problematic):
try {
  const { PNPClient } = require('pnp-sdk');
  // ...
} catch (error: any) {
  console.warn('PNP SDK initialization warning:', error.message);
  this.pnpClient = this.createMockClient(); // Falls back to mock
}

// Required changes:
// 1. Add proper error handling with detailed logging
// 2. Verify SDK version compatibility
// 3. Test SDK import in isolation
```

**Tasks:**
- [ ] Create standalone SDK test script
- [ ] Verify `pnp-sdk@0.2.6` exports `PNPClient` class
- [ ] Check SDK documentation for correct import syntax
- [ ] Add environment variable to disable mock fallback

### 1.2 Test Market Discovery

**File:** `spectre_protocol/tests/pnp_integration.ts`

**Tests to Execute:**
```bash
# Run PNP-specific tests
cd spectre_protocol
npx ts-mocha -p ./tsconfig.json tests/pnp_integration.ts --grep "devnet"
```

**Validation Checklist:**
- [ ] `fetchMarketAddresses()` returns real market addresses
- [ ] `fetchActiveMarkets()` returns normalized `SpectreMarket` objects
- [ ] `fetchMarket(address)` returns specific market details
- [ ] Markets have valid YES/NO prices
- [ ] Markets have valid end times

### 1.3 Execute Test Trade

**Requirements:**
1. Wallet with devnet SOL (for fees)
2. Wallet with devnet USDC (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`)
3. Active market with liquidity

**Test Script:**
```typescript
// tests/pnp_live_test.ts
import { SpectrePnpClient } from '../client/src/pnp';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

async function testLiveTrade() {
  // Load keypair from file
  const keypairData = JSON.parse(fs.readFileSync(
    process.env.SOLANA_KEYPAIR_PATH || '~/.config/solana/id.json',
    'utf-8'
  ));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

  // Create client with real keypair
  const client = new SpectrePnpClient(
    'https://api.devnet.solana.com',
    keypair,
    true // isDevnet
  );

  // 1. Check USDC balance
  const balance = await client.getUsdcBalance();
  console.log(`USDC Balance: ${balance}`);

  if (balance < 1) {
    console.error('Insufficient USDC balance. Need at least 1 USDC.');
    return;
  }

  // 2. Fetch active markets
  const markets = await client.fetchActiveMarkets();
  console.log(`Found ${markets.length} active markets`);

  if (markets.length === 0) {
    console.error('No active markets found.');
    return;
  }

  // 3. Select first market
  const market = markets[0];
  console.log(`Selected market: ${market.question}`);
  console.log(`  YES price: ${market.yesPrice}`);
  console.log(`  NO price: ${market.noPrice}`);

  // 4. Execute small test trade
  const result = await client.executeTrade(
    market.address,
    'yes', // Buy YES tokens
    1 // 1 USDC
  );

  console.log('Trade result:', result);

  if (result.success) {
    console.log('SUCCESS! Trade executed.');
    console.log(`  Signature: ${result.signature}`);
    console.log(`  Shares received: ${result.sharesReceived}`);
  } else {
    console.error('FAILED:', result.error);
  }
}

testLiveTrade().catch(console.error);
```

### 1.4 Integration with Strategy Signals

**Files to Modify:**
- `client/src/pnp.ts` - Ensure `executeSignalTrade()` uses real SDK
- `programs/spectre_protocol/src/lib.rs` - Update `execute_trade` instruction

**Test Flow:**
1. Generate signal: `TradeSignal::StrongBuy`
2. Map signal to side: `'yes'`
3. Calculate position size: `10% of vault balance`
4. Select market: Use `selectBestMarket()`
5. Execute trade: `executeTrade(market, 'yes', amount)`
6. Verify position: Check token balances

---

## Phase 2: PrivacyCash Integration (Priority: HIGH)

### 2.1 Verify SDK Installation and Import

**File:** `spectre_protocol/client/src/privacy.ts`

**Issue:** Line 547 uses dynamic `require('privacycash')` which may fail

**SDK Documentation Check:**
```bash
# Check installed version
npm ls privacycash

# Check what the SDK exports
node -e "console.log(Object.keys(require('privacycash')))"
```

**Expected Exports:**
- `PrivacyCash` class
- `deposit(amount)` method
- `withdraw(amount, recipient)` method
- `getPrivateBalance()` method

### 2.2 Replace Mock Hash Functions

**Current Implementation (SHA-256):**
```typescript
// client/src/privacy.ts:256-258
const hash = crypto.createHash('sha256').update(data).digest();
return new Uint8Array(hash);
```

**Required Implementation (Poseidon):**
```typescript
// If PrivacyCash SDK provides Poseidon:
import { poseidon } from 'privacycash';

export function generateCommitment(
  secret: Uint8Array,
  nullifier: Uint8Array,
  amount: number
): Uint8Array {
  // Use SDK's Poseidon hash
  return poseidon.hash([secret, nullifier, amount]);
}
```

**Alternative:** If SDK doesn't expose Poseidon, use `circomlibjs`:
```bash
npm install circomlibjs
```

```typescript
import { buildPoseidon } from 'circomlibjs';

let poseidon: any;

async function initPoseidon() {
  poseidon = await buildPoseidon();
}

export function generateCommitment(
  secret: Uint8Array,
  nullifier: Uint8Array,
  amount: number
): Uint8Array {
  const hash = poseidon.F.toObject(
    poseidon([secret, nullifier, BigInt(amount)])
  );
  return new Uint8Array(hash.toArray('be', 32));
}
```

### 2.3 Test Shield Operation

**Test Script:**
```typescript
// tests/privacy_live_test.ts
import { SpectrePrivacyClient, formatShieldResult } from '../client/src/privacy';
import { Keypair } from '@solana/web3.js';

async function testShield() {
  const keypair = Keypair.generate(); // Or load from file

  const client = new SpectrePrivacyClient(
    'https://api.devnet.solana.com',
    keypair,
    true
  );

  // Check wallet balance
  const balance = await client.getWalletBalance();
  console.log(`Wallet balance: ${balance / 1e9} SOL`);

  if (balance < 0.1 * 1e9) {
    console.error('Insufficient SOL balance. Need at least 0.1 SOL.');
    return;
  }

  // Execute shield
  const result = await client.shieldSol(0.01); // Shield 0.01 SOL

  console.log(formatShieldResult(result));

  if (result.success && result.note) {
    console.log('\nIMPORTANT: Save this note!');
    const serialized = client.serializeNote(result.note);
    console.log(`Note: ${serialized.slice(0, 50)}...`);
  }
}

testShield().catch(console.error);
```

### 2.4 Test Unshield Operation

**Test Script:**
```typescript
async function testUnshield(noteString: string) {
  const client = new SpectrePrivacyClient(rpcUrl, keypair, true);

  // Deserialize the note
  const note = client.deserializeNote(noteString);

  // Validate
  const validation = client.validateNote(note);
  if (!validation.valid) {
    console.error('Invalid note:', validation.error);
    return;
  }

  // Create new recipient (privacy: different address!)
  const recipient = Keypair.generate().publicKey;

  // Execute unshield
  const result = await client.unshieldSol(note, recipient);

  console.log(formatUnshieldResult(result));
}
```

### 2.5 Update On-Chain ZK Verification

**File:** `programs/spectre_protocol/src/utils/privacy_bridge.rs`

**Current Mock:**
```rust
pub fn verify_deposit_proof(proof: &ZkProof) -> DepositVerification {
    // Simple mock verification - accepts any well-formed proof
    // In production, this would verify the actual groth16/plonk proof
    // ...
}
```

**Production Implementation:**
```rust
// Option A: CPI to PrivacyCash program
pub fn verify_deposit_proof_cpi<'info>(
    proof: &ZkProof,
    privacy_cash_program: &AccountInfo<'info>,
    // ... other accounts
) -> Result<DepositVerification> {
    // Call PrivacyCash's verify instruction
    let cpi_accounts = VerifyProof {
        // ... accounts
    };
    privacy_cash::cpi::verify_proof(cpi_context, proof)?;

    Ok(DepositVerification {
        valid: true,
        // ...
    })
}

// Option B: On-chain Groth16 verification (expensive!)
// Requires Solana's alt_bn128 precompile
```

---

## Phase 3: MagicBlock TEE Integration (Priority: MEDIUM)

### 3.1 Verify Delegation Works

**Current Status:** Code exists, needs testing

**Test Commands:**
```bash
# Test on MagicBlock devnet
cd spectre_protocol
anchor test --provider.cluster https://devnet.magicblock.app/
```

**Manual Test Script:**
```typescript
// tests/tee_live_test.ts
import { SpectreTeeCient } from '../client/src/tee';
import { Program, AnchorProvider } from '@coral-xyz/anchor';

async function testDelegation() {
  // Setup provider
  const provider = AnchorProvider.env();
  const program = new Program(IDL, provider);

  // Create TEE client
  const teeClient = new SpectreTeeCient(
    provider,
    SPECTRE_PROGRAM_ID
  );
  teeClient.setProgram(program);

  // Check current status
  const status = await teeClient.checkDelegationStatus(provider.wallet.publicKey);
  console.log('Current delegation status:', status);

  if (status.isDelegated) {
    console.log('Vault already delegated. Undelegating first...');
    await teeClient.undelegateVault(provider.wallet.publicKey, true);
    await teeClient.waitForUndelegation(provider.wallet.publicKey);
  }

  // Delegate vault
  console.log('Delegating vault to TEE...');
  const result = await teeClient.delegateVault(provider.wallet.publicKey);

  if (result.success) {
    console.log('Delegation successful!');
    console.log('  Signature:', result.signature);
    console.log('  Vault PDA:', result.vaultPda.toString());
  } else {
    console.error('Delegation failed:', result.error);
  }
}

testDelegation().catch(console.error);
```

### 3.2 Implement Strategy Execution in TEE

**File:** `programs/spectre_protocol/src/lib.rs`

**Current:** Strategy execution happens on L1

**Required:** Execute strategy within TEE enclave

```rust
/// Execute strategy in TEE context
/// This instruction can ONLY be called when vault is delegated
pub fn execute_strategy_in_tee(
    ctx: Context<ExecuteStrategyInTee>,
    market_input: MarketInput,
) -> Result<()> {
    let vault = &ctx.accounts.vault;

    // Verify vault is delegated (owner is delegation program)
    // The TEE ensures this execution is confidential

    // Run decision tree strategy
    let signal = run_inference(&market_input, &ctx.accounts.strategy_config.params);

    msg!("TEE Strategy Signal: {:?}", signal);

    // Signal can be used to execute trade via CPI
    // (trade execution would also happen in TEE)

    Ok(())
}
```

### 3.3 Add TEE-Specific Trade Execution

**Flow:**
1. Vault delegated to TEE
2. Strategy generates signal (confidential)
3. Trade executed via CPI to PNP (still in TEE)
4. Position recorded
5. State committed to L1 every ~3 seconds

---

## Phase 4: Frontend Integration (Priority: MEDIUM)

### 4.1 Make DEMO_MODE Configurable

**File:** `app/src/lib/config/constants.ts`

```typescript
// Current:
export const DEMO_MODE = true

// Change to:
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
  || import.meta.env.MODE === 'development'
```

**File:** `.env.development`
```
VITE_DEMO_MODE=true
```

**File:** `.env.production`
```
VITE_DEMO_MODE=false
```

### 4.2 Update Hook Implementations

**File:** `app/src/hooks/usePrivacy.ts`

```typescript
export function usePrivacy() {
  const { clients } = useSpectreClient()
  const { publicKey } = useWallet()

  const shieldSol = useCallback(async (amountSol: number) => {
    if (!publicKey || !clients.privacy) {
      return { success: false, error: 'Not connected' }
    }

    // Remove DEMO_MODE check - always try real operation
    // Only fall back to demo if real operation fails
    try {
      const result = await clients.privacy.shieldSol(amountSol)
      if (result.success) {
        return result
      }
      // If real operation fails, optionally show error
      // instead of falling back to demo
      console.error('Real shield failed:', result.error)
      return result
    } catch (error) {
      console.error('Shield error:', error)
      return { success: false, error: String(error) }
    }
  }, [publicKey, clients.privacy])

  // ... similar changes for other methods
}
```

### 4.3 Fix Status Indicators

**File:** `app/src/components/dashboard/StatusIndicators.tsx`

**Current Issue:** Shows "Inactive" for everything

**Fix:**
```typescript
interface SystemStatus {
  privacyPool: 'active' | 'syncing' | 'inactive'
  teeEnclave: 'active' | 'syncing' | 'inactive'
  pnpMarkets: 'active' | 'limited' | 'inactive'
  rangeOracle: 'active' | 'syncing' | 'inactive'
}

function useSystemStatus(): SystemStatus {
  const [status, setStatus] = useState<SystemStatus>({
    privacyPool: 'syncing',
    teeEnclave: 'syncing',
    pnpMarkets: 'syncing',
    rangeOracle: 'syncing',
  })

  useEffect(() => {
    async function checkStatus() {
      // Check PrivacyCash program
      try {
        const info = await connection.getAccountInfo(PRIVACY_CASH_PROGRAM_ID)
        setStatus(s => ({ ...s, privacyPool: info ? 'active' : 'inactive' }))
      } catch {
        setStatus(s => ({ ...s, privacyPool: 'inactive' }))
      }

      // Check MagicBlock TEE endpoint
      try {
        const teeConnection = new Connection(TEE_RPC_ENDPOINT)
        await teeConnection.getVersion()
        setStatus(s => ({ ...s, teeEnclave: 'active' }))
      } catch {
        setStatus(s => ({ ...s, teeEnclave: 'inactive' }))
      }

      // Check PNP markets
      try {
        const markets = await pnpClient.fetchActiveMarkets()
        setStatus(s => ({
          ...s,
          pnpMarkets: markets.length > 0 ? 'active' : 'limited'
        }))
      } catch {
        setStatus(s => ({ ...s, pnpMarkets: 'inactive' }))
      }

      // Check Range API
      try {
        const response = await fetch('https://api.range.org/v1/health')
        setStatus(s => ({
          ...s,
          rangeOracle: response.ok ? 'active' : 'inactive'
        }))
      } catch {
        setStatus(s => ({ ...s, rangeOracle: 'inactive' }))
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 30000) // Check every 30s
    return () => clearInterval(interval)
  }, [])

  return status
}
```

### 4.4 Add Demo Data Pre-population

**File:** `app/src/stores/privacyStore.ts`

```typescript
// Add initial demo state
const initialState = {
  shieldedBalance: 0,
  notes: [],
  // Demo mode initial data
  ...(DEMO_MODE && {
    shieldedBalance: 2.5 * 1e9, // 2.5 SOL
    notes: [
      {
        id: 'demo_note_1',
        commitment: 'demo_commitment_1',
        amount: 1 * 1e9,
        tokenType: 'SOL',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        spent: false,
      },
      {
        id: 'demo_note_2',
        commitment: 'demo_commitment_2',
        amount: 1.5 * 1e9,
        tokenType: 'SOL',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        spent: false,
      },
    ],
  }),
}
```

---

## Phase 5: End-to-End Testing (Priority: HIGH)

### 5.1 Create Full Flow Test

**File:** `tests/full_flow.ts`

```typescript
/**
 * SPECTRE Full Flow Test
 *
 * Tests the complete user journey:
 * 1. Private Deposit via PrivacyCash
 * 2. TEE Delegation via MagicBlock
 * 3. Strategy Execution
 * 4. Trade Execution via PNP
 * 5. Compliance Check via Range
 * 6. Private Withdrawal
 */

describe('SPECTRE Full Flow', () => {
  let privacyClient: SpectrePrivacyClient;
  let teeClient: SpectreTeeCient;
  let pnpClient: SpectrePnpClient;
  let rangeClient: RangeClient;
  let depositNote: DepositNote;

  before(async () => {
    // Initialize all clients
    privacyClient = new SpectrePrivacyClient(RPC_URL, keypair, true);
    teeClient = new SpectreTeeCient(provider, PROGRAM_ID);
    pnpClient = new SpectrePnpClient(RPC_URL, keypair, true);
    rangeClient = new RangeClient(RANGE_API_KEY);
  });

  it('Step 1: Shield SOL via PrivacyCash', async () => {
    const result = await privacyClient.shieldSol(0.1);
    expect(result.success).to.be.true;
    expect(result.note).to.exist;
    depositNote = result.note!;
    console.log('  Shield successful:', result.signature);
  });

  it('Step 2: Initialize SPECTRE Vault', async () => {
    const tx = await program.methods
      .initialize()
      .accounts({ /* ... */ })
      .rpc();
    console.log('  Vault initialized:', tx);
  });

  it('Step 3: Fund Vault with ZK Proof', async () => {
    const proof = createZkProof(depositNote);
    const tx = await program.methods
      .fundAgent(proof)
      .accounts({ /* ... */ })
      .rpc();
    console.log('  Vault funded:', tx);
  });

  it('Step 4: Delegate Vault to TEE', async () => {
    const result = await teeClient.delegateVault(authority);
    expect(result.success).to.be.true;
    console.log('  Delegated to TEE:', result.signature);
  });

  it('Step 5: Initialize Strategy', async () => {
    const tx = await program.methods
      .initializeStrategy()
      .accounts({ /* ... */ })
      .rpc();
    console.log('  Strategy initialized:', tx);
  });

  it('Step 6: Generate Trade Signal', async () => {
    const marketInput = {
      price: 450, // 0.45
      trend: 200, // +0.2
      volatility: 150, // 0.15
    };

    const tx = await program.methods
      .generateTradeSignal(marketInput)
      .accounts({ /* ... */ })
      .rpc();
    console.log('  Signal generated:', tx);
  });

  it('Step 7: Execute Trade on PNP', async () => {
    const markets = await pnpClient.fetchActiveMarkets();
    expect(markets.length).to.be.gt(0);

    const result = await pnpClient.executeSignalTrade(
      'StrongBuy',
      50, // 50 USDC
      markets[0].address
    );
    expect(result.success).to.be.true;
    console.log('  Trade executed:', result.signature);
  });

  it('Step 8: Undelegate from TEE', async () => {
    const result = await teeClient.undelegateVault(authority, true);
    expect(result.success).to.be.true;
    console.log('  Undelegated from TEE:', result.signature);

    // Wait for L1 sync
    const synced = await teeClient.waitForUndelegation(authority);
    expect(synced).to.be.true;
  });

  it('Step 9: Check Compliance via Range', async () => {
    const assessment = await rangeClient.getAddressRisk(recipient);
    expect(assessment.riskScore).to.be.lte(30);
    expect(assessment.isSanctioned).to.be.false;
    console.log('  Compliance passed, risk score:', assessment.riskScore);
  });

  it('Step 10: Request Withdrawal', async () => {
    const tx = await program.methods
      .requestWithdrawal(new BN(0.05 * 1e9)) // 0.05 SOL
      .accounts({ /* ... */ })
      .rpc();
    console.log('  Withdrawal requested:', tx);
  });

  it('Step 11: Complete Withdrawal with Attestation', async () => {
    const attestation = createRangeAttestation(
      recipient,
      { riskScore: 5, riskLevel: RiskLevel.Low, /* ... */ },
      currentSlot
    );

    const tx = await program.methods
      .completeWithdrawal(attestation)
      .accounts({ /* ... */ })
      .rpc();
    console.log('  Withdrawal completed:', tx);
  });

  it('Step 12: Verify Final State', async () => {
    // Check vault balance decreased
    const vault = await program.account.spectreVault.fetch(vaultPda);
    expect(vault.totalBalance.toNumber()).to.be.lt(initialBalance);

    // Check recipient received funds
    const recipientBalance = await connection.getBalance(recipient);
    expect(recipientBalance).to.be.gt(0);

    console.log('  Final vault balance:', vault.totalBalance.toString());
    console.log('  Recipient balance:', recipientBalance / 1e9, 'SOL');
  });
});
```

### 5.2 Edge Case Testing

**File:** `tests/edge_cases.ts`

```typescript
describe('Edge Cases', () => {
  describe('Privacy Layer', () => {
    it('should reject deposit below minimum', async () => {
      const result = await privacyClient.shieldSol(0.0001); // Below 0.001 min
      expect(result.success).to.be.false;
      expect(result.error).to.include('below minimum');
    });

    it('should reject deposit above maximum', async () => {
      const result = await privacyClient.shieldSol(1001); // Above 1000 max
      expect(result.success).to.be.false;
      expect(result.error).to.include('above maximum');
    });

    it('should prevent double-spend', async () => {
      // First withdrawal
      await privacyClient.unshieldSol(note, recipient1);

      // Second withdrawal with same note
      const result = await privacyClient.unshieldSol(note, recipient2);
      expect(result.success).to.be.false;
      expect(result.error).to.include('already been spent');
    });
  });

  describe('TEE Layer', () => {
    it('should reject delegation of already delegated vault', async () => {
      // First delegation
      await teeClient.delegateVault(authority);

      // Second delegation
      const result = await teeClient.delegateVault(authority);
      expect(result.success).to.be.false;
      expect(result.error).to.include('already delegated');
    });

    it('should handle TEE endpoint timeout gracefully', async () => {
      // Configure short timeout
      const client = new SpectreTeeCient(provider, PROGRAM_ID, {
        teeRpcUrl: 'https://invalid.endpoint',
      });

      const result = await client.undelegateVault(authority, true);
      expect(result.success).to.be.false;
      // Should fail gracefully with error message
    });
  });

  describe('Trading Layer', () => {
    it('should skip trade for HOLD signal', async () => {
      const result = await pnpClient.executeSignalTrade('Hold', 100);
      expect(result.success).to.be.false;
      expect(result.error).to.include('HOLD - no trade required');
    });

    it('should handle no available markets', async () => {
      // Mock empty markets
      const result = await pnpClient.executeSignalTrade('StrongBuy', 100);
      // Should fail gracefully if no markets
    });

    it('should reject trade below minimum amount', async () => {
      const result = await pnpClient.executeTrade(market, 'yes', 0.5); // Below 1 USDC
      expect(result.success).to.be.false;
      expect(result.error).to.include('below minimum');
    });
  });

  describe('Compliance Layer', () => {
    it('should reject withdrawal to high-risk address', async () => {
      // Use known high-risk test address
      const highRiskAddress = new PublicKey('...');

      const assessment = await rangeClient.getAddressRisk(highRiskAddress);
      expect(assessment.riskScore).to.be.gt(30);

      // Withdrawal should fail
    });

    it('should reject stale attestation', async () => {
      // Create attestation from 100 slots ago (beyond 50 slot limit)
      const staleAttestation = createRangeAttestation(
        recipient,
        assessment,
        currentSlot - 100
      );

      // Should fail freshness check
    });
  });
});
```

---

## Phase 6: Production Readiness

### 6.1 Update Program IDs

**File:** `programs/spectre_protocol/src/cpi/pnp_interface.rs`

```rust
// Current placeholder:
pub const PNP_PROGRAM_ID: &str = "PNPXchgExXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

// Replace with actual PNP program ID from documentation
pub const PNP_PROGRAM_ID: &str = "<actual-pnp-program-id>";
```

### 6.2 Add Environment Configuration

**File:** `.env.example`

```bash
# Network
SOLANA_RPC_URL=https://api.devnet.solana.com
MAGICBLOCK_RPC_URL=https://devnet.magicblock.app

# Program IDs
SPECTRE_PROGRAM_ID=6ypxTTHK4q9VC7bABp8U3Sptdt6qNQ7uJHoMqNWKmTuW
PRIVACY_CASH_PROGRAM_ID=9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD

# API Keys
RANGE_PROTOCOL_API_KEY=cmkmprr1d002cns0190metogx.yj3hFQk2jW2zCZtGlg1RdF89hrFJ6lSV

# Wallet (base58 encoded private key)
PRIVATE_KEY=

# Mode
DEMO_MODE=false
```

### 6.3 Add Health Check Endpoint

**File:** `client/src/health.ts`

```typescript
export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    solana: { status: string; latencyMs: number };
    magicblock: { status: string; latencyMs: number };
    range: { status: string; latencyMs: number };
    pnp: { status: string; marketCount: number };
    privacycash: { status: string };
  };
  timestamp: Date;
}

export async function checkHealth(): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    overall: 'healthy',
    services: {} as any,
    timestamp: new Date(),
  };

  // Check Solana
  const solanaStart = Date.now();
  try {
    await connection.getLatestBlockhash();
    result.services.solana = {
      status: 'healthy',
      latencyMs: Date.now() - solanaStart,
    };
  } catch (e) {
    result.services.solana = { status: 'unhealthy', latencyMs: -1 };
    result.overall = 'degraded';
  }

  // Check MagicBlock
  const mbStart = Date.now();
  try {
    await teeConnection.getVersion();
    result.services.magicblock = {
      status: 'healthy',
      latencyMs: Date.now() - mbStart,
    };
  } catch (e) {
    result.services.magicblock = { status: 'unhealthy', latencyMs: -1 };
    result.overall = 'degraded';
  }

  // Check Range
  try {
    const response = await fetch('https://api.range.org/v1/health');
    result.services.range = {
      status: response.ok ? 'healthy' : 'degraded',
      latencyMs: 0, // Would need timing
    };
  } catch (e) {
    result.services.range = { status: 'unhealthy', latencyMs: -1 };
    result.overall = 'degraded';
  }

  // Check PNP
  try {
    const markets = await pnpClient.fetchActiveMarkets();
    result.services.pnp = {
      status: markets.length > 0 ? 'healthy' : 'limited',
      marketCount: markets.length,
    };
  } catch (e) {
    result.services.pnp = { status: 'unhealthy', marketCount: 0 };
    result.overall = 'degraded';
  }

  // Check PrivacyCash
  try {
    const info = await connection.getAccountInfo(PRIVACY_CASH_PROGRAM_ID);
    result.services.privacycash = {
      status: info ? 'healthy' : 'unhealthy',
    };
  } catch (e) {
    result.services.privacycash = { status: 'unhealthy' };
    result.overall = 'degraded';
  }

  // Set overall status
  const unhealthyCount = Object.values(result.services)
    .filter(s => s.status === 'unhealthy').length;

  if (unhealthyCount > 2) {
    result.overall = 'unhealthy';
  } else if (unhealthyCount > 0) {
    result.overall = 'degraded';
  }

  return result;
}
```

---

## Implementation Checklist

### Immediate (Before Demo)

- [ ] **PNP Exchange**
  - [ ] Verify SDK import works
  - [ ] Test market fetching
  - [ ] Execute test trade with 1 USDC
  - [ ] Integrate with strategy signals

- [ ] **PrivacyCash**
  - [ ] Verify SDK import works
  - [ ] Test shield with 0.01 SOL
  - [ ] Test unshield
  - [ ] Replace SHA-256 with Poseidon (if SDK provides)

- [ ] **MagicBlock TEE**
  - [ ] Test delegation on MagicBlock devnet
  - [ ] Test undelegation
  - [ ] Verify L1 sync

- [ ] **Frontend**
  - [ ] Set `DEMO_MODE=false` for testing
  - [ ] Fix status indicators
  - [ ] Pre-populate demo data for fallback

### Short-term (After Demo)

- [ ] Full end-to-end flow test
- [ ] Edge case testing
- [ ] Error handling improvements
- [ ] Add health check endpoint
- [ ] Update documentation

### Long-term (Production)

- [ ] Mainnet program IDs
- [ ] Real Poseidon hash implementation
- [ ] Security audit
- [ ] Performance optimization
- [ ] Monitoring and alerting

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PNP SDK breaking changes | Medium | High | Pin version, have fallback |
| PrivacyCash ZK complexity | High | Medium | Use mock for demo, real for testing |
| MagicBlock TEE downtime | Low | High | Graceful degradation |
| Range API rate limits | Low | Low | Caching, retry logic |
| Insufficient devnet funds | Medium | High | Pre-fund test wallets |

---

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| PNP trades executed | > 10 | 0 |
| PrivacyCash shield/unshield | > 5 | 0 |
| TEE delegation cycles | > 3 | ~1 |
| End-to-end flow passes | 100% | 0% |
| Frontend connected to real services | Yes | No (DEMO_MODE) |

---

## Appendix: Quick Reference

### Environment Variables
```bash
SOLANA_RPC_URL=https://api.devnet.solana.com
MAGICBLOCK_RPC_URL=https://devnet.magicblock.app
RANGE_PROTOCOL_API_KEY=cmkmprr1d002cns0190metogx.yj3hFQk2jW2zCZtGlg1RdF89hrFJ6lSV
SPECTRE_PROGRAM_ID=6ypxTTHK4q9VC7bABp8U3Sptdt6qNQ7uJHoMqNWKmTuW
PRIVACY_CASH_PROGRAM_ID=9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD
DELEGATION_PROGRAM_ID=DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh
```

### Test Commands
```bash
# Run all tests
anchor test

# Run specific test file
npx ts-mocha -p ./tsconfig.json tests/pnp_integration.ts

# Test on MagicBlock devnet
anchor test --provider.cluster https://devnet.magicblock.app/

# Start frontend
cd app && npm run dev
```

### Key File Locations
```
Client SDK:      spectre_protocol/client/src/
Solana Program:  spectre_protocol/programs/spectre_protocol/src/
Frontend:        spectre_protocol/app/src/
Tests:           spectre_protocol/tests/
```

---

*Document Version: 1.0*
*Created: January 2026*
*For: SPECTRE Protocol Hackathon Integration*
