/**
 * Browser-compatible ZK Prover for PrivacyCash
 * Uses snarkjs with ArrayBuffer inputs instead of file paths
 */

// @ts-ignore - snarkjs types
import * as snarkjs from 'snarkjs'

// @ts-ignore - ffjavascript utilities
import { utils as ffUtils } from 'ffjavascript'

export interface Groth16Proof {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
    protocol: string
    curve: string
}

export interface ProofResult {
    proof: Groth16Proof
    publicSignals: string[]
}

/**
 * Generate a Groth16 proof using snarkjs in browser
 * @param input Circuit inputs (will be stringified)
 * @param wasmBuffer WASM circuit file as ArrayBuffer
 * @param zkeyBuffer Proving key as ArrayBuffer
 * @param onProgress Optional progress callback
 */
export async function generateProofBrowser(
    input: Record<string, unknown>,
    wasmBuffer: ArrayBuffer,
    zkeyBuffer: ArrayBuffer,
    onProgress?: (stage: string, percent: number) => void
): Promise<ProofResult> {
    onProgress?.('preparing', 10)

    // Stringify BigInts for snarkjs
    const stringifiedInput = ffUtils.stringifyBigInts(input)

    onProgress?.('generating', 30)

    try {
        // snarkjs.groth16.fullProve accepts ArrayBuffer/Uint8Array in browser
        const result = await snarkjs.groth16.fullProve(
            stringifiedInput,
            new Uint8Array(wasmBuffer),
            new Uint8Array(zkeyBuffer)
        )

        onProgress?.('complete', 100)

        return {
            proof: result.proof as Groth16Proof,
            publicSignals: result.publicSignals as string[],
        }
    } catch (error) {
        console.error('[BrowserProver] Proof generation failed:', error)
        throw error
    }
}

/**
 * Verify a Groth16 proof
 * @param vkey Verification key object
 * @param publicSignals Public signals from proof
 * @param proof The proof to verify
 */
export async function verifyProofBrowser(
    vkey: unknown,
    publicSignals: string[],
    proof: Groth16Proof
): Promise<boolean> {
    try {
        return await snarkjs.groth16.verify(vkey as object, publicSignals, proof)
    } catch (error) {
        console.error('[BrowserProver] Proof verification failed:', error)
        return false
    }
}

/**
 * Parse proof to byte arrays for on-chain submission
 * Based on PrivacyCash SDK's parseProofToBytesArray
 */
export function parseProofToBytes(proof: Groth16Proof): {
    proofA: number[]
    proofB: number[]
    proofC: number[]
} {
    try {
        // Convert proof elements to byte arrays
        const pi_a = proof.pi_a.slice(0, 2).map((x) =>
            Array.from(ffUtils.leInt2Buff(ffUtils.unstringifyBigInts(x), 32)).reverse()
        )

        const pi_b = proof.pi_b.slice(0, 2).map((pair) =>
            pair.map((x) =>
                Array.from(ffUtils.leInt2Buff(ffUtils.unstringifyBigInts(x), 32))
            )
        )

        const pi_c = proof.pi_c.slice(0, 2).map((x) =>
            Array.from(ffUtils.leInt2Buff(ffUtils.unstringifyBigInts(x), 32)).reverse()
        )

        return {
            proofA: pi_a.flat() as number[],
            proofB: ([pi_b[0].flat().reverse(), pi_b[1].flat().reverse()].flat()) as number[],
            proofC: pi_c.flat() as number[],
        }
    } catch (error) {
        console.error('[BrowserProver] Failed to parse proof:', error)
        throw error
    }
}

/**
 * Parse public signals to byte arrays
 */
export function parsePublicSignalsToBytes(publicSignals: string[]): number[][] {
    try {
        return publicSignals.map((signal) =>
            (Array.from(
                ffUtils.leInt2Buff(ffUtils.unstringifyBigInts(signal), 32)
            ).reverse()) as number[]
        )
    } catch (error) {
        console.error('[BrowserProver] Failed to parse public signals:', error)
        throw error
    }
}

/**
 * Format proof for on-chain submission (matches Solana program expectations)
 */
export function formatProofForChain(
    proof: Groth16Proof,
    publicSignals: string[]
): {
    proofA: number[]
    proofB: number[]
    proofC: number[]
    root: number[]
    publicAmount: number[]
    extDataHash: number[]
    inputNullifiers: [number[], number[]]
    outputCommitments: [number[], number[]]
} {
    const proofBytes = parseProofToBytes(proof)
    const signalBytes = parsePublicSignalsToBytes(publicSignals)

    return {
        proofA: proofBytes.proofA,
        proofB: proofBytes.proofB,
        proofC: proofBytes.proofC,
        root: signalBytes[0],
        publicAmount: signalBytes[1],
        extDataHash: signalBytes[2],
        inputNullifiers: [signalBytes[3], signalBytes[4]],
        outputCommitments: [signalBytes[5], signalBytes[6]],
    }
}
