/**
 * Browser-Compatible PNP Exchange Client
 * Replaces Node.js crypto with Web Crypto API
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { sha256 } from '../crypto/browserCrypto'
import bs58 from 'bs58'

// ============================================
// Configuration
// ============================================

// PNP Program ID (devnet)
const PNP_PROGRAM_ID = new PublicKey('pnpxFxDMcMfA1TxJNKqJC3MVZV7AkVDMSoeY9bVg9D2')

// USDC mint (devnet)
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

// RPC endpoint (referenced in connection constructor)
// const RPC_ENDPOINT = 'https://api.devnet.solana.com'

// ============================================
// Types
// ============================================

export interface PnpMarket {
  address: string
  question: string
  yesPrice: number
  noPrice: number
  yesShares: number
  noShares: number
  endTime: Date
  isResolved: boolean
  resolution?: 'yes' | 'no' | null
  liquidity: number
  volume24h: number
  creator: string
}

export interface TradeResult {
  success: boolean
  signature?: string
  sharesReceived?: number
  executionPrice?: number
  error?: string
}

export interface Position {
  market: string
  question: string
  side: 'yes' | 'no'
  shares: number
  averagePrice: number
  currentValue: number
  unrealizedPnL: number
}

// ============================================
// Account Discriminator (Browser-compatible)
// ============================================

/**
 * Compute account discriminator using Web Crypto API
 * Replaces Node.js createHash("sha256")
 */
async function getAccountDiscriminator(accountName: string): Promise<Uint8Array> {
  const data = `account:${accountName}`
  const hash = await sha256(data)
  return hash.slice(0, 8)
}

// Pre-computed discriminator for Market accounts
// This avoids async in hot paths - computed once at module load
let MARKET_DISCRIMINATOR: Uint8Array | null = null

async function getMarketDiscriminator(): Promise<Uint8Array> {
  if (!MARKET_DISCRIMINATOR) {
    MARKET_DISCRIMINATOR = await getAccountDiscriminator('Market')
  }
  return MARKET_DISCRIMINATOR
}

// ============================================
// Browser PNP Client
// ============================================

export class BrowserPnpClient {
  private connection: Connection
  private walletPublicKey: PublicKey | null = null
  private signTransaction: ((tx: Transaction) => Promise<Transaction>) | null = null
  private cachedMarkets: Map<string, PnpMarket> = new Map()
  private lastFetch: number = 0
  private cacheTimeout: number = 30000 // 30 seconds

  constructor(connection: Connection) {
    this.connection = connection
  }

  /**
   * Set wallet for signing transactions
   */
  setWallet(
    publicKey: PublicKey,
    signTransaction: (tx: Transaction) => Promise<Transaction>
  ): void {
    this.walletPublicKey = publicKey
    this.signTransaction = signTransaction
  }

