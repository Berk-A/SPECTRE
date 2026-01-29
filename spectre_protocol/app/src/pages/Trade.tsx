import { motion } from 'framer-motion'
import { TrendingUp, Vault, AlertCircle } from 'lucide-react'
import { MarketList, TradeForm, TradeHistory, PositionList } from '@/components/trading'
import { Badge, Card } from '@/components/ui'
import { usePrivacy } from '@/hooks/usePrivacy'
import { PNP_DEMO_MODE } from '@/lib/config/constants'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { formatSol } from '@/lib/utils'

export function Trade() {
  const { vaultSolBalance, availableForTrading, isInitialized } = usePrivacy()

  const vaultBalanceSol = vaultSolBalance / LAMPORTS_PER_SOL
  const availableForTradingSol = availableForTrading / LAMPORTS_PER_SOL
  const hasVaultFunds = !PNP_DEMO_MODE && vaultBalanceSol > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-status-success/10">
            <TrendingUp className="h-6 w-6 text-status-success" />
          </div>
          <h1 className="text-2xl font-bold">Trading Layer</h1>
          {!PNP_DEMO_MODE && (
            <Badge variant="info" className="text-xs">On-Chain</Badge>
          )}
        </div>
        <p className="text-white/60">
          {PNP_DEMO_MODE
            ? 'Browse and trade on mock prediction markets'
            : 'Trade on prediction markets with on-chain position tracking'}
        </p>
      </motion.div>

      {/* Vault Balance Alert (when not in demo mode) */}
      {!PNP_DEMO_MODE && isInitialized && !hasVaultFunds && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-status-warning/10 border-status-warning/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-status-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-status-warning">No Vault Funds</p>
                <p className="text-sm text-white/60 mt-1">
                  Shield some SOL first to fund your vault for trading. Go to the Privacy page to shield funds.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Vault Balance Display (when not in demo mode and has funds) */}
      {!PNP_DEMO_MODE && hasVaultFunds && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="bg-neon-cyan/5 border-neon-cyan/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Vault className="h-5 w-5 text-neon-cyan" />
                <div>
                  <p className="text-sm text-white/60">Vault Balance</p>
                  <p className="font-mono font-bold text-neon-cyan">{formatSol(vaultBalanceSol)} SOL</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-white/60">Available for Trading</p>
                <p className="font-mono font-bold text-status-success">{formatSol(availableForTradingSol)} SOL</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Market List */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 space-y-6"
        >
          <MarketList />

          {/* Positions */}
          <PositionList />
        </motion.div>

        {/* Trade Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-6"
        >
          <TradeForm />
          <TradeHistory />
        </motion.div>
      </div>
    </div>
  )
}

export default Trade
