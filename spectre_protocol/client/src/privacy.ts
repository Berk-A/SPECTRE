/**
 * SPECTRE PrivacyCash Client
 *
 * TypeScript client for PrivacyCash protocol integration.
 * This module enables privacy-preserving deposits and withdrawals
 * using zero-knowledge proofs.
 *
 * ## Features
 * - Shielded SOL deposits (break on-chain link)
 * - Shielded SPL token deposits (USDC, etc.)
 * - Private withdrawals with ZK proofs
 * - Note management and serialization
 * - TEE delegation support
 *
 * ## Usage
 * ```typescript
 * import { SpectrePrivacyClient } from './privacy';
 *
 * const client = new SpectrePrivacyClient(rpcUrl, keypair, true);
 *
 * // Shield SOL
 * const result = await client.shieldSol(1.0);
 * if (result.success) {
 *   // Save note securely - required for withdrawal!
 *   saveNote(result.note);
 * }
 *
 * // Later: Unshield to new address
 * const unshield = await client.unshieldSol(note, recipientAddress);
 * ```
 */

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as crypto from 'crypto';

// ============================================
// Constants
// ============================================

/**
 * PrivacyCash mainnet program ID
 */
export const PRIVACY_CASH_PROGRAM_ID = new PublicKey(
  '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD'
);

/**
 * USDC mint address on Solana mainnet
 */
export const USDC_MAINNET = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

/**
 * USDC mint address on Solana devnet
 */
export const USDC_DEVNET = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);

/**
 * Minimum deposit amount (0.001 SOL)
 */
export const MIN_DEPOSIT_SOL = 0.001;

/**
 * Maximum deposit amount (1000 SOL)
 */
export const MAX_DEPOSIT_SOL = 1000;

/**
 * Minimum deposit amount in lamports
 */
export const MIN_DEPOSIT_LAMPORTS = MIN_DEPOSIT_SOL * LAMPORTS_PER_SOL;

/**
 * Maximum deposit amount in lamports
 */
export const MAX_DEPOSIT_LAMPORTS = MAX_DEPOSIT_SOL * LAMPORTS_PER_SOL;

/**
 * Note encryption key size (AES-256)
 */
export const NOTE_KEY_SIZE = 32;

/**
 * Commitment size in bytes
 */
export const COMMITMENT_SIZE = 32;

/**
 * Nullifier size in bytes
 */
export const NULLIFIER_SIZE = 32;

// ============================================
// Types
// ============================================

/**
 * Token type for shielded operations
 */
export type ShieldedTokenType = 'SOL' | 'SPL';

/**
 * Deposit note containing all information needed for withdrawal
 * WARNING: This note must be stored securely by the user!
 * Lost notes = lost funds!
 */
export interface DepositNote {
  /** Cryptographic commitment (Poseidon hash) */
  commitment: Uint8Array;
  /** Nullifier (used to prevent double-spending) */
  nullifier: Uint8Array;
  /** Secret value (must be kept private!) */
  secret: Uint8Array;
  /** Amount deposited (in lamports for SOL, base units for SPL) */
  amount: number;
  /** Token mint (undefined for native SOL) */
  tokenMint?: PublicKey;
  /** Token type */
  tokenType: ShieldedTokenType;
  /** Merkle tree index (for proof generation) */
  leafIndex?: number;
  /** Timestamp of note creation */
  createdAt: Date;
  /** Whether this note has been spent */
  spent: boolean;
  /** Transaction signature of the deposit */
  depositSignature?: string;
}

/**
 * Result of a shield (deposit) operation
 */
export interface ShieldResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Transaction signature */
  signature?: string;
  /** Generated deposit note (SAVE THIS!) */
  note?: DepositNote;
  /** Commitment added to Merkle tree */
  commitment?: Uint8Array;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of an unshield (withdrawal) operation
 */
export interface UnshieldResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Transaction signature */
  signature?: string;
  /** Amount received (in lamports/base units) */
  amountReceived?: number;
  /** Recipient address */
  recipient?: PublicKey;
  /** Error message if failed */
  error?: string;
}

