import { useState, useCallback, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
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
import { DEMO_MODE } from '@/lib/config/constants'

export type TradeSide = 'yes' | 'no'

export interface TradeResult {
  success: boolean
  signature?: string
  sharesReceived?: number
  executionPrice?: number
  error?: string
}

export function usePnp() {
  const { connected, publicKey } = useWallet()
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

  // Fetch positions
  const fetchPositions = useCallback(async (): Promise<Position[]> => {
    if (!connected) return []

    try {
      if (DEMO_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        setPositions(DEMO_POSITIONS)
        return DEMO_POSITIONS
      }

      if (!pnpClient) {
        return []
      }

      const fetchedPositions = await pnpClient.getPositions()
      // Map BrowserPnpClient Position type to tradingStore Position type
      const mappedPositions: Position[] = fetchedPositions.map(p => ({
        market: p.market,
        marketQuestion: p.question,
        yesShares: p.side === 'yes' ? p.shares : 0,
        noShares: p.side === 'no' ? p.shares : 0,
        entryPriceYes: p.side === 'yes' ? p.averagePrice : undefined,
        entryPriceNo: p.side === 'no' ? p.averagePrice : undefined,
        unrealizedPnl: p.unrealizedPnL,
        totalInvested: p.shares * p.averagePrice,
      }))
      setPositions(mappedPositions)
      return mappedPositions
    } catch (error: any) {
      console.error('Failed to fetch positions:', error)
      return []
    }
  }, [connected, pnpClient, setPositions])

  // Execute a trade
  const executeTrade = useCallback(
    async (
      marketAddress: string,
      side: TradeSide,
      amountUsdc: number
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
          const shares = amountUsdc / price

          const trade: Trade = {
            id: generateId(),
            market: marketAddress,
            side,
            amount: amountUsdc,
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
                    totalInvested: (p.totalInvested || 0) + amountUsdc,
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
                totalInvested: amountUsdc,
                unrealizedPnl: 0,
              },
            ])
          }

          toast.success(
            `Bought ${shares.toFixed(2)} ${side.toUpperCase()} shares at $${price.toFixed(3)}`
          )

          return {
            success: true,
            signature: trade.signature,
            sharesReceived: shares,
            executionPrice: price,
          }
        }

        // Production: use actual SDK
        if (!pnpClient) {
          return { success: false, error: 'PNP client not initialized' }
        }

        const result = await pnpClient.executeTrade(marketAddress, side, amountUsdc)

        if (result.success) {
          addTrade({
            id: generateId(),
            market: marketAddress,
            side,
            amount: amountUsdc,
            price: result.executionPrice || 0,
            shares: result.sharesReceived || 0,
            signature: result.signature || '',
            timestamp: new Date(),
            type: 'buy',
          })

          toast.success('Trade executed successfully')
        }

        return result
      } catch (error: any) {
        toast.error(error.message || 'Trade failed')
        return { success: false, error: error.message }
      } finally {
        setIsTrading(false)
      }
    },
    [connected, publicKey, markets, positions, pnpClient, addTrade, setPositions]
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

    // Actions
    fetchMarkets,
    fetchPositions,
    executeTrade,
    selectMarket,
  }
}

export default usePnp
