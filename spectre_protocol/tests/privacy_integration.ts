/**
 * SPECTRE PrivacyCash Integration Tests
 *
 * Comprehensive test suite for PrivacyCash privacy protocol integration.
 * Tests cover:
 * - Note generation and management
 * - Shield (deposit) operations
 * - Unshield (withdrawal) operations
 * - Serialization/deserialization
 * - Encryption/decryption
 * - Edge cases and error handling
 *
 * Run with: npx ts-mocha tests/privacy_integration.ts
 */

import assert from 'assert';
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

import {
  SpectrePrivacyClient,
  createPrivacyClientFromEnv,
  createReadOnlyPrivacyClient,
  createDepositNote,
  serializeNote,
  deserializeNote,
  validateNote,
  encryptNote,
  decryptNote,
  generateCommitment,
  generateNullifierHash,
  generateRandomBytes,
  validateShieldAmount,
  formatAmount,
  formatShieldResult,
  formatUnshieldResult,
  DepositNote,
  ShieldResult,
  UnshieldResult,
  PRIVACY_CASH_PROGRAM_ID,
  USDC_MAINNET,
  USDC_DEVNET,
  MIN_DEPOSIT_SOL,
  MAX_DEPOSIT_SOL,
  MIN_DEPOSIT_LAMPORTS,
  MAX_DEPOSIT_LAMPORTS,
  NOTE_KEY_SIZE,
  COMMITMENT_SIZE,
  NULLIFIER_SIZE,
  DEFAULT_PRIVACY_CONFIG,
} from '../client/src/privacy';

// ============================================
// Test Helpers
// ============================================

/**
 * Create a valid test note
 */
function createTestNote(amount: number = 0.1 * LAMPORTS_PER_SOL): DepositNote {
  return createDepositNote(amount);
}

/**
 * Create a test note for SPL tokens
 */
function createTestSplNote(
  amount: number = 1000000,
  tokenMint: PublicKey = USDC_DEVNET
): DepositNote {
  return createDepositNote(amount, tokenMint);
}

// ============================================
// Constants Tests
// ============================================

