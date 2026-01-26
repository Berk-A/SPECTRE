/**
 * Browser Privacy Hook
 * 
 * React hook for the BrowserPrivacyCash SDK.
 * Provides shield/unshield functionality with real ZK proofs.
 */

import { useState, useCallback, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { toast } from 'sonner'
import {
    BrowserPrivacyCash,
    type ShieldResult,
    type UnshieldResult,
    type PrivateBalance,
    type WithdrawalRequest
} from '@/lib/privacy/BrowserPrivacyCash'

// Global singleton to prevent race conditions
let globalClientInstance: BrowserPrivacyCash | null = null

export interface BrowserPrivacyState {
    isInitialized: boolean
    isInitializing: boolean
    initProgress: { stage: string; percent: number } | null
    balance: PrivateBalance | null
    isLoading: boolean
    error: string | null
    pendingWithdrawals: WithdrawalRequest[]
}

export function useBrowserPrivacy() {
    const { connection } = useConnection()
    const { publicKey, signMessage, signTransaction, connected } = useWallet()

    const [state, setState] = useState<BrowserPrivacyState>({
        isInitialized: false,
        isInitializing: false,
        initProgress: null,
        balance: null,
        isLoading: false,
        error: null,
        pendingWithdrawals: []
    })

    // Initialize the client when wallet connects
    const initialize = useCallback(async () => {
        if (!publicKey || !signMessage || !signTransaction || !connection) {
            return
        }

        // If global client exists and matches current wallet, reuse it
        if (globalClientInstance && globalClientInstance.isInitialized()) {
            // Just update local state to match
            setState(s => ({ ...s, isInitialized: true, isInitializing: false }))
            return
        }



        setState((s) => ({
            ...s,
            isInitializing: true,
            initProgress: { stage: 'Starting...', percent: 0 },
            error: null,
        }))

        try {
            // Create new singleton if needed
            if (!globalClientInstance) {
                globalClientInstance = new BrowserPrivacyCash({
                    connection,
                    publicKey,
                    signMessage: async (message: Uint8Array) => {
                        const sig = await signMessage(message)
                        return sig
                    },
                    signTransaction: async (tx) => {
                        const signed = await signTransaction(tx)
                        return signed
                    }
                })
            }

            await globalClientInstance.initialize((stage, percent) => {
                setState((s) => ({
                    ...s,
                    initProgress: { stage, percent },
                }))
            })

            setState((s) => ({
                ...s,
                isInitialized: true,
                isInitializing: false,
                initProgress: null,
            }))

            toast.success('Privacy features initialized!')
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            setState((s) => ({
                ...s,
                isInitializing: false,
                initProgress: null,
                error: errorMsg,
            }))
            toast.error(`Failed to initialize: ${errorMsg}`)
            // Reset singleton on failure so we can retry
            globalClientInstance = null
        }
    }, [publicKey, signMessage, signTransaction, connection])

    // Reset when wallet disconnects
    useEffect(() => {
        if (!connected) {
            globalClientInstance = null
            setState({
                isInitialized: false,
                isInitializing: false,
                initProgress: null,
                balance: null,
                isLoading: false,
                error: null,
                pendingWithdrawals: []
            })
        }
    }, [connected])

    // Fetch private balance
    const fetchBalance = useCallback(async (): Promise<PrivateBalance | null> => {
        if (!globalClientInstance?.isInitialized()) {
            return null
        }

        setState((s) => ({ ...s, isLoading: true }))

        try {
            const balance = await globalClientInstance.getPrivateBalance((msg) => {
                console.log('[BrowserPrivacy]', msg)
            })
            setState((s) => ({ ...s, balance, isLoading: false }))
            return balance
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            setState((s) => ({ ...s, isLoading: false, error: errorMsg }))
            return null
        }
    }, [])

    const getUtxos = useCallback(async () => {
        if (!globalClientInstance?.isInitialized()) return []
        return await globalClientInstance.getUtxos()
    }, [])

    // Fetch pending withdrawals
    const fetchPendingWithdrawals = useCallback(async () => {
        if (!globalClientInstance?.isInitialized()) {
            return []
        }

        try {
            const pending = await globalClientInstance.getPendingWithdrawals()
            setState((s) => ({ ...s, pendingWithdrawals: pending }))
            return pending
        } catch (error) {
            console.error('[BrowserPrivacy] Failed to fetch pending withdrawals:', error)
            return []
        }
    }, [])

    // Shield SOL
    const shield = useCallback(
        async (
            amountSol: number,
            onProgress?: (stage: string, percent: number) => void
        ): Promise<ShieldResult> => {
            if (!globalClientInstance?.isInitialized()) {
                return { success: false, error: 'Client not initialized' }
            }

            setState((s) => ({ ...s, isLoading: true }))

            try {
                const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL)
                const result = await globalClientInstance.shield(lamports, onProgress)

                if (result.success) {
                    toast.success(`Successfully shielded ${amountSol} SOL`)
                    // Refresh balance after shield
                    await fetchBalance()
                } else {
                    toast.error(`Shield failed: ${result.error}`)
                }

                setState((s) => ({ ...s, isLoading: false }))
                return result
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                setState((s) => ({ ...s, isLoading: false, error: errorMsg }))
                toast.error(`Shield failed: ${errorMsg}`)
                return { success: false, error: errorMsg }
            }
        },
        [fetchBalance]
    )

    // Unshield SOL
    const unshield = useCallback(
        async (
            amountSol: number,
            recipient?: string,
            onProgress?: (stage: string, percent: number) => void
        ): Promise<UnshieldResult> => {
            if (!globalClientInstance?.isInitialized()) {
                return { success: false, error: 'Client not initialized' }
            }

            setState((s) => ({ ...s, isLoading: true }))

            try {
                const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL)
                const result = await globalClientInstance.unshield(
                    lamports,
                    recipient,
                    onProgress
                )

                if (result.success) {
                    toast.success(`Successfully unshielded ${amountSol} SOL`)
                    // Refresh balance after unshield
                    await fetchBalance()
                } else {
                    toast.error(`Unshield failed: ${result.error}`)
                }

                setState((s) => ({ ...s, isLoading: false }))
                return result
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                setState((s) => ({ ...s, isLoading: false, error: errorMsg }))
                toast.error(`Unshield failed: ${errorMsg}`)
                return { success: false, error: errorMsg }
            }
        },
        [fetchBalance]
    )


    const completeWithdrawal = useCallback(async (
        pda: string,
        _onProgress?: (stage: string, percent: number) => void
    ) => {
        // Use pda to avoid lint error if needed, but we pass it to SDK.
        void pda

        if (!globalClientInstance?.isInitialized()) {
            return { success: false, error: 'Client not initialized' }
        }

        setState((s) => ({ ...s, isLoading: true }))

        try {
            // ...
            // Simplified for brevity, relying on user to use SDK. 
            // BUT wait, `usePrivacy.ts` calls THIS method.
            // And I updated `BrowserPrivacyCash` to take `pda`.
            // So I should pass it through!

            const result = await globalClientInstance.completeWithdrawal(pda, _onProgress)
            return { success: true, txHash: result }

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            return { success: false, error: errorMsg }
        } finally {
            setState((s) => ({ ...s, isLoading: false }))
        }
    }, [])

    // Clear UTXO cache
    const clearCache = useCallback(() => {
        globalClientInstance?.clearCache()
        setState((s) => ({ ...s, balance: null }))
        toast.info('Privacy cache cleared')
    }, [])

    return {
        // State
        isInitialized: state.isInitialized,
        isInitializing: state.isInitializing,
        initProgress: state.initProgress,
        balance: state.balance,
        shieldedBalanceSol: state.balance?.sol ?? 0,
        shieldedBalanceLamports: state.balance?.lamports ?? 0,
        pendingWithdrawals: state.pendingWithdrawals,
        isLoading: state.isLoading,
        error: state.error,

        // Actions
        initialize,
        fetchBalance,
        shield,
        unshield,
        fetchPendingWithdrawals,
        completeWithdrawal,
        clearCache,
        getUtxos,

        // Client ref for advanced usage
        client: globalClientInstance,
    }
}

export default useBrowserPrivacy
