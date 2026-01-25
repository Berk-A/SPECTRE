import type { VercelRequest, VercelResponse } from '@vercel/node'
import BN from 'bn.js'
import { groth16 } from 'snarkjs'

import { utils } from 'ffjavascript'
import * as hasher from '@lightprotocol/hasher.rs'
import { PublicKey } from '@solana/web3.js'

/**
 * Server-Side Proof Generation API for PrivacyCash
 *
 * This endpoint generates ZK proofs using @lightprotocol/hasher.rs
 * which produces the correct Poseidon hashes for the PrivacyCash circuit.
 *
 * The browser cannot use hasher.rs due to WASM bundling issues with Vite,
 * so we generate proofs on the server where Node.js can load it properly.
 */

// Circuit constants
const FIELD_SIZE = new BN('21888242871839275222246405745257275088548364400416034343698204186575808495617')
const MERKLE_TREE_DEPTH = 26
const DEFAULT_MINT_ADDRESS = '11111111111111111111111111111112' // SOL

// Cache the LightWasm instance
let lightWasm: hasher.LightWasm | null = null

// Cache circuit files (19MB total, loaded once per function instance)
let circuitCache: { wasm: Uint8Array; zkey: Uint8Array } | null = null

async function getLightWasm(): Promise<hasher.LightWasm> {
    if (!lightWasm) {
        lightWasm = await hasher.WasmFactory.getInstance()
    }
    return lightWasm
}

import fs from 'fs'
import path from 'path'

// ... existing imports

async function loadCircuits(): Promise<{ wasm: Uint8Array; zkey: Uint8Array }> {
    if (circuitCache) {
        console.log('[Prove] Using cached circuits')
        return circuitCache
    }

    try {
        // Try loading from filesystem first (much faster and no auth issues)
        // In Vercel, public files are usually at process.cwd() + /public
        // OR sometimes at the root depending on build settings.
        // We'll try a few standard locations.
        const possiblePaths = [
            path.join(process.cwd(), 'public', 'circuits'),
            path.join(process.cwd(), 'circuits'),
            // Fallback for some Vercel configs
            path.join(__dirname, '..', 'public', 'circuits')
        ]

        let wasmBuffer: Buffer | null = null
        let zkeyBuffer: Buffer | null = null
        let loadedPath = ''

        for (const dir of possiblePaths) {
            const wasmPath = path.join(dir, 'transaction2.wasm')
            const zkeyPath = path.join(dir, 'transaction2.zkey')

            if (fs.existsSync(wasmPath) && fs.existsSync(zkeyPath)) {
                console.log(`[Prove] Found circuits at ${dir}`)
                wasmBuffer = fs.readFileSync(wasmPath)
                zkeyBuffer = fs.readFileSync(zkeyPath)
                loadedPath = dir
                break
            }
        }

        if (wasmBuffer && zkeyBuffer) {
            console.log(`[Prove] Circuits loaded from filesystem: WASM=${wasmBuffer.byteLength}B, zkey=${zkeyBuffer.byteLength}B`)
            circuitCache = {
                wasm: new Uint8Array(wasmBuffer),
                zkey: new Uint8Array(zkeyBuffer),
            }
            return circuitCache
        }
    } catch (fsError) {
        console.warn('[Prove] Failed to load from filesystem, falling back to fetch:', fsError)
    }

    // Fallback to GitHub Raw content (Reliable for public repos)
    // Using main branch
    const circuitBaseUrl = 'https://raw.githubusercontent.com/Berk-A/SPECTRE/main/spectre_protocol/app/public/circuits'

    console.log(`[Prove] Fetching circuits from ${circuitBaseUrl}`)

    const [wasmResponse, zkeyResponse] = await Promise.all([
        fetch(`${circuitBaseUrl}/transaction2.wasm`),
        fetch(`${circuitBaseUrl}/transaction2.zkey`)
    ])

    if (!wasmResponse.ok || !zkeyResponse.ok) {
        throw new Error(`Failed to fetch circuit files: WASM=${wasmResponse.status}, zkey=${zkeyResponse.status}`)
    }

    const wasmArrayBuffer = await wasmResponse.arrayBuffer()
    const zkeyArrayBuffer = await zkeyResponse.arrayBuffer()

    // Validate WASM magic number (0x00 0x61 0x73 0x6d)
    const wasmHeader = new Uint8Array(wasmArrayBuffer.slice(0, 4))
    if (wasmHeader[0] !== 0x00 || wasmHeader[1] !== 0x61 || wasmHeader[2] !== 0x73 || wasmHeader[3] !== 0x6d) {
        const headerHex = Array.from(wasmHeader).map(b => b.toString(16).padStart(2, '0')).join(' ')
        const headerText = new TextDecoder().decode(wasmHeader).replace(/[^\x20-\x7E]/g, '.')
        console.error(`[Prove] Invalid WASM header: ${headerHex} ("${headerText}")`)
        throw new Error(`Invalid WASM file downloaded from ${circuitBaseUrl}/transaction2.wasm. Got header: ${headerHex}`)
    }

    console.log(`[Prove] Circuits loaded from CDN: WASM=${wasmArrayBuffer.byteLength}B, zkey=${zkeyArrayBuffer.byteLength}B`)

    circuitCache = {
        wasm: new Uint8Array(wasmArrayBuffer),
        zkey: new Uint8Array(zkeyArrayBuffer),
    }

    return circuitCache
}

