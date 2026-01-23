/**
 * SPECTRE Protocol TypeScript Client
 *
 * Unified client library for interacting with the SPECTRE Protocol.
 *
 * ## Modules
 *
 * ### Range Protocol (`./range`)
 * Compliance verification using Range Protocol's Risk API.
 * - Wallet risk scoring
 * - Sanctions checking
 * - Attestation generation
 *
 * ### TEE Client (`./tee`)
 * MagicBlock TEE integration for confidential execution.
 * - Account delegation to TEE enclaves
 * - Undelegation with async L1 sync
 * - TEE connection management
 *
 * ### Withdrawal Client (`./withdrawal`)
 * Complete withdrawal flow with compliance integration.
 * - Request withdrawals
 * - Get compliance attestations
 * - Execute compliant withdrawals
 *
 * ## Quick Start
 *
 * ```typescript
 * import {
 *   RangeClient,
 *   SpectreTeeCient,
 *   SpectreWithdrawalClient,
 * } from '@spectre/client';
 *
 * // Compliance checking
 * const rangeClient = new RangeClient(apiKey);
 * const risk = await rangeClient.getAddressRisk(address);
 *
 * // TEE delegation
 * const teeClient = new SpectreTeeCient(provider, programId);
 * await teeClient.delegateVault(authority);
 *
 * // Compliant withdrawals
 * const withdrawClient = new SpectreWithdrawalClient(provider, program);
 * withdrawClient.initializeRangeClient(apiKey);
 * await withdrawClient.executeCompliantWithdrawal(amount);
 * ```
 */

// ============================================
// Range Protocol Exports
// ============================================

export {
  // Client
  RangeClient,
  createRangeClientFromEnv,
  // Types
  RiskLevel,
  RiskAssessment,
  RangeAttestation,
  RangeAddressRiskResponse,
  RangeSanctionsResponse,
  RangePaymentRiskResponse,
  // Attestation helpers
  createRangeAttestation,
  createCleanAttestation,
  createHighRiskAttestation,
  // Utility functions
  isAttestationFresh,
  passesCompliance,
  formatRiskAssessment,
  // Constants
  RANGE_API_BASE,
  MAX_ALLOWED_RISK_SCORE,
  MAX_ATTESTATION_AGE_SLOTS,
} from './range';

// ============================================
// TEE Client Exports
// ============================================

export {
  // Client
  SpectreTeeCient,
  // Types
  DelegationResult,
  UndelegationResult,
  VaultDelegationStatus,
  TeeClientConfig,
  // PDA derivation
  deriveVaultPda as deriveTeeVaultPda,
  deriveBufferPda,
  deriveDelegationRecordPda,
  deriveDelegationMetadataPda,
  deriveStrategyConfigPda,
  // Utility functions
  printDelegationStatus,
  createTeeAwareProvider,
  waitForDelegation,
  // Constants
  DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID,
  TEE_DEVNET_RPC,
  SOLANA_DEVNET_RPC,
} from './tee';

// ============================================
// Withdrawal Client Exports
// ============================================

export {
  // Client
  SpectreWithdrawalClient,
  createWithdrawalClientFromEnv,
  // Types
  WithdrawalResult,
  WithdrawalRequest,
  WithdrawalStatus,
  // PDA derivation
  deriveVaultPda,
  deriveUserDepositPda,
  deriveWithdrawalRequestPda,
} from './withdrawal';

// ============================================
// PNP Exchange Exports
// ============================================

export {
  // Client
  SpectrePnpClient,
  createPnpClientFromEnv,
  createReadOnlyPnpClient,
  // Types
  TradeSignal,
  TradeSide,
  SpectreMarket,
  TradeExecutionResult,
  PositionInfo,
  MarketSelectionCriteria,
  PnpClientConfig,
  // Utility functions
  signalToTradeSide,
  isStrongSignal,
  isActionableSignal,
  calculatePositionSize,
  scoreMarket,
  selectBestMarket,
  normalizeMarket,
  formatMarket,
  formatTradeResult,
  // Constants
  PNP_MAINNET_USDC,
  PNP_DEVNET_USDC,
  MIN_TRADE_AMOUNT_USDC,
  MAX_TRADE_AMOUNT_USDC,
  MIN_LIQUIDITY_USDC,
  MIN_TIME_TO_EXPIRY_HOURS,
  MAX_PRICE_DEVIATION,
  DEFAULT_SELECTION_CRITERIA,
  DEFAULT_PNP_CONFIG,
} from './pnp';

// ============================================
// PrivacyCash Exports
// ============================================

export {
  // Client
  SpectrePrivacyClient,
  createPrivacyClientFromEnv,
  createReadOnlyPrivacyClient,
  // Types
  DepositNote,
  ShieldResult,
  UnshieldResult,
  ShieldedBalance,
  NoteDelegation,
  PrivacyClientConfig,
  ShieldedTokenType,
  // Note management functions
  createDepositNote,
  serializeNote,
  deserializeNote,
  validateNote,
  encryptNote,
  decryptNote,
  generateCommitment,
  generateNullifierHash,
  generateRandomBytes,
  // Validation functions
  validateShieldAmount,
  formatAmount,
  // Formatting functions
  formatShieldResult,
  formatUnshieldResult,
  // Constants
  PRIVACY_CASH_PROGRAM_ID,
  USDC_MAINNET,
  USDC_DEVNET,
  MIN_DEPOSIT_SOL,
  MAX_DEPOSIT_SOL,
  MIN_DEPOSIT_LAMPORTS,
  MAX_DEPOSIT_LAMPORTS,
  NOTE_KEY_SIZE,
  COMMITMENT_SIZE,
  NULLIFIER_SIZE,
  DEFAULT_PRIVACY_CONFIG,
} from './privacy';