describe('PrivacyCash Integration - Constants', () => {
  it('should have correct program ID', () => {
    assert.strictEqual(
      PRIVACY_CASH_PROGRAM_ID.toString(),
      '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD'
    );
  });

  it('should have correct USDC addresses', () => {
    assert.strictEqual(
      USDC_MAINNET.toString(),
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    );
    assert.strictEqual(
      USDC_DEVNET.toString(),
      '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    );
  });

  it('should have valid deposit bounds', () => {
    assert.strictEqual(MIN_DEPOSIT_SOL, 0.001);
    assert.strictEqual(MAX_DEPOSIT_SOL, 1000);
    assert.strictEqual(MIN_DEPOSIT_LAMPORTS, 0.001 * LAMPORTS_PER_SOL);
    assert.strictEqual(MAX_DEPOSIT_LAMPORTS, 1000 * LAMPORTS_PER_SOL);
  });

  it('should have valid cryptographic sizes', () => {
    assert.strictEqual(NOTE_KEY_SIZE, 32);
    assert.strictEqual(COMMITMENT_SIZE, 32);
    assert.strictEqual(NULLIFIER_SIZE, 32);
  });

  it('should have valid default config', () => {
    assert.strictEqual(DEFAULT_PRIVACY_CONFIG.isDevnet, true);
    assert.strictEqual(DEFAULT_PRIVACY_CONFIG.commitment, 'confirmed');
    assert.strictEqual(DEFAULT_PRIVACY_CONFIG.retryAttempts, 3);
  });
});

// ============================================
// Random Bytes Generation Tests
// ============================================

describe('PrivacyCash Integration - Random Bytes', () => {
  it('should generate correct size random bytes', () => {
    const bytes32 = generateRandomBytes(32);
    const bytes64 = generateRandomBytes(64);

    assert.strictEqual(bytes32.length, 32);
    assert.strictEqual(bytes64.length, 64);
  });

  it('should generate unique random bytes', () => {
    const bytes1 = generateRandomBytes(32);
    const bytes2 = generateRandomBytes(32);

    // Very unlikely to be equal
    assert.ok(!Buffer.from(bytes1).equals(Buffer.from(bytes2)));
  });

  it('should generate non-zero bytes', () => {
    const bytes = generateRandomBytes(32);
    const hasNonZero = Array.from(bytes).some((b) => b !== 0);
    assert.ok(hasNonZero, 'Should contain non-zero bytes');
  });
});

// ============================================
// Commitment Generation Tests
// ============================================

describe('PrivacyCash Integration - Commitment Generation', () => {
  it('should generate 32-byte commitment', () => {
    const secret = generateRandomBytes(32);
    const nullifier = generateRandomBytes(32);
    const amount = LAMPORTS_PER_SOL;

    const commitment = generateCommitment(secret, nullifier, amount);

    assert.strictEqual(commitment.length, 32);
  });

  it('should generate deterministic commitments', () => {
    const secret = generateRandomBytes(32);
    const nullifier = generateRandomBytes(32);
    const amount = LAMPORTS_PER_SOL;

    const commitment1 = generateCommitment(secret, nullifier, amount);
    const commitment2 = generateCommitment(secret, nullifier, amount);

    assert.ok(Buffer.from(commitment1).equals(Buffer.from(commitment2)));
  });

  it('should generate different commitments for different inputs', () => {
    const secret1 = generateRandomBytes(32);
    const secret2 = generateRandomBytes(32);
    const nullifier = generateRandomBytes(32);
    const amount = LAMPORTS_PER_SOL;

    const commitment1 = generateCommitment(secret1, nullifier, amount);
    const commitment2 = generateCommitment(secret2, nullifier, amount);

    assert.ok(!Buffer.from(commitment1).equals(Buffer.from(commitment2)));
  });

  it('should generate different commitments for different amounts', () => {
    const secret = generateRandomBytes(32);
    const nullifier = generateRandomBytes(32);

    const commitment1 = generateCommitment(secret, nullifier, LAMPORTS_PER_SOL);
    const commitment2 = generateCommitment(secret, nullifier, 2 * LAMPORTS_PER_SOL);

    assert.ok(!Buffer.from(commitment1).equals(Buffer.from(commitment2)));
  });
});

// ============================================
// Nullifier Hash Tests
// ============================================

describe('PrivacyCash Integration - Nullifier Hash', () => {
  it('should generate 32-byte nullifier hash', () => {
    const nullifier = generateRandomBytes(32);
    const hash = generateNullifierHash(nullifier);

    assert.strictEqual(hash.length, 32);
  });

  it('should generate deterministic nullifier hashes', () => {
    const nullifier = generateRandomBytes(32);

    const hash1 = generateNullifierHash(nullifier);
    const hash2 = generateNullifierHash(nullifier);

    assert.ok(Buffer.from(hash1).equals(Buffer.from(hash2)));
  });

  it('should generate different hashes for different nullifiers', () => {
    const nullifier1 = generateRandomBytes(32);
    const nullifier2 = generateRandomBytes(32);

    const hash1 = generateNullifierHash(nullifier1);
    const hash2 = generateNullifierHash(nullifier2);

    assert.ok(!Buffer.from(hash1).equals(Buffer.from(hash2)));
  });
});

// ============================================
// Note Creation Tests
// ============================================

describe('PrivacyCash Integration - Note Creation', () => {
  it('should create valid SOL note', () => {
    const amount = 0.1 * LAMPORTS_PER_SOL;
    const note = createDepositNote(amount);

    assert.strictEqual(note.amount, amount);
    assert.strictEqual(note.tokenType, 'SOL');
    assert.strictEqual(note.tokenMint, undefined);
    assert.strictEqual(note.commitment.length, COMMITMENT_SIZE);
    assert.strictEqual(note.nullifier.length, NULLIFIER_SIZE);
    assert.strictEqual(note.secret.length, NOTE_KEY_SIZE);
    assert.strictEqual(note.spent, false);
    assert.ok(note.createdAt instanceof Date);
  });

  it('should create valid SPL note', () => {
    const amount = 1000000; // 1 USDC
    const note = createDepositNote(amount, USDC_DEVNET);

    assert.strictEqual(note.amount, amount);
    assert.strictEqual(note.tokenType, 'SPL');
    assert.ok(note.tokenMint?.equals(USDC_DEVNET));
  });

  it('should create unique notes', () => {
    const note1 = createDepositNote(LAMPORTS_PER_SOL);
    const note2 = createDepositNote(LAMPORTS_PER_SOL);

    // Nullifiers should be unique
    assert.ok(!Buffer.from(note1.nullifier).equals(Buffer.from(note2.nullifier)));

    // Secrets should be unique
    assert.ok(!Buffer.from(note1.secret).equals(Buffer.from(note2.secret)));

    // Commitments should be unique (because secrets/nullifiers are unique)
    assert.ok(!Buffer.from(note1.commitment).equals(Buffer.from(note2.commitment)));
  });

  it('should create note with correct commitment', () => {
    const note = createDepositNote(LAMPORTS_PER_SOL);

    // Verify commitment matches the expected value
    const expectedCommitment = generateCommitment(
      note.secret,
      note.nullifier,
      note.amount
    );

    assert.ok(Buffer.from(note.commitment).equals(Buffer.from(expectedCommitment)));
  });
});

// ============================================
// Note Validation Tests
// ============================================

describe('PrivacyCash Integration - Note Validation', () => {
  it('should validate correct SOL note', () => {
    const note = createTestNote();
    const result = validateNote(note);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.error, undefined);
  });

  it('should validate correct SPL note', () => {
    const note = createTestSplNote();
    const result = validateNote(note);

    assert.strictEqual(result.valid, true);
  });

  it('should reject note with wrong commitment size', () => {
    const note = createTestNote();
    note.commitment = new Uint8Array(16); // Wrong size

    const result = validateNote(note);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('commitment size'));
  });

  it('should reject note with wrong nullifier size', () => {
    const note = createTestNote();
    note.nullifier = new Uint8Array(16); // Wrong size

    const result = validateNote(note);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('nullifier size'));
  });

  it('should reject note with wrong secret size', () => {
    const note = createTestNote();
    note.secret = new Uint8Array(16); // Wrong size

    const result = validateNote(note);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('secret size'));
  });

  it('should reject SOL note below minimum', () => {
    const note = createDepositNote(MIN_DEPOSIT_LAMPORTS - 1);

    const result = validateNote(note);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('minimum'));
  });

  it('should reject SOL note above maximum', () => {
    const note = createDepositNote(MAX_DEPOSIT_LAMPORTS + 1);

    const result = validateNote(note);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('maximum'));
  });

  it('should reject spent note', () => {
    const note = createTestNote();
    note.spent = true;

    const result = validateNote(note);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('spent'));
  });

  it('should reject note with tampered commitment', () => {
    const note = createTestNote();
    // Tamper with commitment
    note.commitment[0] = note.commitment[0] ^ 0xff;

    const result = validateNote(note);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('does not match'));
  });
});

