/**
 * Shims for vite-plugin-node-polyfills imports used by @lightprotocol/hasher.rs
 */

// Re-export process from the polyfill
export { default as process } from 'process'

// Re-export Buffer from the polyfill
export { Buffer } from 'buffer'
