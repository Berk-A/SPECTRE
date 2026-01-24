# PrivacyCash Integration Plan

## Overview

PrivacyCash is a privacy-preserving payment protocol on Solana that enables:
- **Shielded deposits** using zero-knowledge proofs
- **Private withdrawals** that break on-chain transaction links
- **OFAC compliance** with selective disclosure mechanisms

**Program ID:** `9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD`
**npm Package:** `privacycash` (v1.1.11)

---

## Architecture

```
User → PrivacyCash.deposit() → Merkle Tree Commitment
                                      ↓
                              SPECTRE Vault
                                      ↓
                    [TEE executes trades privately]
                                      ↓
User ← PrivacyCash.withdraw() ← ZK Proof Verification
```

### Integration Flow

1. **Private Deposit**
   - User calls PrivacyCash SDK to generate commitment
   - Deposit SOL/SPL tokens into PrivacyCash pool
   - Note (secret) stored locally by user
   - SPECTRE vault tracks shielded balance

2. **Note Delegation**
   - User delegates note to TEE agent
   - TEE can execute trades without revealing identity
   - Commitment stored on-chain (UserDeposit)

3. **Private Withdrawal**
   - User provides ZK proof of note ownership
   - PrivacyCash verifies proof, nullifies note
   - Funds transferred to new address (unlinkable)

---

## Implementation Tasks

### Task 1: Install PrivacyCash SDK

**File:** `package.json`
```json
{
  "dependencies": {
    "privacycash": "^1.1.11"
  }
}
```

---

### Task 2: Create PrivacyCash Client Module

**File:** `client/src/privacy.ts`

#### Components:

**2.1 Constants**
```typescript
export const PRIVACY_CASH_PROGRAM_ID = new PublicKey('9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD');
export const USDC_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const MIN_DEPOSIT_SOL = 0.001;
export const MAX_DEPOSIT_SOL = 1000;
```

**2.2 Types**
```typescript
interface DepositNote {
  commitment: Uint8Array;
  nullifier: Uint8Array;
  secret: Uint8Array;
  amount: number;
  tokenMint?: PublicKey;
  createdAt: Date;
}

interface ShieldResult {
  success: boolean;
  signature?: string;
  note?: DepositNote;
  error?: string;
}

interface UnshieldResult {
  success: boolean;
  signature?: string;
  amountReceived?: number;
  error?: string;
}
```

**2.3 SpectrePrivacyClient Class**
```typescript
class SpectrePrivacyClient {
  // Initialization
  constructor(rpcUrl: string, keypair?: Keypair);

  // Shield (Deposit) operations
  async shieldSol(amount: number): Promise<ShieldResult>;
  async shieldSpl(amount: number, tokenMint: PublicKey): Promise<ShieldResult>;

  // Unshield (Withdraw) operations
  async unshieldSol(note: DepositNote, recipient: PublicKey): Promise<UnshieldResult>;
  async unshieldSpl(note: DepositNote, recipient: PublicKey): Promise<UnshieldResult>;

  // Balance queries
  async getShieldedBalance(): Promise<number>;
  async getShieldedSplBalance(tokenMint: PublicKey): Promise<number>;

  // Note management
  generateDepositNote(amount: number, tokenMint?: PublicKey): DepositNote;
  serializeNote(note: DepositNote): string;
  deserializeNote(encoded: string): DepositNote;

  // Delegation
  async delegateNoteToTee(note: DepositNote, teeAgent: PublicKey): Promise<{success: boolean}>;
}
```

---

### Task 3: Integration with SPECTRE Vault

**Flow:**
1. User shields SOL via SpectrePrivacyClient
2. Client stores note and creates UserDeposit on-chain
3. Note delegated to TEE for trading
4. When withdrawing, user provides note + ZK proof
5. After Range compliance check, funds unshielded

---

### Task 4: Create Comprehensive Test Suite

**File:** `tests/privacy_integration.ts`

**Test Categories:**

1. **Note Generation Tests**
   - Valid note creation
   - Serialization/deserialization
   - Unique nullifiers

2. **Shield (Deposit) Tests**
   - SOL deposit within limits
   - Below minimum amount rejection
   - Above maximum amount rejection
   - Insufficient balance handling

3. **Unshield (Withdrawal) Tests**
   - Valid withdrawal with proof
   - Invalid nullifier rejection
   - Double-spend prevention

4. **Integration Tests**
   - Full shield → delegate → unshield flow
   - TEE delegation verification

5. **Edge Cases**
   - Zero amount handling
   - Invalid note format
   - Network errors
   - Timeout handling

---

### Task 5: Full Flow Test Suite

**File:** `tests/full_flow.ts`

Test the complete SPECTRE lifecycle:
1. **Private Deposit** → PrivacyCash
2. **TEE Delegation** → MagicBlock
3. **Strategy Execution** → Generate signal
4. **Trade Execution** → PNP Exchange
5. **Compliance Check** → Range Protocol
6. **Private Withdrawal** → PrivacyCash

---

## SDK Reference (PrivacyCash)

### Installation
```bash
npm install privacycash@1.1.11
```

### Initialization
```typescript
import { PrivacyCash } from 'privacycash';

// Read-only
const client = new PrivacyCash(rpcUrl);

// With signing
const client = new PrivacyCash(rpcUrl, keypair);
```

### Core Methods

**Shield SOL:**
```typescript
const signature = await client.deposit(amount); // amount in SOL
```

**Shield SPL Token:**
```typescript
const signature = await client.depositSPL(amount, tokenMint);
```

**Unshield SOL:**
```typescript
const signature = await client.withdraw(amount, recipientAddress);
```

**Unshield SPL Token:**
```typescript
const signature = await client.withdrawSPL(amount, tokenMint, recipientAddress);
```

**Check Balance:**
```typescript
const balance = await client.getPrivateBalance(); // SOL
const splBalance = await client.getPrivateBalanceSpl(tokenMint);
```

---

## Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| `InsufficientFunds` | Not enough shielded balance | Check balance before withdraw |
| `InvalidProof` | ZK proof verification failed | Regenerate proof |
| `NullifierUsed` | Note already spent | Prevent double-spend |
| `AmountTooLow` | Below minimum | Validate before shield |
| `AmountTooHigh` | Above maximum | Cap at maximum |
| `NetworkError` | RPC connection issue | Retry with backoff |

---

## Security Considerations

1. **Note Storage**
   - Notes contain secrets - must be encrypted at rest
   - User responsibility to backup notes
   - Lost note = lost funds

2. **Nullifier Management**
   - Track nullifiers to prevent double-spend
   - Nullifier is derived from note secret

3. **ZK Proof Generation**
   - Proofs generated client-side
   - Requires Circom circuits (bundled in SDK)

4. **Compliance**
   - PrivacyCash is OFAC compliant
   - Selective disclosure available for audits
   - Range Protocol integration for recipient verification

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add privacycash dependency |
| `client/src/privacy.ts` | Create | PrivacyCash client wrapper |
| `client/src/index.ts` | Modify | Add privacy exports |
| `tests/privacy_integration.ts` | Create | Privacy-specific tests |
| `tests/full_flow.ts` | Create | End-to-end integration tests |

---

## Success Criteria

### Minimum Viable
- [ ] PrivacyCash SDK installed
- [ ] Note generation working
- [ ] Shield/Unshield mocking for tests
- [ ] 20+ unit tests passing

### Full Integration
- [ ] Real SDK integration
- [ ] Devnet shield/unshield working
- [ ] Note delegation to TEE
- [ ] Full flow tests passing

---

*Plan created for SPECTRE Protocol PrivacyCash integration*
