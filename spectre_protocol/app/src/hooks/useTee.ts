import { useState, useCallback, useEffect, useRef } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { useSpectreClient } from './useSpectreClient'
import { TEE_DEMO_MODE } from '@/lib/config/constants'
import {
  StrategyExecutor,
  type StrategyParams,
  type MarketInput,
  type TradeSignal,
  type OnChainStrategyConfig,
  DEFAULT_STRATEGY_PARAMS,
} from '@/lib/strategy/StrategyExecutor'

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

export type { StrategyParams, MarketInput, TradeSignal, OnChainStrategyConfig }
export { DEFAULT_STRATEGY_PARAMS }

export function useTee() {
  const { connected, publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const { teeClient } = useSpectreClient()

  const [delegationStatus, setDelegationStatus] = useState<DelegationStatus>({
    isDelegated: false,
  })
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>(
    DEFAULT_STRATEGY_CONFIG
  )
  const [onChainStrategyConfig, setOnChainStrategyConfig] = useState<OnChainStrategyConfig | null>(null)
  const [isStrategyInitialized, setIsStrategyInitialized] = useState(false)
  const [lastSignal, setLastSignal] = useState<TradeSignal | null>(null)
  const [isDelegating, setIsDelegating] = useState(false)
  const [isUndelegating, setIsUndelegating] = useState(false)
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const [isInitializingStrategy, setIsInitializingStrategy] = useState(false)
  const [isGeneratingSignal, setIsGeneratingSignal] = useState(false)

  // Strategy executor instance
  const strategyExecutorRef = useRef<StrategyExecutor | null>(null)

  // Initialize strategy executor when wallet connects
  useEffect(() => {
    if (connected && publicKey && signTransaction && connection) {
      strategyExecutorRef.current = new StrategyExecutor({
        connection,
        publicKey,
        signTransaction,
      })
      console.log('[useTee] StrategyExecutor initialized')

      // Check if strategy is already initialized
      strategyExecutorRef.current.getStrategyConfig().then((config) => {
        if (config) {
          setOnChainStrategyConfig(config)
          setIsStrategyInitialized(true)
          setLastSignal(config.lastSignal)
        }
      })
    } else {
      strategyExecutorRef.current = null
      setIsStrategyInitialized(false)
      setOnChainStrategyConfig(null)
    }
  }, [connected, publicKey, signTransaction, connection])

  // Check current delegation status
  const checkDelegationStatus = useCallback(async (): Promise<DelegationStatus> => {
    if (!connected || !publicKey) {
      return { isDelegated: false }
    }

    setIsCheckingStatus(true)

    try {
      if (TEE_DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return delegationStatus
      }

      if (!teeClient) {
        throw new Error('TEE client not initialized')
      }

      const result = await teeClient.checkDelegationStatus(publicKey)
      const status: DelegationStatus = {
        isDelegated: result.isDelegated,
        vaultPda: result.vaultPda ?? undefined, // Convert null to undefined
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
      if (TEE_DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 2000))

        setDelegationStatus({
          isDelegated: true,
          delegatedAt: new Date(),
          vaultPda: `vault_${publicKey.toBase58().slice(0, 8)}`,
        })

        toast.success('Successfully delegated to TEE (Demo)')
        return true
      }

      if (!teeClient) {
        toast.error('TEE client not initialized')
        return false
      }

      const result = await teeClient.delegateVault(publicKey)

      if (result.success) {
        setDelegationStatus({
          isDelegated: true,
          delegatedAt: new Date(),
          vaultPda: result.vaultPda,
        })

        toast.success('Successfully delegated to MagicBlock TEE', {
          description: `TX: ${result.signature?.slice(0, 8)}...`,
          action: {
            label: 'View',
            onClick: () => window.open(`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`, '_blank')
          }
        })
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
      if (TEE_DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 2000))

        setDelegationStatus({
          isDelegated: false,
        })

        toast.success('Successfully undelegated from TEE (Demo)')
        return true
      }

      if (!teeClient) {
        toast.error('TEE client not initialized')
        return false
      }

      const result = await teeClient.undelegateVault(publicKey)

      if (result.success) {
        setDelegationStatus({
          isDelegated: false,
        })

        toast.success('Successfully undelegated from MagicBlock TEE', {
          description: `State committed to L1`,
          action: result.signature ? {
            label: 'View',
            onClick: () => window.open(`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`, '_blank')
          } : undefined
        })
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

  // Update strategy configuration (local)
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

  // Initialize on-chain strategy
  const initializeStrategy = useCallback(
    async (params?: StrategyParams): Promise<boolean> => {
      if (!connected || !publicKey) {
        toast.error('Wallet not connected')
        return false
      }

      const executor = strategyExecutorRef.current
      if (!executor) {
        toast.error('Strategy executor not initialized')
        return false
      }

      setIsInitializingStrategy(true)

      try {
        if (TEE_DEMO_MODE) {
          await new Promise((resolve) => setTimeout(resolve, 1500))
          setIsStrategyInitialized(true)
          setOnChainStrategyConfig({
            vault: `vault_${publicKey.toBase58().slice(0, 8)}`,
            authority: publicKey.toBase58(),
            priceThresholdLow: params?.priceThresholdLow || DEFAULT_STRATEGY_PARAMS.priceThresholdLow,
            priceThresholdHigh: params?.priceThresholdHigh || DEFAULT_STRATEGY_PARAMS.priceThresholdHigh,
            trendThreshold: params?.trendThreshold || DEFAULT_STRATEGY_PARAMS.trendThreshold,
            volatilityCap: params?.volatilityCap || DEFAULT_STRATEGY_PARAMS.volatilityCap,
            isActive: true,
            updatedAt: Date.now(),
            lastSignal: 'Hold',
            lastSignalAt: 0,
            totalSignals: 0,
          })
          toast.success('Strategy initialized (Demo)')
          return true
        }

        const result = await executor.initializeStrategy(params)

        if (result.success) {
          setIsStrategyInitialized(true)
          const config = await executor.getStrategyConfig()
          setOnChainStrategyConfig(config)

          if (result.signature !== 'already_initialized') {
            toast.success('Strategy initialized on-chain', {
              description: `TX: ${result.signature?.slice(0, 8)}...`,
              action: {
                label: 'View',
                onClick: () => window.open(`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`, '_blank')
              }
            })
          } else {
            toast.info('Strategy already initialized')
          }
          return true
        } else {
          toast.error(result.error || 'Failed to initialize strategy')
          return false
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to initialize strategy')
        return false
      } finally {
        setIsInitializingStrategy(false)
      }
    },
    [connected, publicKey]
  )

  // Update on-chain strategy parameters
  const setOnChainStrategyParams = useCallback(
    async (params: StrategyParams): Promise<boolean> => {
      if (!connected || !publicKey) {
        toast.error('Wallet not connected')
        return false
      }

      const executor = strategyExecutorRef.current
      if (!executor) {
        toast.error('Strategy executor not initialized')
        return false
      }

      try {
        if (TEE_DEMO_MODE) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          setOnChainStrategyConfig((prev) => prev ? {
            ...prev,
            ...params,
            updatedAt: Date.now(),
          } : null)
          toast.success('Strategy parameters updated (Demo)')
          return true
        }

        const result = await executor.setStrategyParams(params)

        if (result.success) {
          const config = await executor.getStrategyConfig()
          setOnChainStrategyConfig(config)
          toast.success('Strategy parameters updated on-chain', {
            description: `TX: ${result.signature?.slice(0, 8)}...`,
          })
          return true
        } else {
          toast.error(result.error || 'Failed to update strategy')
          return false
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to update strategy')
        return false
      }
    },
    [connected, publicKey]
  )

  // Generate trade signal
  const generateSignal = useCallback(
    async (input: MarketInput): Promise<TradeSignal | null> => {
      if (!connected || !publicKey) {
        toast.error('Wallet not connected')
        return null
      }

      const executor = strategyExecutorRef.current
      if (!executor) {
        toast.error('Strategy executor not initialized')
        return null
      }

      setIsGeneratingSignal(true)

      try {
        if (TEE_DEMO_MODE) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          // Use local signal generation for demo
          const params = onChainStrategyConfig ? {
            priceThresholdLow: onChainStrategyConfig.priceThresholdLow,
            priceThresholdHigh: onChainStrategyConfig.priceThresholdHigh,
            trendThreshold: onChainStrategyConfig.trendThreshold,
            volatilityCap: onChainStrategyConfig.volatilityCap,
          } : DEFAULT_STRATEGY_PARAMS

          const signal = executor.generateSignalLocal(input, params)
          setLastSignal(signal)
          toast.success(`Signal generated: ${signal}`, { duration: 3000 })
          return signal
        }

        const result = await executor.generateSignal(input)

        if (result.success && result.signal) {
          setLastSignal(result.signal)

          // Refresh config to get updated stats
          const config = await executor.getStrategyConfig()
          setOnChainStrategyConfig(config)

          toast.success(`Signal: ${result.signal}`, {
            description: `TX: ${result.signature?.slice(0, 8)}...`,
          })
          return result.signal
        } else {
          toast.error(result.error || 'Failed to generate signal')
          return null
        }
      } catch (error: any) {
        toast.error(error.message || 'Failed to generate signal')
        return null
      } finally {
        setIsGeneratingSignal(false)
      }
    },
    [connected, publicKey, onChainStrategyConfig]
  )

  // Generate signal locally without on-chain transaction
  const generateSignalLocal = useCallback(
    (input: MarketInput): TradeSignal => {
      const executor = strategyExecutorRef.current
      if (!executor) {
        return 'Hold'
      }

      const params = onChainStrategyConfig ? {
        priceThresholdLow: onChainStrategyConfig.priceThresholdLow,
        priceThresholdHigh: onChainStrategyConfig.priceThresholdHigh,
        trendThreshold: onChainStrategyConfig.trendThreshold,
        volatilityCap: onChainStrategyConfig.volatilityCap,
      } : DEFAULT_STRATEGY_PARAMS

      return executor.generateSignalLocal(input, params)
    },
    [onChainStrategyConfig]
  )

  // Refresh on-chain strategy config
  const refreshStrategyConfig = useCallback(async () => {
    const executor = strategyExecutorRef.current
    if (!executor) return

    const config = await executor.getStrategyConfig()
    if (config) {
      setOnChainStrategyConfig(config)
      setIsStrategyInitialized(true)
      setLastSignal(config.lastSignal)
    }
  }, [])

  return {
    // State
    delegationStatus,
    strategyConfig,
    onChainStrategyConfig,
    isStrategyInitialized,
    lastSignal,
    isDelegating,
    isUndelegating,
    isCheckingStatus,
    isInitializingStrategy,
    isGeneratingSignal,
    isLoading: isDelegating || isUndelegating || isCheckingStatus || isInitializingStrategy || isGeneratingSignal,

    // Actions
    checkDelegationStatus,
    delegate,
    undelegate,
    updateStrategyConfig,
    initializeStrategy,
    setOnChainStrategyParams,
    generateSignal,
    generateSignalLocal,
    refreshStrategyConfig,
  }
}

export default useTee
