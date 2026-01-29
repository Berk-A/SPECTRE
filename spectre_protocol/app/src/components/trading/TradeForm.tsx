import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Zap, TrendingUp, TrendingDown, Vault, ExternalLink } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@/components/ui'
import { usePnp, type TradeSide } from '@/hooks/usePnp'
import { usePrivacy } from '@/hooks/usePrivacy'
import { formatPercent, formatSol, cn } from '@/lib/utils'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { PNP_DEMO_MODE } from '@/lib/config/constants'

export function TradeForm() {
  const { connected } = useWallet()
  const { selectedMarket, executeTrade, isTrading } = usePnp()
  const { availableForTrading, fetchVaultBalance, isInitialized } = usePrivacy()
  const [side, setSide] = useState<TradeSide>('yes')
  const [amount, setAmount] = useState('')
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null)

  // Refresh vault balance when initialized
  useEffect(() => {
    if (isInitialized && fetchVaultBalance) {
      fetchVaultBalance()
    }
  }, [isInitialized, fetchVaultBalance])

  const handleTrade = async () => {
    if (!selectedMarket) return

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return

    const result = await executeTrade(selectedMarket.address, side, amountNum)
    if (result.success) {
      setAmount('')
      setLastTxSignature(result.signature || null)
      // Refresh vault balance after trade
      if (fetchVaultBalance) {
        fetchVaultBalance()
      }
    }
  }

  const price = selectedMarket
    ? side === 'yes'
      ? selectedMarket.yesPrice
      : selectedMarket.noPrice
    : 0

  const potentialShares = amount && price ? parseFloat(amount) / price : 0

  // Available balance in SOL
  const availableBalanceSol = availableForTrading / LAMPORTS_PER_SOL
  const amountNum = parseFloat(amount) || 0
  const hasInsufficientBalance = !PNP_DEMO_MODE && amountNum > availableBalanceSol && availableBalanceSol > 0

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

            {/* Vault Balance (when not in demo mode) */}
            {!PNP_DEMO_MODE && availableBalanceSol > 0 && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-neon-cyan/5 border border-neon-cyan/20">
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Vault className="h-4 w-4 text-neon-cyan" />
                  <span>Available:</span>
                </div>
                <span className="font-mono text-sm text-neon-cyan">
                  {formatSol(availableBalanceSol)} SOL
                </span>
              </div>
            )}

            {/* Amount input */}
            <Input
              label="Amount (SOL)"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!connected || isTrading}
              error={hasInsufficientBalance ? 'Insufficient vault balance' : undefined}
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
                  <span className="font-mono">{potentialShares.toFixed(4)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Max Payout</span>
                  <span className="font-mono text-status-success">
                    {potentialShares.toFixed(4)} SOL
                  </span>
                </div>
                {!PNP_DEMO_MODE && (
                  <div className="text-xs text-white/40 pt-1 border-t border-glass-border">
                    Position will be recorded on-chain
                  </div>
                )}
              </div>
            )}

            {/* Last transaction link */}
            {lastTxSignature && !PNP_DEMO_MODE && (
              <div className="flex items-center justify-center gap-2 text-xs text-neon-cyan">
                <a
                  href={`https://explorer.solana.com/tx/${lastTxSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:underline"
                >
                  <span>Last TX: {lastTxSignature.slice(0, 8)}...</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            {/* Submit button */}
            <Button
              className="w-full"
              variant="primary"
              onClick={handleTrade}
              disabled={!connected || isTrading || !amount || parseFloat(amount) <= 0 || hasInsufficientBalance}
              loading={isTrading}
            >
              {!connected
                ? 'Connect Wallet'
                : isTrading
                ? 'Opening Position...'
                : `Buy ${side.toUpperCase()} for ${amount || '0'} SOL`}
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
