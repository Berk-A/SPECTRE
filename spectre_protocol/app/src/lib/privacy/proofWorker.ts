/**
 * Web Worker for ZK Proof Generation
 * Runs snarkjs.groth16.fullProve() off the main thread
 *
 * This file is compiled as a Web Worker module
 */

// Worker message types
export interface ProofRequest {
  type: 'generate'
  input: Record<string, string | bigint | number>
  wasmBuffer: ArrayBuffer
  zkeyBuffer: ArrayBuffer
}

export interface ProofResponse {
  type: 'success' | 'error' | 'progress'
  proof?: Groth16Proof
  publicSignals?: string[]
  error?: string
  progress?: {
    stage: string
    percent: number
  }
}

export interface Groth16Proof {
  pi_a: [string, string, string]
  pi_b: [[string, string], [string, string], [string, string]]
  pi_c: [string, string, string]
  protocol: 'groth16'
  curve: 'bn128'
}

// This is the actual worker code that will run in a separate thread
const workerCode = `
// Import snarkjs in worker context
importScripts('https://unpkg.com/snarkjs@0.7.0/build/snarkjs.min.js');

self.onmessage = async function(e) {
  const { type, input, wasmBuffer, zkeyBuffer } = e.data;

  if (type !== 'generate') {
    self.postMessage({ type: 'error', error: 'Unknown request type' });
    return;
  }

  try {
    // Report progress
    self.postMessage({
      type: 'progress',
      progress: { stage: 'Initializing...', percent: 10 }
    });

    // Convert ArrayBuffers to Uint8Array for snarkjs
    const wasmCode = new Uint8Array(wasmBuffer);
    const zkeyCode = new Uint8Array(zkeyBuffer);

    self.postMessage({
      type: 'progress',
      progress: { stage: 'Computing witness...', percent: 30 }
    });

    // Generate the proof
    // Note: snarkjs.groth16.fullProve accepts Uint8Array for wasm and zkey
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmCode,
      zkeyCode
    );

    self.postMessage({
      type: 'progress',
      progress: { stage: 'Proof complete!', percent: 100 }
    });

    // Send result back to main thread
    self.postMessage({
      type: 'success',
      proof,
      publicSignals
    });

  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message || 'Unknown error during proof generation'
    });
  }
};
`;

// ============================================
// Proof Worker Manager
// ============================================

export class ProofWorker {
  private worker: Worker | null = null
  private pendingResolve: ((result: ProofResponse) => void) | null = null
  private pendingReject: ((error: Error) => void) | null = null
  private onProgress: ((progress: { stage: string; percent: number }) => void) | null = null

  /**
   * Initialize the worker
   */
  async init(): Promise<void> {
    if (this.worker) return

    // Create worker from blob
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)

    this.worker = new Worker(workerUrl)

    this.worker.onmessage = (e: MessageEvent<ProofResponse>) => {
      const response = e.data

      if (response.type === 'progress') {
        this.onProgress?.(response.progress!)
      } else if (response.type === 'success') {
        this.pendingResolve?.(response)
        this.cleanup()
      } else if (response.type === 'error') {
        this.pendingReject?.(new Error(response.error || 'Unknown worker error'))
        this.cleanup()
      }
    }

    this.worker.onerror = (e) => {
      this.pendingReject?.(new Error(`Worker error: ${e.message}`))
      this.cleanup()
    }
  }

  /**
   * Generate a proof
   */
  async generateProof(
    input: Record<string, string | bigint | number>,
    wasmBuffer: ArrayBuffer,
    zkeyBuffer: ArrayBuffer,
    onProgress?: (progress: { stage: string; percent: number }) => void
  ): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
    await this.init()

    this.onProgress = onProgress || null

    return new Promise((resolve, reject) => {
      this.pendingResolve = (response: ProofResponse) => {
        if (response.proof && response.publicSignals) {
          resolve({
            proof: response.proof,
            publicSignals: response.publicSignals,
          })
        } else {
          reject(new Error('Invalid proof response'))
        }
      }
      this.pendingReject = reject

      // Send request to worker
      const request: ProofRequest = {
        type: 'generate',
        input,
        wasmBuffer,
        zkeyBuffer,
      }

      this.worker!.postMessage(request, [wasmBuffer, zkeyBuffer])
    })
  }

  private cleanup(): void {
    this.pendingResolve = null
    this.pendingReject = null
    this.onProgress = null
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.cleanup()
  }
}

