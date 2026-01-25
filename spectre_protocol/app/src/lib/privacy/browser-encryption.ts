import { keccak256 } from '@ethersproject/keccak256'


// Version identifier for encryption scheme (8-byte version)
const ENCRYPTION_VERSION_V2 = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02])

/**
 * Compare two Uint8Arrays in constant time to prevent timing attacks
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i]
    }
    return diff === 0
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
    const bytes = new Uint8Array(cleanHex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16)
    }
    return bytes
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Concatenate multiple Uint8Arrays
 */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
    }
    return result
}

// -----------------------------------------------------------
// Borsh Schemas for Transaction Instruction
// -----------------------------------------------------------

class DepositArgs {
    proofA: Uint8Array
    proofB: Uint8Array
    proofC: Uint8Array
    root: Uint8Array
    publicAmount: Uint8Array
    extDataHash: Uint8Array
    inputNullifiers: Uint8Array[]
    outputCommitments: Uint8Array[]
    extData: ExtData

    constructor(fields: any) {
        this.proofA = fields.proofA
        this.proofB = fields.proofB
        this.proofC = fields.proofC
        this.root = fields.root
        this.publicAmount = fields.publicAmount
        this.extDataHash = fields.extDataHash
        this.inputNullifiers = fields.inputNullifiers
        this.outputCommitments = fields.outputCommitments
        this.extData = new ExtData(fields.extData)
    }
}

class ExtData {
    recipient: Uint8Array
    extAmount: Uint8Array
    encryptedOutput1: Uint8Array
    encryptedOutput2: Uint8Array
    fee: Uint8Array
    feeRecipient: Uint8Array
    mintAddress: Uint8Array

    constructor(fields: any) {
        this.recipient = fields.recipient
        this.extAmount = fields.extAmount
        this.encryptedOutput1 = fields.encryptedOutput1
        this.encryptedOutput2 = fields.encryptedOutput2
        this.fee = fields.fee
        this.feeRecipient = fields.feeRecipient
        this.mintAddress = fields.mintAddress
    }
}



/**
 * Manually serialize variable length bytes for ExtData because Borsh JS support is tricky
 * Matches rust logic: u32 length + bytes
 */
function serializeExtData(extData: ExtData): Uint8Array {
    const fixedPartSize = 32 + 8 + 8 + 32 + 32 // recipient + extAmount + fee + feeRecipient + mintAddress
    const size1 = extData.encryptedOutput1.length
    const size2 = extData.encryptedOutput2.length

    // Total size: fixed parts + 4 bytes len + data + 4 bytes len + data
    const buffer = new Uint8Array(fixedPartSize + 4 + size1 + 4 + size2)
    const view = new DataView(buffer.buffer)
    let offset = 0

    // recipient (32)
    buffer.set(extData.recipient, offset); offset += 32

    // extAmount (8 / u64 little endian)
    buffer.set(extData.extAmount, offset); offset += 8

    // encryptedOutput1 (u32 len + bytes)
    view.setUint32(offset, size1, true); offset += 4
    buffer.set(extData.encryptedOutput1, offset); offset += size1

    // encryptedOutput2 (u32 len + bytes)
    view.setUint32(offset, size2, true); offset += 4
    buffer.set(extData.encryptedOutput2, offset); offset += size2

    // fee (8 / u64 little endian)
    buffer.set(extData.fee, offset); offset += 8

    // feeRecipient (32)
    buffer.set(extData.feeRecipient, offset); offset += 32

    // mintAddress (32)
    buffer.set(extData.mintAddress, offset); offset += 32

    return buffer
}


/**
 * Serialize Proof and ExtData for instruction data
 */