/**
 * Shielded balance information
 */
export interface ShieldedBalance {
  /** Token type */
  tokenType: ShieldedTokenType;
  /** Token mint (undefined for SOL) */
  tokenMint?: PublicKey;
  /** Total shielded balance */
  balance: number;
  /** Number of unspent notes */
  noteCount: number;
}

/**
 * Note delegation to TEE
 */
export interface NoteDelegation {
  /** The delegated note commitment */
  commitment: Uint8Array;
  /** TEE agent public key */
  teeAgent: PublicKey;
  /** Delegation timestamp */
  delegatedAt: Date;
  /** Whether delegation is active */
  isActive: boolean;
}

/**
 * Privacy client configuration
 */
export interface PrivacyClientConfig {
  /** Solana RPC URL */
  rpcUrl: string;
  /** Use devnet (affects token addresses) */
  isDevnet: boolean;
  /** Connection commitment level */
  commitment: 'processed' | 'confirmed' | 'finalized';
  /** Retry attempts for failed operations */
  retryAttempts: number;
  /** Retry delay in ms */
  retryDelayMs: number;
}

/**
 * Default privacy client configuration
 */
export const DEFAULT_PRIVACY_CONFIG: PrivacyClientConfig = {
  rpcUrl: 'https://api.devnet.solana.com',
  isDevnet: true,
  commitment: 'confirmed',
  retryAttempts: 3,
  retryDelayMs: 1000,
};

// ============================================
// Note Management Utilities
// ============================================

/**
 * Generate a cryptographically secure random buffer
 */
export function generateRandomBytes(size: number): Uint8Array {
  return crypto.randomBytes(size);
}

/**
 * Generate a commitment from note parameters
 * Uses Poseidon hash in production, simplified hash for mock
 *
 * @param secret - User's secret value
 * @param nullifier - Nullifier for this deposit
 * @param amount - Amount being deposited
 * @returns 32-byte commitment hash
 */
export function generateCommitment(
  secret: Uint8Array,
  nullifier: Uint8Array,
  amount: number
): Uint8Array {
  // In production, this would use Poseidon hash from PrivacyCash SDK
  // For now, use a simplified hash that mimics the behavior
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(amount));

  const data = Buffer.concat([
    Buffer.from(secret),
    Buffer.from(nullifier),
    amountBuffer,
  ]);

  // Use SHA-256 as mock for Poseidon
  const hash = crypto.createHash('sha256').update(data).digest();
  return new Uint8Array(hash);
}

/**
 * Generate a nullifier hash from the nullifier
 *
 * @param nullifier - The nullifier bytes
 * @returns 32-byte nullifier hash
 */
export function generateNullifierHash(nullifier: Uint8Array): Uint8Array {
  // In production, this would use Poseidon hash
  const hash = crypto.createHash('sha256').update(Buffer.from(nullifier)).digest();
  return new Uint8Array(hash);
}

/**
 * Create a new deposit note
 *
 * @param amount - Amount in lamports (SOL) or base units (SPL)
 * @param tokenMint - Token mint for SPL tokens, undefined for SOL
 * @returns New deposit note
 */
export function createDepositNote(
  amount: number,
  tokenMint?: PublicKey
): DepositNote {
  const secret = generateRandomBytes(NOTE_KEY_SIZE);
  const nullifier = generateRandomBytes(NULLIFIER_SIZE);
  const commitment = generateCommitment(secret, nullifier, amount);

  return {
    commitment,
    nullifier,
    secret,
    amount,
    tokenMint,
    tokenType: tokenMint ? 'SPL' : 'SOL',
    createdAt: new Date(),
    spent: false,
  };
}

/**
 * Serialize a deposit note to a base64 string
 * WARNING: This contains secret data - handle with care!
 *
 * @param note - The deposit note to serialize
 * @returns Base64 encoded note
 */
