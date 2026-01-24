
# SPECTRE Integration Plan - Hackathon Ready

## Executive Summary

This document outlines a prioritized plan to integrate real external systems into SPECTRE, replacing mock implementations with production-ready integrations. The goal is to demonstrate functional integration of **MagicBlock TEE**, **Range Protocol**, **PrivacyCash**, and **PNP Exchange** for hackathon submission.

---

## Priority Order (Effort vs Impact Matrix)

| Priority | System | Effort | Impact | Risk | Reason |
|----------|--------|--------|--------|------|--------|
| **1** | MagicBlock TEE | LOW | HIGH | LOW | Free devnet, existing SDK, direct Anchor integration |
| **2** | Range Protocol | LOW | HIGH | LOW | Have API key, REST API (no SDK needed) |
| **3** | PNP Exchange | MEDIUM | HIGH | MEDIUM | npm SDK available, but needs USDC on devnet |
| **4** | PrivacyCash | HIGH | MEDIUM | HIGH | Complex ZK circuits, Circom dependency |

---

## Phase 1: MagicBlock TEE Integration (Highest Priority)

### Why First?
- **FREE** devnet testing at `https://devnet.magicblock.app/`
- **FREE** TEE endpoint at `https://tee.magicblock.app/`
- Already have delegation code structure in place
- Direct Anchor macro support (`#[delegate]`)
- Demonstrates "privacy-preserving AI execution" - core value prop

### What We Get
- Vault delegation to TEE for secure strategy execution
- Sub-50ms transaction execution
- Privacy for trading signals (hidden from MEV)
- "Institutional-grade privacy" marketing angle

### Implementation Steps

#### Step 1.1: Add MagicBlock SDK Dependencies

```toml
# Cargo.toml
[dependencies]
ephemeral-rollups-sdk = "0.2"
```

```json
// package.json
{
  "dependencies": {
    "@magicblock-labs/ephemeral-rollups-sdk": "^0.1"
  }
}
```

#### Step 1.2: Update Anchor Program

```rust
// lib.rs - Add delegate macro
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::delegate_account;

#[delegate]
#[program]
pub mod spectre_protocol {
    // Existing code...

    /// Real TEE delegation (replaces mock)
    pub fn delegate_to_tee(ctx: Context<DelegateToTee>) -> Result<()> {
        // Call actual MagicBlock delegation program
        ctx.accounts.delegate_vault(
            &ctx.accounts.payer,
            &[VAULT_SEED, ctx.accounts.authority.key().as_ref()],
            DelegateConfig::default(),
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.is_delegated = true;
        vault.delegation_slot = Clock::get()?.slot;

        Ok(())
    }
}
```

#### Step 1.3: TypeScript Integration

```typescript
// client/src/magicblock.ts
import { createUndelegateInstruction } from '@magicblock-labs/ephemeral-rollups-sdk';

const MAGICBLOCK_DEVNET = 'https://devnet.magicblock.app/';
const MAGICBLOCK_TEE = 'https://tee.magicblock.app/';

export async function delegateVault(vaultPda: PublicKey) {
    // Use TEE endpoint for delegation
    const teeConnection = new Connection(MAGICBLOCK_TEE);
    // ... delegation logic
}

export async function executeInTEE(instruction: TransactionInstruction) {
    // Execute strategy within TEE for privacy
    const teeConnection = new Connection(MAGICBLOCK_TEE);
    // ... execution logic
}
```

#### Step 1.4: Test on MagicBlock Devnet

```bash
# Test with MagicBlock devnet
anchor test --provider.cluster https://devnet.magicblock.app/
```

### Estimated Time: 2-4 hours

---

## Phase 2: Range Protocol Integration (Second Priority)

### Why Second?
- **Already have API key**: `cmkmprr1d002cns0190metogx.yj3hFQk2jW2zCZtGlg1RdF89hrFJ6lSV`
- Simple REST API (no complex SDK)
- Direct replacement for mock compliance
- "Compliant DeFi" is huge for hackathon judges

