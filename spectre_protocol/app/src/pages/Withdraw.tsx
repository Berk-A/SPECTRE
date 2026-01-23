import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownToLine, Shield, CheckCircle, AlertTriangle } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Badge } from '@/components/ui'
import { ComplianceStatus } from '@/components/compliance'
import { usePrivacy } from '@/hooks/usePrivacy'
import { useCompliance } from '@/hooks/useCompliance'
import { formatSol, cn } from '@/lib/utils'

export function Withdraw() {
  const { unspentNotes, unshieldSol, unshieldLoading } = usePrivacy()
  const { status: complianceStatus, checkCompliance, isChecking } = useCompliance()
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [recipientAddress, setRecipientAddress] = useState('')
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const selectedNote = unspentNotes.find((n) => n.id === selectedNoteId)

  const handleComplianceCheck = async () => {
    const result = await checkCompliance()
    if (result.passed) {
      setStep(2)
    }
  }

  const handleWithdraw = async () => {
    if (!selectedNoteId || !recipientAddress) return

    const result = await unshieldSol(selectedNoteId, recipientAddress)
    if (result.success) {
      setStep(3)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-status-warning/10">
            <ArrowDownToLine className="h-6 w-6 text-status-warning" />
          </div>
          <h1 className="text-2xl font-bold">Compliant Withdrawal</h1>
        </div>
        <p className="text-white/60">
          Withdraw funds with Range Protocol compliance verification
        </p>
      </motion.div>

      {/* Progress steps */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-4"
      >
        <div className="flex items-center justify-between">
          {[
            { num: 1, label: 'Compliance Check' },
            { num: 2, label: 'Select Note' },
            { num: 3, label: 'Withdraw' },
          ].map(({ num, label }, i) => (
            <div key={num} className="flex items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  step >= num
                    ? 'bg-neon-cyan text-background'
                    : 'bg-white/10 text-white/40'
                )}
              >
                {step > num ? <CheckCircle className="h-4 w-4" /> : num}
              </div>
              <span
                className={cn(
                  'ml-2 text-sm hidden sm:block',
                  step >= num ? 'text-white' : 'text-white/40'
                )}
              >
                {label}
              </span>
              {i < 2 && (
                <div
                  className={cn(
                    'h-px w-8 sm:w-16 mx-4',
                    step > num ? 'bg-neon-cyan' : 'bg-white/10'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Main content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column - steps */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Step 1: Compliance */}
          {step === 1 && (
            <Card variant="glow-cyan">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-neon-cyan" />
                  Step 1: Compliance Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-white/60">
                  Before withdrawing, your wallet must pass compliance checks via
                  Range Protocol. This ensures regulatory compliance.
                </p>

                <div className="p-3 rounded-lg bg-neon-cyan/5 border border-neon-cyan/20">
                  <h4 className="text-sm font-medium mb-2">Checks Include:</h4>
                  <ul className="text-xs text-white/60 space-y-1">
                    <li>- Risk score assessment (max score: 30)</li>
                    <li>- OFAC sanctions list check</li>
                    <li>- Malicious address connections</li>
                  </ul>
                </div>

                <Button
                  className="w-full"
                  variant="primary"
                  onClick={handleComplianceCheck}
                  loading={isChecking}
                >
                  {isChecking ? 'Checking Compliance...' : 'Check Compliance'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Select Note */}
          {step === 2 && (
            <Card variant="glow-purple">
              <CardHeader>
                <CardTitle>Step 2: Select Deposit Note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {unspentNotes.length === 0 ? (
                  <div className="text-center py-8 text-white/50">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No unspent notes available</p>
                    <p className="text-sm">Shield some SOL first</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {unspentNotes.map((note) => (
                      <button
                        key={note.id}
                        onClick={() => setSelectedNoteId(note.id)}
                        className={cn(
                          'w-full p-3 rounded-lg border text-left transition-all',
                          selectedNoteId === note.id
                            ? 'border-neon-purple bg-neon-purple/10'
                            : 'border-glass-border hover:border-neon-purple/30'
                        )}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-mono">
                            {formatSol(note.amount)} {note.tokenType}
                          </span>
                          <Badge variant={selectedNoteId === note.id ? 'secondary' : 'outline'}>
                            {selectedNoteId === note.id ? 'Selected' : 'Select'}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <Input
                  label="Recipient Address"
                  placeholder="Enter Solana address..."
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                />

                <Button
                  className="w-full"
                  variant="primary"
                  onClick={handleWithdraw}
                  disabled={!selectedNoteId || !recipientAddress || unshieldLoading}
                  loading={unshieldLoading}
                >
                  {unshieldLoading
                    ? 'Processing Withdrawal...'
                    : `Withdraw ${selectedNote ? formatSol(selectedNote.amount) + ' SOL' : ''}`}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <Card variant="glow-green">
              <CardContent className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.5 }}
                >
                  <CheckCircle className="h-16 w-16 text-status-success mx-auto mb-4" />
                </motion.div>
                <h3 className="text-xl font-semibold mb-2">
                  Withdrawal Complete!
                </h3>
                <p className="text-white/60 mb-6">
                  Your funds have been successfully withdrawn with compliance
                  attestation.
                </p>
                <Button onClick={() => setStep(1)}>Start New Withdrawal</Button>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Right column - compliance status */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <ComplianceStatus />
        </motion.div>
      </div>

      {/* Info section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6"
      >
        <h3 className="text-lg font-semibold mb-4">
          About Compliant Withdrawals
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="text-sm font-medium text-neon-cyan">
              Range Protocol Integration
            </div>
            <p className="text-sm text-white/50">
              Range Protocol provides real-time risk assessment and compliance
              verification for Solana wallets. This ensures SPECTRE users can
              withdraw while maintaining regulatory compliance.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-neon-purple">
              On-Chain Attestation
            </div>
            <p className="text-sm text-white/50">
              Compliance checks create an on-chain attestation that proves the
              withdrawal passed all requirements at the time of execution.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default Withdraw
