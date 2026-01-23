/**
 * SPECTRE Range Protocol Client
 *
 * TypeScript client for Range Protocol compliance verification.
 * This module integrates with Range's Risk API to perform wallet
 * risk scoring and sanctions checking for withdrawal compliance.
 *
 * Range API Documentation: https://docs.range.org/reference/risk
 *
 * ## Features
 * - Wallet address risk scoring (0-10 scale, converted to 0-100)
 * - Sanctions and blacklist checking
 * - Payment risk assessment
 * - Attestation generation for on-chain verification
 *
 * ## Usage
 * ```typescript
 * import { RangeClient, createRangeAttestation } from './range';
 *
 * const client = new RangeClient(process.env.RANGE_API_KEY);
 * const riskData = await client.getAddressRisk(walletAddress);
 *
 * if (riskData.passed) {
 *   const attestation = createRangeAttestation(walletAddress, riskData, currentSlot);
 *   // Use attestation for on-chain compliance verification
 * }
 * ```
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

// ============================================
// Constants
// ============================================

/**
 * Range API base URL
 */
export const RANGE_API_BASE = 'https://api.range.org';

/**
 * Maximum risk score allowed for withdrawals (0-100 scale)
 * Scores above this will block the withdrawal
 */
export const MAX_ALLOWED_RISK_SCORE = 30;

/**
 * Maximum age of attestation in slots before it's considered stale
 * At ~400ms per slot, 50 slots = ~20 seconds
 */
export const MAX_ATTESTATION_AGE_SLOTS = 50;

// ============================================
// Types
// ============================================

/**
 * Risk levels as classified by Range Protocol
 */
export enum RiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/**
 * Raw response from Range API /v1/risk/address endpoint
 * Actual format from API: { riskScore: number, riskLevel: string, attribution: object|null }
 */
export interface RangeAddressRiskResponse {
  riskScore: number; // 0-100 scale
  riskLevel: string; // "Low risk", "Medium risk", "High risk", "Critical risk"
  attribution: {
    name?: string;
    category?: string;
    website?: string;
  } | null;
}

/**
 * Raw response from Range API /v1/risk/sanctions endpoint
 */
export interface RangeSanctionsResponse {
  address: string;
  network: string;
  is_token_blacklisted: boolean;
  is_ofac_sanctioned: boolean;
  checked_at: string;
  token_status_summary: string | null;
  blacklist_event_history: any[] | null;
  ofac_info: any | null;
  attribution: any | null;
}

/**
 * Payment risk assessment result (combined from address risks)
 */
export interface RangePaymentRiskResponse {
  source: {
    address: string;
    riskScore: number;
  };
  destination: {
    address: string;
    riskScore: number;
  };
  overallRiskScore: number;
  recommendation: 'allow' | 'review' | 'block';
}

/**
 * Processed risk assessment result
 */
export interface RiskAssessment {
  /** Whether the address passed compliance checks */
  passed: boolean;
  /** Risk score on 0-100 scale */
  riskScore: number;
  /** Risk level classification */
  riskLevel: RiskLevel;
  /** Whether address is on sanctions list */
  isSanctioned: boolean;
  /** Whether address has malicious connections */
  hasMaliciousConnections: boolean;
  /** Number of hops to nearest malicious address */
  numHops: number;
  /** Raw API response for debugging */
  rawResponse?: RangeAddressRiskResponse;
  /** Error message if request failed */
  error?: string;
}

/**
 * Attestation structure for on-chain compliance verification
 * Must match the Rust RangeAttestation struct
 */
export interface RangeAttestation {
  /** Address being verified */
  address: PublicKey;
  /** Risk score (0-100 scale) */
  riskScore: number;
  /** Risk level enum variant */
  riskLevel: { [key: string]: {} };
  /** Slot when attestation was created */
  attestationSlot: BN;
  /** Number of hops to suspicious activity */
  numHops: number;
  /** Oracle signature (mock for now) */
  oracleSignature: number[];
  /** Whether malicious connections were found */
  hasMaliciousConnections: boolean;
}

// ============================================
// Range API Client
// ============================================

/**
 * Range Protocol API Client
 *
 * Provides methods to interact with Range's Risk API for
 * wallet compliance verification.
 */
