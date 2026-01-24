/**
 * Browser Storage Adapter for PrivacyCash
 * Wraps window.localStorage to match the Storage interface used by the SDK
 */

import { PRIVACY_CASH_PROGRAM_ID } from '@/lib/config/constants'

// Local storage key prefixes
export const LSK_ENCRYPTED_OUTPUTS = 'privacycash_encrypted_outputs_'
export const LSK_FETCH_OFFSET = 'privacycash_fetch_offset_'

/**
 * Generate a unique storage key for a wallet
 */
export function localstorageKey(walletAddress: string): string {
    const programPrefix = PRIVACY_CASH_PROGRAM_ID.toString().substring(0, 6)
    return programPrefix + walletAddress
}

/**
 * Browser storage implementation
 * Provides the same interface as node-localstorage
 */
export const browserStorage = {
    getItem(key: string): string | null {
        try {
            return localStorage.getItem(key)
        } catch {
            console.warn('[BrowserStorage] localStorage not available')
            return null
        }
    },

    setItem(key: string, value: string): void {
        try {
            localStorage.setItem(key, value)
        } catch (e) {
            console.warn('[BrowserStorage] Failed to save to localStorage:', e)
        }
    },

    removeItem(key: string): void {
        try {
            localStorage.removeItem(key)
        } catch {
            console.warn('[BrowserStorage] Failed to remove from localStorage')
        }
    },

    clear(): void {
        try {
            // Only clear privacycash-related keys
            const keysToRemove: string[] = []
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (key && (key.startsWith('privacycash_') || key.startsWith(LSK_ENCRYPTED_OUTPUTS) || key.startsWith(LSK_FETCH_OFFSET))) {
                    keysToRemove.push(key)
                }
            }
            keysToRemove.forEach((key) => localStorage.removeItem(key))
        } catch {
            console.warn('[BrowserStorage] Failed to clear localStorage')
        }
    },

    key(index: number): string | null {
        try {
            return localStorage.key(index)
        } catch {
            return null
        }
    },

    get length(): number {
        try {
            return localStorage.length
        } catch {
            return 0
        }
    },
}

/**
 * In-memory storage fallback for when localStorage is not available
 * (e.g., in incognito mode on some browsers)
 */
export class MemoryStorage {
    private data: Map<string, string> = new Map()

    getItem(key: string): string | null {
        return this.data.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value)
    }

    removeItem(key: string): void {
        this.data.delete(key)
    }

    clear(): void {
        this.data.clear()
    }

    key(index: number): string | null {
        const keys = Array.from(this.data.keys())
        return keys[index] ?? null
    }

    get length(): number {
        return this.data.size
    }
}

/**
 * Get the best available storage
 */
export function getStorage(): typeof browserStorage {
    try {
        // Test if localStorage is available
        const testKey = '__privacycash_test__'
        localStorage.setItem(testKey, 'test')
        localStorage.removeItem(testKey)
        return browserStorage
    } catch {
        console.warn('[BrowserStorage] localStorage not available, using memory storage')
        return new MemoryStorage() as typeof browserStorage
    }
}
