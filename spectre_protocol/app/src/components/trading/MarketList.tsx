import { motion } from 'framer-motion'
import { TrendingUp, Clock, Droplets, BarChart3 } from 'lucide-react'
import { Card, Badge, Button } from '@/components/ui'
import { usePnp } from '@/hooks/usePnp'
import { formatPercent, formatUsd, cn } from '@/lib/utils'
import type { Market } from '@/stores/tradingStore'

interface MarketCardProps {
  market: Market
  isSelected?: boolean
  onSelect?: () => void
}

function MarketCard({ market, isSelected, onSelect }: MarketCardProps) {
  const daysToExpiry = Math.ceil(
    (market.endTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
    >
      <Card
        hover
        className={cn(
          'cursor-pointer transition-all',
          isSelected && 'border-neon-cyan/50 shadow-neon-cyan'
        )}
        onClick={onSelect}
      >
        <div className="space-y-4">
          {/* Question */}
          <div>
            <p className="font-medium text-sm line-clamp-2">{market.question}</p>
          </div>

          {/* Prices */}
          <div className="flex gap-3">
            <div className="flex-1 p-3 rounded-lg bg-status-success/10">
              <p className="text-xs text-white/50 mb-1">YES</p>
              <p className="text-lg font-bold text-status-success">
                {formatPercent(market.yesPrice)}
              </p>
            </div>
            <div className="flex-1 p-3 rounded-lg bg-status-error/10">
              <p className="text-xs text-white/50 mb-1">NO</p>
              <p className="text-lg font-bold text-status-error">
                {formatPercent(market.noPrice)}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-white/50">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>
                {daysToExpiry > 0 ? `${daysToExpiry}d left` : 'Expired'}
              </span>
            </div>

            {market.liquidity && (
              <div className="flex items-center gap-1">
                <Droplets className="h-3 w-3" />
                <span>{formatUsd(market.liquidity)}</span>
              </div>
            )}

            {market.volume24h && (
              <div className="flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                <span>{formatUsd(market.volume24h)} 24h</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

export function MarketList() {
  const { markets, selectedMarket, selectMarket, isLoading, fetchMarkets } = usePnp()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-neon-cyan" />
          <h3 className="font-semibold">Prediction Markets</h3>
          <Badge variant="outline">{markets.length}</Badge>
        </div>

        <Button variant="ghost" size="sm" onClick={fetchMarkets} disabled={isLoading}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <div className="h-24 bg-white/5 rounded" />
            </Card>
          ))}
        </div>
      ) : markets.length === 0 ? (
        <Card className="text-center py-8">
          <TrendingUp className="h-12 w-12 mx-auto mb-3 text-white/20" />
          <p className="text-white/50">No active markets available</p>
        </Card>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {markets.map((market) => (
            <MarketCard
              key={market.address}
              market={market}
              isSelected={selectedMarket?.address === market.address}
              onSelect={() => selectMarket(market.address)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default MarketList
