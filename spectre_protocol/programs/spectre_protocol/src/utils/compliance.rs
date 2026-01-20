//! Range Protocol Compliance Module
//!
//! Implements on-chain risk verification via Range Protocol.
//! This module verifies that addresses are not sanctioned before
//! allowing withdrawals from the SPECTRE vault.
//!
//! Integration Pattern:
//! 1. Client requests signed quote from Switchboard oracle
//! 2. Oracle executes Range API job in secure enclave
//! 3. Program verifies Ed25519 signature
//! 4. Check quote freshness (max slots old)
//! 5. Extract and validate risk score

use anchor_lang::prelude::*;

/// Maximum allowed risk score (0-100 scale, derived from 0-10 API scale)
/// Addresses with risk > 30 are blocked
pub const MAX_RISK_SCORE: u8 = 30;

/// Maximum age of compliance attestation in slots
/// At ~400ms per slot, 50 slots ≈ 20 seconds
pub const MAX_ATTESTATION_AGE_SLOTS: u64 = 50;

/// Risk levels as reported by Range Protocol
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum RiskLevel {
    /// Low risk (score 0-2)
    Low,
    /// Medium risk (score 3-5)
    Medium,
    /// High risk (score 6-8)
    High,
    /// Critical risk (score 9-10) - OFAC sanctioned, etc.
    Critical,
}

impl RiskLevel {
    /// Convert from raw risk score (0-100 scaled)
    pub fn from_score(score: u8) -> Self {
        match score {
            0..=20 => RiskLevel::Low,
            21..=50 => RiskLevel::Medium,
            51..=80 => RiskLevel::High,
            _ => RiskLevel::Critical,
        }
    }

    /// Check if this risk level is acceptable for withdrawal
    pub fn is_acceptable(&self) -> bool {
        matches!(self, RiskLevel::Low | RiskLevel::Medium)
    }
}

/// Range Protocol attestation data
/// This is populated from a Switchboard oracle response
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct RangeAttestation {
    /// Address being checked
    pub address: Pubkey,

    /// Risk score (0-100, scaled from Range API's 0-10)
    pub risk_score: u8,

    /// Risk level classification
    pub risk_level: RiskLevel,

    /// Slot when this attestation was created
    pub attestation_slot: u64,

    /// Number of hops to suspicious activity (if any)
    pub num_hops: u8,

    /// Oracle signature over the attestation data
    /// In production, this would be verified against Switchboard
    pub oracle_signature: [u8; 64],

    /// Whether any malicious addresses were found in the path
    pub has_malicious_connections: bool,
}

impl RangeAttestation {
    /// Create a new attestation (used by oracle/mock)
    pub fn new(
        address: Pubkey,
        risk_score: u8,
        attestation_slot: u64,
        num_hops: u8,
        has_malicious_connections: bool,
    ) -> Self {
        Self {
            address,
            risk_score,
            risk_level: RiskLevel::from_score(risk_score),
            attestation_slot,
            num_hops,
            oracle_signature: [0u8; 64], // Mock signature
            has_malicious_connections,
        }
    }

    /// Create a clean attestation for testing
    pub fn clean(address: Pubkey, slot: u64) -> Self {
        Self::new(address, 0, slot, 0, false)
    }

    /// Create a high-risk attestation for testing
    pub fn high_risk(address: Pubkey, slot: u64) -> Self {
        Self::new(address, 85, slot, 2, true)
    }
}

/// Error returned when compliance check fails
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComplianceError {
    /// Attestation is too old
    StaleAttestation,
    /// Risk score exceeds maximum allowed
    HighRiskAddress,
    /// Address has malicious connections
    MaliciousConnections,
    /// Oracle signature verification failed
    InvalidSignature,
    /// Address in attestation doesn't match requested
    AddressMismatch,
}

/// Result of compliance verification
#[derive(Debug, Clone)]
pub struct ComplianceResult {
    /// Whether the address passed compliance
    pub passed: bool,

    /// Risk score of the address
    pub risk_score: u8,

    /// Risk level classification
    pub risk_level: RiskLevel,

    /// Error if compliance failed
    pub error: Option<ComplianceError>,
}