// ============================================
// Alternative: Inline Worker without external imports
// ============================================

/**
 * This version loads snarkjs dynamically and doesn't require importScripts
 * Use this if the CDN-based worker doesn't work
 */
export async function generateProofInline(
  input: Record<string, string | bigint | number>,
  wasmBuffer: ArrayBuffer,
  zkeyBuffer: ArrayBuffer,
  onProgress?: (progress: { stage: string; percent: number }) => void
): Promise<{ proof: Groth16Proof; publicSignals: string[] }> {
  onProgress?.({ stage: 'Loading snarkjs...', percent: 5 })

  // Dynamically import snarkjs
  const snarkjs = await import('snarkjs')

  onProgress?.({ stage: 'Preparing inputs...', percent: 10 })

  // Convert to Uint8Array
  const wasmCode = new Uint8Array(wasmBuffer)
  const zkeyCode = new Uint8Array(zkeyBuffer)

  onProgress?.({ stage: 'Computing witness...', percent: 30 })

  // Generate proof (this blocks the main thread but is a fallback)
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmCode,
    zkeyCode
  )

  onProgress?.({ stage: 'Proof complete!', percent: 100 })

  return { proof: proof as Groth16Proof, publicSignals }
}

// ============================================
// Singleton Instance
// ============================================

let workerInstance: ProofWorker | null = null

export function getProofWorker(): ProofWorker {
  if (!workerInstance) {
    workerInstance = new ProofWorker()
  }
  return workerInstance
}

// ============================================
// Proof Utilities
// ============================================

/**
 * Convert proof to Solana-compatible format
 * PrivacyCash expects specific byte ordering for on-chain verification
 */
export function proofToSolanaFormat(proof: Groth16Proof): Uint8Array {
  // Solana groth16 expects: pi_a (64 bytes) + pi_b (128 bytes) + pi_c (64 bytes)
  // Each point is encoded as [x, y] where x and y are 32-byte big-endian integers

  const result = new Uint8Array(256)
  let offset = 0

  // pi_a: [x, y] - 64 bytes
  const piA = proof.pi_a
  const piAx = hexToBytes32(piA[0])
  const piAy = hexToBytes32(piA[1])
  result.set(piAx, offset)
  offset += 32
  result.set(piAy, offset)
  offset += 32

  // pi_b: [[x1, x2], [y1, y2]] - 128 bytes (note: reversed order for BN254)
  const piB = proof.pi_b
  const piBx1 = hexToBytes32(piB[0][0])
  const piBx2 = hexToBytes32(piB[0][1])
  const piBy1 = hexToBytes32(piB[1][0])
  const piBy2 = hexToBytes32(piB[1][1])
  // Note: BN254 G2 point encoding order
  result.set(piBx2, offset)
  offset += 32
  result.set(piBx1, offset)
  offset += 32
  result.set(piBy2, offset)
  offset += 32
  result.set(piBy1, offset)
  offset += 32

  // pi_c: [x, y] - 64 bytes
  const piC = proof.pi_c
  const piCx = hexToBytes32(piC[0])
  const piCy = hexToBytes32(piC[1])
  result.set(piCx, offset)
  offset += 32
  result.set(piCy, offset)

  return result
}

function hexToBytes32(hex: string): Uint8Array {
  // Remove '0x' prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex

  // Pad to 64 hex chars (32 bytes)
  const paddedHex = cleanHex.padStart(64, '0')

  // Convert to bytes
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(paddedHex.substr(i * 2, 2), 16)
  }

  return bytes
}
