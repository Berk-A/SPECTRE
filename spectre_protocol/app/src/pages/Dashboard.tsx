import { motion } from 'framer-motion'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useState, useEffect } from 'react'
import { ArrowRight, Wallet, Shield, Cpu, TrendingUp, CheckCircle2, Circle } from 'lucide-react'
import {
  LayerVisualization,
  StatusIndicators,
  QuickActions,
  StatsCards,
} from '@/components/dashboard'
import { Card, Badge } from '@/components/ui'
import { useTee } from '@/hooks/useTee'
import { usePrivacy } from '@/hooks/usePrivacy'
import { usePnp } from '@/hooks/usePnp'
import { formatSol } from '@/lib/utils'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import type { StatusType } from '@/components/dashboard/StatusIndicators'

// Flow step component for the visualization
interface FlowStepProps {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
  status: 'pending' | 'active' | 'complete'
  color: string
  badge?: string
}

function FlowStep({ icon, label, value, unit, status, color, badge }: FlowStepProps) {
  const statusColors = {
    pending: 'text-white/30 border-white/20',
    active: `text-${color} border-${color}/50 bg-${color}/10`,
    complete: `text-${color} border-${color} bg-${color}/20`,
  }

  return (
    <div className={`flex-1 min-w-[100px] p-3 rounded-lg border ${statusColors[status]} transition-all`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={status === 'pending' ? 'opacity-30' : ''}>
          {icon}
        </div>
        <span className="text-sm font-medium">{label}</span>
        {status === 'complete' && <CheckCircle2 className="h-3 w-3 text-status-success ml-auto" />}
        {status === 'active' && <Circle className="h-3 w-3 text-status-warning animate-pulse ml-auto" />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-mono font-bold">{value}</span>
        <span className="text-xs text-white/50">{unit}</span>
      </div>
      {badge && (
        <Badge variant="outline" className="mt-1 text-xs">
          {badge}
        </Badge>
      )}
    </div>
  )
}

export function Dashboard() {
  const { connected, publicKey } = useWallet()
  const { connection } = useConnection()
  const { delegationStatus } = useTee()
  const {
    shieldedBalanceSol,
    unspentNotes,
    vaultSolBalance,
    availableForTrading,
    isInitialized,
    fetchVaultBalance
  } = usePrivacy()
  const { positions } = usePnp()
  const [walletBalance, setWalletBalance] = useState<number>(0)

  // Fetch wallet balance from Solana
  useEffect(() => {
    async function fetchBalance() {
      if (connected && publicKey && connection) {
        try {
          const balance = await connection.getBalance(publicKey)
          setWalletBalance(balance)
        } catch (error) {
          console.error('Failed to fetch wallet balance:', error)
        }
      } else {
        setWalletBalance(0)
      }
    }
    fetchBalance()
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000)
    return () => clearInterval(interval)
  }, [connected, publicKey, connection])

  // Fetch vault balance when initialized
  useEffect(() => {
    if (isInitialized && fetchVaultBalance) {
      fetchVaultBalance()
    }
  }, [isInitialized, fetchVaultBalance])

  // Determine status
  const privacyStatus: StatusType = unspentNotes.length > 0 ? 'active' : 'inactive'
  const teeStatus: StatusType = delegationStatus.isDelegated ? 'active' : 'inactive'
  const tradingStatus: StatusType = positions.length > 0 ? 'active' : 'inactive'

  // Calculate totals
  const positionsValue = positions.reduce(
    (acc, p) => acc + (p.totalInvested || 0),
    0
  )
  const totalPnl = positions.reduce(
    (acc, p) => acc + (p.unrealizedPnl || 0),
    0
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-3xl font-bold mb-2">
          <span className="gradient-text">SPECTRE Protocol</span>
        </h1>
        <p className="text-white/60">
          Confidential Autonomous Market Maker on Solana
        </p>
      </motion.div>

      {/* Stats */}
      {connected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <StatsCards
            walletBalance={walletBalance}
            shieldedBalance={shieldedBalanceSol}
            vaultBalance={vaultSolBalance}
            availableForTrading={availableForTrading}
            positionsValue={positionsValue}
            totalPnl={totalPnl}
            positionsCount={positions.length}
          />
        </motion.div>
      )}

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Layer Visualization - Main feature */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-2"
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="text-neon-cyan">//</span>
            Privacy Sandwich Architecture
          </h2>
          <LayerVisualization />
        </motion.div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-6"
        >
          {/* Status Indicators */}
          <StatusIndicators
            privacyStatus={privacyStatus}
            teeStatus={teeStatus}
            tradingStatus={tradingStatus}
          />

          {/* Quick Actions */}
          <QuickActions />
        </motion.div>
      </div>

      {/* Flow Status Visualization */}
      {connected && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Your SPECTRE Flow</h3>
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
              {/* Wallet Step */}
              <FlowStep
                icon={<Wallet className="h-5 w-5" />}
                label="Wallet"
                value={formatSol(walletBalance / LAMPORTS_PER_SOL)}
                unit="SOL"
                status={walletBalance > 0 ? 'complete' : 'pending'}
                color="neon-cyan"
              />

              <ArrowRight className="h-5 w-5 text-white/30 flex-shrink-0" />

              {/* Shielded Step */}
              <FlowStep
                icon={<Shield className="h-5 w-5" />}
                label="Shielded"
                value={formatSol(shieldedBalanceSol)}
                unit="SOL"
                status={shieldedBalanceSol > 0 ? 'complete' : 'pending'}
                color="neon-purple"
              />

              <ArrowRight className="h-5 w-5 text-white/30 flex-shrink-0" />

              {/* Vault Step */}
              <FlowStep
                icon={<Cpu className="h-5 w-5" />}
                label="Vault"
                value={formatSol(vaultSolBalance / LAMPORTS_PER_SOL)}
                unit="SOL"
                status={vaultSolBalance > 0 ? 'complete' : delegationStatus.isDelegated ? 'active' : 'pending'}
                color="status-warning"
                badge={delegationStatus.isDelegated ? 'TEE' : undefined}
              />

              <ArrowRight className="h-5 w-5 text-white/30 flex-shrink-0" />

              {/* Positions Step */}
              <FlowStep
                icon={<TrendingUp className="h-5 w-5" />}
                label="Positions"
                value={positions.length.toString()}
                unit="active"
                status={positions.length > 0 ? 'complete' : 'pending'}
                color="status-success"
                badge={totalPnl !== 0 ? `${totalPnl >= 0 ? '+' : ''}${formatSol(totalPnl)}` : undefined}
              />
            </div>
          </Card>
        </motion.div>
      )}

      {/* Feature highlights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-6"
      >
        <h3 className="text-lg font-semibold mb-4">How It Works</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="w-10 h-10 rounded-lg bg-neon-cyan/10 flex items-center justify-center mb-3">
              <span className="text-xl text-neon-cyan font-bold">1</span>
            </div>
            <h4 className="font-medium mb-1">Shield Your Funds</h4>
            <p className="text-sm text-white/50">
              Deposit SOL into PrivacyCash ZK pool to break the on-chain link
              between your wallet and trading activity.
            </p>
          </div>

          <div>
            <div className="w-10 h-10 rounded-lg bg-neon-purple/10 flex items-center justify-center mb-3">
              <span className="text-xl text-neon-purple font-bold">2</span>
            </div>
            <h4 className="font-medium mb-1">Delegate to TEE</h4>
            <p className="text-sm text-white/50">
              Your strategy executes in MagicBlock's encrypted TEE environment.
              Nobody can see your trading logic.
            </p>
          </div>

          <div>
            <div className="w-10 h-10 rounded-lg bg-status-success/10 flex items-center justify-center mb-3">
              <span className="text-xl text-status-success font-bold">3</span>
            </div>
            <h4 className="font-medium mb-1">Trade Confidentially</h4>
            <p className="text-sm text-white/50">
              Execute trades on PNP prediction markets with complete privacy.
              Withdraw with Range Protocol compliance.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Dashboard
