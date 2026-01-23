import { motion } from 'framer-motion'
import { Shield, Cpu, TrendingUp, ArrowDown, Lock, Eye, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LayerProps {
  name: string
  description: string
  icon: React.ReactNode
  color: string
  glowClass: string
  features: string[]
  isActive?: boolean
  delay?: number
}

function Layer({
  name,
  description,
  icon,
  color,
  glowClass,
  features,
  isActive = true,
  delay = 0,
}: LayerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={cn(
        'relative glass-card p-6 border-2 transition-all duration-500',
        isActive ? `${color} ${glowClass}` : 'border-glass-border opacity-60'
      )}
    >
      {/* Animated scan line */}
      {isActive && (
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <motion.div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-50"
            animate={{ top: ['0%', '100%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            style={{ color: color.replace('border-', '').replace('/30', '') }}
          />
        </div>
      )}

      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'p-3 rounded-lg',
                isActive ? color.replace('border-', 'bg-').replace('/30', '/20') : 'bg-white/5'
              )}
            >
              {icon}
            </div>
            <div>
              <h3 className="font-semibold text-lg">{name}</h3>
              <p className="text-sm text-white/50">{description}</p>
            </div>
          </div>

          {isActive && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className={cn(
                'w-3 h-3 rounded-full',
                color.replace('border-', 'bg-').replace('/30', '')
              )}
            />
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {features.map((feature, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs text-white/60"
            >
              <div
                className={cn(
                  'w-1 h-1 rounded-full',
                  color.replace('border-', 'bg-').replace('/30', '/50')
                )}
              />
              {feature}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function ConnectionArrow({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
      className="flex justify-center py-2"
    >
      <motion.div
        animate={{ y: [0, 5, 0] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="flex flex-col items-center text-white/30"
      >
        <div className="w-px h-6 bg-gradient-to-b from-neon-cyan/50 to-neon-purple/50" />
        <ArrowDown className="h-4 w-4" />
        <div className="w-px h-6 bg-gradient-to-b from-neon-purple/50 to-status-success/50" />
      </motion.div>
    </motion.div>
  )
}

export function LayerVisualization() {
  return (
    <div className="relative">
      {/* Background glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-neon-cyan/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-neon-purple/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-status-success/5 rounded-full blur-3xl" />
      </div>

      <div className="relative space-y-0">
        {/* Layer 1: Privacy */}
        <Layer
          name="Privacy Layer"
          description="PrivacyCash Integration"
          icon={<Shield className="h-6 w-6 text-neon-cyan" />}
          color="border-neon-cyan/30"
          glowClass="shadow-neon-cyan"
          delay={0}
          features={[
            'Zero-Knowledge Proofs',
            'Shielded Deposits',
            'Break On-Chain Link',
            'Private Notes',
          ]}
        />

        <ConnectionArrow delay={0.3} />

        {/* Layer 2: TEE */}
        <Layer
          name="TEE Layer"
          description="MagicBlock Ephemeral Rollup"
          icon={<Cpu className="h-6 w-6 text-neon-purple" />}
          color="border-neon-purple/30"
          glowClass="shadow-neon-purple"
          delay={0.2}
          features={[
            'Encrypted Memory',
            'Confidential Execution',
            'Strategy Delegation',
            'L1 State Sync',
          ]}
        />

        <ConnectionArrow delay={0.5} />

        {/* Layer 3: Trading */}
        <Layer
          name="Trading Layer"
          description="PNP Prediction Markets"
          icon={<TrendingUp className="h-6 w-6 text-status-success" />}
          color="border-status-success/30"
          glowClass="shadow-neon-green"
          delay={0.4}
          features={[
            'Market Selection',
            'Position Sizing',
            'Trade Execution',
            'P&L Tracking',
          ]}
        />
      </div>

      {/* Flow diagram legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8 p-4 glass-card"
      >
        <h4 className="text-sm font-medium mb-3 text-white/70">Privacy Sandwich Flow</h4>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-neon-cyan" />
            <span className="text-white/60">Shield funds privately</span>
          </div>
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-neon-purple" />
            <span className="text-white/60">Execute in TEE</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-status-success" />
            <span className="text-white/60">Trade on markets</span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default LayerVisualization
