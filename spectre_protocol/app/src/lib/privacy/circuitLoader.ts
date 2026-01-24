/**
 * Circuit File Loader with IndexedDB Caching
 * Handles downloading and caching of ZK circuit files for PrivacyCash
 */

// ============================================
// Configuration
// ============================================

// CDN URLs for circuit files - using public circom circuits
// Note: cdn.spectre.money doesn't exist, use fallback or local
const CIRCUIT_CDN_BASE = 'https://privacycash.github.io/circuits'
const FALLBACK_CDN_BASE = 'https://privacycash.github.io/circuits'

// For development/production, circuits can be served from public folder
const LOCAL_CIRCUIT_PATH = '/circuits'

// Circuit file specifications
const CIRCUITS = {
  transaction2: {
    wasm: 'transaction2.wasm',
    zkey: 'transaction2.zkey',
    wasmSize: 3_100_000, // ~3.1 MB
    zkeySize: 16_000_000, // ~16 MB
    version: 1,
  },
} as const

// IndexedDB configuration
const DB_NAME = 'spectre-circuits'
const DB_VERSION = 1
const STORE_NAME = 'circuit-files'

// ============================================
// Types
// ============================================

export interface CircuitFiles {
  wasm: ArrayBuffer
  zkey: ArrayBuffer
  version: number
}

export interface LoadProgress {
  stage: 'checking' | 'downloading' | 'caching' | 'ready'
  progress: number // 0-100
  bytesLoaded: number
  totalBytes: number
  message: string
}

export type ProgressCallback = (progress: LoadProgress) => void

// ============================================
// IndexedDB Helper
// ============================================

class CircuitDB {
  private db: IDBDatabase | null = null
  private opening: Promise<IDBDatabase> | null = null

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db

    if (this.opening) return this.opening

