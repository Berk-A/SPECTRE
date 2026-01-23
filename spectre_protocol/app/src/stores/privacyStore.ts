import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface StoredNote {
  id: string
  commitment: string
  amount: number
  tokenType: 'SOL' | 'SPL'
  tokenMint?: string
  createdAt: string
  spent: boolean
  depositSignature?: string
  encrypted?: boolean
}

interface PrivacyState {
  notes: StoredNote[]
  shieldedBalanceSol: number
  shieldedBalanceUsdc: number
  isLoading: boolean
  error: string | null

  // Actions
  addNote: (note: StoredNote) => void
  removeNote: (id: string) => void
  markNoteSpent: (id: string) => void
  setNotes: (notes: StoredNote[]) => void
  setShieldedBalance: (sol: number, usdc: number) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearNotes: () => void
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      notes: [],
      shieldedBalanceSol: 0,
      shieldedBalanceUsdc: 0,
      isLoading: false,
      error: null,

      addNote: (note) =>
        set((state) => ({
          notes: [...state.notes, note],
        })),

      removeNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
        })),

      markNoteSpent: (id) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, spent: true } : n
          ),
        })),

      setNotes: (notes) => set({ notes }),

      setShieldedBalance: (sol, usdc) =>
        set({
          shieldedBalanceSol: sol,
          shieldedBalanceUsdc: usdc,
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      clearNotes: () => set({ notes: [] }),
    }),
    {
      name: 'spectre-privacy-store',
      partialize: (state) => ({
        notes: state.notes,
      }),
    }
  )
)
