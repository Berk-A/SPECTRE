import { PublicKey } from '@solana/web3.js'

// Network configuration
// Use VITE_RPC_ENDPOINT environment variable for private RPC, fallback to public devnet
export const NETWORK = 'devnet' as const
export const RPC_ENDPOINT = import.meta.env.VITE_RPC_ENDPOINT || 'https://api.devnet.solana.com'
export const TEE_RPC_ENDPOINT = 'https://devnet.magicblock.app'

// Program IDs
export const SPECTRE_PROGRAM_ID = new PublicKey(
  'B2at4oGQFPAbuH2wMMpBsFrTvJi71GUvR7jyxny7HaGf'
)

export const PRIVACY_CASH_PROGRAM_ID = new PublicKey(
  '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD'
)

export const DELEGATION_PROGRAM_ID = new PublicKey(
  'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
)

// PDA Seeds
export const VAULT_SEED = 'spectre_vault'
export const USER_DEPOSIT_SEED = 'user_deposit'
export const WITHDRAWAL_SEED = 'withdrawal'

// Instruction Discriminators
export const INITIALIZE_IX_DISCRIMINATOR = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237])
export const FUND_AGENT_IX_DISCRIMINATOR = Buffer.from([108, 252, 24, 134, 89, 166, 124, 67])
export const REQUEST_WITHDRAWAL_IX_DISCRIMINATOR = Buffer.from([251, 85, 121, 205, 56, 201, 12, 177])
export const COMPLETE_WITHDRAWAL_IX_DISCRIMINATOR = Buffer.from([107, 98, 134, 131, 74, 120, 174, 121])

// Account Discriminators
export const WITHDRAWAL_REQUEST_ACCOUNT_DISCRIMINATOR = Buffer.from([242, 88, 147, 173, 182, 62, 229, 193])

// Token mints
export const USDC_DEVNET = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
)

export const USDC_MAINNET = new PublicKey(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
)

// Compliance
export const MAX_RISK_SCORE = 30
export const MAX_ATTESTATION_AGE_SLOTS = 50

// Trading
export const MIN_TRADE_AMOUNT_USDC = 1
export const MAX_TRADE_AMOUNT_USDC = 10000
export const MIN_LIQUIDITY_USDC = 100

// Privacy
export const MIN_DEPOSIT_SOL = 0.001
export const MAX_DEPOSIT_SOL = 1000

// Feature-specific demo modes
// PNP: Demo mode ON because program pnpxFx... doesn't exist on devnet
export const PNP_DEMO_MODE = true
// Privacy: Demo mode OFF - Real SDK with Poseidon hashing and ZK proofs
// Uses Vercel serverless proxy to bypass CORS restrictions
export const PRIVACY_DEMO_MODE = false
// TEE: Demo mode ON - MagicBlock delegation program may not be on devnet
export const TEE_DEMO_MODE = true

// Legacy compatibility - true if ANY feature is in demo mode
export const DEMO_MODE = PNP_DEMO_MODE || PRIVACY_DEMO_MODE || TEE_DEMO_MODE

// Layer labels
export const LAYERS = {
  PRIVACY: 'Privacy Layer',
  TEE: 'TEE Layer',
  TRADING: 'Trading Layer',
} as const

// Status colors
export const STATUS_COLORS = {
  success: 'text-status-success',
  warning: 'text-status-warning',
  error: 'text-status-error',
  info: 'text-status-info',
} as const
