/**
 * Browser-compatible Poseidon Hasher
 * 
 * Uses circomlibjs for Poseidon hashing instead of @lightprotocol/hasher.rs
 * to avoid Node.js polyfill issues in browser builds.
 */

// @ts-ignore - circomlibjs doesn't have TypeScript types
import { buildPoseidon } from 'circomlibjs'

export interface PoseidonHasher {
    poseidonHashString: (inputs: string[]) => string
}

let poseidonInstance: ((inputs: bigint[]) => Uint8Array) | null = null

/**
 * Initialize the Poseidon hasher
 */
export async function initPoseidon(): Promise<void> {
    if (poseidonInstance) return
    poseidonInstance = await buildPoseidon()
}

/**
 * Create a Poseidon hasher compatible with PrivacyCash circuits
 */
export async function createPoseidonHasher(): Promise<PoseidonHasher> {
    await initPoseidon()

    return {
        poseidonHashString: (inputs: string[]): string => {
            if (!poseidonInstance) {
                throw new Error('Poseidon not initialized')
            }

            // Convert string inputs to bigints
            const bigIntInputs = inputs.map((input) => {
                // Handle hex strings
                if (input.startsWith('0x')) {
                    return BigInt(input)
                }
                // Handle numeric strings
                return BigInt(input)
            })

            // Hash using circomlibjs Poseidon
            const hash = poseidonInstance(bigIntInputs)

            // Convert result to decimal string (same format as @lightprotocol/hasher.rs)
            // circomlibjs returns Uint8Array, convert to field element
            const F = (poseidonInstance as unknown as { F: { toObject: (v: Uint8Array) => bigint } }).F
            if (F && F.toObject) {
                return F.toObject(hash).toString()
            }

            // Fallback: convert bytes to bigint directly
            let result = BigInt(0)
            for (let i = 0; i < hash.length; i++) {
                result = result * BigInt(256) + BigInt(hash[i])
            }
            return result.toString()
        },
    }
}

/**
 * Get a singleton Poseidon hasher instance
 */
let hasherSingleton: PoseidonHasher | null = null

export async function getPoseidonHasher(): Promise<PoseidonHasher> {
    if (!hasherSingleton) {
        hasherSingleton = await createPoseidonHasher()
    }
    return hasherSingleton
}
