import { motion } from 'framer-motion'
import { useState } from 'react'
import { Briefcase, TrendingUp, TrendingDown, DollarSign, X, ExternalLink } from 'lucide-react'
import { Card, Badge, Button } from '@/components/ui'
import { usePnp } from '@/hooks/usePnp'
import { formatSol, cn } from '@/lib/utils'
import type { Position } from '@/stores/tradingStore'
import { PNP_DEMO_MODE } from '@/lib/config/constants'

interface PositionCardProps {
  position: Position
  onClose: (marketAddress: string) => Promise<void>
  isClosing: boolean
}

function PositionCard({ position, onClose, isClosing }: PositionCardProps) {
  const hasYes = position.yesShares > 0
  const hasNo = position.noShares > 0
  const pnl = position.unrealizedPnl || 0
  const isProfitable = pnl >= 0
  const [closing, setClosing] = useState(false)

  const handleClose = async () => {
    setClosing(true)
    try {
      await onClose(position.market)
    } finally {
      setClosing(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <Card>
        <div className="space-y-3">
          {/* Market question with close button */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium line-clamp-1 flex-1">
              {position.marketQuestion || `Market ${position.market.slice(0, 8)}...`}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isClosing || closing}
              className="h-6 w-6 p-0 text-white/40 hover:text-status-error"
              title="Close Position"
            >
              {closing ? (
                <span className="animate-spin">...</span>
              ) : (
                <X className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Position PDA link (on-chain verification) */}
          {position.positionPda && !PNP_DEMO_MODE && (
            <a
              href={`https://explorer.solana.com/account/${position.positionPda}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-neon-cyan hover:underline"
            >
              <span>PDA: {position.positionPda.slice(0, 8)}...</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Position details */}
          <div className="flex gap-3">
            {hasYes && (
              <div className="flex-1 p-2 rounded bg-status-success/10">
                <div className="flex items-center gap-1 text-xs text-white/50 mb-1">
                  <TrendingUp className="h-3 w-3" />
                  YES
                </div>
                <p className="font-mono text-sm text-status-success">
                  {position.yesShares.toFixed(4)} shares
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
                  {position.noShares.toFixed(4)} shares
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
                Invested: {formatSol(position.totalInvested || 0)} SOL
              </span>
            </div>
            <Badge variant={isProfitable ? 'success' : 'error'}>
              {isProfitable ? '+' : ''}
              {formatSol(pnl)} SOL
            </Badge>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

export function PositionList() {
  const { positions, isLoading, isClosing, closePosition } = usePnp()

  const totalInvested = positions.reduce(
    (acc, p) => acc + (p.totalInvested || 0),
    0
  )
  const totalPnl = positions.reduce(
    (acc, p) => acc + (p.unrealizedPnl || 0),
    0
  )

  const handleClosePosition = async (marketAddress: string) => {
    await closePosition(marketAddress)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-neon-purple" />
          <h3 className="font-semibold">Positions</h3>
          <Badge variant="outline">{positions.length}</Badge>
          {!PNP_DEMO_MODE && positions.length > 0 && (
            <Badge variant="secondary" className="text-xs">On-Chain</Badge>
          )}
        </div>

        {positions.length > 0 && (
          <div
            className={cn(
              'text-sm font-medium',
              totalPnl >= 0 ? 'text-status-success' : 'text-status-error'
            )}
          >
            {totalPnl >= 0 ? '+' : ''}
            {formatSol(totalPnl)} SOL
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
          {positions.map((position) => (
            <PositionCard
              key={position.market}
              position={position}
              onClose={handleClosePosition}
              isClosing={isClosing}
            />
          ))}

          {/* Summary */}
          <Card className="bg-neon-purple/5 border-neon-purple/20">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Total Invested</span>
              <span className="font-mono">{formatSol(totalInvested)} SOL</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default PositionList