### What We Get
- Real wallet risk scoring
- Sanctions/blacklist checking
- On-chain attestation verification (SAS integration)
- Compliance audit trail

### Implementation Steps

#### Step 2.1: Create Range API Client

```typescript
// client/src/range.ts
const RANGE_API_BASE = 'https://api.range.org/v1';
const RANGE_API_KEY = process.env.RANGE_PROTOCOL_API_KEY;

interface RiskScore {
    address: string;
    score: number;        // 0-100
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    sanctions: boolean;
    lastUpdated: string;
}

export async function getWalletRiskScore(address: string): Promise<RiskScore> {
    const response = await fetch(`${RANGE_API_BASE}/risk/address/${address}`, {
        headers: {
            'X-API-KEY': RANGE_API_KEY,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Range API error: ${response.status}`);
    }

    return response.json();
}

export async function checkSanctions(address: string): Promise<boolean> {
    const response = await fetch(`${RANGE_API_BASE}/risk/sanctions/${address}`, {
        headers: {
            'X-API-KEY': RANGE_API_KEY
        }
    });

    const data = await response.json();
    return data.sanctioned === true;
}
```

#### Step 2.2: Update Compliance Module

```rust
// utils/compliance.rs - Use Range attestation format
pub fn verify_range_attestation(
    attestation: &RangeAttestation,
    recipient: &Pubkey,
    current_slot: u64
) -> ComplianceResult {
    // Verify attestation is from Range oracle
    // Check signature against Range public key
    // Validate freshness (within 50 slots)
    // Return compliance result
}
```

#### Step 2.3: Integration in Withdrawal Flow

```typescript
// Before completing withdrawal, check Range API
async function completeWithdrawalWithCompliance(
    recipient: PublicKey,
    withdrawalRequest: PublicKey
) {
    // 1. Get real risk score from Range
    const riskData = await getWalletRiskScore(recipient.toString());

    // 2. Check sanctions
    const isSanctioned = await checkSanctions(recipient.toString());

    if (isSanctioned || riskData.score > 30) {
        throw new Error('Compliance check failed');
    }

    // 3. Create attestation for on-chain verification
    const attestation = {
        address: recipient,
        riskScore: riskData.score,
        riskLevel: { [riskData.riskLevel]: {} },
        attestationSlot: new BN(await connection.getSlot() - 5),
        // ...
    };

    // 4. Complete withdrawal with attestation
    await program.methods
        .completeWithdrawal(attestation)
        .accounts({...})
        .rpc();
}
```

### Estimated Time: 2-3 hours

---

## Phase 3: PNP Exchange Integration (Third Priority)

### Why Third?
- npm SDK available: `pnp-sdk`
- Real prediction market trading
- Demonstrates "AI trading agent" capability
- Requires USDC setup (adds complexity)

### What We Get
- Real market creation
- Actual YES/NO token trading
- AMM interaction
- Position redemption

### Challenges
- Need devnet USDC or create test markets with SOL
- Market creation costs
- Need to understand their program IDs

### Implementation Steps

#### Step 3.1: Install PNP SDK

```bash
npm install pnp-sdk
```

#### Step 3.2: Create PNP Integration Module

```typescript
// client/src/pnp.ts
import { PNPClient } from 'pnp-sdk';
import { PublicKey } from '@solana/web3.js';

const USDC_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // Devnet USDC

export class SprectrePNPClient {
    private client: PNPClient;

    constructor(rpcUrl: string, privateKey: Uint8Array) {
        this.client = new PNPClient(rpcUrl, privateKey);
    }

    async fetchActiveMarkets() {
        const addresses = await this.client.fetchMarketAddresses();
        const markets = await Promise.all(
            addresses.map(addr => this.client.fetchMarket(addr))
        );
        return markets.filter(m => !m.account.resolved);
    }

    async executeTrade(
        marketAddress: PublicKey,
        side: 'yes' | 'no',
        amountUsdc: number
    ) {
        return await this.client.trading.buyTokensUsdc({
            market: marketAddress,
            buyYesToken: side === 'yes',
            amountUsdc
        });
    }