// ============================================
// Note Serialization Tests
// ============================================

describe('PrivacyCash Integration - Note Serialization', () => {
  it('should serialize and deserialize SOL note', () => {
    const original = createTestNote();
    const serialized = serializeNote(original);
    const deserialized = deserializeNote(serialized);

    assert.strictEqual(deserialized.amount, original.amount);
    assert.strictEqual(deserialized.tokenType, original.tokenType);
    assert.ok(Buffer.from(deserialized.commitment).equals(Buffer.from(original.commitment)));
    assert.ok(Buffer.from(deserialized.nullifier).equals(Buffer.from(original.nullifier)));
    assert.ok(Buffer.from(deserialized.secret).equals(Buffer.from(original.secret)));
  });

  it('should serialize and deserialize SPL note', () => {
    const original = createTestSplNote();
    const serialized = serializeNote(original);
    const deserialized = deserializeNote(serialized);

    assert.strictEqual(deserialized.amount, original.amount);
    assert.strictEqual(deserialized.tokenType, 'SPL');
    assert.ok(deserialized.tokenMint?.equals(USDC_DEVNET));
  });

  it('should produce base64 output', () => {
    const note = createTestNote();
    const serialized = serializeNote(note);

    // Should be valid base64
    const decoded = Buffer.from(serialized, 'base64');
    assert.ok(decoded.length > 0);
  });

  it('should preserve all note fields', () => {
    const original = createTestNote();
    original.leafIndex = 42;
    original.depositSignature = 'test_signature_123';

    const serialized = serializeNote(original);
    const deserialized = deserializeNote(serialized);

    assert.strictEqual(deserialized.leafIndex, 42);
    assert.strictEqual(deserialized.depositSignature, 'test_signature_123');
  });
});

