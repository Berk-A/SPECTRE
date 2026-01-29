import { motion } from 'framer-motion'
import { Wallet, TrendingUp, BarChart3, Vault } from 'lucide-react'
import { Card } from '@/components/ui'
import { formatSol, formatUsd, cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  subValue?: string
  icon: React.ReactNode
  color: string
  change?: number
  delay?: number
}

function StatCard({
  title,
  value,
  subValue,
  icon,
  color,
  change,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card className="relative overflow-hidden">
        {/* Background gradient */}
        <div
          className={cn(
            'absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10',
            color.replace('text-', 'bg-')
          )}
        />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-white/60">{title}</span>
            <div className={cn('p-2 rounded-lg', color.replace('text-', 'bg-') + '/10')}>
              {icon}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-2xl font-bold">{value}</p>
            {subValue && (
              <p className="text-sm text-white/50">{subValue}</p>
            )}
            {change !== undefined && (
              <p
                className={cn(
                  'text-sm font-medium',
                  change >= 0 ? 'text-status-success' : 'text-status-error'
                )}
              >
                {change >= 0 ? '+' : ''}
                {change.toFixed(2)}%
              </p>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

interface StatsCardsProps {
  walletBalance?: number
  shieldedBalance?: number
  vaultBalance?: number
  availableForTrading?: number
  positionsValue?: number
  totalPnl?: number
  positionsCount?: number
}

export function StatsCards({
  walletBalance = 0,
  shieldedBalance: _shieldedBalance = 0,
  vaultBalance = 0,
  availableForTrading = 0,
  positionsValue = 0,
  totalPnl = 0,
  positionsCount = 0,
}: StatsCardsProps) {
  void _shieldedBalance // Reserved for future use
  // Calculate P&L percentage (avoid division by zero)
  const pnlPercent = positionsValue > 0 ? (totalPnl / positionsValue) * 100 : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Wallet Balance"
        value={`${formatSol(walletBalance)} SOL`}
        icon={<Wallet className="h-5 w-5 text-neon-cyan" />}
        color="text-neon-cyan"
        delay={0}
      />

      <StatCard
        title="Vault Balance"
        value={`${formatSol(vaultBalance)} SOL`}
        subValue={`${formatSol(availableForTrading)} available`}
        icon={<Vault className="h-5 w-5 text-neon-purple" />}
        color="text-neon-purple"
        delay={0.1}
      />

      <StatCard
        title="Positions Value"
        value={formatUsd(positionsValue)}
        subValue={`${positionsCount} active position${positionsCount !== 1 ? 's' : ''}`}
        icon={<TrendingUp className="h-5 w-5 text-status-success" />}
        color="text-status-success"
        delay={0.2}
      />

      <StatCard
        title="Total P&L"
        value={formatUsd(totalPnl)}
        change={pnlPercent}
        icon={<BarChart3 className="h-5 w-5 text-status-warning" />}
        color="text-status-warning"
        delay={0.3}
      />
    </div>
  )
}

export default StatsCards
