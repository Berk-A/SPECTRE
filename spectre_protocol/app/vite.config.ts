import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Enable polyfills for Node.js built-ins used by Solana SDKs
      include: ['crypto', 'buffer', 'stream', 'util', 'events', 'process'],
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
    },
  },
  define: {
    // For Solana wallet adapter compatibility
    'process.env': {},
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
    include: ['buffer', '@solana/web3.js'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      external: [],
    },
  },
})
