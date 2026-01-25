/**
 * Browser-compatible UTXO Keypair for PrivacyCash
 * Based on Tornado Cash Nova's keypair model
 */

import { keccak256 } from '@ethersproject/keccak256'
import { bytesToHex } from './browser-encryption'

// Field size for BN254 curve (same as Tornado Cash)
const FIELD_SIZE = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617'
)

export interface PoseidonHasher {
    poseidonHashString: (inputs: string[]) => string
}

/**
 * Browser-compatible UTXO Keypair
 * 
 * Uses Poseidon hash for public key derivation
 * Compatible with PrivacyCash circuits
 */
export class BrowserKeypair {
    public readonly privkey: string
    public readonly pubkey: string

    constructor(privkey: string, hasher: PoseidonHasher) {
        // Ensure privkey is in correct format
        this.privkey = privkey.startsWith('0x') ? privkey : '0x' + privkey

        // Derive public key using Poseidon hash
        this.pubkey = hasher.poseidonHashString([this.privkey])
    }

    /**
     * Generate a random keypair
     */
    static random(hasher: PoseidonHasher): BrowserKeypair {
        const randomBytes = crypto.getRandomValues(new Uint8Array(31))
        const privkey = '0x' + bytesToHex(randomBytes)
        return new BrowserKeypair(privkey, hasher)
    }

    /**
     * Sign data using the private key (Poseidon-based signature)
     */
    sign(commitment: string, index: string): string {
        // This is a simplified signature scheme used by PrivacyCash
        // It's not a real cryptographic signature but a deterministic hash
        const hash = keccak256(
            new TextEncoder().encode(this.privkey + commitment + index)
        )
        return (BigInt(hash) % FIELD_SIZE).toString()
    }
}

/**
 * Browser-compatible UTXO (Unspent Transaction Output)
 * 
 * Represents a shielded balance entry in the PrivacyCash system
 */
export class BrowserUtxo {
    public amount: bigint
    public blinding: bigint
    public keypair: BrowserKeypair
    public index: number
    public mintAddress: string
    public version: 'v1' | 'v2'
    private hasher: PoseidonHasher

    constructor(options: {
        hasher: PoseidonHasher
        amount?: bigint | number | string
        keypair?: BrowserKeypair
        blinding?: bigint | number | string
        index?: number
        mintAddress?: string
        version?: 'v1' | 'v2'
    }) {
        this.hasher = options.hasher
        this.amount = BigInt(options.amount?.toString() ?? '0')
        this.blinding = options.blinding
            ? BigInt(options.blinding.toString())
            : BigInt(Math.floor(Math.random() * 1000000000))
        this.keypair = options.keypair ?? BrowserKeypair.random(options.hasher)
        this.index = options.index ?? 0
        this.mintAddress = options.mintAddress ?? '11111111111111111111111111111112' // Native SOL
        this.version = options.version ?? 'v2'
    }

    /**
     * Get the commitment hash for this UTXO
     * commitment = Poseidon(amount, pubkey, blinding, mintAddressField)
     */
    getCommitment(): string {
        const mintAddressField = this.getMintAddressField()
        return this.hasher.poseidonHashString([
            this.amount.toString(),
            this.keypair.pubkey,
            this.blinding.toString(),
            mintAddressField,
        ])
    }

    /**
     * Get the nullifier for this UTXO (marks it as spent)
     * nullifier = Poseidon(commitment, index, signature)
     */
    getNullifier(): string {
        const commitment = this.getCommitment()
        const signature = this.keypair.sign(commitment, this.index.toString())
        return this.hasher.poseidonHashString([
            commitment,
            this.index.toString(),
            signature,
        ])
    }

    /**
     * Convert mint address to field element
     * MATCHES SDK LOGIC from privacycash (31 bytes)
     */
    private getMintAddressField(): string {
        if (this.mintAddress === '11111111111111111111111111111112') {
            return this.mintAddress
        }

        const bytes = this.base58Decode(this.mintAddress)
        // Take first 31 bytes
        const sliced = bytes.slice(0, 31)

        let value = BigInt(0)
        for (let i = 0; i < sliced.length; i++) {
            value = (value << BigInt(8)) | BigInt(sliced[i])
        }

        return value.toString()
    }

    /**
     * Simple Base58 decode (for Solana addresses)
     */
    private base58Decode(str: string): Uint8Array {
        const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
        const ALPHABET_MAP = new Map(ALPHABET.split('').map((c, i) => [c, BigInt(i)]))

        let result = BigInt(0)
        for (const char of str) {
            const value = ALPHABET_MAP.get(char)
            if (value === undefined) throw new Error(`Invalid base58 character: ${char}`)
            result = result * BigInt(58) + value
        }

        // Convert to bytes (32 bytes for Solana addresses)
        const bytes = new Uint8Array(32)
        for (let i = 31; i >= 0; i--) {
            bytes[i] = Number(result & BigInt(0xff))
            result = result >> BigInt(8)
        }
        return bytes
    }

    /**
     * Serialize UTXO data for encryption
     */
    serialize(): string {
        return `${this.amount.toString()}|${this.blinding.toString()}|${this.index}|${this.mintAddress}`
    }

    /**
     * Create UTXO from serialized string
     */
    static deserialize(
        data: string,
        keypair: BrowserKeypair,
        hasher: PoseidonHasher,
        version: 'v1' | 'v2' = 'v2'
    ): BrowserUtxo {
        const [amount, blinding, index, mintAddress] = data.split('|')
        return new BrowserUtxo({
            hasher,
            amount: BigInt(amount),
            blinding: BigInt(blinding),
            index: parseInt(index, 10),
            mintAddress,
            keypair,
            version,
        })
    }

    /**
     * Create a dummy (zero-value) UTXO
     */
    static dummy(keypair: BrowserKeypair, hasher: PoseidonHasher): BrowserUtxo {
        return new BrowserUtxo({
            hasher,
            amount: BigInt(0),
            keypair,
        })
    }

    /**
     * Log UTXO details for debugging
     */
    log(): void {
        console.log(
            JSON.stringify(
                {
                    amount: this.amount.toString(),
                    blinding: this.blinding.toString(),
                    index: this.index,
                    mintAddress: this.mintAddress,
                    commitment: this.getCommitment(),
                    nullifier: this.getNullifier(),
                },
                null,
                2
            )
        )
    }
}