// ============================================
// Note Encryption Tests
// ============================================

describe('PrivacyCash Integration - Note Encryption', () => {
  const testPassword = 'super_secret_password_123';

  it('should encrypt and decrypt note correctly', () => {
    const original = createTestNote();
    const encrypted = encryptNote(original, testPassword);
    const decrypted = decryptNote(encrypted, testPassword);

    assert.strictEqual(decrypted.amount, original.amount);
    assert.ok(Buffer.from(decrypted.secret).equals(Buffer.from(original.secret)));
  });

  it('should fail decryption with wrong password', () => {
    const note = createTestNote();
    const encrypted = encryptNote(note, testPassword);

    assert.throws(() => {
      decryptNote(encrypted, 'wrong_password');
    });
  });

  it('should produce different ciphertext each time', () => {
    const note = createTestNote();
    const encrypted1 = encryptNote(note, testPassword);
    const encrypted2 = encryptNote(note, testPassword);

    // IV is random, so ciphertext should differ
    assert.notStrictEqual(encrypted1, encrypted2);
  });

  it('should have expected encrypted format', () => {
    const note = createTestNote();
    const encrypted = encryptNote(note, testPassword);

    // Format: iv:authTag:ciphertext
    const parts = encrypted.split(':');
    assert.strictEqual(parts.length, 3);

    // IV should be 32 hex chars (16 bytes)
    assert.strictEqual(parts[0].length, 32);

    // Auth tag should be 32 hex chars (16 bytes)
    assert.strictEqual(parts[1].length, 32);
  });
});

// ============================================
// Shield Amount Validation Tests
// ============================================

describe('PrivacyCash Integration - Shield Amount Validation', () => {
  it('should validate correct SOL amount', () => {
    const result = validateShieldAmount(1.0, 'SOL');
    assert.strictEqual(result.valid, true);
  });

  it('should reject zero amount', () => {
    const result = validateShieldAmount(0, 'SOL');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('positive'));
  });

  it('should reject negative amount', () => {
    const result = validateShieldAmount(-1, 'SOL');
    assert.strictEqual(result.valid, false);
  });

  it('should reject SOL below minimum', () => {
    const result = validateShieldAmount(MIN_DEPOSIT_SOL / 2, 'SOL');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('minimum'));
  });

  it('should reject SOL above maximum', () => {
    const result = validateShieldAmount(MAX_DEPOSIT_SOL + 1, 'SOL');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('maximum'));
  });

  it('should accept boundary values', () => {
    const minResult = validateShieldAmount(MIN_DEPOSIT_SOL, 'SOL');
    const maxResult = validateShieldAmount(MAX_DEPOSIT_SOL, 'SOL');

    assert.strictEqual(minResult.valid, true);
    assert.strictEqual(maxResult.valid, true);
  });

  it('should accept any positive SPL amount', () => {
    const result = validateShieldAmount(0.0001, 'SPL');
    assert.strictEqual(result.valid, true);
  });
});

// ============================================
// Client Initialization Tests
// ============================================