/**
 * Compute mint address field element from PublicKey
 */
/**
 * Compute mint address field element from PublicKey
 * MATCHES SDK LOGIC: privacycash/src/utils/utils.ts
 */
function getMintAddressField(mintPubkey: PublicKey): string {
    const mintStr = mintPubkey.toBase58()

    // Special case for SOL (system program)
    if (mintStr === '11111111111111111111111111111112') {
        return mintStr
    }

    // For SPL tokens (USDC, USDT, etc): use first 31 bytes (248 bits)
    // This provides better collision resistance than 8 bytes while still fitting in the field
    const mintBytes = mintPubkey.toBytes()

    // SDK uses BN ('bn.js') with 'be' (Big Endian)
    // We recreate that logic here
    const sliced = mintBytes.slice(0, 31)
    let value = BigInt(0)
    for (let i = 0; i < sliced.length; i++) {
        value = (value << BigInt(8)) | BigInt(sliced[i])
    }

    return value.toString()
}

/**
 * Server-side Keypair class using @lightprotocol/hasher.rs
 */
class ServerKeypair {
    public privkey: BN
    public pubkey: BN
    private wasm: hasher.LightWasm

    constructor(privkeyHex: string, wasm: hasher.LightWasm) {
        const rawDecimal = BigInt(privkeyHex)
        this.privkey = new BN((rawDecimal % BigInt(FIELD_SIZE.toString())).toString())
        this.wasm = wasm
        this.pubkey = new BN(this.wasm.poseidonHashString([this.privkey.toString()]))
    }

    sign(commitment: string, merklePath: string): string {
        return this.wasm.poseidonHashString([this.privkey.toString(), commitment, merklePath])
    }
}

/**
 * Server-side UTXO class using @lightprotocol/hasher.rs
 */
class ServerUtxo {
    amount: BN
    blinding: BN
    keypair: ServerKeypair
    index: number
    mintAddress: string
    private wasm: hasher.LightWasm

    constructor(params: {
        wasm: hasher.LightWasm
        amount: string | number | BN
        blinding: string | number | BN
        keypair: ServerKeypair
        index: number
        mintAddress?: string
    }) {
        this.wasm = params.wasm
        this.amount = new BN(params.amount.toString())
        this.blinding = new BN(params.blinding.toString())
        this.keypair = params.keypair
        this.index = params.index
        this.mintAddress = params.mintAddress || DEFAULT_MINT_ADDRESS
    }

    getCommitment(): string {
        const mintAddressField = getMintAddressField(new PublicKey(this.mintAddress))
        return this.wasm.poseidonHashString([
            this.amount.toString(),
            this.keypair.pubkey.toString(),
            this.blinding.toString(),
            mintAddressField,
        ])
    }

    getNullifier(): string {
        const commitment = this.getCommitment()
        const signature = this.keypair.sign(commitment, new BN(this.index).toString())
        return this.wasm.poseidonHashString([commitment, new BN(this.index).toString(), signature])
    }