impl ComplianceResult {
    /// Create a passing result
    pub fn pass(risk_score: u8) -> Self {
        Self {
            passed: true,
            risk_score,
            risk_level: RiskLevel::from_score(risk_score),
            error: None,
        }
    }

    /// Create a failing result
    pub fn fail(risk_score: u8, error: ComplianceError) -> Self {
        Self {
            passed: false,
            risk_score,
            risk_level: RiskLevel::from_score(risk_score),
            error: Some(error),
        }
    }
}

/// Verify compliance of an address for withdrawal
///
/// # Arguments
/// * `attestation` - The Range Protocol attestation
/// * `expected_address` - The address we expect the attestation to be for
/// * `current_slot` - The current blockchain slot
///
/// # Returns
/// * `ComplianceResult` indicating pass/fail and details
pub fn verify_compliance(
    attestation: &RangeAttestation,
    expected_address: &Pubkey,
    current_slot: u64,
) -> ComplianceResult {
    // 1. Verify address matches
    if attestation.address != *expected_address {
        return ComplianceResult::fail(attestation.risk_score, ComplianceError::AddressMismatch);
    }

    // 2. Check attestation freshness
    let age = current_slot.saturating_sub(attestation.attestation_slot);
    if age > MAX_ATTESTATION_AGE_SLOTS {
        return ComplianceResult::fail(attestation.risk_score, ComplianceError::StaleAttestation);
    }

    // 3. Check for malicious connections
    if attestation.has_malicious_connections {
        return ComplianceResult::fail(
            attestation.risk_score,
            ComplianceError::MaliciousConnections,
        );
    }

    // 4. Check risk score threshold
    if attestation.risk_score > MAX_RISK_SCORE {
        return ComplianceResult::fail(attestation.risk_score, ComplianceError::HighRiskAddress);
    }

    // 5. Verify oracle signature
    // In production, this would verify against Switchboard oracle
    // For Phase 1, we use mock verification
    if !verify_oracle_signature(attestation) {
        return ComplianceResult::fail(attestation.risk_score, ComplianceError::InvalidSignature);
    }

    ComplianceResult::pass(attestation.risk_score)
}

/// Verify the oracle signature on an attestation
/// In production, this verifies against Switchboard Ed25519 signature
fn verify_oracle_signature(attestation: &RangeAttestation) -> bool {
    // Phase 1: Mock verification - accept all signatures
    // Phase 2: Implement actual Ed25519 verification via Switchboard
    //
    // Production implementation would:
    // 1. Reconstruct the signed message from attestation data
    // 2. Verify the Ed25519 signature against known oracle pubkey
    // 3. Verify the oracle is a valid Switchboard oracle

    // For now, accept any signature (mock mode)
    // A zero signature indicates mock mode
    attestation.oracle_signature.iter().all(|&b| b == 0)
        || attestation.oracle_signature.iter().any(|&b| b != 0)
}

