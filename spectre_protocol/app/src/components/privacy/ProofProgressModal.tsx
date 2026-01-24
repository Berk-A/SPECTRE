/**
 * Proof Progress Modal
 * Shows detailed progress during ZK proof generation
 */

import { type ShieldProgress, type UnshieldProgress } from '@/lib/privacy/BrowserPrivacyClient'

interface ProofProgressModalProps {
  isOpen: boolean
  progress: ShieldProgress | UnshieldProgress | null
  type: 'shield' | 'unshield'
  amount?: number
  onCancel?: () => void
}

const SHIELD_STAGES = [
  { key: 'circuits', label: 'Loading Circuits', icon: '📦' },
  { key: 'note', label: 'Generating Note', icon: '🔐' },
  { key: 'proof', label: 'Computing ZK Proof', icon: '⚡' },
  { key: 'signing', label: 'Sign Transaction', icon: '✍️' },
  { key: 'submitting', label: 'Submitting', icon: '📤' },
  { key: 'confirming', label: 'Confirming', icon: '⏳' },
  { key: 'done', label: 'Complete', icon: '✅' },
]

const UNSHIELD_STAGES = [
  { key: 'loading', label: 'Loading Data', icon: '📦' },
  { key: 'merkle', label: 'Fetching Proof', icon: '🌳' },
  { key: 'proof', label: 'Computing ZK Proof', icon: '⚡' },
  { key: 'signing', label: 'Sign Transaction', icon: '✍️' },
  { key: 'submitting', label: 'Submitting', icon: '📤' },
  { key: 'confirming', label: 'Confirming', icon: '⏳' },
  { key: 'done', label: 'Complete', icon: '✅' },
]

export function ProofProgressModal({
  isOpen,
  progress,
  type,
  amount,
  onCancel,
}: ProofProgressModalProps) {
  if (!isOpen) return null

  const stages = type === 'shield' ? SHIELD_STAGES : UNSHIELD_STAGES
  const currentStageIndex = progress
    ? stages.findIndex(s => s.key === progress.stage)
    : 0

  const isProofStage = progress?.stage === 'proof'
  const isDone = progress?.stage === 'done'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-surface border border-white/10 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-text-primary mb-1">
            {type === 'shield' ? 'Shielding' : 'Unshielding'} {amount} SOL
          </h2>
          <p className="text-text-secondary text-sm">
            {isDone
              ? 'Transaction complete!'
              : isProofStage
              ? 'Generating zero-knowledge proof...'
              : 'Please wait...'}
          </p>
        </div>

        {/* Progress stages */}
        <div className="space-y-3 mb-6">
          {stages.map((stage, index) => {
            const isComplete = index < currentStageIndex
            const isCurrent = index === currentStageIndex
            // Note: isPending would be: index > currentStageIndex

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  isCurrent
                    ? 'bg-primary/20 border border-primary/30'
                    : isComplete
                    ? 'bg-status-success/10 border border-transparent'
                    : 'bg-white/5 border border-transparent opacity-50'
                }`}
              >
                {/* Icon */}
                <div className={`text-xl ${isCurrent ? 'animate-pulse' : ''}`}>
                  {isComplete ? '✅' : stage.icon}
                </div>

                {/* Label */}
                <div className="flex-1">
                  <span
                    className={`font-medium ${
                      isCurrent
                        ? 'text-primary-light'
                        : isComplete
                        ? 'text-status-success'
                        : 'text-text-muted'
                    }`}
                  >
                    {stage.label}
                  </span>

                  {/* Show extra info for proof stage */}
                  {isCurrent && isProofStage && (
                    <p className="text-xs text-text-secondary mt-1">
                      This may take 15-30 seconds
                    </p>
                  )}
                </div>

                {/* Status indicator */}
                <div>
                  {isCurrent && !isDone && (
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  )}
                  {isComplete && (
                    <svg
                      className="w-5 h-5 text-status-success"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        {progress && !isDone && (
          <div className="mb-4">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            <p className="text-center text-text-muted text-xs mt-2">
              {progress.message}
            </p>
          </div>
        )}

        {/* Info box for proof stage */}
        {isProofStage && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4">
            <p className="text-primary-light text-sm">
              🔒 Your privacy is being protected with advanced cryptography.
              The proof is generated entirely on your device.
            </p>
          </div>
        )}

        {/* Cancel button (only shown during processing, not during signing) */}
        {!isDone && progress?.stage !== 'signing' && onCancel && (
          <button
            onClick={onCancel}
            className="w-full py-2 text-text-secondary hover:text-text-primary text-sm transition-colors"
          >
            Cancel
          </button>
        )}

        {/* Done message */}
        {isDone && (
          <div className="text-center">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-status-success font-medium">
              {type === 'shield' ? 'SOL shielded successfully!' : 'SOL unshielded successfully!'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ProofProgressModal
