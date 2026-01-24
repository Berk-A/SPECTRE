/**
 * Type declarations for snarkjs
 * This module provides zero-knowledge proof generation and verification
 */
declare module 'snarkjs' {
    export const groth16: {
        fullProve(
            input: Record<string, string | bigint | number>,
            wasmFile: Uint8Array | string,
            zkeyFile: Uint8Array | string
        ): Promise<{
            proof: {
                pi_a: [string, string, string]
                pi_b: [[string, string], [string, string], [string, string]]
                pi_c: [string, string, string]
                protocol: string
                curve: string
            }
            publicSignals: string[]
        }>

        verify(
            vkey: object,
            publicSignals: string[],
            proof: object
        ): Promise<boolean>

        exportSolidityCallData(
            proof: object,
            publicSignals: string[]
        ): Promise<string>
    }

    export const plonk: {
        fullProve(
            input: Record<string, string | bigint | number>,
            wasmFile: Uint8Array | string,
            zkeyFile: Uint8Array | string
        ): Promise<{
            proof: object
            publicSignals: string[]
        }>

        verify(
            vkey: object,
            publicSignals: string[],
            proof: object
        ): Promise<boolean>
    }

    export const zKey: {
        exportVerificationKey(zkeyFile: Uint8Array | string): Promise<object>
    }
}
