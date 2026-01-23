import { motion } from 'framer-motion'
import { Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { Card, Progress, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { MAX_RISK_SCORE } from '@/lib/config/constants'

interface RiskScoreProps {
  score: number
  level: 'low' | 'medium' | 'high' | 'critical'
  passed: boolean
  isSanctioned?: boolean
  isChecked?: boolean
}

export function RiskScore({
  score,
  level,
  passed,
  isSanctioned = false,
  isChecked = false,
}: RiskScoreProps) {
  const getScoreColor = () => {
    if (score <= MAX_RISK_SCORE) return 'text-status-success'
    if (score <= 50) return 'text-status-warning'
    return 'text-status-error'
  }

  const getProgressVariant = () => {
    if (score <= MAX_RISK_SCORE) return 'green'
    if (score <= 50) return 'warning'
    return 'danger'
  }

  const getIcon = () => {
    if (!isChecked) return <Shield className="h-8 w-8 text-white/40" />
    if (passed) return <ShieldCheck className="h-8 w-8 text-status-success" />
    if (isSanctioned) return <ShieldX className="h-8 w-8 text-status-error" />
    return <ShieldAlert className="h-8 w-8 text-status-warning" />
  }

  const getLevelLabel = () => {
    switch (level) {
      case 'low':
        return 'Low Risk'
      case 'medium':
        return 'Medium Risk'
      case 'high':
        return 'High Risk'
      case 'critical':
        return 'Critical Risk'
    }
  }

  const getLevelVariant = () => {
    switch (level) {
      case 'low':
        return 'success'
      case 'medium':
        return 'warning'
      case 'high':
        return 'error'
      case 'critical':
        return 'error'
    }
  }

  return (
    <Card className="text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center"
      >
        {/* Risk score circle */}
        <div className="relative mb-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.4 }}
            className={cn(
              'w-24 h-24 rounded-full flex items-center justify-center',
              'bg-background-secondary border-2',
              isChecked
                ? passed
                  ? 'border-status-success/30'
                  : 'border-status-error/30'
                : 'border-white/10'
            )}
          >
            {isChecked ? (
              <span className={cn('text-3xl font-bold', getScoreColor())}>
                {score}
              </span>
            ) : (
              <span className="text-3xl font-bold text-white/30">?</span>
            )}
          </motion.div>

          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
            {getIcon()}
          </div>
        </div>

        {/* Status */}
        <div className="space-y-2 mt-4">
          {isChecked ? (
            <>
              <Badge variant={getLevelVariant() as any}>{getLevelLabel()}</Badge>
              <p className="text-sm text-white/60">
                {passed
                  ? 'Compliant for withdrawal'
                  : isSanctioned
                  ? 'Address is sanctioned'
                  : 'Risk score too high'}
              </p>
            </>
          ) : (
            <p className="text-sm text-white/50">
              Run compliance check to verify
            </p>
          )}
        </div>

        {/* Progress bar */}
        {isChecked && (
          <div className="w-full mt-4">
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>0</span>
              <span className="text-neon-cyan">Max: {MAX_RISK_SCORE}</span>
              <span>100</span>
            </div>
            <Progress value={score} variant={getProgressVariant()} />
          </div>
        )}
      </motion.div>
    </Card>
  )
}

export default RiskScore
