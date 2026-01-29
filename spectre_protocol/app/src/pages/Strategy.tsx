import { useState } from 'react'
import { motion } from 'framer-motion'
import { Cpu, Shield, Zap, Activity, TrendingUp, TrendingDown, Minus, PlayCircle } from 'lucide-react'
import { DelegationStatus, StrategyConfig } from '@/components/strategy'
import { Card, Button, Badge } from '@/components/ui'
import { useTee, type MarketInput, type TradeSignal } from '@/hooks/useTee'
import { usePnp } from '@/hooks/usePnp'
import { TEE_DEMO_MODE } from '@/lib/config/constants'

// Signal badge colors
const signalColors: Record<TradeSignal, string> = {
  StrongBuy: 'bg-status-success text-white',
  Buy: 'bg-status-success/60 text-white',
  Hold: 'bg-status-warning/60 text-white',
  Sell: 'bg-status-error/60 text-white',
  StrongSell: 'bg-status-error text-white',
}

const signalIcons: Record<TradeSignal, React.ReactNode> = {
  StrongBuy: <TrendingUp className="h-4 w-4" />,
  Buy: <TrendingUp className="h-4 w-4" />,
  Hold: <Minus className="h-4 w-4" />,
  Sell: <TrendingDown className="h-4 w-4" />,
  StrongSell: <TrendingDown className="h-4 w-4" />,
}

export function Strategy() {
  const {
    onChainStrategyConfig,
    isStrategyInitialized,
    lastSignal,
    isGeneratingSignal,
    generateSignal,
    initializeStrategy,
    isInitializingStrategy,
  } = useTee()

  const { selectedMarket } = usePnp()
  const [testSignal, setTestSignal] = useState<TradeSignal | null>(null)

  // Generate a test signal using current market data
  const handleGenerateSignal = async () => {
    // Create market input from selected market or mock data
    const input: MarketInput = selectedMarket ? {
      price: Math.floor(selectedMarket.yesPrice * 1000),  // Scale to 0-1000
      trend: Math.floor((Math.random() - 0.5) * 200),     // Random trend -100 to 100
      volatility: Math.floor(Math.random() * 200),        // Random volatility 0-200
      volume: Math.floor(selectedMarket.volume24h || 1000),
    } : {
      price: 450,     // 45%
      trend: 30,      // Slight uptrend
      volatility: 100, // Moderate volatility
      volume: 5000,
    }

    const signal = await generateSignal(input)
    if (signal) {
      setTestSignal(signal)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-neon-purple/10">
            <Cpu className="h-6 w-6 text-neon-purple" />
          </div>
          <h1 className="text-2xl font-bold">TEE Layer</h1>
          {!TEE_DEMO_MODE && (
            <Badge variant="secondary" className="text-xs">On-Chain</Badge>
          )}
        </div>
        <p className="text-white/60">
          Configure your trading strategy and delegate to MagicBlock's TEE
        </p>
      </motion.div>

      {/* Main content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Delegation Status */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <DelegationStatus />
        </motion.div>

        {/* Strategy Config */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <StrategyConfig />
        </motion.div>
      </div>

      {/* Signal Generation Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-neon-cyan" />
              Signal Generation
            </h3>
            {lastSignal && (
              <div className={`px-3 py-1 rounded-full flex items-center gap-2 ${signalColors[lastSignal]}`}>
                {signalIcons[lastSignal]}
                <span className="font-medium">{lastSignal}</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Strategy Status */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-background-secondary">
                <p className="text-xs text-white/50 mb-1">Strategy</p>
                <p className={`font-medium ${isStrategyInitialized ? 'text-status-success' : 'text-status-warning'}`}>
                  {isStrategyInitialized ? 'Initialized' : 'Not Initialized'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-background-secondary">
                <p className="text-xs text-white/50 mb-1">Total Signals</p>
                <p className="font-mono">{onChainStrategyConfig?.totalSignals || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-background-secondary">
                <p className="text-xs text-white/50 mb-1">Last Signal</p>
                <p className="font-medium">{lastSignal || 'None'}</p>
              </div>
              <div className="p-3 rounded-lg bg-background-secondary">
                <p className="text-xs text-white/50 mb-1">Last Updated</p>
                <p className="font-mono text-sm">
                  {onChainStrategyConfig?.lastSignalAt
                    ? new Date(onChainStrategyConfig.lastSignalAt * 1000).toLocaleTimeString()
                    : 'Never'}
                </p>
              </div>
            </div>

            {/* Strategy Parameters Display */}
            {onChainStrategyConfig && (
              <div className="p-3 rounded-lg bg-neon-purple/5 border border-neon-purple/20">
                <p className="text-xs text-white/50 mb-2">On-Chain Parameters</p>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-white/40">Buy &lt;</span>{' '}
                    <span className="font-mono">{(onChainStrategyConfig.priceThresholdLow / 10).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-white/40">Sell &gt;</span>{' '}
                    <span className="font-mono">{(onChainStrategyConfig.priceThresholdHigh / 10).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-white/40">Trend</span>{' '}
                    <span className="font-mono">{(onChainStrategyConfig.trendThreshold / 10).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-white/40">Vol Cap</span>{' '}
                    <span className="font-mono">{(onChainStrategyConfig.volatilityCap / 10).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!isStrategyInitialized ? (
                <Button
                  onClick={() => initializeStrategy()}
                  disabled={isInitializingStrategy}
                  loading={isInitializingStrategy}
                  className="flex-1"
                >
                  Initialize Strategy
                </Button>
              ) : (
                <Button
                  onClick={handleGenerateSignal}
                  disabled={isGeneratingSignal}
                  loading={isGeneratingSignal}
                  variant="primary"
                  className="flex-1"
                >
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Generate Signal
                </Button>
              )}
            </div>

            {/* Test Signal Result */}
            {testSignal && (
              <div className={`p-4 rounded-lg ${signalColors[testSignal]} flex items-center justify-center gap-3`}>
                {signalIcons[testSignal]}
                <span className="text-lg font-bold">{testSignal}</span>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Info section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6"
      >
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-neon-purple" />
          About TEE Delegation
        </h3>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="text-sm font-medium text-neon-cyan">
              Trusted Execution Environment
            </div>
            <p className="text-sm text-white/50">
              MagicBlock's TEE runs your code in encrypted memory. Even the
              server operators cannot see your trading logic or positions.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-neon-purple">
              Ephemeral Rollup
            </div>
            <p className="text-sm text-white/50">
              State changes accumulate in the TEE and periodically commit to
              Solana L1. This gives fast execution with L1 security guarantees.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-status-success">
              Full Control
            </div>
            <p className="text-sm text-white/50">
              You can undelegate at any time to return full control of your
              vault to your wallet. Final state commits to L1 automatically.
            </p>
          </div>
        </div>
      </motion.div>

      {/* TEE Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-status-warning" />
            TEE Network Status
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Network</p>
              <p className="font-mono text-sm">MagicBlock Devnet</p>
            </div>

            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Endpoint</p>
              <p className="font-mono text-sm truncate">devnet.magicblock.app</p>
            </div>

            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Commit Frequency</p>
              <p className="font-mono text-sm">~3 seconds</p>
            </div>

            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Status</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
                <span className="font-mono text-sm text-status-success">
                  Operational
                </span>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

export default Strategy