    this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('[CircuitDB] Failed to open:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
    })

    return this.opening
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async set(key: string, value: ArrayBuffer): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(value, key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getVersion(): Promise<number> {
    try {
      const version = await this.get('version')
      if (version) {
        const decoder = new TextDecoder()
        return parseInt(decoder.decode(version), 10) || 0
      }
    } catch {
      // Ignore
    }
    return 0
  }

  async setVersion(version: number): Promise<void> {
    const encoder = new TextEncoder()
    await this.set('version', encoder.encode(String(version)).buffer as ArrayBuffer)
  }

  async clear(): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

// ============================================
// Circuit Loader Class
// ============================================

export class CircuitLoader {
  private circuitDb: CircuitDB
  private cachedCircuits: CircuitFiles | null = null
  private loadingPromise: Promise<CircuitFiles> | null = null

  constructor() {
    this.circuitDb = new CircuitDB()
  }

  /**
   * Check if circuits are already cached
   */
  async isCached(): Promise<boolean> {
    try {
      const version = await this.circuitDb.getVersion()
      return version === CIRCUITS.transaction2.version
    } catch {
      return false
    }
  }

  /**
   * Get cached circuits if available
   */
  async getCached(): Promise<CircuitFiles | null> {
    if (this.cachedCircuits) return this.cachedCircuits

    try {
      if (!(await this.isCached())) return null

      const wasm = await this.circuitDb.get('transaction2.wasm')
      const zkey = await this.circuitDb.get('transaction2.zkey')

      if (wasm && zkey) {
        this.cachedCircuits = {
          wasm,
          zkey,
          version: CIRCUITS.transaction2.version,
        }
        return this.cachedCircuits
      }
    } catch (e) {
      console.warn('[CircuitLoader] Cache read error:', e)
    }
    return null
  }

  /**
   * Load circuits with progress callback
   * Returns cached version if available, otherwise downloads
   */
  async load(onProgress?: ProgressCallback): Promise<CircuitFiles> {
    // Return in-memory cache if available
    if (this.cachedCircuits) {
      onProgress?.({
        stage: 'ready',
        progress: 100,
        bytesLoaded: 0,
        totalBytes: 0,
        message: 'Circuits loaded from memory',
      })
      return this.cachedCircuits
    }

    // Dedupe concurrent loads
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    this.loadingPromise = this.doLoad(onProgress)

    try {
      return await this.loadingPromise
    } finally {
      this.loadingPromise = null
    }
  }

  private async doLoad(onProgress?: ProgressCallback): Promise<CircuitFiles> {
    // Check cache first
    onProgress?.({
      stage: 'checking',
      progress: 0,
      bytesLoaded: 0,
      totalBytes: 0,
      message: 'Checking local cache...',
    })

    const cached = await this.getCached()
    if (cached) {
      onProgress?.({
        stage: 'ready',
        progress: 100,
        bytesLoaded: 0,
        totalBytes: 0,
        message: 'Loaded from cache',
      })
      return cached
    }

    // Download circuits
    const totalSize = CIRCUITS.transaction2.wasmSize + CIRCUITS.transaction2.zkeySize

    onProgress?.({
      stage: 'downloading',
      progress: 0,
      bytesLoaded: 0,
      totalBytes: totalSize,
      message: 'Downloading ZK circuits (first time only)...',
    })

    let loadedBytes = 0

    // Download WASM
    const wasm = await this.downloadWithProgress(
      `${this.getBaseUrl()}/${CIRCUITS.transaction2.wasm}`,
      (bytes, total) => {
        loadedBytes = bytes
        onProgress?.({
          stage: 'downloading',
          progress: Math.round((loadedBytes / totalSize) * 100),
          bytesLoaded: loadedBytes,
          totalBytes: totalSize,
          message: `Downloading circuit WASM... ${this.formatBytes(bytes)}/${this.formatBytes(total)}`,
        })
      }
    )

    const wasmBytesLoaded = wasm.byteLength

    // Download zkey
    const zkey = await this.downloadWithProgress(
      `${this.getBaseUrl()}/${CIRCUITS.transaction2.zkey}`,
      (bytes, total) => {
        loadedBytes = wasmBytesLoaded + bytes
        onProgress?.({
          stage: 'downloading',
          progress: Math.round((loadedBytes / totalSize) * 100),
          bytesLoaded: loadedBytes,
          totalBytes: totalSize,
          message: `Downloading proving key... ${this.formatBytes(bytes)}/${this.formatBytes(total)}`,
        })
      }
    )

    // Cache the downloads
    onProgress?.({
      stage: 'caching',
      progress: 95,
      bytesLoaded: totalSize,
      totalBytes: totalSize,
      message: 'Caching circuits locally...',
    })

    try {
      await this.circuitDb.set('transaction2.wasm', wasm)
      await this.circuitDb.set('transaction2.zkey', zkey)
      await this.circuitDb.setVersion(CIRCUITS.transaction2.version)
    } catch (e) {
      console.warn('[CircuitLoader] Failed to cache circuits:', e)
      // Continue anyway - circuits are in memory
    }

    this.cachedCircuits = {
      wasm,
      zkey,
      version: CIRCUITS.transaction2.version,
    }

    onProgress?.({
      stage: 'ready',
      progress: 100,
      bytesLoaded: totalSize,
      totalBytes: totalSize,
      message: 'Circuits ready',
    })

    return this.cachedCircuits
  }

  private getBaseUrl(): string {
    // Check if running locally
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return LOCAL_CIRCUIT_PATH
    }
    return CIRCUIT_CDN_BASE
  }

  private async downloadWithProgress(
    url: string,
    onProgress: (bytesLoaded: number, totalBytes: number) => void
  ): Promise<ArrayBuffer> {
    const response = await fetch(url)

    if (!response.ok) {
      // Try fallback CDN
      console.warn(`[CircuitLoader] Primary CDN failed, trying fallback...`)
      const fallbackUrl = url.replace(CIRCUIT_CDN_BASE, FALLBACK_CDN_BASE)
      const fallbackResponse = await fetch(fallbackUrl)
      if (!fallbackResponse.ok) {
        throw new Error(`Failed to download circuit from ${url}: ${response.status}`)
      }
      return this.readResponseWithProgress(fallbackResponse, onProgress)
    }

    return this.readResponseWithProgress(response, onProgress)
  }

  private async readResponseWithProgress(
    response: Response,
    onProgress: (bytesLoaded: number, totalBytes: number) => void
  ): Promise<ArrayBuffer> {
    const contentLength = response.headers.get('Content-Length')
    const total = contentLength ? parseInt(contentLength, 10) : 0

    if (!response.body) {
      // Fallback for browsers without streaming support
      const buffer = await response.arrayBuffer()
      onProgress(buffer.byteLength, buffer.byteLength)
      return buffer
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      chunks.push(value)
      loaded += value.length
      onProgress(loaded, total || loaded)
    }

    // Combine chunks
    const result = new Uint8Array(loaded)
    let position = 0
    for (const chunk of chunks) {
      result.set(chunk, position)
      position += chunk.length
    }

    return result.buffer as ArrayBuffer
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * Clear cached circuits (for debugging/updates)
   */
  async clearCache(): Promise<void> {
    this.cachedCircuits = null
    await this.circuitDb.clear()
  }

  /**
   * Get estimated total size to download
   */
  getTotalSize(): number {
    return CIRCUITS.transaction2.wasmSize + CIRCUITS.transaction2.zkeySize
  }

  /**
   * Format total size for display
   */
  getFormattedTotalSize(): string {
    return this.formatBytes(this.getTotalSize())
  }
}

// ============================================
// Singleton Instance
// ============================================

let loaderInstance: CircuitLoader | null = null

export function getCircuitLoader(): CircuitLoader {
  if (!loaderInstance) {
    loaderInstance = new CircuitLoader()
  }
  return loaderInstance
}

// ============================================
// Preload Helper
// ============================================

/**
 * Preload circuits in the background
 * Call this on app startup to minimize wait time later
 */
export async function preloadCircuits(onProgress?: ProgressCallback): Promise<void> {
  const loader = getCircuitLoader()
  await loader.load(onProgress)
}
