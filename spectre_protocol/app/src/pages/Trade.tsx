import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { MarketList, TradeForm, TradeHistory } from '@/components/trading'

export function Trade() {
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
        </div>
        <p className="text-white/60">
          Browse and trade on PNP prediction markets
        </p>
      </motion.div>

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Market List */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <MarketList />
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
