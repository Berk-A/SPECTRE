/**
 * SPECTRE Strategy Executor
 *
 * Handles on-chain strategy configuration and signal generation
 * for the SPECTRE trading protocol.
 */

import {
    Connection,
    PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
} from '@solana/web3.js'
import BN from 'bn.js'
import {
    SPECTRE_PROGRAM_ID,
    VAULT_SEED,
    STRATEGY_CONFIG_SEED,
    INITIALIZE_STRATEGY_IX_DISCRIMINATOR,
    SET_STRATEGY_PARAMS_IX_DISCRIMINATOR,
    GENERATE_TRADE_SIGNAL_IX_DISCRIMINATOR,
} from '@/lib/config/constants'

// Strategy parameters matching the on-chain StrategyParams struct
export interface StrategyParams {
    priceThresholdLow: number   // Scaled by 1000 (e.g., 400 = 0.4 = 40%)
    priceThresholdHigh: number  // Scaled by 1000 (e.g., 600 = 0.6 = 60%)
    trendThreshold: number      // Scaled by 1000
    volatilityCap: number       // Scaled by 1000
}

// Default strategy parameters
export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
    priceThresholdLow: 400,   // Buy when price < 40%
    priceThresholdHigh: 600,  // Sell when price > 60%
    trendThreshold: 50,       // 5% trend for strong signals
    volatilityCap: 300,       // Hold when volatility > 30%
}

// Market input for signal generation
export interface MarketInput {
    price: number       // Current price (scaled by 1000)
    trend: number       // Price trend (-1000 to 1000)
    volatility: number  // Volatility (0-1000)
    volume: number      // 24h volume
}

// Trade signal enum matching on-chain
export type TradeSignal = 'StrongBuy' | 'Buy' | 'Hold' | 'Sell' | 'StrongSell'

// On-chain strategy config
export interface OnChainStrategyConfig {
    vault: string
    authority: string
    priceThresholdLow: number
    priceThresholdHigh: number
    trendThreshold: number
    volatilityCap: number
    isActive: boolean
    updatedAt: number
    lastSignal: TradeSignal
    lastSignalAt: number
    totalSignals: number
}

// Sign transaction function type
export interface SignTransactionFn {
    (transaction: VersionedTransaction): Promise<VersionedTransaction>
}

/**
 * Strategy Executor Client
 */
