import { motion } from 'framer-motion'
import { History, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react'
import { Card, Badge } from '@/components/ui'
import { usePnp } from '@/hooks/usePnp'
import { formatUsd, formatTimeAgo, formatAddress, cn } from '@/lib/utils'
import type { Trade } from '@/stores/tradingStore'

interface TradeRowProps {
  trade: Trade
}

function TradeRow({ trade }: TradeRowProps) {
  const isBuy = trade.type === 'buy'

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between p-3 rounded-lg bg-background-secondary"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'p-2 rounded',
            trade.side === 'yes'
              ? 'bg-status-success/10'
              : 'bg-status-error/10'
          )}
        >
          {trade.side === 'yes' ? (
            <TrendingUp className="h-4 w-4 text-status-success" />
          ) : (
            <TrendingDown className="h-4 w-4 text-status-error" />
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <Badge
              variant={trade.side === 'yes' ? 'success' : 'error'}
              className="text-xs"
            >
              {trade.side.toUpperCase()}
            </Badge>
            <span className="text-xs text-white/40">
              {formatTimeAgo(trade.timestamp)}
            </span>
          </div>
          <p className="text-sm font-mono mt-0.5">
            {trade.shares.toFixed(2)} @ {(trade.price * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="text-right">
        <p className="font-mono text-sm">
          {isBuy ? '-' : '+'}
          {formatUsd(trade.amount)}
        </p>
        <a
          href={`https://solscan.io/tx/${trade.signature}?cluster=devnet`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-neon-cyan hover:underline flex items-center gap-1 justify-end"
        >
          {formatAddress(trade.signature, 4)}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </motion.div>
  )
}

export function TradeHistory() {
  const { trades } = usePnp()

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <History className="h-5 w-5 text-white/60" />
        <h3 className="font-semibold">Trade History</h3>
        <Badge variant="outline">{trades.length}</Badge>
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-8 text-white/50">
          <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No trades yet</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {trades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </div>
      )}
    </Card>
  )
}

export default TradeHistory
