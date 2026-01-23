/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL: string
  readonly VITE_RANGE_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    Buffer: typeof Buffer
  }
}