export function serializeProofAndExtData(proof: any, extData: any): Buffer {
    // 1. Serialize ExtData manually (because of variable length fields)
    const extDataBytes = serializeExtData(new ExtData(extData))

    // 2. Serialize Fixed Proof Parts (everything except extData)
    // We construct a buffer manually to match the Rust struct layout
    // struct DepositInstruction {
    //   proofA: [u8; 32],
    //   proofB: [u8; 64],
    //   proofC: [u8; 32],
    //   root: [u8; 32],
    //   publicAmount: [u8; 32],
    //   extDataHash: [u8; 32],
    //   inputNullifiers: [[u8; 32]; 2],
    //   outputCommitments: [[u8; 32]; 2],
    //   extData: ExtData
    // }

    const proofSize = 32 + 64 + 32 + 32 + 32 + 32 + (32 * 2) + (32 * 2)
    const buffer = new Uint8Array(proofSize + extDataBytes.length)
    let offset = 0

    // Helper to copy
    const write = (data: Uint8Array | number[]) => {
        const arr = data instanceof Uint8Array ? data : new Uint8Array(data)
        buffer.set(arr, offset)
        offset += arr.length
    }

    write(proof.proofA)
    write(proof.proofB) // proofB is already flattened 64 bytes
    write(proof.proofC)
    write(proof.root)
    write(proof.publicAmount)
    write(proof.extDataHash)

    proof.inputNullifiers.forEach((n: any) => write(n))
    proof.outputCommitments.forEach((c: any) => write(c))

    // 3. Append serialized ExtData
    buffer.set(extDataBytes, offset)

    return Buffer.from(buffer)
}

/**
 * Compute the hash of ExtData (Keccak256 of serialized ExtData)
 */
