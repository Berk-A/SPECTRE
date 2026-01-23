import { motion } from 'framer-motion'
import { Wallet, Shield, TrendingUp, BarChart3 } from 'lucide-react'
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
  positionsValue?: number
  totalPnl?: number
}

export function StatsCards({
  walletBalance = 5.25e9,
  shieldedBalance = 2.5e9,
  positionsValue = 45.50,
  totalPnl = 3.25,
}: StatsCardsProps) {
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
        title="Shielded Balance"
        value={`${formatSol(shieldedBalance)} SOL`}
        subValue="Private pool"
        icon={<Shield className="h-5 w-5 text-neon-purple" />}
        color="text-neon-purple"
        delay={0.1}
      />

      <StatCard
        title="Positions Value"
        value={formatUsd(positionsValue)}
        subValue="2 active positions"
        icon={<TrendingUp className="h-5 w-5 text-status-success" />}
        color="text-status-success"
        delay={0.2}
      />

      <StatCard
        title="Total P&L"
        value={formatUsd(totalPnl)}
        change={7.23}
        icon={<BarChart3 className="h-5 w-5 text-status-warning" />}
        color="text-status-warning"
        delay={0.3}
      />
    </div>
  )
}

export default StatsCards
