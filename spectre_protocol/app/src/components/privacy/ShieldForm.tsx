import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Shield, AlertTriangle } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input } from '@/components/ui'
import { usePrivacy } from '@/hooks/usePrivacy'
import { formatSol } from '@/lib/utils'
import { MIN_DEPOSIT_SOL, MAX_DEPOSIT_SOL } from '@/lib/config/constants'

export function ShieldForm() {
  const { connected } = useWallet()
  const { shieldSol, shieldLoading } = usePrivacy()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmount(value)
    setError('')

    const num = parseFloat(value)
    if (isNaN(num)) return

    if (num < MIN_DEPOSIT_SOL) {
      setError(`Minimum deposit is ${MIN_DEPOSIT_SOL} SOL`)
    } else if (num > MAX_DEPOSIT_SOL) {
      setError(`Maximum deposit is ${MAX_DEPOSIT_SOL} SOL`)
    }
  }

  const handleShield = async () => {
    const num = parseFloat(amount)
    if (isNaN(num) || num < MIN_DEPOSIT_SOL || num > MAX_DEPOSIT_SOL) {
      return
    }

    const result = await shieldSol(num)
    if (result.success) {
      setAmount('')
    }
  }

  const presetAmounts = [0.1, 0.5, 1, 5]

  return (
    <Card variant="glow-cyan">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-neon-cyan" />
          Shield SOL
        </CardTitle>
        <CardDescription>
          Deposit SOL into the privacy pool to break the on-chain link
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Input
          label="Amount (SOL)"
          type="number"
          placeholder="0.0"
          value={amount}
          onChange={handleAmountChange}
          error={error}
          disabled={!connected || shieldLoading}
        />

        <div className="flex gap-2">
          {presetAmounts.map((preset) => (
            <Button
              key={preset}
              variant="ghost"
              size="sm"
              onClick={() => {
                setAmount(preset.toString())
                setError('')
              }}
              disabled={!connected || shieldLoading}
            >
              {preset} SOL
            </Button>
          ))}
        </div>

        <div className="p-3 rounded-lg bg-status-warning/10 border border-status-warning/30">
          <div className="flex gap-2">
            <AlertTriangle className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />
            <div className="text-xs text-white/70">
              <p className="font-medium text-status-warning mb-1">Important</p>
              <p>
                You will receive a deposit note. Save it securely - it's required to
                withdraw your funds. Lost notes mean lost funds!
              </p>
            </div>
          </div>
        </div>

        <Button
          className="w-full"
          variant="primary"
          onClick={handleShield}
          disabled={!connected || shieldLoading || !amount || !!error}
          loading={shieldLoading}
        >
          {!connected
            ? 'Connect Wallet'
            : shieldLoading
            ? 'Shielding...'
            : `Shield ${amount || '0'} SOL`}
        </Button>
      </CardContent>
    </Card>
  )
}

export default ShieldForm