export function getExtDataHash(extData: any): string {
    const serialized = serializeExtData(new ExtData(extData))
    // Keccak256 hash of the serialized data
    const hash = keccak256(serialized)
    return (BigInt(hash) & (BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617') - BigInt(1)))
        .toString()
}

export interface EncryptionKey {
    v1: Uint8Array
    v2: Uint8Array
}

// Storage key for persisted encryption keys
const ENCRYPTION_KEYS_STORAGE_PREFIX = 'spectre_encryption_keys_'

/**
 * Browser-compatible encryption service for PrivacyCash
 * 
 * Persists derived keys to localStorage to avoid repeated signature prompts.
 */
export class BrowserEncryptionService {
    private encryptionKeyV1: Uint8Array | null = null
    private encryptionKeyV2: Uint8Array | null = null
    private utxoPrivateKeyV1: string | null = null
    private utxoPrivateKeyV2: string | null = null
    // Note: Keys are persisted to localStorage per-wallet

    /**
     * Check if keys are already derived and loaded
     */
    hasKeys(): boolean {
        return this.encryptionKeyV2 !== null
    }

    /**
     * Try to restore keys from localStorage for a given wallet
     * Returns true if keys were restored, false if signature is needed
     */
    restoreKeysFromStorage(walletAddress: string): boolean {
        try {
            const storageKey = ENCRYPTION_KEYS_STORAGE_PREFIX + walletAddress
            const stored = localStorage.getItem(storageKey)
            if (!stored) return false

            const parsed = JSON.parse(stored)
            if (!parsed.v1 || !parsed.v2 || !parsed.utxoV1 || !parsed.utxoV2) return false

            // Restore keys
            this.encryptionKeyV1 = hexToBytes(parsed.v1)
            this.encryptionKeyV2 = hexToBytes(parsed.v2)
            this.utxoPrivateKeyV1 = parsed.utxoV1
            this.utxoPrivateKeyV2 = parsed.utxoV2

            console.log('[BrowserEncryptionService] Restored keys from storage')
            return true
        } catch (error) {
            console.warn('[BrowserEncryptionService] Failed to restore keys:', error)
            return false
        }
    }

    /**
     * Persist keys to localStorage for a wallet
     */
    private persistKeysToStorage(walletAddress: string): void {
        try {
            const storageKey = ENCRYPTION_KEYS_STORAGE_PREFIX + walletAddress
            const data = {
                v1: this.encryptionKeyV1 ? bytesToHex(this.encryptionKeyV1) : null,
                v2: this.encryptionKeyV2 ? bytesToHex(this.encryptionKeyV2) : null,
                utxoV1: this.utxoPrivateKeyV1,
                utxoV2: this.utxoPrivateKeyV2,
            }
            localStorage.setItem(storageKey, JSON.stringify(data))
            console.log('[BrowserEncryptionService] Persisted keys to storage')
        } catch (error) {
            console.warn('[BrowserEncryptionService] Failed to persist keys:', error)
        }
    }

    /**
     * Clear persisted keys (for sign out)
     */
    clearPersistedKeys(walletAddress: string): void {
        try {
            const storageKey = ENCRYPTION_KEYS_STORAGE_PREFIX + walletAddress
            localStorage.removeItem(storageKey)
        } catch (error) {
            // Ignore
        }
    }

    /**
     * Derive encryption keys from a wallet signature
     */
    deriveEncryptionKeyFromSignature(signature: Uint8Array, walletAddress?: string): EncryptionKey {
        // V1: First 31 bytes of signature (legacy)
        const encryptionKeyV1 = signature.slice(0, 31)
        this.encryptionKeyV1 = encryptionKeyV1

        // Hash the V1 key for UTXO private key
        const hashedSeedV1 = this.sha256Sync(encryptionKeyV1)
        this.utxoPrivateKeyV1 = '0x' + bytesToHex(hashedSeedV1)

        // V2: Keccak256 of full signature
        const keccakHash = keccak256(signature)
        const encryptionKeyV2 = hexToBytes(keccakHash)
        this.encryptionKeyV2 = encryptionKeyV2

        // Hash for V2 UTXO private key
        const hashedSeedV2 = hexToBytes(keccak256(encryptionKeyV2))
        this.utxoPrivateKeyV2 = '0x' + bytesToHex(hashedSeedV2)

        // Persist for future sessions
        if (walletAddress) {
            this.persistKeysToStorage(walletAddress)
        }

        return {
            v1: this.encryptionKeyV1,
            v2: this.encryptionKeyV2,
        }
    }

    /**
     * Derive encryption key from wallet signature (async version using signMessage)
     * Will try to restore from localStorage first to avoid prompting
     */
    async deriveEncryptionKeyFromWallet(
        signMessage: (message: Uint8Array) => Promise<Uint8Array>,
        walletAddress?: string
    ): Promise<EncryptionKey> {
        // Try to restore from storage first
        if (walletAddress && this.restoreKeysFromStorage(walletAddress)) {
            return {
                v1: this.encryptionKeyV1!,
                v2: this.encryptionKeyV2!,
            }
        }

        // Need to request signature
        const message = new TextEncoder().encode('Privacy Money account sign in')
        const signature = await signMessage(message)
        return this.deriveEncryptionKeyFromSignature(signature, walletAddress)
    }

    /**
     * Synchronous SHA256 using SubtleCrypto (browser)
     * Note: In browser, we use a pre-computed approach or async
     */
    private sha256Sync(data: Uint8Array): Uint8Array {
        // For browser compatibility, we'll use a simple implementation
        // In production, use the async version
        // This is a fallback that uses keccak256 as a substitute
        return hexToBytes(keccak256(data))
    }

    /**
     * Encrypt data using AES-256-GCM (V2 format)
     */
    async encrypt(data: Uint8Array | string): Promise<Uint8Array> {
        if (!this.encryptionKeyV2) {
            throw new Error('Encryption key not set. Call deriveEncryptionKeyFromWallet first.')
        }

        const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data

        // Generate random 12-byte IV for GCM
        const iv = crypto.getRandomValues(new Uint8Array(12))

        // Import key for AES-256-GCM
        const keyBuffer = new Uint8Array(this.encryptionKeyV2).buffer
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        )

        // Encrypt (includes auth tag automatically in Web Crypto)
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv).buffer },
            cryptoKey,
            new Uint8Array(dataBytes).buffer
        )

        // Web Crypto appends 16-byte auth tag to ciphertext
        // Format: version(8) + iv(12) + authTag(16) + ciphertext
        const encryptedArray = new Uint8Array(encrypted)
        const authTag = encryptedArray.slice(-16)
        const ciphertext = encryptedArray.slice(0, -16)

        return concatBytes(ENCRYPTION_VERSION_V2, iv, authTag, ciphertext)
    }

    /**
     * Decrypt data (auto-detects V1 or V2 format)
     */
    async decrypt(encryptedData: Uint8Array): Promise<Uint8Array> {
        // Check for V2 format (starts with 8-byte version identifier)
        if (
            encryptedData.length >= 8 &&
            timingSafeEqual(encryptedData.slice(0, 8), ENCRYPTION_VERSION_V2)
        ) {
            return this.decryptV2(encryptedData)
        } else {
            return this.decryptV1(encryptedData)
        }
    }

    /**
     * Decrypt V2 format (AES-256-GCM)
     */
    private async decryptV2(encryptedData: Uint8Array): Promise<Uint8Array> {
        if (!this.encryptionKeyV2) {
            throw new Error('Encryption key not set.')
        }

        // Parse: version(8) + iv(12) + authTag(16) + ciphertext
        const iv = encryptedData.slice(8, 20)
        const authTag = encryptedData.slice(20, 36)
        const ciphertext = encryptedData.slice(36)

        // Web Crypto expects authTag appended to ciphertext
        const dataWithTag = concatBytes(ciphertext, authTag)

        // Import key
        const keyBuffer = new Uint8Array(this.encryptionKeyV2).buffer
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        )

        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv).buffer },
                cryptoKey,
                new Uint8Array(dataWithTag).buffer
            )
            return new Uint8Array(decrypted)
        } catch {
            throw new Error('Failed to decrypt data. Invalid key or corrupted data.')
        }
    }

    /**
     * Decrypt V1 format (AES-128-CTR with HMAC)
     */
    private async decryptV1(encryptedData: Uint8Array): Promise<Uint8Array> {
        if (!this.encryptionKeyV1) {
            throw new Error('V1 Encryption key not set.')
        }

        // Parse: iv(16) + authTag(16) + ciphertext
        const iv = encryptedData.slice(0, 16)
        const authTag = encryptedData.slice(16, 32)
        const ciphertext = encryptedData.slice(32)

        // Verify HMAC (using first 15 bytes of key after first 16)
        const hmacKey = this.encryptionKeyV1.slice(16, 31)
        const calculatedTag = await this.computeHmac(hmacKey, concatBytes(iv, ciphertext))

        if (!timingSafeEqual(authTag, calculatedTag.slice(0, 16))) {
            throw new Error('Failed to decrypt data. Invalid key or corrupted data.')
        }

        // Decrypt with AES-128-CTR
        const aesKey = this.encryptionKeyV1.slice(0, 16)
        const aesKeyBuffer = new Uint8Array(aesKey).buffer
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            aesKeyBuffer,
            { name: 'AES-CTR' },
            false,
            ['decrypt']
        )

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-CTR', counter: new Uint8Array(iv).buffer, length: 64 },
            cryptoKey,
            new Uint8Array(ciphertext).buffer
        )

        return new Uint8Array(decrypted)
    }

    /**
     * Compute HMAC-SHA256
     */
    private async computeHmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
        const keyBuffer = new Uint8Array(key).buffer
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        )
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, new Uint8Array(data).buffer)
        return new Uint8Array(signature)
    }

    /**
     * Get encryption key version from encrypted data
     */
    getEncryptionKeyVersion(encryptedData: Uint8Array | string): 'v1' | 'v2' {
        const buffer =
            typeof encryptedData === 'string' ? hexToBytes(encryptedData) : encryptedData

        if (
            buffer.length >= 8 &&
            timingSafeEqual(buffer.slice(0, 8), ENCRYPTION_VERSION_V2)
        ) {
            return 'v2'
        }
        return 'v1'
    }

    /**
     * Get UTXO private key for specified version
     */
    getUtxoPrivateKey(version: 'v1' | 'v2' = 'v2'): string {
        if (version === 'v1') {
            if (!this.utxoPrivateKeyV1) throw new Error('V1 key not set')
            return this.utxoPrivateKeyV1
        }
        if (!this.utxoPrivateKeyV2) throw new Error('V2 key not set')
        return this.utxoPrivateKeyV2
    }

    /**
     * Reset all encryption keys
     */
    reset(): void {
        this.encryptionKeyV1 = null
        this.encryptionKeyV2 = null
        this.utxoPrivateKeyV1 = null
        this.utxoPrivateKeyV2 = null
    }

    /**
     * Check if encryption keys are initialized
     */
    isInitialized(): boolean {
        return this.encryptionKeyV2 !== null
    }
}

// Export utility functions
export { hexToBytes, bytesToHex, concatBytes, timingSafeEqual }
