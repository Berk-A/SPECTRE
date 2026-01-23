import { useState, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { useSpectreClient } from './useSpectreClient'
import { DEMO_MODE } from '@/lib/config/constants'

export interface DelegationStatus {
  isDelegated: boolean
  delegatedAt?: Date
  vaultPda?: string
}

export interface StrategyConfig {
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
  maxPositionSize: number
  stopLoss: number
  takeProfit: number
  allowedMarkets: string[]
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  riskLevel: 'moderate',
  maxPositionSize: 100,
  stopLoss: 10,
  takeProfit: 25,
  allowedMarkets: [],
}

export function useTee() {
  const { connected, publicKey } = useWallet()
  const { teeClient } = useSpectreClient()

  const [delegationStatus, setDelegationStatus] = useState<DelegationStatus>({
    isDelegated: false,
  })
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>(
    DEFAULT_STRATEGY_CONFIG
  )
  const [isDelegating, setIsDelegating] = useState(false)
  const [isUndelegating, setIsUndelegating] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)

  // Check current delegation status
  const checkDelegationStatus = useCallback(async (): Promise<DelegationStatus> => {
    if (!connected || !publicKey) {
      return { isDelegated: false }
    }

    setIsCheckingStatus(true)

    try {
      if (DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return delegationStatus
      }

      const result = await teeClient.checkDelegationStatus(publicKey)
      const status: DelegationStatus = {
        isDelegated: result.isDelegated,
        vaultPda: result.vaultPda?.toBase58(),
      }

      setDelegationStatus(status)
      return status
    } catch (error: any) {
      console.error('Failed to check delegation status:', error)
      return { isDelegated: false }
    } finally {
      setIsCheckingStatus(false)
    }
  }, [connected, publicKey, teeClient, delegationStatus])

  // Delegate vault to TEE
  const delegate = useCallback(async (): Promise<boolean> => {
    if (!connected || !publicKey) {
      toast.error('Wallet not connected')
      return false
    }

    if (delegationStatus.isDelegated) {
      toast.error('Already delegated')
      return false
    }

    setIsDelegating(true)

    try {
      if (DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 2000))

        setDelegationStatus({
          isDelegated: true,
          delegatedAt: new Date(),
          vaultPda: `vault_${publicKey.toBase58().slice(0, 8)}`,
        })

        toast.success('Successfully delegated to TEE')
        return true
      }

      const result = await teeClient.delegateVault(publicKey)

      if (result.success) {
        setDelegationStatus({
          isDelegated: true,
          delegatedAt: result.delegatedAt,
          vaultPda: result.vaultPda?.toBase58(),
        })

        toast.success('Successfully delegated to TEE')
        return true
      } else {
        toast.error(result.error || 'Delegation failed')
        return false
      }
    } catch (error: any) {
      toast.error(error.message || 'Delegation failed')
      return false
    } finally {
      setIsDelegating(false)
    }
  }, [connected, publicKey, delegationStatus.isDelegated, teeClient])

  // Undelegate vault from TEE
  const undelegate = useCallback(async (): Promise<boolean> => {
    if (!connected || !publicKey) {
      toast.error('Wallet not connected')
      return false
    }

    if (!delegationStatus.isDelegated) {
      toast.error('Not delegated')
      return false
    }

    setIsUndelegating(true)

    try {
      if (DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 2000))

        setDelegationStatus({
          isDelegated: false,
        })

        toast.success('Successfully undelegated from TEE')
        return true
      }

      const result = await teeClient.undelegateVault(publicKey, true)

      if (result.success) {
        setDelegationStatus({
          isDelegated: false,
        })

        toast.success('Successfully undelegated from TEE')
        return true
      } else {
        toast.error(result.error || 'Undelegation failed')
        return false
      }
    } catch (error: any) {
      toast.error(error.message || 'Undelegation failed')
      return false
    } finally {
      setIsUndelegating(false)
    }
  }, [connected, publicKey, delegationStatus.isDelegated, teeClient])

  // Update strategy configuration
  const updateStrategyConfig = useCallback(
    (config: Partial<StrategyConfig>) => {
      setStrategyConfig((prev) => ({
        ...prev,
        ...config,
      }))
      toast.success('Strategy configuration updated')
    },
    []
  )

  return {
    // State
    delegationStatus,
    strategyConfig,
    isDelegating,
    isUndelegating,
    isCheckingStatus,
    isLoading: isDelegating || isUndelegating || isCheckingStatus,

    // Actions
    checkDelegationStatus,
    delegate,
    undelegate,
    updateStrategyConfig,
  }
}

export default useTee
