/**
 * Browser-compatible cryptographic utilities using Web Crypto API
 * Replaces Node.js crypto module for browser environments
 */

// ============================================
// SHA-256 Hashing
// ============================================

/**
 * Compute SHA-256 hash of data
 * @param data - String or Uint8Array to hash
 * @returns Hash as Uint8Array
 */
export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const buffer = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as BufferSource)
  return new Uint8Array(hashBuffer)
}

/**
 * Compute SHA-256 hash and return as hex string
 * @param data - String or Uint8Array to hash
 * @returns Hash as hex string
 */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const hash = await sha256(data)
  return bufferToHex(hash)
}

// ============================================
// AES-GCM Encryption/Decryption
// ============================================

const AES_KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM
const TAG_LENGTH = 128 // 128 bits auth tag

/**
 * Generate a random AES-256-GCM key
 * @returns CryptoKey for encryption/decryption
 */
export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    true, // extractable
    ['encrypt', 'decrypt']
  )
}

/**
 * Import a raw key bytes as AES-GCM key
 * @param keyBytes - 32-byte key
 * @returns CryptoKey for encryption/decryption
 */
export async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  if (keyBytes.length !== 32) {
    throw new Error('AES-256 key must be 32 bytes')
  }
  return crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false, // not extractable
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt data using AES-256-GCM
 * @param plaintext - Data to encrypt
 * @param key - CryptoKey for AES-GCM
 * @returns IV + ciphertext + auth tag concatenated
 */
export async function aesGcmEncrypt(
  plaintext: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const iv = randomBytes(IV_LENGTH)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: TAG_LENGTH },
    key,
    plaintext as BufferSource
  )

  // Concatenate IV + ciphertext (includes auth tag)
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), IV_LENGTH)

  return result
}

/**
 * Decrypt data using AES-256-GCM
 * @param encrypted - IV + ciphertext + auth tag
 * @param key - CryptoKey for AES-GCM
 * @returns Decrypted plaintext
 */
export async function aesGcmDecrypt(
  encrypted: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  if (encrypted.length < IV_LENGTH + 16) {
    throw new Error('Encrypted data too short')
  }

  const iv = encrypted.slice(0, IV_LENGTH)
  const ciphertext = encrypted.slice(IV_LENGTH)

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LENGTH },
    key,
    ciphertext
  )

  return new Uint8Array(plaintext)
}

/**
 * Encrypt string data and return as base64
 * @param plaintext - String to encrypt
 * @param key - CryptoKey for AES-GCM
 * @returns Base64-encoded encrypted data
 */
export async function aesGcmEncryptString(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const data = new TextEncoder().encode(plaintext)
  const encrypted = await aesGcmEncrypt(data, key)
  return bufferToBase64(encrypted)
}

/**
 * Decrypt base64-encoded data and return as string
 * @param encrypted - Base64-encoded encrypted data
 * @param key - CryptoKey for AES-GCM
 * @returns Decrypted string
 */
export async function aesGcmDecryptString(
  encrypted: string,
  key: CryptoKey
): Promise<string> {
  const data = base64ToBuffer(encrypted)
  const decrypted = await aesGcmDecrypt(data, key)
  return new TextDecoder().decode(decrypted)
}

// ============================================
// HMAC-SHA256
// ============================================

/**
 * Compute HMAC-SHA256
 * @param key - Secret key
 * @param message - Message to authenticate
 * @returns HMAC as Uint8Array
 */
export async function hmacSha256(
  key: Uint8Array,
  message: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message as BufferSource)
  return new Uint8Array(signature)
}

/**
 * Verify HMAC-SHA256
 * @param key - Secret key
 * @param message - Message to verify
 * @param mac - Expected MAC
 * @returns True if MAC is valid
 */
export async function hmacSha256Verify(
  key: Uint8Array,
  message: Uint8Array,
  mac: Uint8Array
): Promise<boolean> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  return crypto.subtle.verify('HMAC', cryptoKey, mac as BufferSource, message as BufferSource)
}

// ============================================
// Key Derivation (PBKDF2)
// ============================================

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16

/**
 * Derive an AES key from a password using PBKDF2
 * @param password - User password
 * @param salt - Salt bytes (generate with randomBytes(16) if new)
 * @param iterations - Number of iterations (default 100000)
 * @returns Derived CryptoKey
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false, // not extractable
    ['encrypt', 'decrypt']
  )
}

/**
 * Derive raw key bytes from password
 * @param password - User password
 * @param salt - Salt bytes
 * @param keyLength - Output key length in bytes (default 32)
 * @param iterations - Number of iterations (default 100000)
 * @returns Derived key bytes
 */
export async function deriveKeyBytes(
  password: string,
  salt: Uint8Array,
  keyLength: number = 32,
  iterations: number = PBKDF2_ITERATIONS
): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    keyLength * 8
  )

  return new Uint8Array(bits)
}

// ============================================
// Random Bytes Generation
// ============================================

/**
 * Generate cryptographically secure random bytes
 * @param length - Number of bytes to generate
 * @returns Random Uint8Array
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Generate random bytes as hex string
 * @param length - Number of bytes to generate
 * @returns Random hex string
 */
export function randomBytesHex(length: number): string {
  return bufferToHex(randomBytes(length))
}

/**
 * Generate a random salt for key derivation
 * @returns 16-byte salt
 */
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_LENGTH)
}

// ============================================
// Utility Functions
// ============================================

/**
 * Convert Uint8Array to hex string
 */
export function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBuffer(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

/**
 * Convert Uint8Array to base64 string
 */
export function bufferToBase64(buffer: Uint8Array): string {
  const binary = String.fromCharCode(...buffer)
  return btoa(binary)
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Compare two byte arrays in constant time
 * (Prevents timing attacks)
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

// ============================================
// Poseidon Hash Placeholder
// ============================================

/**
 * Poseidon hash - required for PrivacyCash note commitments
 * This is a placeholder - actual implementation uses circomlibjs
 * which will be loaded as a Web Worker
 */
export async function poseidonHash(_inputs: bigint[]): Promise<bigint> {
  // This will be replaced with actual circomlibjs poseidon
  // when the proof worker is loaded
  throw new Error('Poseidon hash requires circomlibjs - use ProofWorker')
}

// ============================================
// Note Encryption (PrivacyCash compatible)
// ============================================

export interface EncryptedNote {
  ciphertext: string // base64
  salt: string // base64
  iv: string // base64 (included in ciphertext, but stored separately for compatibility)
}

/**
 * Encrypt a privacy note with a password
 * Compatible with PrivacyCash note storage format
 */
export async function encryptNote(
  noteJson: string,
  password: string
): Promise<EncryptedNote> {
  const salt = generateSalt()
  const key = await deriveKeyFromPassword(password, salt)
  const encrypted = await aesGcmEncryptString(noteJson, key)

  return {
    ciphertext: encrypted,
    salt: bufferToBase64(salt),
    iv: '', // IV is embedded in ciphertext for our format
  }
}

/**
 * Decrypt a privacy note with a password
 */
export async function decryptNote(
  encrypted: EncryptedNote,
  password: string
): Promise<string> {
  const salt = base64ToBuffer(encrypted.salt)
  const key = await deriveKeyFromPassword(password, salt)
  return aesGcmDecryptString(encrypted.ciphertext, key)
}

// ============================================
// Export Constants
// ============================================

export const CRYPTO_CONSTANTS = {
  AES_KEY_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
  SALT_LENGTH,
  PBKDF2_ITERATIONS,
} as const
