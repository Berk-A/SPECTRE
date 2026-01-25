/**
 * Privacy Hook
 * 
 * Unified hook for privacy features that works in both demo and production modes.
 * Uses BrowserPrivacyCash for real ZK proofs when PRIVACY_DEMO_MODE is false.
 */

import { useState, useCallback, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { usePrivacyStore, type StoredNote } from '@/stores/privacyStore'
import { generateId } from '@/lib/utils'
import { PRIVACY_DEMO_MODE } from '@/lib/config/constants'
import { useBrowserPrivacy } from './useBrowserPrivacy'
import type { WithdrawalRequest } from '@/lib/privacy/BrowserPrivacyCash'

export interface ShieldResult {
  success: boolean
  signature?: string
  note?: StoredNote
  error?: string
}

export interface UnshieldResult {
  success: boolean
  signature?: string
  amountReceived?: number
  error?: string
}

export function usePrivacy() {
  const { connected, publicKey } = useWallet()
  const browserPrivacy = useBrowserPrivacy()

  const {
    notes,
    shieldedBalanceSol: storedBalanceSol,
    shieldedBalanceUsdc,
    isLoading: storeLoading,
    addNote,
    markNoteSpent,
    setShieldedBalance,
    setError,
  } = usePrivacyStore()

  const [shieldLoading, setShieldLoading] = useState(false)
  const [unshieldLoading, setUnshieldLoading] = useState(false)
  const [completeLoading, setCompleteLoading] = useState(false)
  const [initAttempted, setInitAttempted] = useState(false)
  const [demoPendingWithdrawals, setDemoPendingWithdrawals] = useState<WithdrawalRequest[]>([])

  // Auto-initialize browser privacy when wallet connects (if not in demo mode)
  useEffect(() => {
    if (!PRIVACY_DEMO_MODE && connected && publicKey && !browserPrivacy.isInitialized && !browserPrivacy.isInitializing && !initAttempted) {
      setInitAttempted(true)
      browserPrivacy.initialize()
    }
  }, [connected, publicKey, browserPrivacy, initAttempted])

  // Reset init attempted when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setInitAttempted(false)
    }
  }, [connected])

  // Calculate balance from unspent notes (demo mode)
  const calculateBalance = useCallback(() => {
    const unspentNotes = notes.filter((n) => !n.spent)
    const solBalance = unspentNotes
      .filter((n) => n.tokenType === 'SOL')
      .reduce((acc, n) => acc + n.amount, 0)
    const usdcBalance = unspentNotes
      .filter((n) => n.tokenType === 'SPL')
      .reduce((acc, n) => acc + n.amount, 0)

    setShieldedBalance(solBalance, usdcBalance)
    return { solBalance, usdcBalance }
  }, [notes, setShieldedBalance])

  // Shield SOL into privacy pool
  const shieldSol = useCallback(
    async (amountSol: number): Promise<ShieldResult> => {
      if (!connected) {
        return { success: false, error: 'Wallet not connected' }
      }

      setShieldLoading(true)

      try {
        if (PRIVACY_DEMO_MODE) {
          // Demo mode: simulate shield operation
          await new Promise((resolve) => setTimeout(resolve, 2000))

          const note: StoredNote = {
            id: generateId(),
            commitment: `commit_${Date.now()}`,
            amount: amountSol * 1e9,
            tokenType: 'SOL',
            createdAt: new Date().toISOString(),
            spent: false,
            depositSignature: `sig_${Date.now()}`,
          }

          addNote(note)
          calculateBalance()

          toast.success(`Successfully shielded ${amountSol} SOL`)

          return {
            success: true,
            signature: note.depositSignature,
            note,
          }
        }

        // Production: use BrowserPrivacyCash
        if (!browserPrivacy.isInitialized) {
          return { success: false, error: 'Privacy client not initialized. Please sign the initialization message.' }
        }

        const result = await browserPrivacy.shield(amountSol, (stage, percent) => {
          console.log(`[Shield] ${stage}: ${percent}%`)
        })

        if (result.success) {
          // Store note reference in local state
          const storedNote: StoredNote = {
            id: generateId(),
            commitment: `real_${Date.now()}`,
            amount: amountSol * 1e9,
            tokenType: 'SOL',
            createdAt: new Date().toISOString(),
            spent: false,
            depositSignature: result.txHash || 'pending',
          }
          addNote(storedNote)

          return {
            success: true,
            signature: result.txHash,
            note: storedNote,
          }
        }

        return {
          success: false,
          error: result.error || 'Shield operation failed',
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        setError(errorMsg)
        toast.error(`Shield failed: ${errorMsg}`)
        return { success: false, error: errorMsg }
      } finally {
        setShieldLoading(false)
      }
    },
    [connected, browserPrivacy, addNote, calculateBalance, setError]
  )

  // Unshield SOL from privacy pool
  const unshieldSol = useCallback(
    async (amountOrNoteId: string | number, recipientAddress?: string): Promise<UnshieldResult> => {
      if (!connected) {
        return { success: false, error: 'Wallet not connected' }
      }

      setUnshieldLoading(true)

      try {
        if (PRIVACY_DEMO_MODE) {
          // Demo mode: find note by ID and simulate unshield
          const noteId = typeof amountOrNoteId === 'string' ? amountOrNoteId : ''
          const note = notes.find((n) => n.id === noteId)

          if (!note) {
            return { success: false, error: 'Note not found' }
          }

          if (note.spent) {
            return { success: false, error: 'Note already spent' }
          }

          await new Promise((resolve) => setTimeout(resolve, 2000))

          markNoteSpent(noteId)
          calculateBalance()

          const amountSol = note.amount / 1e9
          toast.success(`Successfully unshielded ${amountSol} SOL`)

          return {
            success: true,
            signature: `sig_${Date.now()}`,
            amountReceived: note.amount,
          }
        }

        // Production: use BrowserPrivacyCash
        if (!browserPrivacy.isInitialized) {
          return { success: false, error: 'Privacy client not initialized' }
        }

        const amountSol = typeof amountOrNoteId === 'number' ? amountOrNoteId : 0
        if (amountSol <= 0) {
          return { success: false, error: 'Invalid amount' }
        }

        const result = await browserPrivacy.unshield(amountSol, recipientAddress, (stage, percent) => {
          console.log(`[Unshield] ${stage}: ${percent}%`)
        })

        if (result.success) {
          return {
            success: true,
            signature: result.txHash,
            amountReceived: result.amount,
          }
        }

        return {
          success: false,
          error: result.error || 'Unshield operation failed',
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        setError(errorMsg)
        toast.error(`Unshield failed: ${errorMsg}`)
        return { success: false, error: errorMsg }
      } finally {
        setUnshieldLoading(false)
      }
    },
    [connected, notes, browserPrivacy, markNoteSpent, calculateBalance, setError]
  )

  // Export notes as JSON
  const exportNotes = useCallback(() => {
    const unspentNotes = notes.filter((n) => !n.spent)
    const data = JSON.stringify(unspentNotes, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spectre-notes-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Notes exported successfully')
  }, [notes])

  // Import notes from JSON
  const importNotes = useCallback(
    (jsonString: string) => {
      try {
        const importedNotes = JSON.parse(jsonString) as StoredNote[]
        importedNotes.forEach((note) => {
          if (!notes.some((n) => n.commitment === note.commitment)) {
            addNote(note)
          }
        })
        calculateBalance()
        toast.success(`Imported ${importedNotes.length} notes`)
      } catch {
        toast.error('Failed to import notes: Invalid format')
      }
    },
    [notes, addNote, calculateBalance]
  )


  // Fetch Pending Withdrawals
  const fetchPendingWithdrawals = useCallback(async () => {
    if (PRIVACY_DEMO_MODE) {
      return demoPendingWithdrawals
    }
    return await browserPrivacy.fetchPendingWithdrawals()
  }, [browserPrivacy, demoPendingWithdrawals])

  // Complete Withdrawal
  const completeWithdrawal = useCallback(async (pda: string) => {
    setCompleteLoading(true)
    try {
      if (PRIVACY_DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        setDemoPendingWithdrawals(prev => prev.filter(w => w.pda.toBase58() !== pda))
        // const amount = 1_000_000_000 // 1 SOL
        toast.success(`Successfully claimed 1 SOL`)
        return { success: true, signature: 'demo_sig' }
      } else {
        const result = await browserPrivacy.completeWithdrawal(pda, (stage, percent) => {
          console.log(`[Complete] ${stage}: ${percent}%`)
        })
        if (result.success) {
          toast.success('Withdrawal completed!')
          await fetchPendingWithdrawals()
        } else {
          toast.error(`Claim failed: ${result.error}`)
        }
        return result
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast.error(msg)
      return { success: false, error: msg }
    } finally {
      setCompleteLoading(false)
    }
  }, [browserPrivacy, fetchPendingWithdrawals])

  // Get shielded balance (use browser SDK balance if available)
  const shieldedBalanceSol = PRIVACY_DEMO_MODE
    ? storedBalanceSol / 1e9
    : browserPrivacy.shieldedBalanceSol

  return {
    // State
    notes,
    unspentNotes: notes.filter((n) => !n.spent),
    shieldedBalanceSol,
    shieldedBalanceUsdc: shieldedBalanceUsdc / 1e9,
    isLoading: storeLoading || shieldLoading || unshieldLoading || completeLoading || browserPrivacy.isLoading,
    shieldLoading,
    unshieldLoading,
    completeLoading,
    pendingWithdrawals: PRIVACY_DEMO_MODE ? demoPendingWithdrawals : browserPrivacy.pendingWithdrawals,

    // Privacy client state
    isInitialized: PRIVACY_DEMO_MODE ? true : browserPrivacy.isInitialized,
    isInitializing: browserPrivacy.isInitializing,
    initProgress: browserPrivacy.initProgress,

    // Actions
    initialize: browserPrivacy.initialize,
    shieldSol,
    unshieldSol,
    exportNotes,
    importNotes,
    calculateBalance,
    fetchBalance: browserPrivacy.fetchBalance,
    clearCache: browserPrivacy.clearCache,
    fetchPendingWithdrawals,
    completeWithdrawal,
  }
}

export default usePrivacy
