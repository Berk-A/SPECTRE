/**
 * SPECTRE Trade Client
 *
 * On-chain trading client for SPECTRE Protocol.
 * Handles position management via open_position and close_position instructions.
 *
 * Note: Market data (prices, names) are mocked in the frontend.
 * Positions are recorded on-chain for verifiability.
 */

import {
    Connection,
    PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import BN from 'bn.js'
import {
    SPECTRE_PROGRAM_ID,
    VAULT_SEED,
    POSITION_SEED,
    OPEN_POSITION_IX_DISCRIMINATOR,
    CLOSE_POSITION_IX_DISCRIMINATOR,
    POSITION_ACCOUNT_DISCRIMINATOR,
    PRICE_SCALE,
} from '@/lib/config/constants'

// Trade side enum matching the program
export type TradeSide = 'yes' | 'no'

// Position status enum
export type PositionStatus = 'open' | 'closed' | 'liquidated'

// On-chain position interface
export interface OnChainPosition {
    pda: string
    vault: string
    marketId: string
    side: TradeSide
    shares: number  // Raw share count (scaled)
    entryPrice: number  // Price in lamports per share (scaled by PRICE_SCALE)
    investedAmount: number  // Amount in lamports
    status: PositionStatus
    openedAt: number  // Unix timestamp
    closedAt: number  // Unix timestamp (0 if open)
    exitPrice: number  // Price at close (0 if open)
    realizedPnl: number  // PnL in lamports (0 if open)
}

// Trade execution result
export interface TradeResult {
    success: boolean
    signature?: string
    positionPda?: string
    error?: string
}

// Close position result
export interface ClosePositionResult {
    success: boolean
    signature?: string
    pnl?: number  // Realized PnL in lamports
    error?: string
}

// Sign transaction function type
export interface SignTransactionFn {
    (transaction: VersionedTransaction): Promise<VersionedTransaction>
}

/**
 * SPECTRE Trade Client
 *
 * Manages on-chain trading positions for the SPECTRE protocol.
 */
export class SpectreTradeClient {
    private connection: Connection
    private publicKey: PublicKey
    private signTransaction: SignTransactionFn

    constructor(options: {
        connection: Connection
        publicKey: PublicKey
        signTransaction: SignTransactionFn
    }) {
        this.connection = options.connection
        this.publicKey = options.publicKey
        this.signTransaction = options.signTransaction
    }

    /**
     * Derive the vault PDA for the current user
     */
    private getVaultPda(): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_SEED), this.publicKey.toBuffer()],
            SPECTRE_PROGRAM_ID
        )
    }

    /**
     * Derive the position PDA for a given market
     */
    private getPositionPda(vaultPda: PublicKey, marketId: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from(POSITION_SEED), vaultPda.toBuffer(), marketId.toBuffer()],
            SPECTRE_PROGRAM_ID
        )
    }

    /**
     * Open a new position on a market
     *
     * @param marketId - The market's public key (can be mock)
     * @param side - 'yes' or 'no'
     * @param amountLamports - Amount to invest in lamports
     * @param price - Current market price (0-1, will be scaled)
     */
    async openPosition(
        marketId: PublicKey | string,
        side: TradeSide,
        amountLamports: number,
        price: number
    ): Promise<TradeResult> {
        try {
            const marketPubkey = typeof marketId === 'string' ? new PublicKey(marketId) : marketId
            const [vaultPda] = this.getVaultPda()
            const [positionPda] = this.getPositionPda(vaultPda, marketPubkey)

            // Calculate shares based on price
            // shares = amount / price (where price is 0-1)
            // Scale price to PRICE_SCALE
            const scaledPrice = Math.floor(price * PRICE_SCALE)
            const shares = Math.floor((amountLamports * PRICE_SCALE) / scaledPrice)

            console.log(`[SpectreTradeClient] Opening position:`)
            console.log(`  Market: ${marketPubkey.toBase58()}`)
            console.log(`  Side: ${side}`)
            console.log(`  Amount: ${amountLamports} lamports (${amountLamports / LAMPORTS_PER_SOL} SOL)`)
            console.log(`  Price: ${price} (scaled: ${scaledPrice})`)
            console.log(`  Shares: ${shares}`)
            console.log(`  Position PDA: ${positionPda.toBase58()}`)

            // Build instruction data
            // open_position(market_id, side, shares, entry_price, invested_amount)
            const sideValue = side === 'yes' ? 0 : 1

            const instructionData = Buffer.concat([
                OPEN_POSITION_IX_DISCRIMINATOR,
                marketPubkey.toBuffer(),  // market_id: Pubkey (32 bytes)
                Buffer.from([sideValue]),  // side: TradeSide (1 byte)
                new BN(shares).toArrayLike(Buffer, 'le', 8),  // shares: u64 (8 bytes)
                new BN(scaledPrice).toArrayLike(Buffer, 'le', 8),  // entry_price: u64 (8 bytes)
                new BN(amountLamports).toArrayLike(Buffer, 'le', 8),  // invested_amount: u64 (8 bytes)
            ])

            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: this.publicKey, isSigner: true, isWritable: true },  // authority
                    { pubkey: vaultPda, isSigner: false, isWritable: true },  // vault
                    { pubkey: positionPda, isSigner: false, isWritable: true },  // position (init)
                    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },  // system_program
                ],
                programId: SPECTRE_PROGRAM_ID,
                data: instructionData,
            })

            // Build and send transaction
            const recentBlockhash = await this.connection.getLatestBlockhash()
            const messageV0 = new TransactionMessage({
                payerKey: this.publicKey,
                recentBlockhash: recentBlockhash.blockhash,
                instructions: [instruction],
            }).compileToV0Message()

            const transaction = new VersionedTransaction(messageV0)
            const signedTx = await this.signTransaction(transaction)
            const signature = await this.connection.sendTransaction(signedTx)

            console.log(`[SpectreTradeClient] Position opened: https://explorer.solana.com/tx/${signature}?cluster=devnet`)

            await this.connection.confirmTransaction({
                signature,
                blockhash: recentBlockhash.blockhash,
                lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
            })

            return {
                success: true,
                signature,
                positionPda: positionPda.toBase58(),
            }
        } catch (error) {
            console.error('[SpectreTradeClient] Failed to open position:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Close an existing position
     *
     * @param marketId - The market's public key
     * @param exitPrice - Current market price (0-1, will be scaled)
     */
    async closePosition(
        marketId: PublicKey | string,
        exitPrice: number
    ): Promise<ClosePositionResult> {
        try {
            const marketPubkey = typeof marketId === 'string' ? new PublicKey(marketId) : marketId
            const [vaultPda] = this.getVaultPda()
            const [positionPda] = this.getPositionPda(vaultPda, marketPubkey)

            const scaledExitPrice = Math.floor(exitPrice * PRICE_SCALE)

            console.log(`[SpectreTradeClient] Closing position:`)
            console.log(`  Position PDA: ${positionPda.toBase58()}`)
            console.log(`  Exit Price: ${exitPrice} (scaled: ${scaledExitPrice})`)

            // Build instruction data
            // close_position(exit_price)
            const instructionData = Buffer.concat([
                CLOSE_POSITION_IX_DISCRIMINATOR,
                new BN(scaledExitPrice).toArrayLike(Buffer, 'le', 8),  // exit_price: u64 (8 bytes)
            ])

            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: this.publicKey, isSigner: true, isWritable: true },  // authority
                    { pubkey: vaultPda, isSigner: false, isWritable: true },  // vault
                    { pubkey: positionPda, isSigner: false, isWritable: true },  // position
                    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },  // system_program
                ],
                programId: SPECTRE_PROGRAM_ID,
                data: instructionData,
            })

            // Build and send transaction
            const recentBlockhash = await this.connection.getLatestBlockhash()
            const messageV0 = new TransactionMessage({
                payerKey: this.publicKey,
                recentBlockhash: recentBlockhash.blockhash,
                instructions: [instruction],
            }).compileToV0Message()

            const transaction = new VersionedTransaction(messageV0)
            const signedTx = await this.signTransaction(transaction)
            const signature = await this.connection.sendTransaction(signedTx)

            console.log(`[SpectreTradeClient] Position closed: https://explorer.solana.com/tx/${signature}?cluster=devnet`)

            await this.connection.confirmTransaction({
                signature,
                blockhash: recentBlockhash.blockhash,
                lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
            })

            // Fetch the position to get realized PnL
            const positionData = await this.getPosition(positionPda)
            const pnl = positionData?.realizedPnl ?? 0

            return {
                success: true,
                signature,
                pnl,
            }
        } catch (error) {
            console.error('[SpectreTradeClient] Failed to close position:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Get a specific position by PDA
     */
    async getPosition(positionPda: PublicKey | string): Promise<OnChainPosition | null> {
        try {
            const pda = typeof positionPda === 'string' ? new PublicKey(positionPda) : positionPda
            const accountInfo = await this.connection.getAccountInfo(pda)

            if (!accountInfo) {
                return null
            }

            return this.parsePositionAccount(pda, accountInfo.data)
        } catch (error) {
            console.error('[SpectreTradeClient] Failed to get position:', error)
            return null
        }
    }

    /**
     * Get all positions for the current user's vault
     */
    async getPositions(): Promise<OnChainPosition[]> {
        try {
            const [vaultPda] = this.getVaultPda()

            // Fetch all Position accounts that belong to this vault
            const accounts = await this.connection.getProgramAccounts(SPECTRE_PROGRAM_ID, {
                filters: [
                    // Filter by discriminator
                    {
                        memcmp: {
                            offset: 0,
                            bytes: POSITION_ACCOUNT_DISCRIMINATOR.toString('base64'),
                        },
                    },
                    // Filter by vault
                    {
                        memcmp: {
                            offset: 8,
                            bytes: vaultPda.toBase58(),
                        },
                    },
                ],
            })

            console.log(`[SpectreTradeClient] Found ${accounts.length} positions for vault ${vaultPda.toBase58()}`)

            const positions: OnChainPosition[] = []
            for (const { pubkey, account } of accounts) {
                const position = this.parsePositionAccount(pubkey, account.data)
                if (position) {
                    positions.push(position)
                }
            }

            return positions
        } catch (error) {
            console.error('[SpectreTradeClient] Failed to fetch positions:', error)
            return []
        }
    }

    /**
     * Parse a Position account's data
     *
     * Position layout:
     * - 0-8: Discriminator
     * - 8-40: vault (Pubkey)
     * - 40-72: market_id (Pubkey)
     * - 72: side (enum: 0=Yes, 1=No)
     * - 73-81: shares (u64)
     * - 81-89: entry_price (u64)
     * - 89-97: invested_amount (u64)
     * - 97: status (enum: 0=Open, 1=Closed, 2=Liquidated)
     * - 98-106: opened_at (i64)
     * - 106-114: closed_at (i64)
     * - 114-122: exit_price (u64)
     * - 122-130: realized_pnl (i64)
     * - 130: bump (u8)
     */
    private parsePositionAccount(pda: PublicKey, data: Buffer): OnChainPosition | null {
        try {
            if (data.length < 131) {
                console.warn('[SpectreTradeClient] Position account data too short')
                return null
            }

            // Skip discriminator (8 bytes)
            const vault = new PublicKey(data.subarray(8, 40))
            const marketId = new PublicKey(data.subarray(40, 72))
            const sideValue = data[72]
            const shares = new BN(data.subarray(73, 81), 'le').toNumber()
            const entryPrice = new BN(data.subarray(81, 89), 'le').toNumber()
            const investedAmount = new BN(data.subarray(89, 97), 'le').toNumber()
            const statusValue = data[97]
            const openedAt = new BN(data.subarray(98, 106), 'le').toNumber()
            const closedAt = new BN(data.subarray(106, 114), 'le').toNumber()
            const exitPrice = new BN(data.subarray(114, 122), 'le').toNumber()
            const realizedPnl = new BN(data.subarray(122, 130), 'le').fromTwos(64).toNumber()

            const side: TradeSide = sideValue === 0 ? 'yes' : 'no'
            const status: PositionStatus = statusValue === 0 ? 'open' : statusValue === 1 ? 'closed' : 'liquidated'

            return {
                pda: pda.toBase58(),
                vault: vault.toBase58(),
                marketId: marketId.toBase58(),
                side,
                shares,
                entryPrice,
                investedAmount,
                status,
                openedAt,
                closedAt,
                exitPrice,
                realizedPnl,
            }
        } catch (error) {
            console.error('[SpectreTradeClient] Failed to parse position:', error)
            return null
        }
    }

    /**
     * Calculate unrealized PnL for a position given current price
     */
    calculateUnrealizedPnl(position: OnChainPosition, currentPrice: number): number {
        if (position.status !== 'open') {
            return position.realizedPnl
        }

        const scaledCurrentPrice = Math.floor(currentPrice * PRICE_SCALE)
        const currentValue = Math.floor((position.shares * scaledCurrentPrice) / PRICE_SCALE)
        return currentValue - position.investedAmount
    }
}

export default SpectreTradeClient
