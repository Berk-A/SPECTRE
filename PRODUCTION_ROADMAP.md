# SPECTRE Protocol - Production Roadmap

## Executive Summary

This document outlines the path from the current demo implementation to a production-grade system. The architecture prioritizes **user privacy**, **security**, and **decentralization** while maintaining excellent UX.

---

## Current State vs Production Target

| Component | Demo State | Production Target |
|-----------|------------|-------------------|
| Range Protocol | Real API integration | Same (already production-ready) |
| PNP Exchange | Mock markets | Full on-chain trading |
| PrivacyCash | Simulated shield/unshield | Real ZK privacy operations |
| MagicBlock TEE | Status checks only | Full delegation + ephemeral execution |

---

## Architecture Decision: Why Browser-First

For production, we recommend **Option 2: Browser-Compatible SDK** over a backend proxy because:

1. **Privacy Preservation**: ZK proofs MUST be generated client-side
2. **Decentralization**: No central server = no single point of failure
3. **Self-Custody**: Users never expose private keys to a server
4. **Censorship Resistance**: No backend to shut down

---

## Phase 1: PrivacyCash Production Integration (2-3 weeks)

### 1.1 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         BROWSER                                   │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Wallet      │  │ snarkjs     │  │ PrivacyCash Browser SDK │  │
│  │ Adapter     │  │ (browser)   │  │ (forked & modified)     │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                       │               │
│         │    ┌───────────┴───────────┐          │               │
│         │    │  Web Workers          │          │               │
│         │    │  (proof generation)   │          │               │
│         │    └───────────────────────┘          │               │
└─────────┼────────────────────────────────────────┼───────────────┘
          │                                        │
          ▼                                        ▼
┌─────────────────────┐              ┌─────────────────────────────┐
│  Solana RPC         │              │  PrivacyCash Relayer API    │
│  (devnet/mainnet)   │              │  https://api3.privacycash.org│
└─────────────────────┘              └─────────────────────────────┘
```

### 1.2 Implementation Tasks

#### Task 1: Fork and Modify PrivacyCash SDK
```typescript
// Changes needed in privacycash SDK:

// 1. Replace node-localstorage with browser localStorage
// Before:
import { LocalStorage } from "node-localstorage";
let storage = new LocalStorage(path.join(process.cwd(), "cache"));

// After:
const storage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
  removeItem: (key: string) => localStorage.removeItem(key),
};

// 2. Replace filesystem circuit loading with fetch
// Before:
keyBasePath: path.join(import.meta.dirname, '..', 'circuit2', 'transaction2')

// After:
keyBasePath: 'https://cdn.spectre.money/circuits/transaction2'
// Then in prover.js:
const wasmBuffer = await fetch(`${keyBasePath}.wasm`).then(r => r.arrayBuffer());
const zkeyBuffer = await fetch(`${keyBasePath}.zkey`).then(r => r.arrayBuffer());
```

#### Task 2: Web Worker for Proof Generation
```typescript
// src/workers/zkProver.worker.ts
import { groth16 } from 'snarkjs';

