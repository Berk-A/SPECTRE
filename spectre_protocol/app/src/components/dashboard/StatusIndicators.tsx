import { motion } from 'framer-motion'
import { Shield, Cpu, TrendingUp, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'

export type StatusType = 'active' | 'inactive' | 'warning' | 'error'

interface StatusIndicatorProps {
  name: string
  status: StatusType
  description: string
  icon: React.ReactNode
  color: string
}

function StatusIndicator({
  name,
  status,
  description,
  icon,
  color,
}: StatusIndicatorProps) {
  const statusConfig = {
    active: {
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Active',
      color: 'text-status-success',
      bg: 'bg-status-success/10',
    },
    inactive: {
      icon: <XCircle className="h-4 w-4" />,
      label: 'Inactive',
      color: 'text-white/40',
      bg: 'bg-white/5',
    },
    warning: {
      icon: <AlertCircle className="h-4 w-4" />,
      label: 'Warning',
      color: 'text-status-warning',
      bg: 'bg-status-warning/10',
    },
    error: {
      icon: <XCircle className="h-4 w-4" />,
      label: 'Error',
      color: 'text-status-error',
      bg: 'bg-status-error/10',
    },
  }

  const config = statusConfig[status]

  return (
    <Card className="relative overflow-hidden">
      {/* Animated pulse for active status */}
      {status === 'active' && (
        <motion.div
          className={cn('absolute inset-0 opacity-10', color.replace('text-', 'bg-'))}
          animate={{ opacity: [0.05, 0.1, 0.05] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', color.replace('text-', 'bg-') + '/20')}>
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium">{name}</p>
            <p className="text-xs text-white/50">{description}</p>
          </div>
        </div>

        <div className={cn('flex items-center gap-2 px-3 py-1 rounded-full', config.bg)}>
          <span className={config.color}>{config.icon}</span>
          <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
        </div>
      </div>
    </Card>
  )
}

interface StatusIndicatorsProps {
  privacyStatus?: StatusType
  teeStatus?: StatusType
  tradingStatus?: StatusType
}

export function StatusIndicators({
  privacyStatus = 'active',
  teeStatus = 'inactive',
  tradingStatus = 'active',
}: StatusIndicatorsProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold mb-4">System Status</h3>

      <StatusIndicator
        name="Privacy Layer"
        status={privacyStatus}
        description="PrivacyCash ZK Pool"
        icon={<Shield className="h-5 w-5 text-neon-cyan" />}
        color="text-neon-cyan"
      />

      <StatusIndicator
        name="TEE Layer"
        status={teeStatus}
        description="MagicBlock Enclave"
        icon={<Cpu className="h-5 w-5 text-neon-purple" />}
        color="text-neon-purple"
      />

      <StatusIndicator
        name="Trading Layer"
        status={tradingStatus}
        description="PNP Markets"
        icon={<TrendingUp className="h-5 w-5 text-status-success" />}
        color="text-status-success"
      />
    </div>
  )
}

export default StatusIndicators
