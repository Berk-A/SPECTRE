import { useWallet } from '@solana/wallet-adapter-react'
import { motion } from 'framer-motion'
import { Cpu, Power, Zap, Clock } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui'
import { useTee } from '@/hooks/useTee'
import { formatDate, cn } from '@/lib/utils'

export function DelegationStatus() {
  const { connected } = useWallet()
  const {
    delegationStatus,
    isDelegating,
    isUndelegating,
    delegate,
    undelegate,
  } = useTee()

  return (
    <Card variant={delegationStatus.isDelegated ? 'glow-purple' : 'default'}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-neon-purple" />
            TEE Delegation
          </div>
          <Badge variant={delegationStatus.isDelegated ? 'secondary' : 'outline'}>
            {delegationStatus.isDelegated ? 'Active' : 'Inactive'}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status indicator */}
        <div className="flex items-center justify-center py-6">
          <motion.div
            animate={
              delegationStatus.isDelegated
                ? { scale: [1, 1.05, 1], opacity: [1, 0.8, 1] }
                : {}
            }
            transition={{ duration: 2, repeat: Infinity }}
            className={cn(
              'relative w-24 h-24 rounded-full flex items-center justify-center',
              delegationStatus.isDelegated
                ? 'bg-neon-purple/20 border-2 border-neon-purple/50'
                : 'bg-white/5 border-2 border-white/10'
            )}
          >
            <Cpu
              className={cn(
                'h-10 w-10',
                delegationStatus.isDelegated ? 'text-neon-purple' : 'text-white/40'
              )}
            />

            {delegationStatus.isDelegated && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-neon-purple/50"
              />
            )}
          </motion.div>
        </div>

        {/* Delegation info */}
        {delegationStatus.isDelegated && delegationStatus.delegatedAt && (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-background-secondary">
              <div className="flex items-center gap-2 text-white/60">
                <Clock className="h-4 w-4" />
                <span className="text-sm">Delegated At</span>
              </div>
              <span className="text-sm font-mono">
                {formatDate(delegationStatus.delegatedAt)}
              </span>
            </div>

            {delegationStatus.vaultPda && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-background-secondary">
                <span className="text-sm text-white/60">Vault PDA</span>
                <span className="text-sm font-mono">
                  {delegationStatus.vaultPda.slice(0, 8)}...
                </span>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div className="p-3 rounded-lg bg-neon-purple/5 border border-neon-purple/20">
          <div className="flex gap-2">
            <Zap className="h-4 w-4 text-neon-purple shrink-0 mt-0.5" />
            <p className="text-xs text-white/70">
              {delegationStatus.isDelegated
                ? 'Your vault is delegated to the TEE enclave. Trading operations execute in encrypted memory.'
                : 'Delegate your vault to enable confidential trading via MagicBlock TEE.'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        {connected ? (
          delegationStatus.isDelegated ? (
            <Button
              className="w-full"
              variant="secondary"
              onClick={undelegate}
              loading={isUndelegating}
            >
              <Power className="h-4 w-4 mr-2" />
              {isUndelegating ? 'Undelegating...' : 'Undelegate from TEE'}
            </Button>
          ) : (
            <Button
              className="w-full"
              variant="primary"
              onClick={delegate}
              loading={isDelegating}
            >
              <Zap className="h-4 w-4 mr-2" />
              {isDelegating ? 'Delegating...' : 'Delegate to TEE'}
            </Button>
          )
        ) : (
          <Button className="w-full" disabled>
            Connect Wallet
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default DelegationStatus