    async redeemWinnings(marketAddress: PublicKey) {
        return await this.client.redeemPosition(marketAddress);
    }
}
```

#### Step 3.3: Replace Mock Market in Execute Trade

```typescript
// Instead of mock market, use real PNP
async function executeRealTrade(signal: TradeSignal, vault: SpectreVault) {
    const pnpClient = new SprectrePNPClient(RPC_URL, walletKeypair.secretKey);

    // Find suitable market based on signal
    const markets = await pnpClient.fetchActiveMarkets();
    const targetMarket = selectMarketForSignal(markets, signal);

    if (!targetMarket) {
        console.log('No suitable market found');
        return;
    }

    // Calculate position size
    const positionSize = vault.calculatePositionSize(signal.isStrong);

    // Execute real trade
    const result = await pnpClient.executeTrade(
        targetMarket.publicKey,
        signal.side,
        positionSize / 1_000_000 // Convert to USDC
    );

    return result;
}
```

### Estimated Time: 4-6 hours

---

## Phase 4: PrivacyCash Integration (Lowest Priority)

### Why Last?
- Most complex (ZK circuits, Circom)
- Requires local circuit compilation
- Higher risk of issues
- Current mock is functional for demo

### What We Get
- Real privacy-preserving deposits
- Unlinkable withdrawals
- True "anonymous funding"

### Recommendation for Hackathon
**Partial integration** - Use SDK for deposit flow, keep simplified proof verification:

```typescript
// client/src/privacy.ts
import { PrivacyCash } from 'privacy-cash-sdk';