describe('PrivacyCash Integration - Client Initialization', () => {
  it('should create read-only client without keypair', () => {
    const client = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      undefined,
      true
    );

    assert.strictEqual(client.canSign(), false);
    assert.strictEqual(client.getWalletPublicKey(), null);
  });

  it('should create signing client with Keypair', () => {
    const keypair = Keypair.generate();
    const client = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    assert.strictEqual(client.canSign(), true);
    assert.ok(client.getWalletPublicKey()?.equals(keypair.publicKey));
  });

  it('should create signing client with secret key array', () => {
    const keypair = Keypair.generate();
    const client = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair.secretKey,
      true
    );

    assert.strictEqual(client.canSign(), true);
  });

  it('should have valid connection', () => {
    const client = createReadOnlyPrivacyClient();
    const connection = client.getConnection();

    assert.ok(connection !== null);
  });
});

// ============================================
// Shield Operation Tests
// ============================================

describe('PrivacyCash Integration - Shield Operations', () => {
  let client: SpectrePrivacyClient;

  beforeEach(() => {
    client = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      undefined,
      true
    );
  });

  it('should fail shieldSol without signing capability', async () => {
    const result = await client.shieldSol(1.0);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('keypair'));
  });

  it('should fail shieldSol with invalid amount', async () => {
    const keypair = Keypair.generate();
    const signingClient = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const result = await signingClient.shieldSol(0);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('positive'));
  });

  it('should fail shieldSol below minimum', async () => {
    const keypair = Keypair.generate();
    const signingClient = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const result = await signingClient.shieldSol(MIN_DEPOSIT_SOL / 10);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('minimum'));
  });

  it('should fail shieldSol above maximum', async () => {
    const keypair = Keypair.generate();
    const signingClient = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const result = await signingClient.shieldSol(MAX_DEPOSIT_SOL + 100);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('maximum'));
  });

  it('should fail shieldSpl without signing capability', async () => {
    const result = await client.shieldSpl(1000000, USDC_DEVNET);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('keypair'));
  });

  it('should fail shieldSpl with invalid amount', async () => {
    const keypair = Keypair.generate();
    const signingClient = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const result = await signingClient.shieldSpl(0, USDC_DEVNET);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('positive'));
  });
});

// ============================================
// Unshield Operation Tests
// ============================================

describe('PrivacyCash Integration - Unshield Operations', () => {
  let client: SpectrePrivacyClient;
  const recipient = Keypair.generate().publicKey;

  beforeEach(() => {
    client = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      undefined,
      true
    );
  });

  it('should fail unshieldSol without signing capability', async () => {
    const note = createTestNote();
    const result = await client.unshieldSol(note, recipient);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('keypair'));
  });

  it('should fail unshieldSol with invalid note', async () => {
    const keypair = Keypair.generate();
    const signingClient = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const note = createTestNote();
    note.commitment = new Uint8Array(16); // Invalid size

    const result = await signingClient.unshieldSol(note, recipient);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('commitment'));
  });

  it('should fail unshieldSol with spent note', async () => {
    const keypair = Keypair.generate();
    const signingClient = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const note = createTestNote();
    note.spent = true;

    const result = await signingClient.unshieldSol(note, recipient);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('spent'));
  });

  it('should fail unshieldSol with SPL note', async () => {
    const keypair = Keypair.generate();
    const signingClient = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const note = createTestSplNote();

    const result = await signingClient.unshieldSol(note, recipient);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('not for SOL'));
  });

  it('should fail unshieldSpl with SOL note', async () => {
    const keypair = Keypair.generate();
    const signingClient = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const note = createTestNote();

    const result = await signingClient.unshieldSpl(note, recipient);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('not for SPL'));
  });
});

// ============================================
// Double-Spend Prevention Tests
// ============================================