    static dummy(keypair: ServerKeypair, wasm: hasher.LightWasm): ServerUtxo {
        return new ServerUtxo({
            wasm,
            amount: '0',
            blinding: Math.floor(Math.random() * 1000000000).toString(),
            keypair,
            index: 0,
        })
    }
}

/**
 * Compute external data hash using Poseidon
 */
function computeExtDataHash(wasm: hasher.LightWasm, extData: {
    recipient: string
    extAmount: string
    encryptedOutput1: number[] | Uint8Array
    encryptedOutput2: number[] | Uint8Array
    fee: string
    feeRecipient?: string
}): string {
    // Hash the recipient pubkey
    const recipientPubkey = new PublicKey(extData.recipient)
    const recipientBytes = recipientPubkey.toBytes()

    // Convert to field elements for hashing
    // Use a simplified hash: poseidon(recipient_hash, extAmount, fee)
    let recipientField = BigInt(0)
    for (let i = 0; i < Math.min(16, recipientBytes.length); i++) {
        recipientField = (recipientField << BigInt(8)) | BigInt(recipientBytes[i])
    }
    recipientField = recipientField % BigInt(FIELD_SIZE.toString())

    // Hash encrypted outputs
    const enc1Bytes = Array.isArray(extData.encryptedOutput1)
        ? new Uint8Array(extData.encryptedOutput1)
        : extData.encryptedOutput1
    const enc2Bytes = Array.isArray(extData.encryptedOutput2)
        ? new Uint8Array(extData.encryptedOutput2)
        : extData.encryptedOutput2

    // Convert first 16 bytes of each encrypted output to field elements
    let enc1Field = BigInt(0)
    for (let i = 0; i < Math.min(16, enc1Bytes.length); i++) {
        enc1Field = (enc1Field << BigInt(8)) | BigInt(enc1Bytes[i])
    }
    enc1Field = enc1Field % BigInt(FIELD_SIZE.toString())

    let enc2Field = BigInt(0)
    for (let i = 0; i < Math.min(16, enc2Bytes.length); i++) {
        enc2Field = (enc2Field << BigInt(8)) | BigInt(enc2Bytes[i])
    }
    enc2Field = enc2Field % BigInt(FIELD_SIZE.toString())

    // Compute the extDataHash using Poseidon
    return wasm.poseidonHashString([
        recipientField.toString(),
        extData.extAmount,
        enc1Field.toString(),
        enc2Field.toString(),
        extData.fee,
    ])
}

// Request body interface
interface ProveRequest {
    operation: 'deposit' | 'withdraw'
    // Raw UTXO data from browser
    inputs: Array<{
        amount: string
        blinding: string
        privateKey: string
        index: number
        mintAddress?: string
    }>
    outputs: Array<{
        amount: string
        blinding: string
        index: number
    }>
    // Merkle tree data
    root: string
    inputMerklePaths: string[][]
    inputMerklePathIndices: number[]
    // External data
    extData: {
        recipient: string
        extAmount: string
        encryptedOutput1: number[]
        encryptedOutput2: number[]
        fee: string
    }
    // Public amount for circuit
    publicAmount: string
    // UTXO private key (shared across inputs/outputs)
    utxoPrivateKey: string
}

// Response interfaces
interface ProofResult {
    proof: {
        pi_a: string[]
        pi_b: string[][]
        pi_c: string[]
    }
    publicSignals: string[]
    // Formatted for on-chain submission
    proofBytes: {
        proofA: number[]
        proofB: number[]
        proofC: number[]
    }
    publicInputsBytes: number[][]
}

/**
 * Parse proof to bytes array for on-chain submission
 */
function parseProofToBytesArray(proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] }): {
    proofA: number[]
    proofB: number[]
    proofC: number[]
} {
    const proofJson = JSON.parse(JSON.stringify(proof))

    for (const i in proofJson) {
        if (i === 'pi_a' || i === 'pi_c') {
            for (const j in proofJson[i]) {
                proofJson[i][j] = Array.from(
                    utils.leInt2Buff(utils.unstringifyBigInts(proofJson[i][j]), 32)
                ).reverse()
            }
        } else if (i === 'pi_b') {
            for (const j in proofJson[i]) {
                for (const z in proofJson[i][j]) {
                    proofJson[i][j][z] = Array.from(
                        utils.leInt2Buff(utils.unstringifyBigInts(proofJson[i][j][z]), 32)
                    )
                }
            }
        }
    }

    return {
        proofA: [proofJson.pi_a[0], proofJson.pi_a[1]].flat(),
        proofB: [proofJson.pi_b[0].flat().reverse(), proofJson.pi_b[1].flat().reverse()].flat(),
        proofC: [proofJson.pi_c[0], proofJson.pi_c[1]].flat(),
    }
}