  /**
   * Fetch all active markets
   */
  async fetchActiveMarkets(): Promise<PnpMarket[]> {
    // Check cache
    if (this.cachedMarkets.size > 0 && Date.now() - this.lastFetch < this.cacheTimeout) {
      return Array.from(this.cachedMarkets.values())
    }

    try {
      const discriminator = await getMarketDiscriminator()

      // Fetch all market accounts using getProgramAccounts
      const accounts = await this.connection.getProgramAccounts(PNP_PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(discriminator),
            },
          },
        ],
      })

      const markets: PnpMarket[] = []

      for (const { pubkey, account } of accounts) {
        try {
          const market = this.parseMarketAccount(pubkey, account.data)
          if (market && !market.isResolved) {
            markets.push(market)
          }
        } catch (e) {
          // Skip invalid accounts
          console.warn(`[BrowserPnpClient] Failed to parse market ${pubkey.toBase58()}:`, e)
        }
      }

      // Update cache
      this.cachedMarkets.clear()
      markets.forEach(m => this.cachedMarkets.set(m.address, m))
      this.lastFetch = Date.now()

      return markets
    } catch (error) {
      console.error('[BrowserPnpClient] Failed to fetch markets:', error)
      // Return cached markets if fetch fails
      return Array.from(this.cachedMarkets.values())
    }
  }

  /**
   * Fetch a specific market
   */
  async fetchMarket(address: string): Promise<PnpMarket | null> {
    // Check cache first
    const cached = this.cachedMarkets.get(address)
    if (cached && Date.now() - this.lastFetch < this.cacheTimeout) {
      return cached
    }

    try {
      const pubkey = new PublicKey(address)
      const accountInfo = await this.connection.getAccountInfo(pubkey)

      if (!accountInfo) {
        return null
      }

      const market = this.parseMarketAccount(pubkey, accountInfo.data)

      if (market) {
        this.cachedMarkets.set(address, market)
      }

      return market
    } catch (error) {
      console.error(`[BrowserPnpClient] Failed to fetch market ${address}:`, error)
      return null
    }
  }

  /**
   * Execute a trade
   */
  async executeTrade(
    marketAddress: string,
    side: 'yes' | 'no',
    amountUsdc: number
  ): Promise<TradeResult> {
    if (!this.walletPublicKey || !this.signTransaction) {
      return { success: false, error: 'Wallet not connected' }
    }

    try {
      const market = await this.fetchMarket(marketAddress)
      if (!market) {
        return { success: false, error: 'Market not found' }
      }

      if (market.isResolved) {
        return { success: false, error: 'Market is already resolved' }
      }

      // Convert USDC to micro-USDC (6 decimals)
      const amountMicroUsdc = Math.floor(amountUsdc * 1_000_000)

      // Build trade instruction
      const tx = await this.buildTradeTransaction(
        new PublicKey(marketAddress),
        side,
        amountMicroUsdc
      )

      // Sign
      const signedTx = await this.signTransaction(tx)

      // Send
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())

      // Confirm
      await this.connection.confirmTransaction(signature, 'confirmed')

      // Estimate shares received (simplified)
      const price = side === 'yes' ? market.yesPrice : market.noPrice
      const sharesReceived = amountUsdc / price

      return {
        success: true,
        signature,
        sharesReceived,
        executionPrice: price,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Get user positions
   */
  async getPositions(): Promise<Position[]> {
    if (!this.walletPublicKey) {
      return []
    }

    try {
      // Fetch user's position accounts
      const positionDiscriminator = await getAccountDiscriminator('Position')

      const accounts = await this.connection.getProgramAccounts(PNP_PROGRAM_ID, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(positionDiscriminator),
            },
          },
          {
            memcmp: {
              offset: 8, // After discriminator, owner pubkey
              bytes: this.walletPublicKey.toBase58(),
            },
          },
        ],
      })

      const positions: Position[] = []

      for (const { account } of accounts) {
        try {
          const position = this.parsePositionAccount(account.data)
          if (position) {
            positions.push(position)
          }
        } catch {
          // Skip invalid accounts
        }
      }

      return positions
    } catch (error) {
      console.error('[BrowserPnpClient] Failed to fetch positions:', error)
      return []
    }
  }

  /**
   * Claim winnings from resolved markets
   */
  async claimWinnings(marketAddress: string): Promise<TradeResult> {
    if (!this.walletPublicKey || !this.signTransaction) {
      return { success: false, error: 'Wallet not connected' }
    }

    try {
      const market = await this.fetchMarket(marketAddress)
      if (!market) {
        return { success: false, error: 'Market not found' }
      }

      if (!market.isResolved) {
        return { success: false, error: 'Market is not resolved yet' }
      }

      const tx = await this.buildClaimTransaction(new PublicKey(marketAddress))
      const signedTx = await this.signTransaction(tx)
      const signature = await this.connection.sendRawTransaction(signedTx.serialize())
      await this.connection.confirmTransaction(signature, 'confirmed')

      return {
        success: true,
        signature,
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { success: false, error: errorMessage }
    }
  }

  // ============================================
  // Account Parsing
  // ============================================

  private parseMarketAccount(pubkey: PublicKey, data: Buffer): PnpMarket | null {
    try {
      // Skip discriminator (8 bytes)
      let offset = 8

      // Parse market data according to PNP account structure
      // This is a simplified parser - adjust based on actual account layout

      // Creator (32 bytes)
      const creator = new PublicKey(data.slice(offset, offset + 32))
      offset += 32

      // Question string (4 bytes length + string)
      const questionLen = data.readUInt32LE(offset)
      offset += 4
      const question = data.slice(offset, offset + questionLen).toString('utf-8')
      offset += questionLen

      // Yes pool (8 bytes)
      const yesPool = new BN(data.slice(offset, offset + 8), 'le')
      offset += 8

      // No pool (8 bytes)
      const noPool = new BN(data.slice(offset, offset + 8), 'le')
      offset += 8

      // End time (8 bytes)
      const endTimestamp = new BN(data.slice(offset, offset + 8), 'le')
      offset += 8

      // Is resolved (1 byte)
      const isResolved = data[offset] === 1
      offset += 1

      // Resolution (1 byte: 0 = none, 1 = yes, 2 = no)
      const resolutionByte = data[offset]
      const resolution = resolutionByte === 0 ? null : resolutionByte === 1 ? 'yes' : 'no'

      // Calculate prices using CPMM formula
      const yesPoolNum = yesPool.toNumber() / 1_000_000
      const noPoolNum = noPool.toNumber() / 1_000_000
      const totalPool = yesPoolNum + noPoolNum

      const yesPrice = totalPool > 0 ? noPoolNum / totalPool : 0.5
      const noPrice = totalPool > 0 ? yesPoolNum / totalPool : 0.5

      return {
        address: pubkey.toBase58(),
        question,
        yesPrice,
        noPrice,
        yesShares: yesPoolNum,
        noShares: noPoolNum,
        endTime: new Date(endTimestamp.toNumber() * 1000),
        isResolved,
        resolution: resolution as 'yes' | 'no' | null,
        liquidity: totalPool,
        volume24h: 0, // Would need historical data
        creator: creator.toBase58(),
      }
    } catch (e) {
      console.warn('[BrowserPnpClient] Failed to parse market:', e)
      return null
    }
  }

  private parsePositionAccount(data: Buffer): Position | null {
    try {
      let offset = 8 // Skip discriminator

      // Owner (32 bytes)
      offset += 32

      // Market (32 bytes)
      const market = new PublicKey(data.slice(offset, offset + 32))
      offset += 32

      // Side (1 byte: 0 = yes, 1 = no)
      const sideNum = data[offset]
      const side = sideNum === 0 ? 'yes' : 'no'
      offset += 1

      // Shares (8 bytes)
      const shares = new BN(data.slice(offset, offset + 8), 'le').toNumber() / 1_000_000
      offset += 8

      // Average price (8 bytes, fixed point)
      const avgPriceBN = new BN(data.slice(offset, offset + 8), 'le')
      const averagePrice = avgPriceBN.toNumber() / 1_000_000

      // Get market for current price
      const cachedMarket = this.cachedMarkets.get(market.toBase58())
      const currentPrice = cachedMarket
        ? (side === 'yes' ? cachedMarket.yesPrice : cachedMarket.noPrice)
        : averagePrice

      const currentValue = shares * currentPrice
      const costBasis = shares * averagePrice
      const unrealizedPnL = currentValue - costBasis

      return {
        market: market.toBase58(),
        question: cachedMarket?.question || 'Unknown market',
        side,
        shares,
        averagePrice,
        currentValue,
        unrealizedPnL,
      }
    } catch {
      return null
    }
  }

  // ============================================
  // Transaction Building
  // ============================================

  private async buildTradeTransaction(
    market: PublicKey,
    side: 'yes' | 'no',
    amountMicroUsdc: number
  ): Promise<Transaction> {
    if (!this.walletPublicKey) throw new Error('Wallet not connected')

    // Derive user position PDA
    const [positionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position'),
        market.toBuffer(),
        this.walletPublicKey.toBuffer(),
      ],
      PNP_PROGRAM_ID
    )

    // Derive user token accounts
    const [userUsdcAta] = PublicKey.findProgramAddressSync(
      [
        this.walletPublicKey.toBuffer(),
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
        USDC_MINT.toBuffer(),
      ],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
    )

    // Derive market vault
    const [marketVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), market.toBuffer()],
      PNP_PROGRAM_ID
    )

    // Build instruction
    const discriminator = await sha256('global:buy_outcome')

    // Side: 0 = yes, 1 = no
    const sideByte = side === 'yes' ? 0 : 1

    // Amount as u64
    const amountBuffer = Buffer.alloc(8)
    amountBuffer.writeBigUInt64LE(BigInt(amountMicroUsdc))

    const instructionData = Buffer.concat([
      discriminator.slice(0, 8),
      Buffer.from([sideByte]),
      amountBuffer,
    ])

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.walletPublicKey, isSigner: true, isWritable: true },
        { pubkey: market, isSigner: false, isWritable: true },
        { pubkey: positionPda, isSigner: false, isWritable: true },
        { pubkey: userUsdcAta, isSigner: false, isWritable: true },
        { pubkey: marketVault, isSigner: false, isWritable: true },
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PNP_PROGRAM_ID,
      data: instructionData,
    })

    const tx = new Transaction().add(ix)

    const { blockhash } = await this.connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = this.walletPublicKey

    return tx
  }

  private async buildClaimTransaction(market: PublicKey): Promise<Transaction> {
    if (!this.walletPublicKey) throw new Error('Wallet not connected')

    const [positionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position'),
        market.toBuffer(),
        this.walletPublicKey.toBuffer(),
      ],
      PNP_PROGRAM_ID
    )

    const [userUsdcAta] = PublicKey.findProgramAddressSync(
      [
        this.walletPublicKey.toBuffer(),
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
        USDC_MINT.toBuffer(),
      ],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
    )

    const [marketVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), market.toBuffer()],
      PNP_PROGRAM_ID
    )

    const discriminator = await sha256('global:claim_winnings')

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.walletPublicKey, isSigner: true, isWritable: true },
        { pubkey: market, isSigner: false, isWritable: true },
        { pubkey: positionPda, isSigner: false, isWritable: true },
        { pubkey: userUsdcAta, isSigner: false, isWritable: true },
        { pubkey: marketVault, isSigner: false, isWritable: true },
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isSigner: false, isWritable: false },
      ],
      programId: PNP_PROGRAM_ID,
      data: Buffer.from(discriminator.slice(0, 8)),
    })

    const tx = new Transaction().add(ix)

    const { blockhash } = await this.connection.getLatestBlockhash()
    tx.recentBlockhash = blockhash
    tx.feePayer = this.walletPublicKey

    return tx
  }

  /**
   * Clear market cache
   */
  clearCache(): void {
    this.cachedMarkets.clear()
    this.lastFetch = 0
  }
}

// ============================================
// Singleton Instance
// ============================================

let clientInstance: BrowserPnpClient | null = null

export function getBrowserPnpClient(connection: Connection): BrowserPnpClient {
  if (!clientInstance) {
    clientInstance = new BrowserPnpClient(connection)
  }
  return clientInstance
}