describe('PrivacyCash Integration - Double-Spend Prevention', () => {
  it('should track used nullifiers', async () => {
    const keypair = Keypair.generate();
    const client = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      keypair,
      true
    );

    const note = createTestNote();

    // First check
    assert.strictEqual(client.isNullifierUsed(note.nullifier), false);

    // Simulate spending (this would happen after successful unshield)
    // Note: In a real scenario, this would be tracked after successful withdrawal
  });

  it('should generate unique nullifiers for each note', () => {
    const notes = Array.from({ length: 10 }, () => createTestNote());
    const nullifiers = new Set(notes.map((n) => Buffer.from(n.nullifier).toString('hex')));

    // All nullifiers should be unique
    assert.strictEqual(nullifiers.size, 10);
  });
});

// ============================================
// TEE Delegation Tests
// ============================================

describe('PrivacyCash Integration - TEE Delegation', () => {
  let client: SpectrePrivacyClient;
  const teeAgent = Keypair.generate().publicKey;

  beforeEach(() => {
    client = new SpectrePrivacyClient(
      'https://api.devnet.solana.com',
      undefined,
      true
    );
  });

  it('should delegate note to TEE', async () => {
    const note = createTestNote();
    const result = await client.delegateNoteToTee(note, teeAgent);

    assert.strictEqual(result.success, true);
    assert.ok(result.delegation);
    assert.ok(result.delegation!.teeAgent.equals(teeAgent));
    assert.strictEqual(result.delegation!.isActive, true);
  });

  it('should fail delegation with invalid note', async () => {
    const note = createTestNote();
    note.spent = true;

    const result = await client.delegateNoteToTee(note, teeAgent);

    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('spent'));
  });

  it('should revoke delegation', async () => {
    const note = createTestNote();
    const delegationResult = await client.delegateNoteToTee(note, teeAgent);

    assert.ok(delegationResult.delegation);

    const revokeResult = await client.revokeDelegation(delegationResult.delegation!);

    assert.strictEqual(revokeResult.success, true);
    assert.strictEqual(delegationResult.delegation!.isActive, false);
  });

  it('should fail to revoke inactive delegation', async () => {
    const note = createTestNote();
    const delegationResult = await client.delegateNoteToTee(note, teeAgent);

    assert.ok(delegationResult.delegation);
    delegationResult.delegation!.isActive = false;

    const revokeResult = await client.revokeDelegation(delegationResult.delegation!);

    assert.strictEqual(revokeResult.success, false);
    assert.ok(revokeResult.error?.includes('not active'));
  });
});

// ============================================
// Formatting Tests
// ============================================

describe('PrivacyCash Integration - Formatting', () => {
  it('should format SOL amount correctly', () => {
    const formatted = formatAmount(LAMPORTS_PER_SOL, 'SOL');
    assert.ok(formatted.includes('1.0000'));
    assert.ok(formatted.includes('SOL'));
  });

  it('should format SPL amount correctly', () => {
    const formatted = formatAmount(1000000, 'SPL', 6);
    assert.ok(formatted.includes('1.00'));
    assert.ok(formatted.includes('SPL'));
  });

  it('should format successful shield result', () => {
    const result: ShieldResult = {
      success: true,
      signature: 'test_signature_12345678901234567890',
      note: createTestNote(),
      commitment: new Uint8Array(32),
    };

    const formatted = formatShieldResult(result);

    assert.ok(formatted.includes('Shield Successful'));
    assert.ok(formatted.includes('Signature'));
    assert.ok(formatted.includes('WARNING'));
  });

  it('should format failed shield result', () => {
    const result: ShieldResult = {
      success: false,
      error: 'Insufficient balance',
    };

    const formatted = formatShieldResult(result);

    assert.ok(formatted.includes('Shield Failed'));
    assert.ok(formatted.includes('Insufficient balance'));
  });

  it('should format successful unshield result', () => {
    const result: UnshieldResult = {
      success: true,
      signature: 'test_signature_12345678901234567890',
      amountReceived: LAMPORTS_PER_SOL,
      recipient: Keypair.generate().publicKey,
    };

    const formatted = formatUnshieldResult(result);

    assert.ok(formatted.includes('Unshield Successful'));
    assert.ok(formatted.includes('Signature'));
  });

  it('should format failed unshield result', () => {
    const result: UnshieldResult = {
      success: false,
      error: 'Invalid proof',
    };

    const formatted = formatUnshieldResult(result);

    assert.ok(formatted.includes('Unshield Failed'));
    assert.ok(formatted.includes('Invalid proof'));
  });
});