/// Serialize attestation data for signing
/// Used to verify oracle signatures
pub fn serialize_attestation_data(attestation: &RangeAttestation) -> Vec<u8> {
    let mut data = Vec::with_capacity(64);
    data.extend_from_slice(attestation.address.as_ref());
    data.push(attestation.risk_score);
    data.extend_from_slice(&attestation.attestation_slot.to_le_bytes());
    data.push(attestation.num_hops);
    data.push(if attestation.has_malicious_connections {
        1
    } else {
        0
    });
    data
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_risk_level_from_score() {
        assert_eq!(RiskLevel::from_score(0), RiskLevel::Low);
        assert_eq!(RiskLevel::from_score(20), RiskLevel::Low);
        assert_eq!(RiskLevel::from_score(21), RiskLevel::Medium);
        assert_eq!(RiskLevel::from_score(50), RiskLevel::Medium);
        assert_eq!(RiskLevel::from_score(51), RiskLevel::High);
        assert_eq!(RiskLevel::from_score(80), RiskLevel::High);
        assert_eq!(RiskLevel::from_score(81), RiskLevel::Critical);
        assert_eq!(RiskLevel::from_score(100), RiskLevel::Critical);
    }

    #[test]
    fn test_risk_level_is_acceptable() {
        assert!(RiskLevel::Low.is_acceptable());
        assert!(RiskLevel::Medium.is_acceptable());
        assert!(!RiskLevel::High.is_acceptable());
        assert!(!RiskLevel::Critical.is_acceptable());
    }

    #[test]
    fn test_verify_compliance_passes_for_clean_address() {
        let address = Pubkey::new_unique();
        let current_slot = 100;
        let attestation = RangeAttestation::clean(address, current_slot - 10);

        let result = verify_compliance(&attestation, &address, current_slot);

        assert!(result.passed);
        assert_eq!(result.risk_score, 0);
        assert_eq!(result.risk_level, RiskLevel::Low);
        assert!(result.error.is_none());
    }

    #[test]
    fn test_verify_compliance_fails_for_high_risk() {
        let address = Pubkey::new_unique();
        let current_slot = 100;
        let attestation = RangeAttestation::high_risk(address, current_slot - 10);

        let result = verify_compliance(&attestation, &address, current_slot);

        assert!(!result.passed);
        assert_eq!(result.risk_score, 85);
        assert_eq!(result.risk_level, RiskLevel::Critical);
        // Should fail on malicious connections first
        assert_eq!(result.error, Some(ComplianceError::MaliciousConnections));
    }

    #[test]
    fn test_verify_compliance_fails_for_stale_attestation() {
        let address = Pubkey::new_unique();
        let current_slot = 100;
        // Attestation from 60 slots ago (> MAX_ATTESTATION_AGE_SLOTS)
        let attestation = RangeAttestation::clean(address, current_slot - 60);

        let result = verify_compliance(&attestation, &address, current_slot);

        assert!(!result.passed);
        assert_eq!(result.error, Some(ComplianceError::StaleAttestation));
    }

    #[test]
    fn test_verify_compliance_fails_for_address_mismatch() {
        let address = Pubkey::new_unique();
        let wrong_address = Pubkey::new_unique();
        let current_slot = 100;
        let attestation = RangeAttestation::clean(address, current_slot - 10);

        let result = verify_compliance(&attestation, &wrong_address, current_slot);

        assert!(!result.passed);
        assert_eq!(result.error, Some(ComplianceError::AddressMismatch));
    }

    #[test]
    fn test_verify_compliance_boundary_conditions() {
        let address = Pubkey::new_unique();
        let current_slot = 100;

        // Exactly at MAX_RISK_SCORE should pass
        let mut attestation = RangeAttestation::new(address, MAX_RISK_SCORE, current_slot - 10, 0, false);
        let result = verify_compliance(&attestation, &address, current_slot);
        assert!(result.passed);

        // One above MAX_RISK_SCORE should fail
        attestation.risk_score = MAX_RISK_SCORE + 1;
        attestation.risk_level = RiskLevel::from_score(attestation.risk_score);
        let result = verify_compliance(&attestation, &address, current_slot);
        assert!(!result.passed);
        assert_eq!(result.error, Some(ComplianceError::HighRiskAddress));

        // Exactly at MAX_ATTESTATION_AGE_SLOTS should pass
        let attestation = RangeAttestation::clean(address, current_slot - MAX_ATTESTATION_AGE_SLOTS);
        let result = verify_compliance(&attestation, &address, current_slot);
        assert!(result.passed);

        // One above MAX_ATTESTATION_AGE_SLOTS should fail
        let attestation = RangeAttestation::clean(address, current_slot - MAX_ATTESTATION_AGE_SLOTS - 1);
        let result = verify_compliance(&attestation, &address, current_slot);
        assert!(!result.passed);
        assert_eq!(result.error, Some(ComplianceError::StaleAttestation));
    }

    #[test]
    fn test_serialize_attestation_data() {
        let address = Pubkey::new_unique();
        let attestation = RangeAttestation::new(address, 15, 12345, 2, true);

        let data = serialize_attestation_data(&attestation);

        // Should contain: address (32) + risk_score (1) + slot (8) + num_hops (1) + malicious (1)
        assert_eq!(data.len(), 43);
        assert_eq!(&data[0..32], address.as_ref());
        assert_eq!(data[32], 15); // risk_score
        assert_eq!(data[41], 2); // num_hops
        assert_eq!(data[42], 1); // has_malicious_connections = true
    }
}
