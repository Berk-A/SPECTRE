/**
 * Empty fs module shim for browser environment
 * Required by snarkjs which imports fs but doesn't use it in browser
 */

// These are no-op stubs that satisfy snarkjs imports
// The actual file operations in snarkjs are wrapped in try-catch
// and will fall back to fetch when these fail

export function readFileSync(): never {
  throw new Error('fs.readFileSync not available in browser')
}

export function writeFileSync(): never {
  throw new Error('fs.writeFileSync not available in browser')
}

export function existsSync(): boolean {
  return false
}

export function mkdirSync(): void {
  // no-op
}

export function readdirSync(): string[] {
  return []
}

export function statSync(): never {
  throw new Error('fs.statSync not available in browser')
}

export function unlinkSync(): void {
  // no-op
}

export const promises = {
  readFile: async (): Promise<never> => {
    throw new Error('fs.promises.readFile not available in browser')
  },
  writeFile: async (): Promise<void> => {
    // no-op
  },
  mkdir: async (): Promise<void> => {
    // no-op
  },
  access: async (): Promise<never> => {
    throw new Error('fs.promises.access not available in browser')
  },
  stat: async (): Promise<never> => {
    throw new Error('fs.promises.stat not available in browser')
  },
}

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  promises,
}
