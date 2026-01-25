/**
 * Shim for vite-plugin-node-polyfills/shims/process
 * Used by @lightprotocol/hasher.rs
 */

// The vite-plugin-node-polyfills provides a global process object
// We just need to re-export it
const processShim = typeof process !== 'undefined' ? process : {
  env: {},
  version: '',
  versions: {},
  platform: 'browser',
  browser: true,
  nextTick: (fn: () => void) => setTimeout(fn, 0),
}

export default processShim
