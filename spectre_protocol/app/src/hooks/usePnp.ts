import { useState, useCallback, useEffect, useRef } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { toast } from 'sonner'
import { useSpectreClient } from './useSpectreClient'
import {
  useTradingStore,
  type Market,
  type Position,
  type Trade,
  DEMO_MARKETS,
  DEMO_POSITIONS,
} from '@/stores/tradingStore'
import { generateId } from '@/lib/utils'
import { PNP_DEMO_MODE as DEMO_MODE, PRICE_SCALE } from '@/lib/config/constants'
import { SpectreTradeClient } from '@/lib/trading/SpectreTradeClient'

export type TradeSide = 'yes' | 'no'

export interface TradeResult {
  success: boolean
  signature?: string
  sharesReceived?: number
  executionPrice?: number
  positionPda?: string
  error?: string
}

export function usePnp() {
  const { connected, publicKey, signTransaction } = useWallet()
  const { connection } = useConnection()
  const { pnpClient } = useSpectreClient()
  const {
    markets,
    positions,
    trades,
    selectedMarket,
    isLoading,
    setMarkets,
    setPositions,
    addTrade,
    setSelectedMarket,
    setLoading,
    setError,
  } = useTradingStore()

  const [isTrading, setIsTrading] = useState(false)
  const [isClosing, setIsClosing] = useState(false)

  // SpectreTradeClient instance
  const tradeClientRef = useRef<SpectreTradeClient | null>(null)

  // Initialize trade client when wallet connects
  useEffect(() => {
    if (connected && publicKey && signTransaction && connection) {
      tradeClientRef.current = new SpectreTradeClient({
        connection,
        publicKey,
        signTransaction,
      })
      console.log('[usePnp] SpectreTradeClient initialized')
    } else {
      tradeClientRef.current = null
    }
  }, [connected, publicKey, signTransaction, connection])

  // Fetch active markets
  const fetchMarkets = useCallback(async (): Promise<Market[]> => {
    setLoading(true)

    try {
      if (DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        setMarkets(DEMO_MARKETS)
        return DEMO_MARKETS
      }

      if (!pnpClient) {
        setError('PNP client not initialized')
        return []
      }

      const fetchedMarkets = await pnpClient.fetchActiveMarkets()
      const normalizedMarkets: Market[] = fetchedMarkets.map((m: any) => ({
        address: typeof m.address === 'string' ? m.address : m.address.toBase58(),
        question: m.question,
        yesPrice: m.yesPrice,
        noPrice: m.noPrice,
        endTime: m.endTime,
        isResolved: m.isResolved,
        liquidity: m.liquidity,
        volume24h: m.volume24h,
      }))

      setMarkets(normalizedMarkets)
      return normalizedMarkets
    } catch (error: any) {
      setError(error.message)
      toast.error('Failed to fetch markets')
      return []
    } finally {
      setLoading(false)
    }
  }, [pnpClient, setMarkets, setLoading, setError])

  // Fetch positions - syncs from chain when not in demo mode
  const fetchPositions = useCallback(async (): Promise<Position[]> => {
    if (!connected) return []

    try {
      if (DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        setPositions(DEMO_POSITIONS)
        return DEMO_POSITIONS
      }

      // Use SpectreTradeClient to fetch on-chain positions
      const tradeClient = tradeClientRef.current
      if (!tradeClient) {
        console.warn('[usePnp] Trade client not initialized')
        return []
      }

      console.log('[usePnp] Fetching positions from chain...')
      const onChainPositions = await tradeClient.getPositions()

      // Map on-chain positions to store format
      const mappedPositions: Position[] = onChainPositions
        .filter(p => p.status === 'open')
        .map(p => {
          // Find market info (mock data)
          const market = markets.find(m => m.address === p.marketId)
          const currentPrice = market
            ? (p.side === 'yes' ? market.yesPrice : market.noPrice)
            : 0.5

          // Calculate unrealized PnL
          const scaledPrice = Math.floor(currentPrice * PRICE_SCALE)
          const currentValue = Math.floor((p.shares * scaledPrice) / PRICE_SCALE)
          const unrealizedPnl = currentValue - p.investedAmount

          return {
            market: p.marketId,
            marketQuestion: market?.question || `Market ${p.marketId.slice(0, 8)}...`,
            yesShares: p.side === 'yes' ? p.shares / LAMPORTS_PER_SOL : 0,
            noShares: p.side === 'no' ? p.shares / LAMPORTS_PER_SOL : 0,
            entryPriceYes: p.side === 'yes' ? p.entryPrice / PRICE_SCALE : undefined,
            entryPriceNo: p.side === 'no' ? p.entryPrice / PRICE_SCALE : undefined,
            unrealizedPnl: unrealizedPnl / LAMPORTS_PER_SOL,
            totalInvested: p.investedAmount / LAMPORTS_PER_SOL,
            positionPda: p.pda,  // Store PDA for closing
          }
        })

      console.log(`[usePnp] Synced ${mappedPositions.length} positions from chain`)
      setPositions(mappedPositions)
      return mappedPositions
    } catch (error: any) {
      console.error('Failed to fetch positions:', error)
      return []
    }
  }, [connected, markets, setPositions])

  // Execute a trade - opens an on-chain position
  const executeTrade = useCallback(
    async (
      marketAddress: string,
      side: TradeSide,
      amountSol: number  // Amount in SOL (not USDC for SPECTRE)
    ): Promise<TradeResult> => {
      if (!connected || !publicKey) {
        return { success: false, error: 'Wallet not connected' }
      }

      const market = markets.find((m) => m.address === marketAddress)
      if (!market) {
        return { success: false, error: 'Market not found' }
      }

      setIsTrading(true)

      try {
        if (DEMO_MODE) {
          await new Promise((resolve) => setTimeout(resolve, 2000))

          const price = side === 'yes' ? market.yesPrice : market.noPrice
          const shares = amountSol / price

          const trade: Trade = {
            id: generateId(),
            market: marketAddress,
            side,
            amount: amountSol,
            price,
            shares,
            signature: `sig_${Date.now()}`,
            timestamp: new Date(),
            type: 'buy',
          }

          addTrade(trade)

          // Update positions
          const existingPosition = positions.find((p) => p.market === marketAddress)
          if (existingPosition) {
            const updatedPositions = positions.map((p) =>
              p.market === marketAddress
                ? {
                  ...p,
                  yesShares: p.yesShares + (side === 'yes' ? shares : 0),
                  noShares: p.noShares + (side === 'no' ? shares : 0),
                  totalInvested: (p.totalInvested || 0) + amountSol,
                }
                : p
            )
            setPositions(updatedPositions)
          } else {
            setPositions([
              ...positions,
              {
                market: marketAddress,
                marketQuestion: market.question,
                yesShares: side === 'yes' ? shares : 0,
                noShares: side === 'no' ? shares : 0,
                entryPriceYes: side === 'yes' ? price : undefined,
                entryPriceNo: side === 'no' ? price : undefined,
                totalInvested: amountSol,
                unrealizedPnl: 0,
              },
            ])
          }

          toast.success(
            `Bought ${shares.toFixed(2)} ${side.toUpperCase()} shares at ${(price * 100).toFixed(1)}%`
          )

          return {
            success: true,
            signature: trade.signature,
            sharesReceived: shares,
            executionPrice: price,
          }
        }

        // Production: use SpectreTradeClient for on-chain positions
        const tradeClient = tradeClientRef.current
        if (!tradeClient) {
          return { success: false, error: 'Trade client not initialized' }
        }

        const price = side === 'yes' ? market.yesPrice : market.noPrice
        const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL)

        console.log(`[usePnp] Opening on-chain position: ${amountSol} SOL on ${side.toUpperCase()}`)

        const result = await tradeClient.openPosition(
          marketAddress,
          side,
          amountLamports,
          price
        )

        if (result.success) {
          const shares = amountSol / price

          addTrade({
            id: generateId(),
            market: marketAddress,
            side,
            amount: amountSol,
            price,
            shares,
            signature: result.signature || '',
            timestamp: new Date(),
            type: 'buy',
          })

          // Refresh positions from chain
          await fetchPositions()

          toast.success(
            `Position opened: ${shares.toFixed(2)} ${side.toUpperCase()} shares`,
            {
              description: `TX: ${result.signature?.slice(0, 8)}...`,
              action: {
                label: 'View',
                onClick: () => window.open(`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`, '_blank')
              }
            }
          )

          return {
            success: true,
            signature: result.signature,
            positionPda: result.positionPda,
            sharesReceived: shares,
            executionPrice: price,
          }
        }

        return { success: false, error: result.error }
      } catch (error: any) {
        toast.error(error.message || 'Trade failed')
        return { success: false, error: error.message }
      } finally {
        setIsTrading(false)
      }
    },
    [connected, publicKey, markets, positions, addTrade, setPositions, fetchPositions]
  )

  // Close a position
  const closePosition = useCallback(
    async (marketAddress: string): Promise<TradeResult> => {
      if (!connected || !publicKey) {
        return { success: false, error: 'Wallet not connected' }
      }

      const market = markets.find((m) => m.address === marketAddress)
      const position = positions.find((p) => p.market === marketAddress)

      if (!position) {
        return { success: false, error: 'Position not found' }
      }

      setIsClosing(true)

      try {
        if (DEMO_MODE) {
          await new Promise((resolve) => setTimeout(resolve, 2000))

          // Remove position from store
          const updatedPositions = positions.filter((p) => p.market !== marketAddress)
          setPositions(updatedPositions)

          toast.success('Position closed successfully')
          return { success: true, signature: `sig_close_${Date.now()}` }
        }

        // Production: use SpectreTradeClient
        const tradeClient = tradeClientRef.current
        if (!tradeClient) {
          return { success: false, error: 'Trade client not initialized' }
        }

        // Get current price for exit
        const side = position.yesShares > 0 ? 'yes' : 'no'
        const exitPrice = market
          ? (side === 'yes' ? market.yesPrice : market.noPrice)
          : 0.5

        console.log(`[usePnp] Closing position on market ${marketAddress}`)

        const result = await tradeClient.closePosition(marketAddress, exitPrice)

        if (result.success) {
          // Record the close trade
          const shares = side === 'yes' ? position.yesShares : position.noShares
          addTrade({
            id: generateId(),
            market: marketAddress,
            side,
            amount: position.totalInvested || 0,
            price: exitPrice,
            shares,
            signature: result.signature || '',
            timestamp: new Date(),
            type: 'sell',
          })

          // Refresh positions from chain
          await fetchPositions()

          const pnlSol = (result.pnl || 0) / LAMPORTS_PER_SOL
          toast.success(
            `Position closed: ${pnlSol >= 0 ? '+' : ''}${pnlSol.toFixed(4)} SOL`,
            {
              description: `TX: ${result.signature?.slice(0, 8)}...`,
              action: {
                label: 'View',
                onClick: () => window.open(`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`, '_blank')
              }
            }
          )

          return { success: true, signature: result.signature }
        }

        return { success: false, error: result.error }
      } catch (error: any) {
        toast.error(error.message || 'Close position failed')
        return { success: false, error: error.message }
      } finally {
        setIsClosing(false)
      }
    },
    [connected, publicKey, markets, positions, addTrade, setPositions, fetchPositions]
  )

  // Select a market
  const selectMarket = useCallback(
    (marketAddress: string | null) => {
      if (!marketAddress) {
        setSelectedMarket(null)
        return
      }

      const market = markets.find((m) => m.address === marketAddress)
      setSelectedMarket(market || null)
    },
    [markets, setSelectedMarket]
  )

  // Load initial data
  useEffect(() => {
    if (connected) {
      fetchMarkets()
      fetchPositions()
    }
  }, [connected, fetchMarkets, fetchPositions])

  return {
    // State
    markets,
    positions,
    trades,
    selectedMarket,
    isLoading,
    isTrading,
    isClosing,

    // Actions
    fetchMarkets,
    fetchPositions,
    executeTrade,
    closePosition,
    selectMarket,
  }
}

export default usePnp
