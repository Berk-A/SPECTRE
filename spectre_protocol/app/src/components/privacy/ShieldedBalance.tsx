import { motion } from 'framer-motion'
import { Shield, Lock, Vault, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui'
import { usePrivacy } from '@/hooks/usePrivacy'
import { formatSol, formatUsdc } from '@/lib/utils'
import { useEffect } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

export function ShieldedBalance() {
  const {
    shieldedBalanceSol,
    shieldedBalanceUsdc,
    unspentNotes,
    vaultBalance,
    vaultSolBalance,
    availableForTrading,
    isInitialized,
    fetchVaultBalance
  } = usePrivacy()

  // Fetch vault balance on mount and when initialized
  useEffect(() => {
    if (isInitialized && fetchVaultBalance) {
      fetchVaultBalance()
    }
  }, [isInitialized, fetchVaultBalance])

  // Convert lamports to SOL for display
  const vaultBalanceSol = vaultSolBalance / LAMPORTS_PER_SOL
  const availableForTradingSol = availableForTrading / LAMPORTS_PER_SOL

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
        {/* Vault Balance (On-Chain) */}
        {vaultBalance && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-3 rounded-lg bg-gradient-to-br from-neon-cyan/10 to-neon-purple/10 border border-neon-cyan/20"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Vault className="w-5 h-5 text-neon-cyan" />
                <span className="text-sm font-medium text-neon-cyan">Vault Balance</span>
              </div>
              <span className="text-xs text-white/50">On-Chain</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono font-semibold text-lg">
                  {formatSol(vaultBalanceSol)}
                </p>
                <p className="text-xs text-white/50">
                  {vaultBalance.isDelegated ? 'Delegated to TEE' : 'Not delegated'}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-status-success">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {formatSol(availableForTradingSol)}
                  </span>
                </div>
                <p className="text-xs text-white/50">Available for Trading</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* SOL Balance (Local Notes) */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-between p-3 rounded-lg bg-background-secondary"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold">
              S
            </div>
            <div>
              <span className="text-sm text-white/70">SOL (Shielded)</span>
              <p className="text-xs text-white/40">ZK Notes</p>
            </div>
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
            transition={{ delay: 0.2 }}
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
        {shieldedBalanceSol === 0 && shieldedBalanceUsdc === 0 && !vaultBalance && (
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