export async function privateDeposit(
    amount: number,
    rpcUrl: string,
    keypair: Keypair
) {
    const client = new PrivacyCash(rpcUrl, keypair);

    // Generate commitment locally
    const { commitment, nullifier, note } = await client.generateDepositNote(amount);

    // Execute deposit through PrivacyCash program
    const signature = await client.deposit(amount);

    // Store note securely (user must save this!)
    return {
        signature,
        commitment,
        note, // User needs this to withdraw
    };
}
```

### Alternative: Minimal Integration
If full integration is too complex, demonstrate the **interface** and **architecture**:

1. Show CPI call structure to PrivacyCash program
2. Use their mainnet program ID: `9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD`
3. Document the integration path

### Estimated Time: 8-12 hours (full) / 2-3 hours (minimal)

---

## Implementation Timeline

### Day 1 (4-6 hours)
| Time | Task |
|------|------|
| Hour 1-2 | MagicBlock SDK installation + Anchor macro integration |
| Hour 2-3 | MagicBlock delegation testing on devnet |
| Hour 3-4 | Range API client implementation |
| Hour 4-5 | Range compliance integration in withdrawal |
| Hour 5-6 | Testing + debugging |

### Day 2 (4-6 hours)
| Time | Task |
|------|------|
| Hour 1-3 | PNP SDK integration |
| Hour 3-4 | PNP market fetching + trade execution |
| Hour 4-5 | End-to-end testing |
| Hour 5-6 | PrivacyCash minimal integration (optional) |

---

## Environment Setup

### Required Environment Variables

```bash
# .env
RANGE_PROTOCOL_API_KEY=cmkmprr1d002cns0190metogx.yj3hFQk2jW2zCZtGlg1RdF89hrFJ6lSV
SOLANA_RPC_URL=https://api.devnet.solana.com
MAGICBLOCK_RPC_URL=https://devnet.magicblock.app/
MAGICBLOCK_TEE_URL=https://tee.magicblock.app/
PNP_PROGRAM_ID=<get from PNP docs>
PRIVACY_CASH_PROGRAM_ID=9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD
```

### Package Dependencies

```json
{
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1",
    "@solana/web3.js": "^1.95.0",
    "@magicblock-labs/ephemeral-rollups-sdk": "^0.1",
    "pnp-sdk": "latest",
    "dotenv": "^16.0.0"
  }
}
```

```toml
# Cargo.toml
[dependencies]
ephemeral-rollups-sdk = "0.2"
```

---

## Hackathon Demo Script

### Demo Flow (5 minutes)

1. **Privacy Deposit** (30s)
   - Show user depositing SOL through privacy interface
   - Display commitment generation

2. **TEE Delegation** (30s)
   - Demonstrate vault delegation to MagicBlock TEE
   - Show delegation transaction on explorer

3. **AI Strategy Execution** (1m)
   - Generate trade signal in TEE (hidden from MEV)
   - Show signal output: STRONG BUY

4. **PNP Market Trade** (1m)
   - Execute trade on real prediction market
   - Show position opened

5. **Compliance Withdrawal** (1m)
   - Request withdrawal to recipient
   - Show Range API risk check
   - Complete withdrawal with attestation

6. **Summary** (1m)
   - Privacy: PrivacyCash + MagicBlock TEE
   - Compliance: Range Protocol
   - Trading: PNP Exchange
   - All on Solana devnet

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| MagicBlock SDK breaking changes | Pin version, have fallback to mock |
| Range API rate limits | Cache responses, implement retry logic |
| PNP devnet unavailable | Have recorded demo as backup |
| PrivacyCash complexity | Use minimal integration or mock |

---

## Success Criteria

### Minimum Viable Integration (Hackathon Pass)
- [x] MagicBlock TEE delegation working ✅ (Delegation: `2cRycCLRWVVZgqGT6DjxTmnQY8A6DZW6ShumSHtUE5Ew4rSooCcr47nwJuiqPbV3bzeXUBkzt7hmPDrFaQN2skpL`)
- [x] Range API risk score fetching ✅ (26 tests passing, real API integration)
- [ ] End-to-end deposit → trade → withdraw flow

### Full Integration (Prize Contention)
- [x] All above plus:
- [ ] Real PNP market trades
- [ ] PrivacyCash deposit integration
- [ ] Live demo on devnet

---

## Integration Status (Updated)

### ✅ Phase 1: MagicBlock TEE - COMPLETE
- Delegation working on devnet
- Undelegation with async L1 sync working
- TEE client (`client/src/tee.ts`) fully implemented
- Test file: `tests/tee_delegation.ts`

### ✅ Phase 2: Range Protocol - COMPLETE
- Range API client (`client/src/range.ts`) fully implemented
- Real API integration working (risk score 3/100 for test wallet)
- Sanctions checking working
- Attestation generation for on-chain verification
- Withdrawal client (`client/src/withdrawal.ts`) with compliance integration
- Test files: `tests/range_compliance.ts`, `tests/withdrawal_compliance.ts`
- **26 tests passing**

### ⏳ Phase 3: PNP Exchange - PENDING
- SDK available: `pnp-sdk`
- Integration planned

### ⏳ Phase 4: PrivacyCash - PENDING
- Current mock implementation functional
- Integration planned

---

## Resources

### Documentation Links
- [MagicBlock Docs](https://docs.magicblock.gg)
- [MagicBlock GitHub](https://github.com/magicblock-labs)
- [Range API Reference](https://docs.range.org/reference/risk)
- [PNP SDK Docs](https://docs.pnp.exchange/pnp-sdk)
- [PrivacyCash GitHub](https://github.com/Privacy-Cash/privacy-cash)
- [PrivacyCash SDK](https://docs.rs/privacy-cash-sdk)

### Devnet Endpoints
- Solana Devnet: `https://api.devnet.solana.com`
- MagicBlock Devnet: `https://devnet.magicblock.app/`
- MagicBlock TEE: `https://tee.magicblock.app/`

### Program IDs
- SPECTRE: `B2at4oGQFPAbuH2wMMpBsFrTvJi71GUvR7jyxny7HaGf`
- PrivacyCash (mainnet): `9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD`

---

*Plan created for SPECTRE Protocol hackathon submission*
