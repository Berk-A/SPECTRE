import { useState, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { useSpectreClient } from './useSpectreClient'
import { DEMO_MODE, MAX_RISK_SCORE } from '@/lib/config/constants'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ComplianceStatus {
  checked: boolean
  passed: boolean
  riskScore: number
  riskLevel: RiskLevel
  isSanctioned: boolean
  hasMaliciousConnections: boolean
  lastChecked?: Date
  error?: string
}

export function useCompliance() {
  const { publicKey, connected } = useWallet()
  const { rangeClient } = useSpectreClient()

  const [status, setStatus] = useState<ComplianceStatus>({
    checked: false,
    passed: false,
    riskScore: 0,
    riskLevel: 'low',
    isSanctioned: false,
    hasMaliciousConnections: false,
  })
  const [isChecking, setIsChecking] = useState(false)

  // Check compliance status for current wallet
  const checkCompliance = useCallback(async (): Promise<ComplianceStatus> => {
    if (!connected || !publicKey) {
      return {
        ...status,
        checked: false,
        error: 'Wallet not connected',
      }
    }

    setIsChecking(true)

    try {
      if (DEMO_MODE) {
        // Simulate compliance check
        await new Promise((resolve) => setTimeout(resolve, 1500))

        // Demo: generate a low risk score
        const demoStatus: ComplianceStatus = {
          checked: true,
          passed: true,
          riskScore: Math.floor(Math.random() * 15), // 0-14
          riskLevel: 'low',
          isSanctioned: false,
          hasMaliciousConnections: false,
          lastChecked: new Date(),
        }

        setStatus(demoStatus)
        toast.success('Compliance check passed')
        return demoStatus
      }

      // Production: use Range Protocol API
      if (!rangeClient) {
        throw new Error('Range client not initialized')
      }

      const result = await rangeClient.getAddressRisk(publicKey.toBase58())

      // Calculate if compliance passed based on risk assessment
      const passed = result.riskScore <= MAX_RISK_SCORE && !result.isSanctioned && !result.hasMaliciousConnections

      const newStatus: ComplianceStatus = {
        checked: true,
        passed,
        riskScore: result.riskScore,
        riskLevel: classifyRiskLevel(result.riskScore),
        isSanctioned: result.isSanctioned,
        hasMaliciousConnections: result.hasMaliciousConnections,
        lastChecked: new Date(),
      }

      setStatus(newStatus)

      if (newStatus.passed) {
        toast.success('Compliance check passed')
      } else {
        toast.error('Compliance check failed')
      }

      return newStatus
    } catch (error: any) {
      const errorMsg = error.message || 'Compliance check failed'
      const errorStatus: ComplianceStatus = {
        ...status,
        checked: true,
        passed: false,
        error: errorMsg,
      }
      setStatus(errorStatus)
      toast.error(errorMsg)
      return errorStatus
    } finally {
      setIsChecking(false)
    }
  }, [connected, publicKey, rangeClient, status])

  // Check compliance for a specific address
  const checkAddress = useCallback(
    async (address: string): Promise<ComplianceStatus> => {
      setIsChecking(true)

      try {
        if (DEMO_MODE) {
          await new Promise((resolve) => setTimeout(resolve, 1000))

          return {
            checked: true,
            passed: true,
            riskScore: Math.floor(Math.random() * 20),
            riskLevel: 'low',
            isSanctioned: false,
            hasMaliciousConnections: false,
            lastChecked: new Date(),
          }
        }

        if (!rangeClient) {
          throw new Error('Range client not initialized')
        }

        const result = await rangeClient.getAddressRisk(address)

        // Calculate if compliance passed based on risk assessment
        const passed = result.riskScore <= MAX_RISK_SCORE && !result.isSanctioned && !result.hasMaliciousConnections

        return {
          checked: true,
          passed,
          riskScore: result.riskScore,
          riskLevel: classifyRiskLevel(result.riskScore),
          isSanctioned: result.isSanctioned,
          hasMaliciousConnections: result.hasMaliciousConnections,
          lastChecked: new Date(),
        }
      } catch (error: any) {
        return {
          checked: true,
          passed: false,
          riskScore: 100,
          riskLevel: 'critical',
          isSanctioned: false,
          hasMaliciousConnections: false,
          error: error.message,
        }
      } finally {
        setIsChecking(false)
      }
    },
    [rangeClient]
  )

  // Get risk level color
  const getRiskColor = useCallback((level: RiskLevel): string => {
    switch (level) {
      case 'low':
        return 'text-status-success'
      case 'medium':
        return 'text-status-warning'
      case 'high':
        return 'text-status-error'
      case 'critical':
        return 'text-status-error'
      default:
        return 'text-white/60'
    }
  }, [])

  // Get risk progress color
  const getRiskProgressVariant = useCallback(
    (score: number): 'green' | 'warning' | 'danger' => {
      if (score <= MAX_RISK_SCORE) return 'green'
      if (score <= 50) return 'warning'
      return 'danger'
    },
    []
  )

  return {
    status,
    isChecking,
    checkCompliance,
    checkAddress,
    getRiskColor,
    getRiskProgressVariant,
  }
}

function classifyRiskLevel(score: number): RiskLevel {
  if (score <= 20) return 'low'
  if (score <= 50) return 'medium'
  if (score <= 80) return 'high'
  return 'critical'
}

export default useCompliance
