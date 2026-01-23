import { PublicKey } from '@solana/web3.js'

// Network configuration
export const NETWORK = 'devnet' as const
export const RPC_ENDPOINT = 'https://api.devnet.solana.com'
export const TEE_RPC_ENDPOINT = 'https://devnet.magicblock.app'

// Program IDs
export const SPECTRE_PROGRAM_ID = new PublicKey(
  '6ypxTTHK4q9VC7bABp8U3Sptdt6qNQ7uJHoMqNWKmTuW'
)

export const PRIVACY_CASH_PROGRAM_ID = new PublicKey(
  '9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD'
)

export const DELEGATION_PROGRAM_ID = new PublicKey(
  'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh'
)

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

// Demo mode
export const DEMO_MODE = false

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