export class RangeClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = RANGE_API_BASE) {
    if (!apiKey) {
      throw new Error('Range API key is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Make an authenticated request to the Range API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-API-KEY': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Range API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get risk assessment for a Solana address
   *
   * @param address - The Solana wallet address to check
   * @returns Risk assessment with score and compliance status
   */
  async getAddressRisk(address: string | PublicKey): Promise<RiskAssessment> {
    const addressStr = typeof address === 'string' ? address : address.toBase58();

    try {
      // Get risk score from address endpoint
      const riskResponse = await this.request<RangeAddressRiskResponse>(
        `/v1/risk/address?address=${addressStr}&network=solana`
      );

      // Get sanctions status from sanctions endpoint
      let isSanctioned = false;
      let isBlacklisted = false;
      try {
        const sanctionsResponse = await this.request<RangeSanctionsResponse>(
          `/v1/risk/sanctions/${addressStr}?network=solana`
        );
        isSanctioned = sanctionsResponse.is_ofac_sanctioned;
        isBlacklisted = sanctionsResponse.is_token_blacklisted;
      } catch (sanctionError) {
        // If sanctions check fails, assume not sanctioned but log warning
        console.warn('Sanctions check failed, proceeding with risk score only:', sanctionError);
      }

      // Risk score is already 0-100 scale from API
      const riskScore = riskResponse.riskScore;

      // Determine risk level from score (API returns string like "Low risk")
      const riskLevel = this.classifyRiskLevel(riskScore);

      // Consider address malicious if high risk or blacklisted
      const hasMaliciousConnections = riskScore >= 70 || isBlacklisted;

      // Check if address passes compliance
      const passed =
        riskScore <= MAX_ALLOWED_RISK_SCORE &&
        !isSanctioned &&
        !isBlacklisted &&
        !hasMaliciousConnections;

      return {
        passed,
        riskScore,
        riskLevel,
        isSanctioned,
        hasMaliciousConnections,
        numHops: 0, // Not provided by this API
        rawResponse: riskResponse,
      };
    } catch (error: any) {
      console.error('Range API request failed:', error);
      return {
        passed: false,
        riskScore: 100,
        riskLevel: RiskLevel.Critical,
        isSanctioned: false,
        hasMaliciousConnections: false,
        numHops: 0,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Check if an address is on a sanctions list
   *
   * @param address - The address to check
   * @returns True if address is sanctioned (OFAC) or blacklisted
   */
  async checkSanctions(address: string | PublicKey): Promise<boolean> {
    const addressStr = typeof address === 'string' ? address : address.toBase58();

    try {
      const response = await this.request<RangeSanctionsResponse>(
        `/v1/risk/sanctions/${addressStr}?network=solana`
      );
      return response.is_ofac_sanctioned || response.is_token_blacklisted;
    } catch (error) {
      console.error('Sanctions check failed:', error);
      // Fail safe: if we can't verify, assume sanctioned
      return true;
    }
  }

  /**
   * Assess payment risk between two addresses
   * Note: Constructs payment risk from individual address assessments
   *
   * @param sourceAddress - The source/sender address
   * @param destinationAddress - The destination/recipient address
   * @returns Payment risk assessment
   */
  async assessPaymentRisk(
    sourceAddress: string | PublicKey,
    destinationAddress: string | PublicKey
  ): Promise<RangePaymentRiskResponse | null> {
    const sourceStr = typeof sourceAddress === 'string' ? sourceAddress : sourceAddress.toBase58();
    const destStr = typeof destinationAddress === 'string' ? destinationAddress : destinationAddress.toBase58();

    try {
      // Get individual risk assessments
      const [sourceRisk, destRisk] = await Promise.all([
        this.getAddressRisk(sourceStr),
        this.getAddressRisk(destStr),
      ]);

      // Calculate overall risk (max of source and destination)
      const overallRiskScore = Math.max(sourceRisk.riskScore, destRisk.riskScore);

      // Determine recommendation based on overall risk
      let recommendation: 'allow' | 'review' | 'block';
      if (overallRiskScore <= MAX_ALLOWED_RISK_SCORE && !sourceRisk.isSanctioned && !destRisk.isSanctioned) {
        recommendation = 'allow';
      } else if (overallRiskScore <= 50 && !sourceRisk.isSanctioned && !destRisk.isSanctioned) {
        recommendation = 'review';
      } else {
        recommendation = 'block';
      }

      return {
        source: {
          address: sourceStr,
          riskScore: sourceRisk.riskScore,
        },
        destination: {
          address: destStr,
          riskScore: destRisk.riskScore,
        },
        overallRiskScore,
        recommendation,
      };
    } catch (error) {
      console.error('Payment risk assessment failed:', error);
      return null;
    }
  }

  /**
   * Classify risk score into risk level
   */
  private classifyRiskLevel(score: number): RiskLevel {
    if (score <= 20) return RiskLevel.Low;
    if (score <= 50) return RiskLevel.Medium;
    if (score <= 80) return RiskLevel.High;
    return RiskLevel.Critical;
  }
}

// ============================================
// Attestation Helpers
// ============================================

/**
 * Create a RangeAttestation for on-chain verification
 *
 * @param address - The verified address
 * @param assessment - Risk assessment from Range API
 * @param currentSlot - Current blockchain slot
 * @returns Attestation object for use with SPECTRE program
 */
export function createRangeAttestation(
  address: PublicKey,
  assessment: RiskAssessment,
  currentSlot: number | BN
): RangeAttestation {
  const slot = typeof currentSlot === 'number' ? new BN(currentSlot) : currentSlot;

  // Map RiskLevel to Anchor enum format
  const riskLevelVariant: { [key: string]: {} } = {};
  switch (assessment.riskLevel) {
    case RiskLevel.Low:
      riskLevelVariant['low'] = {};
      break;
    case RiskLevel.Medium:
      riskLevelVariant['medium'] = {};
      break;
    case RiskLevel.High:
      riskLevelVariant['high'] = {};
      break;
    case RiskLevel.Critical:
      riskLevelVariant['critical'] = {};
      break;
  }

  return {
    address,
    riskScore: assessment.riskScore,
    riskLevel: riskLevelVariant,
    attestationSlot: slot,
    numHops: assessment.numHops,
    oracleSignature: new Array(64).fill(0), // Mock signature for now
    hasMaliciousConnections: assessment.hasMaliciousConnections,
  };
}

/**
 * Create a clean attestation for testing (low risk)
 */
export function createCleanAttestation(
  address: PublicKey,
  currentSlot: number | BN
): RangeAttestation {
  return createRangeAttestation(
    address,
    {
      passed: true,
      riskScore: 0,
      riskLevel: RiskLevel.Low,
      isSanctioned: false,
      hasMaliciousConnections: false,
      numHops: 0,
    },
    currentSlot
  );
}

/**
 * Create a high-risk attestation for testing
 */
export function createHighRiskAttestation(
  address: PublicKey,
  currentSlot: number | BN
): RangeAttestation {
  return createRangeAttestation(
    address,
    {
      passed: false,
      riskScore: 85,
      riskLevel: RiskLevel.Critical,
      isSanctioned: false,
      hasMaliciousConnections: true,
      numHops: 2,
    },
    currentSlot
  );
}

// ============================================
// Utility Functions
// ============================================

/**
 * Verify an attestation is still fresh
 *
 * @param attestation - The attestation to verify
 * @param currentSlot - Current blockchain slot
 * @returns True if attestation is fresh enough
 */
export function isAttestationFresh(
  attestation: RangeAttestation,
  currentSlot: number | BN
): boolean {
  const slot = typeof currentSlot === 'number' ? new BN(currentSlot) : currentSlot;
  const age = slot.sub(attestation.attestationSlot);
  return age.lten(MAX_ATTESTATION_AGE_SLOTS);
}

/**
 * Check if a risk assessment passes compliance
 */
export function passesCompliance(assessment: RiskAssessment): boolean {
  return (
    assessment.riskScore <= MAX_ALLOWED_RISK_SCORE &&
    !assessment.isSanctioned &&
    !assessment.hasMaliciousConnections
  );
}

/**
 * Format risk assessment for logging
 */
export function formatRiskAssessment(assessment: RiskAssessment): string {
  return `
Risk Assessment:
  Passed: ${assessment.passed}
  Score: ${assessment.riskScore}/100
  Level: ${assessment.riskLevel}
  Sanctioned: ${assessment.isSanctioned}
  Malicious: ${assessment.hasMaliciousConnections}
  Hops: ${assessment.numHops}
  ${assessment.error ? `Error: ${assessment.error}` : ''}
`.trim();
}

// ============================================
// Export default client factory
// ============================================

/**
 * Create a Range client with API key from environment
 */
export function createRangeClientFromEnv(): RangeClient {
  const apiKey = process.env.RANGE_PROTOCOL_API_KEY;
  if (!apiKey) {
    throw new Error('RANGE_PROTOCOL_API_KEY environment variable not set');
  }
  return new RangeClient(apiKey);
}

export default RangeClient;
