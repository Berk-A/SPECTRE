import { motion } from 'framer-motion'
import { Briefcase, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import { usePnp } from '@/hooks/usePnp'
import { formatUsd, cn } from '@/lib/utils'
import type { Position } from '@/stores/tradingStore'

interface PositionCardProps {
  position: Position
}

function PositionCard({ position }: PositionCardProps) {
  const hasYes = position.yesShares > 0
  const hasNo = position.noShares > 0
  const pnl = position.unrealizedPnl || 0
  const isProfitable = pnl >= 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <Card>
        <div className="space-y-3">
          {/* Market question */}
          <p className="text-sm font-medium line-clamp-1">
            {position.marketQuestion || `Market ${position.market.slice(0, 8)}...`}
          </p>

          {/* Position details */}
          <div className="flex gap-3">
            {hasYes && (
              <div className="flex-1 p-2 rounded bg-status-success/10">
                <div className="flex items-center gap-1 text-xs text-white/50 mb-1">
                  <TrendingUp className="h-3 w-3" />
                  YES
                </div>
                <p className="font-mono text-sm text-status-success">
                  {position.yesShares.toFixed(2)} shares
                </p>
                {position.entryPriceYes && (
                  <p className="text-xs text-white/40">
                    @ {(position.entryPriceYes * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            )}

            {hasNo && (
              <div className="flex-1 p-2 rounded bg-status-error/10">
                <div className="flex items-center gap-1 text-xs text-white/50 mb-1">
                  <TrendingDown className="h-3 w-3" />
                  NO
                </div>
                <p className="font-mono text-sm text-status-error">
                  {position.noShares.toFixed(2)} shares
                </p>
                {position.entryPriceNo && (
                  <p className="text-xs text-white/40">
                    @ {(position.entryPriceNo * 100).toFixed(1)}%
                  </p>
                )}
              </div>
            )}
          </div>

          {/* P&L */}
          <div className="flex items-center justify-between pt-2 border-t border-glass-border">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-white/40" />
              <span className="text-xs text-white/50">
                Invested: {formatUsd(position.totalInvested || 0)}
              </span>
            </div>
            <Badge variant={isProfitable ? 'success' : 'error'}>
              {isProfitable ? '+' : ''}
              {formatUsd(pnl)}
            </Badge>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

export function PositionList() {
  const { positions, isLoading } = usePnp()

  const totalInvested = positions.reduce(
    (acc, p) => acc + (p.totalInvested || 0),
    0
  )
  const totalPnl = positions.reduce(
    (acc, p) => acc + (p.unrealizedPnl || 0),
    0
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-neon-purple" />
          <h3 className="font-semibold">Positions</h3>
          <Badge variant="outline">{positions.length}</Badge>
        </div>

        {positions.length > 0 && (
          <div
            className={cn(
              'text-sm font-medium',
              totalPnl >= 0 ? 'text-status-success' : 'text-status-error'
            )}
          >
            {totalPnl >= 0 ? '+' : ''}
            {formatUsd(totalPnl)}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-24 bg-white/5 rounded" />
            </Card>
          ))}
        </div>
      ) : positions.length === 0 ? (
        <Card className="text-center py-8">
          <Briefcase className="h-12 w-12 mx-auto mb-3 text-white/20" />
          <p className="text-white/50">No open positions</p>
          <p className="text-xs text-white/30 mt-1">
            Trade on markets to open positions
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {positions.map((position, i) => (
            <PositionCard key={position.market} position={position} />
          ))}

          {/* Summary */}
          <Card className="bg-neon-purple/5 border-neon-purple/20">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Total Invested</span>
              <span className="font-mono">{formatUsd(totalInvested)}</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default PositionList
