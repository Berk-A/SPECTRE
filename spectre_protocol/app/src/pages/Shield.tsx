import { motion } from 'framer-motion'
import { Shield as ShieldIcon, Lock, AlertTriangle } from 'lucide-react'
import { ShieldForm, NoteManager, ShieldedBalance } from '@/components/privacy'
import { Card } from '@/components/ui'

export function Shield() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-neon-cyan/10">
            <ShieldIcon className="h-6 w-6 text-neon-cyan" />
          </div>
          <h1 className="text-2xl font-bold">Privacy Layer</h1>
        </div>
        <p className="text-white/60">
          Shield your funds into the privacy pool using PrivacyCash ZK proofs
        </p>
      </motion.div>

      {/* Warning banner */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-status-warning/30 bg-status-warning/5">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-status-warning shrink-0" />
            <div>
              <h4 className="font-medium text-status-warning mb-1">
                Important: Backup Your Notes
              </h4>
              <p className="text-sm text-white/60">
                Deposit notes are required to withdraw your funds. Export and
                store them securely. Lost notes cannot be recovered.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Main content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          <ShieldForm />
          <ShieldedBalance />
        </motion.div>

        {/* Right column */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <NoteManager />
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
          <Lock className="h-5 w-5 text-neon-cyan" />
          How Privacy Shielding Works
        </h3>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="text-sm font-medium text-neon-cyan">
              Zero-Knowledge Proofs
            </div>
            <p className="text-sm text-white/50">
              PrivacyCash uses ZK-SNARKs to prove you deposited funds without
              revealing which specific deposit you're withdrawing.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-neon-purple">
              Commitment Scheme
            </div>
            <p className="text-sm text-white/50">
              Your deposit creates a cryptographic commitment on-chain. The note
              contains the secret needed to spend it.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-status-success">
              Break the Link
            </div>
            <p className="text-sm text-white/50">
              When you withdraw to a new address, there's no on-chain connection
              between your original wallet and the recipient.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Shield