export class StrategyExecutor {
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
     * Derive the vault PDA
     */
    private getVaultPda(): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from(VAULT_SEED), this.publicKey.toBuffer()],
            SPECTRE_PROGRAM_ID
        )
    }

    /**
     * Derive the strategy config PDA
     */
    private getStrategyConfigPda(vaultPda: PublicKey): [PublicKey, number] {
        return PublicKey.findProgramAddressSync(
            [Buffer.from(STRATEGY_CONFIG_SEED), vaultPda.toBuffer()],
            SPECTRE_PROGRAM_ID
        )
    }

    /**
     * Initialize strategy configuration on-chain
     */
    async initializeStrategy(params?: StrategyParams): Promise<{ success: boolean; signature?: string; error?: string }> {
        try {
            const [vaultPda] = this.getVaultPda()
            const [strategyConfigPda] = this.getStrategyConfigPda(vaultPda)

            // Check if already initialized
            const existingConfig = await this.connection.getAccountInfo(strategyConfigPda)
            if (existingConfig) {
                console.log('[StrategyExecutor] Strategy already initialized')
                return { success: true, signature: 'already_initialized' }
            }

            const strategyParams = params || DEFAULT_STRATEGY_PARAMS

            // Build instruction data
            // Option<StrategyParams> - 1 byte tag + params if Some
            const hasParams = true
            const paramsData = Buffer.alloc(1 + 16)  // 1 byte for Option tag + 4 u32s
            paramsData[0] = hasParams ? 1 : 0  // Some variant

            if (hasParams) {
                paramsData.writeUInt32LE(strategyParams.priceThresholdLow, 1)
                paramsData.writeUInt32LE(strategyParams.priceThresholdHigh, 5)
                paramsData.writeUInt32LE(strategyParams.trendThreshold, 9)
                paramsData.writeUInt32LE(strategyParams.volatilityCap, 13)
            }

            const instructionData = Buffer.concat([
                INITIALIZE_STRATEGY_IX_DISCRIMINATOR,
                paramsData,
            ])

            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: this.publicKey, isSigner: true, isWritable: true },  // authority
                    { pubkey: vaultPda, isSigner: false, isWritable: false },  // vault
                    { pubkey: strategyConfigPda, isSigner: false, isWritable: true },  // strategy_config (init)
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

            await this.connection.confirmTransaction({
                signature,
                blockhash: recentBlockhash.blockhash,
                lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
            })

            console.log(`[StrategyExecutor] Strategy initialized: ${signature}`)
            return { success: true, signature }
        } catch (error) {
            console.error('[StrategyExecutor] Failed to initialize strategy:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Update strategy parameters on-chain
     */
    async setStrategyParams(params: StrategyParams): Promise<{ success: boolean; signature?: string; error?: string }> {
        try {
            const [vaultPda] = this.getVaultPda()
            const [strategyConfigPda] = this.getStrategyConfigPda(vaultPda)

            // Build params data
            const paramsData = Buffer.alloc(16)  // 4 u32s
            paramsData.writeUInt32LE(params.priceThresholdLow, 0)
            paramsData.writeUInt32LE(params.priceThresholdHigh, 4)
            paramsData.writeUInt32LE(params.trendThreshold, 8)
            paramsData.writeUInt32LE(params.volatilityCap, 12)

            const instructionData = Buffer.concat([
                SET_STRATEGY_PARAMS_IX_DISCRIMINATOR,
                paramsData,
            ])

            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: this.publicKey, isSigner: true, isWritable: true },  // authority
                    { pubkey: vaultPda, isSigner: false, isWritable: false },  // vault
                    { pubkey: strategyConfigPda, isSigner: false, isWritable: true },  // strategy_config
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

            await this.connection.confirmTransaction({
                signature,
                blockhash: recentBlockhash.blockhash,
                lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
            })

            console.log(`[StrategyExecutor] Strategy params updated: ${signature}`)
            return { success: true, signature }
        } catch (error) {
            console.error('[StrategyExecutor] Failed to update strategy params:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Generate a trade signal from market input (on-chain)
     */
    async generateSignal(input: MarketInput): Promise<{ success: boolean; signal?: TradeSignal; signature?: string; error?: string }> {
        try {
            const [vaultPda] = this.getVaultPda()
            const [strategyConfigPda] = this.getStrategyConfigPda(vaultPda)

            // Build market input data
            const inputData = Buffer.alloc(16)  // 4 u32s
            inputData.writeUInt32LE(input.price, 0)
            inputData.writeInt32LE(input.trend, 4)
            inputData.writeUInt32LE(input.volatility, 8)
            inputData.writeUInt32LE(input.volume, 12)

            const instructionData = Buffer.concat([
                GENERATE_TRADE_SIGNAL_IX_DISCRIMINATOR,
                inputData,
            ])

            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: this.publicKey, isSigner: true, isWritable: true },  // authority
                    { pubkey: vaultPda, isSigner: false, isWritable: false },  // vault
                    { pubkey: strategyConfigPda, isSigner: false, isWritable: true },  // strategy_config
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

            await this.connection.confirmTransaction({
                signature,
                blockhash: recentBlockhash.blockhash,
                lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
            })

            // Fetch the updated strategy config to get the signal
            const config = await this.getStrategyConfig()
            const signal = config?.lastSignal || 'Hold'

            console.log(`[StrategyExecutor] Signal generated: ${signal}`)
            return { success: true, signal, signature }
        } catch (error) {
            console.error('[StrategyExecutor] Failed to generate signal:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Generate a trade signal locally (without on-chain transaction)
     * Uses the same decision tree logic as the on-chain program
     */
    generateSignalLocal(input: MarketInput, params: StrategyParams): TradeSignal {
        // Replicate the on-chain decision tree logic
        const { price, trend, volatility } = input
        const { priceThresholdLow, priceThresholdHigh, trendThreshold, volatilityCap } = params

        // High volatility = HOLD
        if (volatility > volatilityCap) {
            return 'Hold'
        }

        // Low price zone
        if (price < priceThresholdLow) {
            if (trend > trendThreshold) {
                return 'StrongBuy'
            }
            return 'Buy'
        }

        // High price zone
        if (price > priceThresholdHigh) {
            if (trend < -trendThreshold) {
                return 'StrongSell'
            }
            return 'Sell'
        }

        // Middle zone - check trend
        if (trend > trendThreshold) {
            return 'Buy'
        }
        if (trend < -trendThreshold) {
            return 'Sell'
        }

        return 'Hold'
    }

    /**
     * Get the current strategy configuration from chain
     */
    async getStrategyConfig(): Promise<OnChainStrategyConfig | null> {
        try {
            const [vaultPda] = this.getVaultPda()
            const [strategyConfigPda] = this.getStrategyConfigPda(vaultPda)

            const accountInfo = await this.connection.getAccountInfo(strategyConfigPda)
            if (!accountInfo) {
                return null
            }

            return this.parseStrategyConfig(accountInfo.data)
        } catch (error) {
            console.error('[StrategyExecutor] Failed to get strategy config:', error)
            return null
        }
    }

    /**
     * Check if strategy is initialized
     */
    async isStrategyInitialized(): Promise<boolean> {
        const config = await this.getStrategyConfig()
        return config !== null
    }

    /**
     * Parse strategy config account data
     *
     * StrategyConfig layout:
     * - 0-8: Discriminator
     * - 8-40: vault (Pubkey)
     * - 40-72: authority (Pubkey)
     * - 72-76: price_threshold_low (u32)
     * - 76-80: price_threshold_high (u32)
     * - 80-84: trend_threshold (u32)
     * - 84-88: volatility_cap (u32)
     * - 88: is_active (bool)
     * - 89-97: updated_at (i64)
     * - 97: last_signal (u8)
     * - 98-106: last_signal_at (i64)
     * - 106-114: total_signals (u64)
     * - 114: bump (u8)
     * - 115-147: _reserved (32 bytes)
     */
    private parseStrategyConfig(data: Buffer): OnChainStrategyConfig | null {
        try {
            if (data.length < 115) {
                return null
            }

            const vault = new PublicKey(data.subarray(8, 40))
            const authority = new PublicKey(data.subarray(40, 72))
            const priceThresholdLow = data.readUInt32LE(72)
            const priceThresholdHigh = data.readUInt32LE(76)
            const trendThreshold = data.readUInt32LE(80)
            const volatilityCap = data.readUInt32LE(84)
            const isActive = data[88] === 1
            const updatedAt = new BN(data.subarray(89, 97), 'le').toNumber()
            const lastSignalValue = data[97]
            const lastSignalAt = new BN(data.subarray(98, 106), 'le').toNumber()
            const totalSignals = new BN(data.subarray(106, 114), 'le').toNumber()

            const signalMap: Record<number, TradeSignal> = {
                1: 'StrongBuy',
                2: 'Buy',
                3: 'Hold',
                4: 'Sell',
                5: 'StrongSell',
            }
            const lastSignal = signalMap[lastSignalValue] || 'Hold'

            return {
                vault: vault.toBase58(),
                authority: authority.toBase58(),
                priceThresholdLow,
                priceThresholdHigh,
                trendThreshold,
                volatilityCap,
                isActive,
                updatedAt,
                lastSignal,
                lastSignalAt,
                totalSignals,
            }
        } catch (error) {
            console.error('[StrategyExecutor] Failed to parse strategy config:', error)
            return null
        }
    }
}

export default StrategyExecutor
