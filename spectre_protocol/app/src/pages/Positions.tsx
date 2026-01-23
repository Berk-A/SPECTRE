import { motion } from 'framer-motion'
import { BarChart3, Wallet, TrendingUp, TrendingDown } from 'lucide-react'
import { PositionList, TradeHistory } from '@/components/trading'
import { Card, Badge } from '@/components/ui'
import { usePnp } from '@/hooks/usePnp'
import { formatUsd, cn } from '@/lib/utils'

export function Positions() {
  const { positions, trades } = usePnp()

  const totalInvested = positions.reduce(
    (acc, p) => acc + (p.totalInvested || 0),
    0
  )
  const totalPnl = positions.reduce(
    (acc, p) => acc + (p.unrealizedPnl || 0),
    0
  )
  const totalYesShares = positions.reduce(
    (acc, p) => acc + p.yesShares,
    0
  )
  const totalNoShares = positions.reduce(
    (acc, p) => acc + p.noShares,
    0
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-neon-purple/10">
            <BarChart3 className="h-6 w-6 text-neon-purple" />
          </div>
          <h1 className="text-2xl font-bold">Positions</h1>
        </div>
        <p className="text-white/60">
          Manage your active positions and view trade history
        </p>
      </motion.div>

      {/* Portfolio summary */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-neon-cyan/10">
              <Wallet className="h-5 w-5 text-neon-cyan" />
            </div>
            <div>
              <p className="text-xs text-white/50">Total Invested</p>
              <p className="font-mono font-semibold">{formatUsd(totalInvested)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'p-2 rounded-lg',
                totalPnl >= 0 ? 'bg-status-success/10' : 'bg-status-error/10'
              )}
            >
              {totalPnl >= 0 ? (
                <TrendingUp className="h-5 w-5 text-status-success" />
              ) : (
                <TrendingDown className="h-5 w-5 text-status-error" />
              )}
            </div>
            <div>
              <p className="text-xs text-white/50">Total P&L</p>
              <p
                className={cn(
                  'font-mono font-semibold',
                  totalPnl >= 0 ? 'text-status-success' : 'text-status-error'
                )}
              >
                {totalPnl >= 0 ? '+' : ''}
                {formatUsd(totalPnl)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-status-success/10">
              <TrendingUp className="h-5 w-5 text-status-success" />
            </div>
            <div>
              <p className="text-xs text-white/50">YES Shares</p>
              <p className="font-mono font-semibold">
                {totalYesShares.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-status-error/10">
              <TrendingDown className="h-5 w-5 text-status-error" />
            </div>
            <div>
              <p className="text-xs text-white/50">NO Shares</p>
              <p className="font-mono font-semibold">
                {totalNoShares.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Main content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Positions */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <PositionList />
        </motion.div>

        {/* Trade History */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <TradeHistory />
        </motion.div>
      </div>
    </div>
  )
}

export default Positions
