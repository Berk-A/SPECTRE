/**
 * Shim for vite-plugin-node-polyfills/shims/buffer
 * Used by @lightprotocol/hasher.rs
 */

import { Buffer } from 'buffer'

export { Buffer }
export default Buffer
