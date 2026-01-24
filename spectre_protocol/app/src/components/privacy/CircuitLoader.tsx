/**
 * Circuit Loader Component
 * Shows progress while downloading ZK circuit files
 */

import { useEffect, useState } from 'react'
import { type LoadProgress } from '@/lib/privacy/circuitLoader'
import useSpectreClient from '@/hooks/useSpectreClient'

interface CircuitLoaderProps {
  onComplete?: () => void
  autoLoad?: boolean
  showOnlyWhenLoading?: boolean
}

export function CircuitLoader({
  onComplete,
  autoLoad = true,
  showOnlyWhenLoading = false,
}: CircuitLoaderProps) {
  const { circuitsLoaded, preloadCircuits } = useSpectreClient()
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (autoLoad && !circuitsLoaded && !isLoading) {
      loadCircuits()
    }
  }, [autoLoad, circuitsLoaded])

  const loadCircuits = async () => {
    if (circuitsLoaded || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      await preloadCircuits((p) => {
        setProgress(p)
      })
      onComplete?.()
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to load circuits'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Don't render if already loaded and showOnlyWhenLoading is true
  if (showOnlyWhenLoading && circuitsLoaded) {
    return null
  }

  // Already loaded
  if (circuitsLoaded) {
    return (
      <div className="flex items-center gap-2 text-status-success text-sm">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span>ZK circuits ready</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">Failed to load circuits</span>
        </div>
        <p className="text-red-400/70 text-sm mb-3">{error}</p>
        <button
          onClick={loadCircuits}
          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  // Loading state
  if (isLoading && progress) {
    return (
      <div className="bg-surface-light/50 border border-primary/20 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-primary-light font-medium">Loading ZK Circuits</span>
          <span className="text-text-secondary text-sm">{progress.progress}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-surface rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
            style={{ width: `${progress.progress}%` }}
          />
        </div>

        {/* Status message */}
        <p className="text-text-secondary text-sm">{progress.message}</p>

        {/* Size info on first download */}
        {progress.stage === 'downloading' && (
          <p className="text-text-muted text-xs mt-2">
            First time only • {formatBytes(progress.bytesLoaded)} / {formatBytes(progress.totalBytes)}
          </p>
        )}
      </div>
    )
  }

  // Initial state - not started
  return (
    <div className="bg-surface-light/50 border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-primary font-medium">ZK Circuits Required</p>
          <p className="text-text-secondary text-sm">~19 MB download (cached after first use)</p>
        </div>
        <button
          onClick={loadCircuits}
          className="px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary-light rounded-lg text-sm transition-colors"
        >
          Load Now
        </button>
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default CircuitLoader
