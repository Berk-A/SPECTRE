import { create } from 'zustand'

export interface Market {
  address: string
  question: string
  yesPrice: number
  noPrice: number
  endTime: Date
  isResolved: boolean
  liquidity?: number
  volume24h?: number
}

export interface Position {
  market: string
  marketQuestion?: string
  yesShares: number
  noShares: number
  entryPriceYes?: number
  entryPriceNo?: number
  unrealizedPnl?: number
  totalInvested?: number
}

export interface Trade {
  id: string
  market: string
  side: 'yes' | 'no'
  amount: number
  price: number
  shares: number
  signature: string
  timestamp: Date
  type: 'buy' | 'sell'
}

interface TradingState {
  markets: Market[]
  positions: Position[]
  trades: Trade[]
  selectedMarket: Market | null
  isLoading: boolean
  error: string | null

  // Actions
  setMarkets: (markets: Market[]) => void
  setPositions: (positions: Position[]) => void
  addTrade: (trade: Trade) => void
  setSelectedMarket: (market: Market | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearTrades: () => void
}

export const useTradingStore = create<TradingState>((set) => ({
  markets: [],
  positions: [],
  trades: [],
  selectedMarket: null,
  isLoading: false,
  error: null,

  setMarkets: (markets) => set({ markets }),

  setPositions: (positions) => set({ positions }),

  addTrade: (trade) =>
    set((state) => ({
      trades: [trade, ...state.trades].slice(0, 100), // Keep last 100 trades
    })),

  setSelectedMarket: (market) => set({ selectedMarket: market }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  clearTrades: () => set({ trades: [] }),
}))

// Demo data for presentation
export const DEMO_MARKETS: Market[] = [
  {
    address: 'DemoMarket1111111111111111111111111111111',
    question: 'Will Bitcoin reach $100,000 by end of 2025?',
    yesPrice: 0.45,
    noPrice: 0.55,
    endTime: new Date('2025-12-31'),
    isResolved: false,
    liquidity: 15000,
    volume24h: 2500,
  },
  {
    address: 'DemoMarket2222222222222222222222222222222',
    question: 'Will Ethereum transition to deflationary by Q2 2025?',
    yesPrice: 0.62,
    noPrice: 0.38,
    endTime: new Date('2025-06-30'),
    isResolved: false,
    liquidity: 8500,
    volume24h: 1200,
  },
  {
    address: 'DemoMarket3333333333333333333333333333333',
    question: 'Will Solana TVL exceed $10B in 2025?',
    yesPrice: 0.58,
    noPrice: 0.42,
    endTime: new Date('2025-12-31'),
    isResolved: false,
    liquidity: 12000,
    volume24h: 3100,
  },
  {
    address: 'DemoMarket4444444444444444444444444444444',
    question: 'Will the Fed cut rates 3+ times in 2025?',
    yesPrice: 0.35,
    noPrice: 0.65,
    endTime: new Date('2025-12-31'),
    isResolved: false,
    liquidity: 25000,
    volume24h: 5600,
  },
]

export const DEMO_POSITIONS: Position[] = [
  {
    market: 'DemoMarket1111111111111111111111111111111',
    marketQuestion: 'Will Bitcoin reach $100,000 by end of 2025?',
    yesShares: 50,
    noShares: 0,
    entryPriceYes: 0.42,
    totalInvested: 21,
    unrealizedPnl: 1.5,
  },
  {
    market: 'DemoMarket3333333333333333333333333333333',
    marketQuestion: 'Will Solana TVL exceed $10B in 2025?',
    yesShares: 0,
    noShares: 30,
    entryPriceNo: 0.40,
    totalInvested: 12,
    unrealizedPnl: 0.6,
  },
]
