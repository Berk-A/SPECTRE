import { useState, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { toast } from 'sonner'
import { usePrivacyStore, type StoredNote } from '@/stores/privacyStore'
import { useSpectreClient } from './useSpectreClient'
import { generateId } from '@/lib/utils'
import { DEMO_MODE } from '@/lib/config/constants'

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
  const { privacyClient } = useSpectreClient()
  const {
    notes,
    shieldedBalanceSol,
    shieldedBalanceUsdc,
    isLoading,
    addNote,
    markNoteSpent,
    setShieldedBalance,
    setLoading,
    setError,
  } = usePrivacyStore()

  const [shieldLoading, setShieldLoading] = useState(false)
  const [unshieldLoading, setUnshieldLoading] = useState(false)

  // Calculate balance from unspent notes
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
        if (DEMO_MODE) {
          // Simulate shield operation
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

        // Production: use actual SDK
        const result = await privacyClient.shieldSol(amountSol)

        if (result.success && result.note) {
          const storedNote: StoredNote = {
            id: generateId(),
            commitment: Buffer.from(result.note.commitment).toString('hex'),
            amount: result.note.amount,
            tokenType: result.note.tokenType,
            createdAt: result.note.createdAt.toISOString(),
            spent: false,
            depositSignature: result.signature,
          }

          addNote(storedNote)
          calculateBalance()

          toast.success(`Successfully shielded ${amountSol} SOL`)

          return {
            success: true,
            signature: result.signature,
            note: storedNote,
          }
        }

        return {
          success: false,
          error: result.error || 'Shield operation failed',
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error'
        setError(errorMsg)
        toast.error(`Shield failed: ${errorMsg}`)
        return { success: false, error: errorMsg }
      } finally {
        setShieldLoading(false)
      }
    },
    [connected, privacyClient, addNote, calculateBalance, setError]
  )

  // Unshield SOL from privacy pool
  const unshieldSol = useCallback(
    async (noteId: string, recipientAddress: string): Promise<UnshieldResult> => {
      if (!connected) {
        return { success: false, error: 'Wallet not connected' }
      }

      const note = notes.find((n) => n.id === noteId)
      if (!note) {
        return { success: false, error: 'Note not found' }
      }

      if (note.spent) {
        return { success: false, error: 'Note already spent' }
      }

      setUnshieldLoading(true)

      try {
        if (DEMO_MODE) {
          // Simulate unshield operation
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

        // Production: use actual SDK
        // Would need to deserialize the note and call the SDK
        return {
          success: false,
          error: 'Production unshield not implemented',
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error'
        setError(errorMsg)
        toast.error(`Unshield failed: ${errorMsg}`)
        return { success: false, error: errorMsg }
      } finally {
        setUnshieldLoading(false)
      }
    },
    [connected, notes, markNoteSpent, calculateBalance, setError]
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
      } catch (error) {
        toast.error('Failed to import notes: Invalid format')
      }
    },
    [notes, addNote, calculateBalance]
  )

  return {
    // State
    notes,
    unspentNotes: notes.filter((n) => !n.spent),
    shieldedBalanceSol,
    shieldedBalanceUsdc,
    isLoading: isLoading || shieldLoading || unshieldLoading,
    shieldLoading,
    unshieldLoading,

    // Actions
    shieldSol,
    unshieldSol,
    exportNotes,
    importNotes,
    calculateBalance,
  }
}

export default usePrivacy
