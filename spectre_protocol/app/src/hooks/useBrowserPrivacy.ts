/**
 * Browser Privacy Hook
 * 
 * React hook for the BrowserPrivacyCash SDK.
 * Provides shield/unshield functionality with real ZK proofs.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { toast } from 'sonner'
import {
    BrowserPrivacyCash,
    type ShieldResult,
    type UnshieldResult,
    type PrivateBalance,
} from '@/lib/privacy/BrowserPrivacyCash'

export interface BrowserPrivacyState {
    isInitialized: boolean
    isInitializing: boolean
    initProgress: { stage: string; percent: number } | null
    balance: PrivateBalance | null
    isLoading: boolean
    error: string | null
}

export function useBrowserPrivacy() {
    const { connection } = useConnection()
    const { publicKey, signMessage, signTransaction, connected } = useWallet()

    const clientRef = useRef<BrowserPrivacyCash | null>(null)

    const [state, setState] = useState<BrowserPrivacyState>({
        isInitialized: false,
        isInitializing: false,
        initProgress: null,
        balance: null,
        isLoading: false,
        error: null,
    })

    // Initialize the client when wallet connects
    const initialize = useCallback(async () => {
        if (!publicKey || !signMessage || !signTransaction || !connection) {
            return
        }

        // Don't re-initialize if already initialized with same wallet
        if (clientRef.current?.isInitialized()) {
            return
        }

        setState((s) => ({
            ...s,
            isInitializing: true,
            initProgress: { stage: 'Starting...', percent: 0 },
            error: null,
        }))

        try {
            const client = new BrowserPrivacyCash({
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

            await client.initialize((stage, percent) => {
                setState((s) => ({
                    ...s,
                    initProgress: { stage, percent },
                }))
            })

            clientRef.current = client

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
        }
    }, [publicKey, signMessage, signTransaction, connection])

    // Reset when wallet disconnects
    useEffect(() => {
        if (!connected) {
            clientRef.current = null
            setState({
                isInitialized: false,
                isInitializing: false,
                initProgress: null,
                balance: null,
                isLoading: false,
                error: null,
            })
        }
    }, [connected])

    // Fetch private balance
    const fetchBalance = useCallback(async (): Promise<PrivateBalance | null> => {
        if (!clientRef.current?.isInitialized()) {
            return null
        }

        setState((s) => ({ ...s, isLoading: true }))

        try {
            const balance = await clientRef.current.getPrivateBalance((msg) => {
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

    // Shield SOL
    const shield = useCallback(
        async (
            amountSol: number,
            onProgress?: (stage: string, percent: number) => void
        ): Promise<ShieldResult> => {
            if (!clientRef.current?.isInitialized()) {
                return { success: false, error: 'Client not initialized' }
            }

            setState((s) => ({ ...s, isLoading: true }))

            try {
                const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL)
                const result = await clientRef.current.shield(lamports, onProgress)

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
            if (!clientRef.current?.isInitialized()) {
                return { success: false, error: 'Client not initialized' }
            }

            setState((s) => ({ ...s, isLoading: true }))

            try {
                const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL)
                const result = await clientRef.current.unshield(
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

    // Clear UTXO cache
    const clearCache = useCallback(() => {
        clientRef.current?.clearCache()
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
        isLoading: state.isLoading,
        error: state.error,

        // Actions
        initialize,
        fetchBalance,
        shield,
        unshield,
        clearCache,

        // Client ref for advanced usage
        client: clientRef.current,
    }
}

export default useBrowserPrivacy
