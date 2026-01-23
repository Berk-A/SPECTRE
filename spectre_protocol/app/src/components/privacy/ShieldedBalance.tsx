import { motion } from 'framer-motion'
import { Shield, Lock } from 'lucide-react'
import { Card } from '@/components/ui'
import { usePrivacy } from '@/hooks/usePrivacy'
import { formatSol, formatUsdc, cn } from '@/lib/utils'

export function ShieldedBalance() {
  const { shieldedBalanceSol, shieldedBalanceUsdc, unspentNotes } = usePrivacy()

  return (
    <Card variant="glow-purple">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-lg bg-neon-purple/10">
          <Lock className="h-6 w-6 text-neon-purple" />
        </div>
        <div>
          <h3 className="font-semibold">Shielded Balance</h3>
          <p className="text-xs text-white/50">Private pool funds</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* SOL Balance */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center justify-between p-3 rounded-lg bg-background-secondary"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold">
              S
            </div>
            <span className="text-sm text-white/70">SOL</span>
          </div>
          <div className="text-right">
            <p className="font-mono font-semibold">
              {formatSol(shieldedBalanceSol)}
            </p>
            <p className="text-xs text-white/50">
              {unspentNotes.filter((n) => n.tokenType === 'SOL').length} notes
            </p>
          </div>
        </motion.div>

        {/* USDC Balance (if any) */}
        {shieldedBalanceUsdc > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-between p-3 rounded-lg bg-background-secondary"
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center text-xs font-bold">
                $
              </div>
              <span className="text-sm text-white/70">USDC</span>
            </div>
            <div className="text-right">
              <p className="font-mono font-semibold">
                {formatUsdc(shieldedBalanceUsdc)}
              </p>
              <p className="text-xs text-white/50">
                {unspentNotes.filter((n) => n.tokenType === 'SPL').length} notes
              </p>
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {shieldedBalanceSol === 0 && shieldedBalanceUsdc === 0 && (
          <div className="text-center py-4 text-white/50">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No shielded funds</p>
          </div>
        )}
      </div>
    </Card>
  )
}

export default ShieldedBalance
