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
    type WithdrawalRequest
} from '@/lib/privacy/BrowserPrivacyCash'

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

    const clientRef = useRef<BrowserPrivacyCash | null>(null)

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
                pendingWithdrawals: []
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

    // Fetch pending withdrawals
    const fetchPendingWithdrawals = useCallback(async () => {
        if (!clientRef.current?.isInitialized()) {
            return []
        }

        try {
            const pending = await clientRef.current.getPendingWithdrawals()
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


    const completeWithdrawal = useCallback(async (
        pda: string,
        _onProgress?: (stage: string, percent: number) => void
    ) => {
        // Use pda to avoid lint error if needed, but we pass it to SDK.
        void pda

        if (!clientRef.current?.isInitialized()) {
            return { success: false, error: 'Client not initialized' }
        }

        setState((s) => ({ ...s, isLoading: true }))

        try {
            // Find withdrawal request object if needed, or reconstruct dummy for params
            // Wait, completeWithdrawal in SDK takes `BrowserUtxo`? No.
            // Let's check SDK signature.
            // async completeWithdrawal(utxo: BrowserUtxo, ...)
            // Ah, I need to pass the UTXO to derive the PDAs again!
            // But I don't have the UTXO easily available from the WithdrawalRequest account on chain...
            // The WithdrawalRequest account has `userDeposit` key.
            // I need to know which UTXO corresponds to that UserDeposit.
            // UserDeposit PDA = [USER_DEPOSIT_SEED, Vault, Commitment].
            // So if I have the UserDeposit PDA from the WithdrawalRequest, I can't reverse it to get Commitment easily unless I iterate my notes.

            // STRATEGY: 
            // 1. Fetch all pending withdrawals.
            // 2. For each, getting `userDeposit` pubkey.
            // 3. Match `userDeposit` pubkey against my local notes (derived PDAs).
            // 4. Pass the matching Note/UTXO to `completeWithdrawal`.

            // This requires `usePrivacy` layer to handle the matching, as `useBrowserPrivacy` doesn't know about "Notes".
            // So here I just expose a method that takes a UTXO (or similar) or just expose the raw client method.

            // Actually, for now, let's expose a generic method that takes a BrowserUtxo.
            // Since `usePrivacy` interacts with `BrowserUtxo` (it constructs them or has notes).

            // Wait, `usePrivacy` uses `StoredNote`.
            // I need a way to convert `StoredNote` -> `BrowserUtxo`.
            // BrowserPrivacyCash has helpers? No.
            // I can construct a BrowserUtxo from a StoredNote if I have the keypair (from wallet signature).
            // This is getting complicated.

            // SIMPLIFICATION:
            // `completeWithdrawal` in SDK recalculates PDAs. 
            // If I change SDK `completeWithdrawal` to take `WithdrawalRequest` account data (specifically user_deposit PDA and withdrawal_request PDA), I might avoid needed the UTXO *if* the instruction doesn't need commitment?
            // The instruction is:
            // seeds = [WITHDRAWAL_SEED, vault, requester, user_deposit]
            // We HAVE `user_deposit` from the chain account!
            // We HAVE `requester` (us).
            // We HAVE `vault`.
            // So we can derive `withdrawal_request` PDA without the UTXO commitment!
            // BUT, does `complete_withdrawal` instruction require `user_deposit` seeds validation?
            // #[account(mut, seeds = [DEPOSIT_SEED ... commitment], bump)] pub user_deposit: Account<'info, UserDeposit>
            // YES. Anchor verifies seeds. I NEED the commitment to derive `user_deposit` address for the instruction call? 
            // No, I pass the address. Anchor verifies it matches the seeds.
            // If I pass the address, Anchor calculates the seeds on-chain to verify.
            // So on-chain, Anchor needs `commitment`. Where does it get it?
            // It gets it from `user_deposit.commitment` (the account data)!
            // `seeds = [..., user_deposit.commitment]`.
            // So I DON'T need to pass commitment from client if Anchor can read it from the account passed in?
            // PROBABLY!
            // Let's check lib.rs: `seeds = [..., &user_deposit.commitment]`.
            // Yes! It reads from the account.
            // So as long as I pass the correct `user_deposit` Pubkey, the client doesn't need to know the commitment?
            // Wait, client logic:
            // `const [userDepositPDA] = PublicKey.findProgramAddressSync(...)`
            // If I already have the `userDepositPDA` from the `WithdrawalRequest` account (fetched from chain), I can just use it!
            // I don't need to re-derive it!

            // SO: modifying `completeWithdrawal` in SDK to accept `WithdrawalRequest` object (or just keys) is better.

            // BUT for this step, I am in `useBrowserPrivacy.ts`.
            // I will assume `client.completeWithdrawal` will be updated or I will wrap it.
            // Let's just expose a method `completeWithdrawal` that takes `withdrawalRequest` and `userDeposit`.

            // For now, I'll pass `any` or high level args and let `usePrivacy` handle it.
            // But wait, `useBrowserPrivacy` wraps `BrowserPrivacyCash`.
            // Let's postpone this implementation detail to `usePrivacy.ts` or fix SDK first?
            // I should FIX SDK `completeWithdrawal` to take `WithdrawalRequest` input instead of `UTXO`.

            // Let's do that in the NEXT step. For now, I will add the skeleton here.
            return { success: false, error: 'Not implemented' }
        } catch (error) {
            return { success: false, error: 'Failed' }
        }
    }, [])

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

        // Client ref for advanced usage
        client: clientRef.current,
    }
}

export default useBrowserPrivacy
