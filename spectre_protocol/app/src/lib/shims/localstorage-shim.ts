/**
 * Browser localStorage wrapper that matches node-localstorage interface
 * Used by PrivacyCash SDK for note storage
 */

export class LocalStorage {
  private prefix: string

  constructor(location?: string) {
    // Use location as a prefix to namespace storage
    // This mimics the directory-based storage of node-localstorage
    this.prefix = location ? `spectre:${this.sanitizePath(location)}:` : 'spectre:'
  }

  private sanitizePath(path: string): string {
    // Convert path to a safe storage key prefix
    return path
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase()
  }

  private getFullKey(key: string): string {
    return `${this.prefix}${key}`
  }

  getItem(key: string): string | null {
    try {
      return localStorage.getItem(this.getFullKey(key))
    } catch (e) {
      console.warn('[LocalStorage Shim] getItem failed:', e)
      return null
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(this.getFullKey(key), value)
    } catch (e) {
      console.warn('[LocalStorage Shim] setItem failed:', e)
      // Storage might be full or disabled
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        // Try to clear old items
        this.pruneOldItems()
        try {
          localStorage.setItem(this.getFullKey(key), value)
        } catch {
          console.error('[LocalStorage Shim] Storage full, cannot save')
        }
      }
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(this.getFullKey(key))
    } catch (e) {
      console.warn('[LocalStorage Shim] removeItem failed:', e)
    }
  }

  clear(): void {
    try {
      // Only clear items with our prefix
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
    } catch (e) {
      console.warn('[LocalStorage Shim] clear failed:', e)
    }
  }

  key(index: number): string | null {
    try {
      // Get keys matching our prefix
      const keys = this.keys()
      return keys[index] || null
    } catch (e) {
      console.warn('[LocalStorage Shim] key failed:', e)
      return null
    }
  }

  keys(): string[] {
    try {
      const result: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(this.prefix)) {
          // Return key without prefix
          result.push(key.slice(this.prefix.length))
        }
      }
      return result
    } catch (e) {
      console.warn('[LocalStorage Shim] keys failed:', e)
      return []
    }
  }

  get length(): number {
    return this.keys().length
  }

  private pruneOldItems(): void {
    // Remove old cached items to free space
    // This is a simple LRU-like cleanup
    try {
      const keys = this.keys()
      const cacheKeys = keys.filter(k => k.startsWith('cache_'))
      // Remove half of cache keys
      const toRemove = cacheKeys.slice(0, Math.floor(cacheKeys.length / 2))
      toRemove.forEach(key => this.removeItem(key))
    } catch (e) {
      console.warn('[LocalStorage Shim] pruneOldItems failed:', e)
    }
  }
}

// Default export for CommonJS compatibility
export default { LocalStorage }

// Also export a pre-configured instance for easy use
export const storage = new LocalStorage()
