import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Zap, TrendingUp, TrendingDown } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Badge } from '@/components/ui'
import { usePnp, type TradeSide } from '@/hooks/usePnp'
import { formatPercent, cn } from '@/lib/utils'

export function TradeForm() {
  const { connected } = useWallet()
  const { selectedMarket, executeTrade, isTrading } = usePnp()
  const [side, setSide] = useState<TradeSide>('yes')
  const [amount, setAmount] = useState('')

  const handleTrade = async () => {
    if (!selectedMarket) return

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return

    const result = await executeTrade(selectedMarket.address, side, amountNum)
    if (result.success) {
      setAmount('')
    }
  }

  const price = selectedMarket
    ? side === 'yes'
      ? selectedMarket.yesPrice
      : selectedMarket.noPrice
    : 0

  const potentialShares = amount && price ? parseFloat(amount) / price : 0

  return (
    <Card variant="glow-cyan">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-neon-cyan" />
          Place Trade
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {selectedMarket ? (
          <>
            {/* Selected market */}
            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Market</p>
              <p className="text-sm font-medium line-clamp-1">
                {selectedMarket.question}
              </p>
            </div>

            {/* Side selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Side</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSide('yes')}
                  className={cn(
                    'p-4 rounded-lg border transition-all flex flex-col items-center gap-2',
                    side === 'yes'
                      ? 'border-status-success bg-status-success/10'
                      : 'border-glass-border hover:border-status-success/30'
                  )}
                >
                  <TrendingUp
                    className={cn(
                      'h-6 w-6',
                      side === 'yes' ? 'text-status-success' : 'text-white/40'
                    )}
                  />
                  <span
                    className={cn(
                      'font-semibold',
                      side === 'yes' ? 'text-status-success' : 'text-white/60'
                    )}
                  >
                    YES
                  </span>
                  <span className="text-xs text-white/50">
                    {formatPercent(selectedMarket.yesPrice)}
                  </span>
                </button>

                <button
                  onClick={() => setSide('no')}
                  className={cn(
                    'p-4 rounded-lg border transition-all flex flex-col items-center gap-2',
                    side === 'no'
                      ? 'border-status-error bg-status-error/10'
                      : 'border-glass-border hover:border-status-error/30'
                  )}
                >
                  <TrendingDown
                    className={cn(
                      'h-6 w-6',
                      side === 'no' ? 'text-status-error' : 'text-white/40'
                    )}
                  />
                  <span
                    className={cn(
                      'font-semibold',
                      side === 'no' ? 'text-status-error' : 'text-white/60'
                    )}
                  >
                    NO
                  </span>
                  <span className="text-xs text-white/50">
                    {formatPercent(selectedMarket.noPrice)}
                  </span>
                </button>
              </div>
            </div>

            {/* Amount input */}
            <Input
              label="Amount (USDC)"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!connected || isTrading}
            />

            {/* Trade preview */}
            {amount && parseFloat(amount) > 0 && (
              <div className="p-3 rounded-lg bg-neon-cyan/5 border border-neon-cyan/20 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Price</span>
                  <span className="font-mono">{formatPercent(price)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Est. Shares</span>
                  <span className="font-mono">{potentialShares.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Max Payout</span>
                  <span className="font-mono text-status-success">
                    ${potentialShares.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Submit button */}
            <Button
              className="w-full"
              variant="primary"
              onClick={handleTrade}
              disabled={!connected || isTrading || !amount || parseFloat(amount) <= 0}
              loading={isTrading}
            >
              {!connected
                ? 'Connect Wallet'
                : isTrading
                ? 'Executing Trade...'
                : `Buy ${side.toUpperCase()} for $${amount || '0'}`}
            </Button>
          </>
        ) : (
          <div className="text-center py-8 text-white/50">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Select a market to trade</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default TradeForm
