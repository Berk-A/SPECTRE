import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Enable polyfills for Node.js built-ins used by Solana SDKs and snarkjs
      include: ['crypto', 'buffer', 'stream', 'util', 'events', 'process', 'path', 'os'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Shims for Node.js modules used by PrivacyCash SDK
      'fs': path.resolve(__dirname, './src/lib/shims/fs-shim.ts'),
      'node-localstorage': path.resolve(__dirname, './src/lib/shims/localstorage-shim.ts'),
    },
  },
  define: {
    // For Solana wallet adapter compatibility
    'process.env': {},
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    include: ['buffer', '@solana/web3.js'],
    exclude: ['snarkjs'], // snarkjs needs special handling for WASM
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      external: [],
    },
  },
  // Allow loading WASM and zkey files
  assetsInclude: ['**/*.wasm', '**/*.zkey'],
})