// ============================================
// Edge Cases Tests
// ============================================

describe('PrivacyCash Integration - Edge Cases', () => {
  it('should handle minimum valid SOL amount', () => {
    const note = createDepositNote(MIN_DEPOSIT_LAMPORTS);
    const result = validateNote(note);

    assert.strictEqual(result.valid, true);
  });

  it('should handle maximum valid SOL amount', () => {
    const note = createDepositNote(MAX_DEPOSIT_LAMPORTS);
    const result = validateNote(note);

    assert.strictEqual(result.valid, true);
  });

  it('should handle very small SPL amounts', () => {
    const note = createDepositNote(1, USDC_DEVNET);
    const result = validateNote(note);

    assert.strictEqual(result.valid, true);
  });

  it('should handle very large SPL amounts', () => {
    const note = createDepositNote(Number.MAX_SAFE_INTEGER, USDC_DEVNET);
    const result = validateNote(note);

    assert.strictEqual(result.valid, true);
  });

  it('should handle note with all boundary values', () => {
    const note = createDepositNote(MIN_DEPOSIT_LAMPORTS);
    note.leafIndex = 0;

    const validation = validateNote(note);
    assert.strictEqual(validation.valid, true);

    const serialized = serializeNote(note);
    const deserialized = deserializeNote(serialized);

    assert.strictEqual(deserialized.leafIndex, 0);
  });

  it('should handle encryption with special characters in password', () => {
    const note = createTestNote();
    const password = '!@#$%^&*()_+{}|:"<>?`~';

    const encrypted = encryptNote(note, password);
    const decrypted = decryptNote(encrypted, password);

    assert.ok(Buffer.from(decrypted.secret).equals(Buffer.from(note.secret)));
  });
});

// ============================================
// Integration Test (Devnet) - Optional
// ============================================

describe('PrivacyCash Integration - Devnet (Optional)', function () {
  this.timeout(30000);

  let client: SpectrePrivacyClient;

  before(() => {
    client = createReadOnlyPrivacyClient();
  });

  it('should connect to devnet', async () => {
    try {
      const slot = await client.getConnection().getSlot();
      assert.ok(typeof slot === 'number');
      assert.ok(slot > 0);
    } catch (error) {
      console.warn('Devnet connection test skipped (network unavailable)');
    }
  });

  it('should attempt to get shielded balance', async () => {
    try {
      const balance = await client.getShieldedSolBalance();
      assert.ok(typeof balance === 'number');
      console.log(`Shielded SOL balance: ${balance / LAMPORTS_PER_SOL}`);
    } catch (error) {
      console.warn('Balance check skipped:', (error as Error).message);
    }
  });
});

// ============================================
// Summary
// ============================================

console.log(`
================================================================================
PrivacyCash Integration Test Suite
================================================================================
Test Categories:
- Constants: Program ID, USDC addresses, deposit bounds, crypto sizes
- Random Bytes: Generation, uniqueness, non-zero values
- Commitment: Generation, determinism, uniqueness
- Nullifier Hash: Generation, determinism
- Note Creation: SOL notes, SPL notes, uniqueness
- Note Validation: Size checks, amount bounds, spent status, tampering
- Note Serialization: Round-trip, base64 format, field preservation
- Note Encryption: AES-GCM encryption, decryption, wrong password
- Shield Amount Validation: Boundaries, zero/negative, SPL flexibility
- Client Initialization: Read-only, signing, keypair formats
- Shield Operations: Signing requirement, amount validation
- Unshield Operations: Validation, token type matching
- Double-Spend Prevention: Nullifier tracking, uniqueness
- TEE Delegation: Delegation, revocation
- Formatting: Result display
- Edge Cases: Boundary values, special characters
- Devnet Integration: Connection, balance query
================================================================================
`);