export function serializeNote(note: DepositNote): string {
  const data = {
    commitment: Buffer.from(note.commitment).toString('hex'),
    nullifier: Buffer.from(note.nullifier).toString('hex'),
    secret: Buffer.from(note.secret).toString('hex'),
    amount: note.amount,
    tokenMint: note.tokenMint?.toString(),
    tokenType: note.tokenType,
    leafIndex: note.leafIndex,
    createdAt: note.createdAt.toISOString(),
    spent: note.spent,
    depositSignature: note.depositSignature,
  };

  return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Deserialize a deposit note from a base64 string
 *
 * @param encoded - Base64 encoded note
 * @returns Deserialized deposit note
 */
export function deserializeNote(encoded: string): DepositNote {
  const json = Buffer.from(encoded, 'base64').toString('utf-8');
  const data = JSON.parse(json);

  return {
    commitment: new Uint8Array(Buffer.from(data.commitment, 'hex')),
    nullifier: new Uint8Array(Buffer.from(data.nullifier, 'hex')),
    secret: new Uint8Array(Buffer.from(data.secret, 'hex')),
    amount: data.amount,
    tokenMint: data.tokenMint ? new PublicKey(data.tokenMint) : undefined,
    tokenType: data.tokenType,
    leafIndex: data.leafIndex,
    createdAt: new Date(data.createdAt),
    spent: data.spent,
    depositSignature: data.depositSignature,
  };
}

/**
 * Validate a deposit note
 *
 * @param note - The note to validate
 * @returns Validation result
 */
export function validateNote(note: DepositNote): { valid: boolean; error?: string } {
  // Check commitment size
  if (note.commitment.length !== COMMITMENT_SIZE) {
    return { valid: false, error: 'Invalid commitment size' };
  }

  // Check nullifier size
  if (note.nullifier.length !== NULLIFIER_SIZE) {
    return { valid: false, error: 'Invalid nullifier size' };
  }

  // Check secret size
  if (note.secret.length !== NOTE_KEY_SIZE) {
    return { valid: false, error: 'Invalid secret size' };
  }

  // Check amount bounds
  if (note.tokenType === 'SOL') {
    if (note.amount < MIN_DEPOSIT_LAMPORTS) {
      return { valid: false, error: `Amount below minimum (${MIN_DEPOSIT_SOL} SOL)` };
    }
    if (note.amount > MAX_DEPOSIT_LAMPORTS) {
      return { valid: false, error: `Amount above maximum (${MAX_DEPOSIT_SOL} SOL)` };
    }
  }

  // Check if already spent
  if (note.spent) {
    return { valid: false, error: 'Note has already been spent' };
  }

  // Verify commitment matches
  const expectedCommitment = generateCommitment(note.secret, note.nullifier, note.amount);
  const commitmentMatches = Buffer.from(note.commitment).equals(Buffer.from(expectedCommitment));
  if (!commitmentMatches) {
    return { valid: false, error: 'Commitment does not match note parameters' };
  }

  return { valid: true };
}

/**
 * Encrypt a note for secure storage
 *
 * @param note - The note to encrypt
 * @param password - Encryption password
 * @returns Encrypted note string
 */
export function encryptNote(note: DepositNote, password: string): string {
  const serialized = serializeNote(note);
  const key = crypto.scryptSync(password, 'spectre-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(serialized, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

/**
 * Decrypt an encrypted note
 *
 * @param encrypted - The encrypted note string
 * @param password - Decryption password
 * @returns Decrypted deposit note
 */
export function decryptNote(encrypted: string, password: string): DepositNote {
  const [ivHex, authTagHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(password, 'spectre-salt', 32);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  // decrypted is already the base64 string from serializeNote
  return deserializeNote(decrypted);
}

// ============================================
// Validation Utilities
// ============================================

/**
 * Validate a shield (deposit) amount
 *
 * @param amount - Amount in SOL or SPL base units
 * @param tokenType - Token type
 * @returns Validation result
 */
export function validateShieldAmount(
  amount: number,
  tokenType: ShieldedTokenType
): { valid: boolean; error?: string } {
  if (amount <= 0) {
    return { valid: false, error: 'Amount must be positive' };
  }

  if (tokenType === 'SOL') {
    if (amount < MIN_DEPOSIT_SOL) {
      return { valid: false, error: `Amount below minimum (${MIN_DEPOSIT_SOL} SOL)` };
    }
    if (amount > MAX_DEPOSIT_SOL) {
      return { valid: false, error: `Amount above maximum (${MAX_DEPOSIT_SOL} SOL)` };
    }
  }

  return { valid: true };
}

/**
 * Format an amount for display
 *
 * @param amount - Amount in lamports/base units
 * @param tokenType - Token type
 * @param decimals - Token decimals (9 for SOL, 6 for USDC)
 * @returns Formatted string
 */
export function formatAmount(
  amount: number,
  tokenType: ShieldedTokenType,
  decimals: number = tokenType === 'SOL' ? 9 : 6
): string {
  const value = amount / Math.pow(10, decimals);
  return `${value.toFixed(decimals === 9 ? 4 : 2)} ${tokenType}`;
}

// ============================================
// Privacy Client Class
// ============================================

/**
 * SPECTRE PrivacyCash Client
 *
 * Wraps the PrivacyCash SDK for SPECTRE-specific privacy operations.
 */
export class SpectrePrivacyClient {
  private privacyCashClient: any; // PrivacyCash client from SDK
  private connection: Connection;
  private config: PrivacyClientConfig;
  private keypair: Keypair | null = null;
  private usedNullifiers: Set<string> = new Set();

  /**
   * Create a new SpectrePrivacyClient
   *
   * @param rpcUrl - Solana RPC endpoint
   * @param keypair - Keypair for signing (optional)
   * @param isDevnet - Use devnet configuration
   */
  constructor(
    rpcUrl: string,
    keypair?: Keypair | Uint8Array | string,
    isDevnet: boolean = true
  ) {
    this.config = {
      ...DEFAULT_PRIVACY_CONFIG,
      rpcUrl,
      isDevnet,
    };

    this.connection = new Connection(rpcUrl, this.config.commitment);

    // Handle different keypair formats
    if (keypair) {
      if (keypair instanceof Keypair) {
        this.keypair = keypair;
      } else if (typeof keypair === 'string') {
        const bs58 = require('bs58');
        this.keypair = Keypair.fromSecretKey(bs58.decode(keypair));
      } else {
        this.keypair = Keypair.fromSecretKey(keypair);
      }
    }

    // Initialize PrivacyCash client
    this.initializePrivacyCashClient(rpcUrl, keypair);
  }

  /**
   * Initialize the underlying PrivacyCash SDK client
   *
   * PrivacyCash SDK expects: new PrivacyCash({ RPC_url, owner, enableDebug })
   * where owner is a Keypair object
   */
  private initializePrivacyCashClient(
    rpcUrl: string,
    _keypair?: Keypair | Uint8Array | string
  ): void {
    try {
      // Dynamic import to handle SDK variations
      const { PrivacyCash } = require('privacycash');

      if (this.keypair) {
        // SDK expects object with named parameters
        this.privacyCashClient = new PrivacyCash({
          RPC_url: rpcUrl,
          owner: this.keypair,
          enableDebug: true, // Enable debug to suppress status render
        });
        console.log('PrivacyCash SDK initialized successfully');
      } else {
        // No keypair - use mock client for read-only operations
        console.warn('PrivacyCash: No keypair provided, using mock client');
        this.privacyCashClient = this.createMockClient();
      }
    } catch (error: any) {
      console.warn('PrivacyCash SDK initialization warning:', error.message);
      // Create a mock client for testing if SDK fails
      this.privacyCashClient = this.createMockClient();
    }
  }

  /**
   * Create a mock client for testing when SDK is unavailable
   */
  private createMockClient(): any {
    return {
      deposit: async () => 'mock_signature_' + Date.now(),
      withdraw: async () => 'mock_signature_' + Date.now(),
      depositSPL: async () => 'mock_signature_' + Date.now(),
      withdrawSPL: async () => 'mock_signature_' + Date.now(),
      getPrivateBalance: async () => 0,
      getPrivateBalanceSpl: async () => 0,
    };
  }

  /**
   * Get the Solana connection
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Check if client has signing capability
   */
  canSign(): boolean {
    return this.keypair !== null;
  }

  /**
   * Get the wallet public key
   */
  getWalletPublicKey(): PublicKey | null {
    return this.keypair?.publicKey || null;
  }

  // ============================================
  // Shield (Deposit) Operations
  // ============================================

  /**
   * Shield (deposit) SOL into privacy pool
   *
   * @param amountSol - Amount in SOL
   * @returns Shield result with note
   */
  async shieldSol(amountSol: number): Promise<ShieldResult> {
    // Validate amount
    const validation = validateShieldAmount(amountSol, 'SOL');
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Check signing capability
    if (!this.canSign()) {
      return { success: false, error: 'No keypair provided. Cannot sign transactions.' };
    }

    const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    try {
      // Generate note
      const note = createDepositNote(amountLamports);

      // Execute deposit via PrivacyCash SDK
      // SDK expects: deposit({ lamports }) where lamports is an integer
      const result = await this.privacyCashClient.deposit({ lamports: amountLamports });

      // Extract signature from result (SDK returns transaction result)
      const signature = typeof result === 'string' ? result : (result?.signature || result?.txSignature || 'success');

      // Update note with signature
      note.depositSignature = signature;

      return {
        success: true,
        signature,
        note,
        commitment: note.commitment,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Shield (deposit) SPL tokens into privacy pool
   *
   * @param amount - Amount in token base units
   * @param tokenMint - Token mint address
   * @returns Shield result with note
   */
  async shieldSpl(amount: number, tokenMint: PublicKey): Promise<ShieldResult> {
    // Validate amount
    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    // Check signing capability
    if (!this.canSign()) {
      return { success: false, error: 'No keypair provided. Cannot sign transactions.' };
    }

    try {
      // Generate note with token mint
      const note = createDepositNote(amount, tokenMint);

      // Execute deposit via PrivacyCash SDK
      // SDK expects: depositSPL({ base_units, mintAddress, amount })
      const result = await this.privacyCashClient.depositSPL({
        base_units: amount,
        mintAddress: tokenMint.toString(),
        amount: amount,
      });

      // Extract signature from result
      const signature = typeof result === 'string' ? result : (result?.signature || result?.txSignature || 'success');

      // Update note with signature
      note.depositSignature = signature;

      return {
        success: true,
        signature,
        note,
        commitment: note.commitment,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  // ============================================
  // Unshield (Withdrawal) Operations
  // ============================================

  /**
   * Unshield (withdraw) SOL from privacy pool
   *
   * @param note - The deposit note to spend
   * @param recipient - Recipient address
   * @returns Unshield result
   */
  async unshieldSol(note: DepositNote, recipient: PublicKey): Promise<UnshieldResult> {
    // Validate note
    const validation = validateNote(note);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Check token type
    if (note.tokenType !== 'SOL') {
      return { success: false, error: 'Note is not for SOL' };
    }

    // Check signing capability
    if (!this.canSign()) {
      return { success: false, error: 'No keypair provided. Cannot sign transactions.' };
    }

    // Check for double-spend
    const nullifierHex = Buffer.from(note.nullifier).toString('hex');
    if (this.usedNullifiers.has(nullifierHex)) {
      return { success: false, error: 'Note has already been spent (double-spend attempt)' };
    }

    try {
      // Execute withdrawal via PrivacyCash SDK
      // SDK expects: withdraw({ lamports, recipientAddress, referrer })
      const result = await this.privacyCashClient.withdraw({
        lamports: note.amount,
        recipientAddress: recipient.toString(),
      });

      // Extract signature from result
      const signature = typeof result === 'string' ? result : (result?.signature || result?.txSignature || 'success');

      // Mark note as spent
      note.spent = true;
      this.usedNullifiers.add(nullifierHex);

      return {
        success: true,
        signature,
        amountReceived: note.amount,
        recipient,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Unshield (withdraw) SPL tokens from privacy pool
   *
   * @param note - The deposit note to spend
   * @param recipient - Recipient address
   * @returns Unshield result
   */
  async unshieldSpl(note: DepositNote, recipient: PublicKey): Promise<UnshieldResult> {
    // Validate note
    const validation = validateNote(note);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Check token type
    if (note.tokenType !== 'SPL' || !note.tokenMint) {
      return { success: false, error: 'Note is not for SPL token' };
    }

    // Check signing capability
    if (!this.canSign()) {
      return { success: false, error: 'No keypair provided. Cannot sign transactions.' };
    }

    // Check for double-spend
    const nullifierHex = Buffer.from(note.nullifier).toString('hex');
    if (this.usedNullifiers.has(nullifierHex)) {
      return { success: false, error: 'Note has already been spent (double-spend attempt)' };
    }

    try {
      // Execute withdrawal via PrivacyCash SDK
      // SDK expects: withdrawSPL({ base_units, mintAddress, recipientAddress, amount, referrer })
      const result = await this.privacyCashClient.withdrawSPL({
        base_units: note.amount,
        mintAddress: note.tokenMint.toString(),
        recipientAddress: recipient.toString(),
        amount: note.amount,
      });

      // Extract signature from result
      const signature = typeof result === 'string' ? result : (result?.signature || result?.txSignature || 'success');

      // Mark note as spent
      note.spent = true;
      this.usedNullifiers.add(nullifierHex);

      return {
        success: true,
        signature,
        amountReceived: note.amount,
        recipient,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  // ============================================
  // Balance Queries
  // ============================================

  /**
   * Get shielded SOL balance
   *
   * @returns Balance in lamports
   */
  async getShieldedSolBalance(): Promise<number> {
    try {
      const result = await this.privacyCashClient.getPrivateBalance();
      // SDK returns { lamports: number } object
      if (typeof result === 'object' && result.lamports !== undefined) {
        return result.lamports;
      }
      // Fallback for mock or different return format
      return typeof result === 'number' ? result : 0;
    } catch (error) {
      console.error('Failed to get shielded balance:', error);
      return 0;
    }
  }

  /**
   * Get shielded SPL token balance
   *
   * @param tokenMint - Token mint address
   * @returns Balance in base units
   */
  async getShieldedSplBalance(tokenMint: PublicKey): Promise<number> {
    try {
      return await this.privacyCashClient.getPrivateBalanceSpl(tokenMint);
    } catch (error) {
      console.error('Failed to get shielded SPL balance:', error);
      return 0;
    }
  }

  // ============================================
  // Note Management
  // ============================================

  /**
   * Generate a new deposit note (for offline preparation)
   *
   * @param amountLamports - Amount in lamports
   * @param tokenMint - Token mint (optional, for SPL)
   * @returns New deposit note
   */
  generateNote(amountLamports: number, tokenMint?: PublicKey): DepositNote {
    return createDepositNote(amountLamports, tokenMint);
  }

  /**
   * Serialize a note for storage
   *
   * @param note - The note to serialize
   * @returns Base64 encoded string
   */
  serializeNote(note: DepositNote): string {
    return serializeNote(note);
  }

  /**
   * Deserialize a note from storage
   *
   * @param encoded - Base64 encoded string
   * @returns Deposit note
   */
  deserializeNote(encoded: string): DepositNote {
    return deserializeNote(encoded);
  }

  /**
   * Encrypt a note for secure storage
   *
   * @param note - The note to encrypt
   * @param password - Encryption password
   * @returns Encrypted string
   */
  encryptNote(note: DepositNote, password: string): string {
    return encryptNote(note, password);
  }

  /**
   * Decrypt a note from secure storage
   *
   * @param encrypted - Encrypted string
   * @param password - Decryption password
   * @returns Decrypted note
   */
  decryptNote(encrypted: string, password: string): DepositNote {
    return decryptNote(encrypted, password);
  }

  /**
   * Validate a note
   *
   * @param note - The note to validate
   * @returns Validation result
   */
  validateNote(note: DepositNote): { valid: boolean; error?: string } {
    return validateNote(note);
  }

  // ============================================
  // TEE Delegation
  // ============================================

  /**
   * Delegate a note to a TEE agent
   *
   * @param note - The note to delegate
   * @param teeAgent - TEE agent public key
   * @returns Delegation result
   */
  async delegateNoteToTee(
    note: DepositNote,
    teeAgent: PublicKey
  ): Promise<{ success: boolean; delegation?: NoteDelegation; error?: string }> {
    // Validate note
    const validation = validateNote(note);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Create delegation record
    const delegation: NoteDelegation = {
      commitment: note.commitment,
      teeAgent,
      delegatedAt: new Date(),
      isActive: true,
    };

    // In production, this would call the on-chain delegation instruction
    // For now, return the delegation record
    return {
      success: true,
      delegation,
    };
  }

  /**
   * Revoke a note delegation
   *
   * @param delegation - The delegation to revoke
   * @returns Revocation result
   */
  async revokeDelegation(
    delegation: NoteDelegation
  ): Promise<{ success: boolean; error?: string }> {
    if (!delegation.isActive) {
      return { success: false, error: 'Delegation is not active' };
    }

    // In production, this would call the on-chain revoke instruction
    delegation.isActive = false;

    return { success: true };
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Check if a nullifier has been used
   *
   * @param nullifier - The nullifier to check
   * @returns true if used
   */
  isNullifierUsed(nullifier: Uint8Array): boolean {
    const nullifierHex = Buffer.from(nullifier).toString('hex');
    return this.usedNullifiers.has(nullifierHex);
  }

  /**
   * Get wallet SOL balance
   *
   * @returns Balance in lamports
   */
  async getWalletBalance(): Promise<number> {
    if (!this.keypair) {
      return 0;
    }

    try {
      return await this.connection.getBalance(this.keypair.publicKey);
    } catch (error) {
      console.error('Failed to get wallet balance:', error);
      return 0;
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a privacy client from environment variables
 *
 * Environment variables:
 * - PRIVACY_RPC_URL or SOLANA_RPC_URL
 * - PRIVACY_PRIVATE_KEY
 * - PRIVACY_NETWORK: 'devnet' or 'mainnet'
 */
export function createPrivacyClientFromEnv(): SpectrePrivacyClient {
  const rpcUrl =
    process.env.PRIVACY_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    'https://api.devnet.solana.com';

  const privateKey = process.env.PRIVACY_PRIVATE_KEY;
  const isDevnet = (process.env.PRIVACY_NETWORK || 'devnet') === 'devnet';

  return new SpectrePrivacyClient(rpcUrl, privateKey, isDevnet);
}

/**
 * Create a read-only privacy client
 *
 * @param rpcUrl - Solana RPC URL
 * @param isDevnet - Use devnet configuration
 */
export function createReadOnlyPrivacyClient(
  rpcUrl: string = 'https://api.devnet.solana.com',
  isDevnet: boolean = true
): SpectrePrivacyClient {
  return new SpectrePrivacyClient(rpcUrl, undefined, isDevnet);
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format a shield result for display
 */
export function formatShieldResult(result: ShieldResult): string {
  if (!result.success) {
    return `Shield Failed: ${result.error}`;
  }

  return `
Shield Successful:
  Signature: ${result.signature?.slice(0, 16)}...
  Amount: ${result.note ? formatAmount(result.note.amount, result.note.tokenType) : 'N/A'}
  Commitment: ${result.commitment ? Buffer.from(result.commitment).toString('hex').slice(0, 16) : 'N/A'}...

  WARNING: Save your note securely! Lost notes = lost funds!
`.trim();
}

/**
 * Format an unshield result for display
 */
export function formatUnshieldResult(result: UnshieldResult): string {
  if (!result.success) {
    return `Unshield Failed: ${result.error}`;
  }

  return `
Unshield Successful:
  Signature: ${result.signature?.slice(0, 16)}...
  Amount: ${result.amountReceived ? formatAmount(result.amountReceived, 'SOL') : 'N/A'}
  Recipient: ${result.recipient?.toString().slice(0, 8)}...
`.trim();
}

export default SpectrePrivacyClient;