self.onmessage = async (e) => {
  const { input, wasmBuffer, zkeyBuffer } = e.data;

  try {
    const { proof, publicSignals } = await groth16.fullProve(
      input,
      new Uint8Array(wasmBuffer),
      new Uint8Array(zkeyBuffer)
    );

    self.postMessage({ success: true, proof, publicSignals });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
```

#### Task 3: Circuit File CDN Setup
```yaml
# CDN structure:
https://cdn.spectre.money/
  └── circuits/
      ├── transaction2.wasm    (3.1 MB, gzipped: ~1.2 MB)
      └── transaction2.zkey    (16 MB, gzipped: ~12 MB)

# Caching strategy:
- Cache-Control: public, max-age=31536000, immutable
- Store in IndexedDB after first download
- Show progress bar during download
```

#### Task 4: Browser SDK Integration
```typescript
// src/lib/privacy/browserClient.ts
import { PrivacyCashBrowser } from '@spectre/privacycash-browser';

export async function createPrivacyClient(
  connection: Connection,
  wallet: WalletAdapter
): Promise<PrivacyClient> {
  // Load circuit files (with caching)
  const circuits = await loadCircuits();

  // Initialize SDK with browser-compatible storage
  const client = new PrivacyCashBrowser({
    RPC_url: connection.rpcEndpoint,
    circuits,
    storage: new BrowserStorage(),
  });

  return {
    shieldSol: async (amount: number) => {
      // Show progress UI
      setStatus('Generating ZK proof...');

      // Generate proof in Web Worker
      const proof = await client.generateDepositProof(amount);

      // Build and sign transaction
      setStatus('Please sign the transaction...');
      const tx = await client.buildDepositTransaction(proof);
      const signed = await wallet.signTransaction(tx);

      // Submit via relayer
      setStatus('Submitting to relayer...');
      const result = await client.submitDeposit(signed);

      return result;
    },

    unshieldSol: async (note, recipient) => {
      // Similar flow with withdrawal proof
    },
  };
}
```

### 1.3 UX Considerations

```
┌────────────────────────────────────────────────────────────┐
│  Shield 1.5 SOL                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Step 1/4: Downloading ZK circuits...                      │
│  ████████████████░░░░░░░░░░░░░░░░░░░░ 45%                 │
│  (First time only - 13 MB)                                 │
│                                                            │
│  Step 2/4: Generating zero-knowledge proof...              │
│  ⏳ This may take 15-30 seconds                           │
│                                                            │
│  Step 3/4: Sign transaction in wallet                      │
│                                                            │
│  Step 4/4: Submitting to privacy pool...                   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Phase 2: PNP Exchange Production Integration (1-2 weeks)

### 2.1 Architecture Options

**Option A: Browser-Compatible SDK (Recommended)**

The PNP SDK's main browser incompatibility is the `crypto` module usage. This can be solved by:

```typescript
// Fork pnp-sdk and replace crypto usage:

// Before:
const { createHash } = await import("crypto");
const hash = createHash('sha256').update(data).digest();

// After:
const hash = await crypto.subtle.digest('SHA-256', data);
```

**Option B: Lightweight Read-Only Backend**

For markets that don't require signing, use a simple backend:

```typescript
// backend/src/routes/markets.ts
import { PNPClient } from 'pnp-sdk';
import express from 'express';

const router = express.Router();
const pnp = new PNPClient(process.env.RPC_URL);

router.get('/markets', async (req, res) => {
  const markets = await pnp.fetchActiveMarkets();
  res.json(markets);
});

router.get('/markets/:address', async (req, res) => {
  const market = await pnp.fetchMarket(req.params.address);
  res.json(market);
});

export default router;
```

### 2.2 Trading Flow (Full On-Chain)

```typescript
// src/lib/trading/pnpClient.ts

export async function executeTrade(
  market: PublicKey,
  side: 'yes' | 'no',
  amount: number,
  wallet: WalletAdapter,
  connection: Connection
): Promise<TradeResult> {
  // 1. Build transaction using Anchor
  const program = new Program(PNP_IDL, PROGRAM_ID, provider);

  const ix = await program.methods
    .buyOutcome({ [side]: {} }, new BN(amount * 1e6))
    .accounts({
      market,
      buyer: wallet.publicKey,
      // ... other accounts
    })
    .instruction();

  // 2. Add priority fee for faster confirmation
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }))
    .add(ix);

  // 3. Sign with wallet adapter
  const signed = await wallet.signTransaction(tx);

  // 4. Send and confirm
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(signature);

  return { success: true, signature };
}
```

---

## Phase 3: MagicBlock TEE Integration (2 weeks)

### 3.1 Full Delegation Flow

```typescript
// src/lib/tee/magicblock.ts
import { DelegationProgram } from '@magicblock-labs/delegation-sdk';

export async function delegateVault(
  wallet: WalletAdapter,
  connection: Connection
): Promise<DelegationResult> {
  // 1. Derive vault PDA
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('spectre_vault'), wallet.publicKey.toBuffer()],
    SPECTRE_PROGRAM_ID
  );

  // 2. Create delegation instruction
  const delegationProgram = new DelegationProgram(connection);
  const delegateIx = await delegationProgram.createDelegateInstruction({
    authority: wallet.publicKey,
    account: vaultPda,
    delegatee: MAGICBLOCK_TEE_PUBKEY,
  });

  // 3. Build and sign transaction
  const tx = new Transaction().add(delegateIx);
  const signed = await wallet.signTransaction(tx);

  // 4. Submit to Solana L1
  const signature = await connection.sendRawTransaction(signed.serialize());

  // 5. Wait for TEE to pick up delegation
  await waitForTeeConfirmation(vaultPda);

  return { success: true, signature, vaultPda };
}
```

### 3.2 Ephemeral Rollup Execution

```typescript
// Trading on L2 (TEE ephemeral rollup)
export async function executeL2Trade(
  market: PublicKey,
  side: 'yes' | 'no',
  amount: number
): Promise<L2TradeResult> {
  // Connect to MagicBlock TEE RPC
  const teeConnection = new Connection(TEE_RPC_ENDPOINT);

  // Build trade transaction (same as L1 but on L2)
  const tx = buildTradeTransaction(market, side, amount);

  // Submit to TEE - instant confirmation
  const signature = await teeConnection.sendRawTransaction(tx.serialize());

  // TEE confirms in ~400ms
  const confirmation = await teeConnection.confirmTransaction(signature, 'confirmed');

  return { success: true, signature, l2Slot: confirmation.context.slot };
}
```

---

## Phase 4: Infrastructure & Security

### 4.1 Infrastructure Requirements

| Component | Provider Options | Monthly Cost |
|-----------|-----------------|--------------|
| Circuit CDN | Cloudflare R2 / AWS S3 | $5-20 |
| RPC Nodes | Helius / Triton / QuickNode | $50-500 |
| Backend (if needed) | Vercel / Railway / AWS | $20-100 |
| Monitoring | Sentry + Grafana | $30-100 |

### 4.2 Security Checklist

```markdown
## Pre-Launch Security Audit Checklist

### Smart Contracts
- [ ] Audit by reputable firm (Zellic, OtterSec, Neodyme)
- [ ] Formal verification of critical paths
- [ ] Fuzzing with Trident/Echidna
- [ ] Economic attack simulations

### Frontend Security
- [ ] CSP headers configured
- [ ] No sensitive data in localStorage (only encrypted notes)
- [ ] Subresource integrity for CDN assets
- [ ] Rate limiting on API calls

### Operational Security
- [ ] Multi-sig for program upgrades
- [ ] Incident response plan
- [ ] Bug bounty program (Immunefi)
- [ ] Monitoring and alerting
```

### 4.3 Key Security Considerations

```typescript
// NEVER do this:
const privateKey = localStorage.getItem('privateKey'); // ❌

// Always use wallet adapter:
const { signTransaction } = useWallet(); // ✅

// Encrypted note storage (already implemented):
const encryptedNote = await encryptWithUserKey(note);
localStorage.setItem('encrypted_notes', encryptedNote); // ✅
```

---

## Phase 5: Production Deployment

### 5.1 Environment Configuration

```typescript
// src/lib/config/environments.ts
export const environments = {
  development: {
    rpc: 'https://api.devnet.solana.com',
    teeRpc: 'https://devnet.magicblock.app',
    circuitCdn: 'http://localhost:3001/circuits',
    rangeApi: 'https://api.range.org',
  },
  staging: {
    rpc: 'https://rpc.helius.xyz/?api-key=xxx',
    teeRpc: 'https://devnet.magicblock.app',
    circuitCdn: 'https://staging-cdn.spectre.money/circuits',
    rangeApi: 'https://api.range.org',
  },
  production: {
    rpc: 'https://rpc.helius.xyz/?api-key=xxx',
    teeRpc: 'https://mainnet.magicblock.app',
    circuitCdn: 'https://cdn.spectre.money/circuits',
    rangeApi: 'https://api.range.org',
  },
};
```

### 5.2 Deployment Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test
      - run: npm run test:e2e

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: snyk/actions/node@master

  deploy:
    needs: [test, security-scan]
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          command: pages deploy dist --project-name=spectre
```

---

## Timeline & Resource Estimates

### Development Timeline

```
Week 1-2:   PrivacyCash browser SDK fork
Week 3:     Web Worker integration + circuit CDN
Week 4:     PNP SDK browser compatibility
Week 5-6:   MagicBlock full delegation flow
Week 7:     Integration testing + bug fixes
Week 8:     Security audit preparation
Week 9-12:  Security audit + fixes
Week 13:    Mainnet deployment
```

### Team Requirements

| Role | Count | Responsibilities |
|------|-------|-----------------|
| Senior Solana Dev | 1 | SDK modifications, smart contracts |
| Frontend Dev | 1 | React integration, UX |
| DevOps | 0.5 | Infrastructure, CI/CD |
| Security | 0.5 | Audit coordination, hardening |

### Budget Estimate

| Category | Cost |
|----------|------|
| Development (3 months) | $50,000 - $100,000 |
| Security Audit | $30,000 - $80,000 |
| Infrastructure (year 1) | $2,000 - $5,000 |
| Bug Bounty Fund | $10,000 - $50,000 |
| **Total** | **$92,000 - $235,000** |

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SDK changes break integration | Medium | High | Pin SDK versions, fork if needed |
| Proof generation too slow | Low | Medium | Web Worker optimization, progress UX |
| TEE unavailable | Low | High | Graceful fallback to L1-only mode |
| Range API rate limits | Medium | Low | Caching, fallback risk score |

---

## Success Metrics

### Technical KPIs
- Proof generation < 30s on average hardware
- Transaction confirmation < 500ms on TEE
- 99.9% uptime for frontend
- Zero security incidents

### User Metrics
- Average shield/unshield completion rate > 90%
- Trade execution success rate > 99%
- User retention > 40% weekly

---

## Conclusion

The path to production is well-defined and achievable. The key insight is that **browser-first architecture** is not just possible but preferable for a privacy-focused protocol. The PrivacyCash SDK was designed with a relayer backend specifically to enable client-side proof generation.

The main engineering challenges are:
1. Forking and modifying PrivacyCash SDK for browser
2. Optimizing proof generation with Web Workers
3. Full MagicBlock TEE integration

All of these are solved problems with clear implementation paths.
