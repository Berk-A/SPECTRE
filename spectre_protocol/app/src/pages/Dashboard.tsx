import { motion } from 'framer-motion'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useState, useEffect } from 'react'
import {
  LayerVisualization,
  StatusIndicators,
  QuickActions,
  StatsCards,
} from '@/components/dashboard'
import { useTee } from '@/hooks/useTee'
import { usePrivacy } from '@/hooks/usePrivacy'
import { usePnp } from '@/hooks/usePnp'
import type { StatusType } from '@/components/dashboard/StatusIndicators'

export function Dashboard() {
  const { connected, publicKey } = useWallet()
  const { connection } = useConnection()
  const { delegationStatus } = useTee()
  const { shieldedBalanceSol, unspentNotes } = usePrivacy()
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
            positionsValue={positionsValue}
            totalPnl={totalPnl}
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