/**
 * Parse public signals to bytes array
 */
function parseToBytesArray(publicSignals: string[]): number[][] {
    const result: number[][] = []
    for (const signal of publicSignals) {
        const ref = Array.from(utils.leInt2Buff(utils.unstringifyBigInts(signal), 32)).reverse()
        result.push(ref as number[])
    }
    return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
        return res.status(200).end()
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const startTime = Date.now()

    try {
        const body = req.body as ProveRequest

        if (!body.inputs || !body.outputs || !body.utxoPrivateKey) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        console.log(`[Prove] Starting proof generation for ${body.operation}`)

        // Initialize hasher
        const wasm = await getLightWasm()
        console.log(`[Prove] LightWasm initialized in ${Date.now() - startTime}ms`)

        // Create keypair from private key
        const keypair = new ServerKeypair(body.utxoPrivateKey, wasm)

        // Build server-side UTXOs with correct Poseidon hashing
        const inputs = body.inputs.map(
            (input, idx) =>
                new ServerUtxo({
                    wasm,
                    amount: input.amount,
                    blinding: input.blinding,
                    keypair: new ServerKeypair(input.privateKey, wasm),
                    index: input.index,
                    mintAddress: input.mintAddress,
                })
        )

        const outputs = body.outputs.map(
            (output) =>
                new ServerUtxo({
                    wasm,
                    amount: output.amount,
                    blinding: output.blinding,
                    keypair,
                    index: output.index,
                })
        )

        // Compute nullifiers and commitments using correct Poseidon
        const inputNullifiers = inputs.map((u) => u.getNullifier())
        const outputCommitments = outputs.map((u) => u.getCommitment())

        console.log(`[Prove] Input nullifiers:`, inputNullifiers)
        console.log(`[Prove] Output commitments:`, outputCommitments)

        // Compute extDataHash
        const extDataHash = computeExtDataHash(wasm, body.extData)
        console.log(`[Prove] ExtDataHash:`, extDataHash)

        // Build circuit input
        const circuitInput = {
            root: body.root,
            inputNullifier: inputNullifiers,
            outputCommitment: outputCommitments,
            publicAmount: body.publicAmount,
            extDataHash: extDataHash,
            inAmount: inputs.map((u) => u.amount.toString()),
            inPrivateKey: inputs.map((u) => u.keypair.privkey.toString()),
            inBlinding: inputs.map((u) => u.blinding.toString()),
            inPathIndices: body.inputMerklePathIndices,
            inPathElements: body.inputMerklePaths,
            outAmount: outputs.map((u) => u.amount.toString()),
            outBlinding: outputs.map((u) => u.blinding.toString()),
            outPubkey: outputs.map((u) => u.keypair.pubkey.toString()),
            mintAddress: inputs[0].mintAddress,
        }

        console.log(`[Prove] Circuit input built, generating proof...`)

        // Load circuits (cached after first load)
        const circuits = await loadCircuits()

        // Generate proof using snarkjs
        const { proof, publicSignals } = await groth16.fullProve(
            utils.stringifyBigInts(circuitInput),
            circuits.wasm,
            circuits.zkey
        )

        console.log(`[Prove] Proof generated in ${Date.now() - startTime}ms`)

        // Format proof for chain submission
        const proofBytes = parseProofToBytesArray(proof)
        const publicInputsBytes = parseToBytesArray(publicSignals)

        const result: ProofResult = {
            proof: {
                pi_a: proof.pi_a,
                pi_b: proof.pi_b,
                pi_c: proof.pi_c,
            },
            publicSignals,
            proofBytes,
            publicInputsBytes,
        }

        console.log(`[Prove] Total time: ${Date.now() - startTime}ms`)

        return res.status(200).json(result)
    } catch (error) {
        console.error('[Prove] Error:', error)
        return res.status(500).json({
            error: 'Proof generation failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
        })
    }
}
