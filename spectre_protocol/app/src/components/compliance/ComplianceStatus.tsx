import { useWallet } from '@solana/wallet-adapter-react'
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui'
import { useCompliance } from '@/hooks/useCompliance'
import { formatAddress, formatTimeAgo, cn } from '@/lib/utils'
import { RiskScore } from './RiskScore'

export function ComplianceStatus() {
  const { connected, publicKey } = useWallet()
  const { status, isChecking, checkCompliance } = useCompliance()

  return (
    <div className="space-y-4">
      {/* Address info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Wallet Compliance</span>
            {status.checked && (
              <Badge variant={status.passed ? 'success' : 'error'}>
                {status.passed ? 'Compliant' : 'Non-Compliant'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {connected && publicKey ? (
            <>
              <div className="flex items-center justify-between p-3 rounded-lg bg-background-secondary">
                <span className="text-sm text-white/60">Address</span>
                <span className="font-mono text-sm">
                  {formatAddress(publicKey.toBase58(), 8)}
                </span>
              </div>

              {status.lastChecked && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-background-secondary">
                  <span className="text-sm text-white/60">Last Checked</span>
                  <span className="text-sm">
                    {formatTimeAgo(status.lastChecked)}
                  </span>
                </div>
              )}

              <Button
                className="w-full"
                onClick={checkCompliance}
                loading={isChecking}
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isChecking && 'animate-spin')} />
                {isChecking ? 'Checking...' : 'Check Compliance'}
              </Button>
            </>
          ) : (
            <div className="text-center py-8 text-white/50">
              <p>Connect wallet to check compliance</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risk Score */}
      {connected && (
        <RiskScore
          score={status.riskScore}
          level={status.riskLevel}
          passed={status.passed}
          isSanctioned={status.isSanctioned}
          isChecked={status.checked}
        />
      )}

      {/* Detailed status */}
      {status.checked && (
        <Card>
          <CardContent className="pt-6">
            <h4 className="text-sm font-medium mb-4">Compliance Details</h4>

            <div className="space-y-3">
              <StatusItem
                label="Risk Score"
                passed={status.riskScore <= 30}
                value={`${status.riskScore}/100`}
              />

              <StatusItem
                label="Sanctions Check"
                passed={!status.isSanctioned}
                value={status.isSanctioned ? 'Sanctioned' : 'Clear'}
              />

              <StatusItem
                label="Malicious Connections"
                passed={!status.hasMaliciousConnections}
                value={status.hasMaliciousConnections ? 'Detected' : 'None'}
              />
            </div>

            {status.error && (
              <div className="mt-4 p-3 rounded-lg bg-status-error/10 border border-status-error/30">
                <div className="flex items-center gap-2 text-status-error">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">{status.error}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface StatusItemProps {
  label: string
  passed: boolean
  value: string
}

function StatusItem({ label, passed, value }: StatusItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-background-secondary">
      <div className="flex items-center gap-2">
        {passed ? (
          <CheckCircle className="h-4 w-4 text-status-success" />
        ) : (
          <XCircle className="h-4 w-4 text-status-error" />
        )}
        <span className="text-sm text-white/70">{label}</span>
      </div>
      <span
        className={cn(
          'text-sm font-medium',
          passed ? 'text-status-success' : 'text-status-error'
        )}
      >
        {value}
      </span>
    </div>
  )
}

export default ComplianceStatus
