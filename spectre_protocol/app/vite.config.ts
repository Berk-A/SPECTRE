import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Handle Node.js built-ins for Solana wallet adapter
      buffer: 'buffer',
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
    },
  },
  define: {
    // For Solana wallet adapter compatibility
    'process.env': {},
    global: 'globalThis',
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
