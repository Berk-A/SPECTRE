import { motion } from 'framer-motion'
import { Cpu, Shield, Zap } from 'lucide-react'
import { DelegationStatus, StrategyConfig } from '@/components/strategy'
import { Card } from '@/components/ui'

export function Strategy() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-neon-purple/10">
            <Cpu className="h-6 w-6 text-neon-purple" />
          </div>
          <h1 className="text-2xl font-bold">TEE Layer</h1>
        </div>
        <p className="text-white/60">
          Configure your trading strategy and delegate to MagicBlock's TEE
        </p>
      </motion.div>

      {/* Main content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Delegation Status */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <DelegationStatus />
        </motion.div>

        {/* Strategy Config */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <StrategyConfig />
        </motion.div>
      </div>

      {/* Info section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6"
      >
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5 text-neon-purple" />
          About TEE Delegation
        </h3>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="text-sm font-medium text-neon-cyan">
              Trusted Execution Environment
            </div>
            <p className="text-sm text-white/50">
              MagicBlock's TEE runs your code in encrypted memory. Even the
              server operators cannot see your trading logic or positions.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-neon-purple">
              Ephemeral Rollup
            </div>
            <p className="text-sm text-white/50">
              State changes accumulate in the TEE and periodically commit to
              Solana L1. This gives fast execution with L1 security guarantees.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-status-success">
              Full Control
            </div>
            <p className="text-sm text-white/50">
              You can undelegate at any time to return full control of your
              vault to your wallet. Final state commits to L1 automatically.
            </p>
          </div>
        </div>
      </motion.div>

      {/* TEE Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-status-warning" />
            TEE Network Status
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Network</p>
              <p className="font-mono text-sm">MagicBlock Devnet</p>
            </div>

            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Endpoint</p>
              <p className="font-mono text-sm truncate">devnet.magicblock.app</p>
            </div>

            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Commit Frequency</p>
              <p className="font-mono text-sm">~3 seconds</p>
            </div>

            <div className="p-3 rounded-lg bg-background-secondary">
              <p className="text-xs text-white/50 mb-1">Status</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
                <span className="font-mono text-sm text-status-success">
                  Operational
                </span>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

export default Strategy
