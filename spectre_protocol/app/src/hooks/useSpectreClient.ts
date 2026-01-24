import { useMemo, useEffect, useState, useCallback } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { DEMO_MODE, SPECTRE_PROGRAM_ID } from '@/lib/config/constants'

// Import browser-compatible clients
import { getBrowserPrivacyClient, type BrowserPrivacyClient, type DepositNote, type ShieldProgress, type UnshieldProgress } from '@/lib/privacy/BrowserPrivacyClient'
import { getBrowserPnpClient, type BrowserPnpClient, type PnpMarket, type Position } from '@/lib/pnp/BrowserPnpClient'
import { getBrowserTeeClient, type BrowserTeeClient, type DelegationStatus } from '@/lib/tee/BrowserTeeClient'
import { getCircuitLoader, preloadCircuits, type LoadProgress } from '@/lib/privacy/circuitLoader'

// Range Protocol API configuration
const RANGE_API_BASE = 'https://api.range.org'
const RANGE_API_KEY = 'cmkmprr1d002cns0190metogx.yj3hFQk2jW2zCZtGlg1RdF89hrFJ6lSV'

export interface SpectreClients {
  isReady: boolean
  isConnected: boolean
  walletAddress: string | null
  // Circuit loading state
  circuitsLoaded: boolean
  circuitProgress: LoadProgress | null
  // Clients
  privacyClient: PrivacyClient | null
  teeClient: TeeClient | null
  pnpClient: PnpClient | null
  rangeClient: RangeClient | null
  // Preload function
  preloadCircuits: (onProgress?: (progress: LoadProgress) => void) => Promise<void>
}

// Type definitions for client methods
export interface PrivacyClient {
  shieldSol: (amount: number, onProgress?: (progress: ShieldProgress) => void) => Promise<ShieldResult>
  unshieldSol: (note: DepositNote, recipient: string, onProgress?: (progress: UnshieldProgress) => void) => Promise<UnshieldResult>
  getShieldedSolBalance: () => Promise<number>
  getUnspentNotes: () => Promise<DepositNote[]>
  exportNotes: (password: string) => Promise<string>
  importNotes: (encrypted: string, password: string) => Promise<void>
}

export interface TeeClient {
  delegateVault: (authority: PublicKey) => Promise<DelegationResult>
  undelegateVault: (authority: PublicKey) => Promise<DelegationResult>
  checkDelegationStatus: (authority: PublicKey) => Promise<DelegationStatus>
  getTeeHealth: () => Promise<{ healthy: boolean; latencyMs: number; slot: number }>
  executeOnTee: (transaction: Transaction) => Promise<TeeExecutionResult>
}

export interface PnpClient {
  fetchActiveMarkets: () => Promise<PnpMarket[]>
  fetchMarketAddresses: () => Promise<string[]>
  executeTrade: (market: string, side: 'yes' | 'no', amount: number) => Promise<TradeResult>
  getPositions: () => Promise<Position[]>
  claimWinnings: (market: string) => Promise<TradeResult>
}

export interface RangeClient {
  getAddressRisk: (address: PublicKey | string) => Promise<RiskAssessment>
  checkCompliance: (address: PublicKey | string) => Promise<ComplianceResult>
}

// Result types
interface ShieldResult {
  success: boolean
  signature?: string
  note?: DepositNote
  error?: string
}

interface UnshieldResult {
  success: boolean
  signature?: string
  amountReceived?: number
  error?: string
}

interface DelegationResult {
  success: boolean
  signature?: string
  error?: string
}

interface TeeExecutionResult {
  success: boolean
  signature?: string
  l2Slot?: number
  executionTimeMs?: number
  error?: string
}

interface TradeResult {
  success: boolean
  signature?: string
  sharesReceived?: number
  executionPrice?: number
  error?: string
}

interface RiskAssessment {
  riskScore: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  isSanctioned: boolean
  isBlacklisted: boolean
  hasMaliciousConnections: boolean
  numHops: number
}

interface ComplianceResult {
  passed: boolean
  riskScore: number
  riskLevel: string
  isSanctioned: boolean
  hasMaliciousConnections: boolean
}

export function useSpectreClient(): SpectreClients {
  const { connection } = useConnection()
  const { publicKey, connected, signTransaction, signAllTransactions } = useWallet()
  const [circuitsLoaded, setCircuitsLoaded] = useState(false)
  const [circuitProgress, setCircuitProgress] = useState<LoadProgress | null>(null)

  // Create and configure browser clients
  const browserClients = useMemo(() => {
    const privacyClient = getBrowserPrivacyClient(connection)
    const pnpClient = getBrowserPnpClient(connection)
    const teeClient = getBrowserTeeClient()

    // Set wallet when connected
    if (publicKey && signTransaction) {
      privacyClient.setWallet(publicKey, signTransaction as (tx: Transaction) => Promise<Transaction>)
      pnpClient.setWallet(publicKey, signTransaction as (tx: Transaction) => Promise<Transaction>)
      teeClient.setWallet(
        publicKey,
        signTransaction as (tx: Transaction) => Promise<Transaction>,
        signAllTransactions as ((txs: Transaction[]) => Promise<Transaction[]>) | undefined
      )
    }

    return { privacyClient, pnpClient, teeClient }
  }, [connection, publicKey, signTransaction, signAllTransactions])

  // Preload circuits in background on mount
  useEffect(() => {
    const loader = getCircuitLoader()
    loader.isCached().then(cached => {
      if (cached) {
        setCircuitsLoaded(true)
      }
    })
  }, [])

  // Preload function
  const handlePreloadCircuits = useCallback(async (onProgress?: (progress: LoadProgress) => void) => {
    if (circuitsLoaded) return

    const progressHandler = (progress: LoadProgress) => {
      setCircuitProgress(progress)
      onProgress?.(progress)
    }

    await preloadCircuits(progressHandler)
    setCircuitsLoaded(true)
  }, [circuitsLoaded])

  const clients = useMemo(() => {
    const walletAddress = publicKey?.toBase58() || null

    if (DEMO_MODE) {
      return {
        isReady: true,
        isConnected: connected,
        walletAddress,
        circuitsLoaded: true,
        circuitProgress: null,
        privacyClient: createMockPrivacyClient(),
        teeClient: createMockTeeClient(),
        pnpClient: createMockPnpClient(),
        rangeClient: createMockRangeClient(),
        preloadCircuits: async () => {},
      }
    }

    // Production mode - use browser-compatible clients
    return {
      isReady: connected && publicKey !== null,
      isConnected: connected,
      walletAddress,
      circuitsLoaded,
      circuitProgress,
      privacyClient: createWrappedPrivacyClient(browserClients.privacyClient),
      teeClient: createWrappedTeeClient(browserClients.teeClient),
      pnpClient: createWrappedPnpClient(browserClients.pnpClient),
      rangeClient: createBrowserRangeClient(),
      preloadCircuits: handlePreloadCircuits,
    }
  }, [connection, publicKey, connected, circuitsLoaded, circuitProgress, browserClients, handlePreloadCircuits])

  return clients
}

// ============================================
// Wrapper Functions for Browser Clients
// ============================================

function createWrappedPrivacyClient(client: BrowserPrivacyClient): PrivacyClient {
  return {
    shieldSol: async (amount, onProgress) => {
      return client.shieldSol(amount, onProgress)
    },
    unshieldSol: async (note, recipient, onProgress) => {
      return client.unshieldSol(note, recipient, onProgress)
    },
    getShieldedSolBalance: async () => {
      return client.getShieldedBalance()
    },
    getUnspentNotes: async () => {
      return client.getUnspentNotes()
    },
    exportNotes: async (password) => {
      return client.exportNotes(password)
    },
    importNotes: async (encrypted, password) => {
      return client.importNotes(encrypted, password)
    },
  }
}

function createWrappedTeeClient(client: BrowserTeeClient): TeeClient {
  return {
    delegateVault: async (authority) => {
      return client.delegateVault(authority)
    },
    undelegateVault: async (authority) => {
      const result = await client.undelegateVault(authority)
      return {
        success: result.success,
        signature: result.signature,
        error: result.error,
      }
    },
    checkDelegationStatus: async (authority) => {
      return client.checkDelegationStatus(authority)
    },
    getTeeHealth: async () => {
      return client.getTeeHealth()
    },
    executeOnTee: async (transaction) => {
      return client.executeOnTee(transaction)
    },
  }
}

function createWrappedPnpClient(client: BrowserPnpClient): PnpClient {
  return {
    fetchActiveMarkets: async () => {
      return client.fetchActiveMarkets()
    },
    fetchMarketAddresses: async () => {
      const markets = await client.fetchActiveMarkets()
      return markets.map(m => m.address)
    },
    executeTrade: async (market, side, amount) => {
      return client.executeTrade(market, side, amount)
    },
    getPositions: async () => {
      return client.getPositions()
    },
    claimWinnings: async (market) => {
      return client.claimWinnings(market)
    },
  }
}

function createBrowserRangeClient(): RangeClient {
  return {
    getAddressRisk: async (address: PublicKey | string) => {
      const addressStr = typeof address === 'string' ? address : address.toBase58()

      try {
        // Call Range Protocol API
        const response = await fetch(
          `${RANGE_API_BASE}/v1/risk/address?address=${addressStr}&network=solana`,
          {
            headers: {
              'Authorization': `Bearer ${RANGE_API_KEY}`,
              'X-API-KEY': RANGE_API_KEY,
              'Content-Type': 'application/json',
            },
          }
        )

        if (!response.ok) {
          if (response.status === 429) {
            console.warn('[Range] Rate limited, returning default low risk')
            return {
              riskScore: 5,
              riskLevel: 'low' as const,
              isSanctioned: false,
              isBlacklisted: false,
              hasMaliciousConnections: false,
              numHops: 0,
            }
          }
          throw new Error(`Range API error: ${response.status}`)
        }

        const data = await response.json()

        // Map risk score to level
        let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
        if (data.riskScore > 80) riskLevel = 'critical'
        else if (data.riskScore > 50) riskLevel = 'high'
        else if (data.riskScore > 20) riskLevel = 'medium'

        return {
          riskScore: data.riskScore || 0,
          riskLevel,
          isSanctioned: data.is_ofac_sanctioned || false,
          isBlacklisted: data.is_token_blacklisted || false,
          hasMaliciousConnections: (data.riskScore || 0) > 50,
          numHops: 0,
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('[Range] API error:', errorMessage)
        // Return safe default on error
        return {
          riskScore: 5,
          riskLevel: 'low' as const,
          isSanctioned: false,
          isBlacklisted: false,
          hasMaliciousConnections: false,
          numHops: 0,
        }
      }
    },

    checkCompliance: async (address: PublicKey | string) => {
      const risk = await createBrowserRangeClient().getAddressRisk(address)
      const passed = risk.riskScore <= 30 && !risk.isSanctioned && !risk.hasMaliciousConnections

      return {
        passed,
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        isSanctioned: risk.isSanctioned,
        hasMaliciousConnections: risk.hasMaliciousConnections,
      }
    },
  }
}

// ============================================
// Demo Markets Data
// ============================================

function getDemoMarkets(): PnpMarket[] {
  return [
    {
      address: 'demo_market_1',
      question: 'Will BTC reach $100k by end of Q1 2026?',
      yesPrice: 0.65,
      noPrice: 0.35,
      yesShares: 50000,
      noShares: 50000,
      endTime: new Date('2026-03-31'),
      isResolved: false,
      liquidity: 50000,
      volume24h: 12500,
      creator: 'demo_creator',
    },
    {
      address: 'demo_market_2',
      question: 'Will ETH flip BTC market cap in 2026?',
      yesPrice: 0.15,
      noPrice: 0.85,
      yesShares: 35000,
      noShares: 35000,
      endTime: new Date('2026-12-31'),
      isResolved: false,
      liquidity: 35000,
      volume24h: 8200,
      creator: 'demo_creator',
    },
    {
      address: 'demo_market_3',
      question: 'Will Solana TVL exceed $50B by June 2026?',
      yesPrice: 0.45,
      noPrice: 0.55,
      yesShares: 28000,
      noShares: 28000,
      endTime: new Date('2026-06-30'),
      isResolved: false,
      liquidity: 28000,
      volume24h: 6800,
      creator: 'demo_creator',
    },
  ]
}

// ============================================
// Mock Clients for Demo Mode
// ============================================

function createMockPrivacyClient(): PrivacyClient {
  return {
    shieldSol: async (amount: number) => ({
      success: true,
      signature: 'mock_sig_' + Date.now(),
      note: {
        commitment: Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(''),
        nullifier: Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(''),
        secret: Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(''),
        amount: amount * 1e9,
        tokenType: 'SOL' as const,
        createdAt: new Date(),
        spent: false,
      },
    }),
    unshieldSol: async () => ({
      success: true,
      signature: 'mock_sig_' + Date.now(),
      amountReceived: 1e9,
    }),
    getShieldedSolBalance: async () => 2.5e9,
    getUnspentNotes: async () => [],
    exportNotes: async () => '{}',
    importNotes: async () => {},
  }
}

function createMockTeeClient(): TeeClient {
  return {
    delegateVault: async () => ({
      success: true,
      signature: 'mock_sig_' + Date.now(),
    }),
    undelegateVault: async () => ({
      success: true,
      signature: 'mock_sig_' + Date.now(),
    }),
    checkDelegationStatus: async (authority: PublicKey) => {
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('spectre_vault'), authority.toBuffer()],
        new PublicKey(SPECTRE_PROGRAM_ID)
      )
      return {
        isDelegated: false,
        vaultPda: vaultPda.toBase58(),
        owner: authority.toBase58(),
      }
    },
    getTeeHealth: async () => ({
      healthy: true,
      latencyMs: 50,
      slot: 123456789,
    }),
    executeOnTee: async () => ({
      success: true,
      signature: 'mock_sig_' + Date.now(),
      l2Slot: 123456789,
      executionTimeMs: 400,
    }),
  }
}

function createMockPnpClient(): PnpClient {
  return {
    fetchActiveMarkets: async () => getDemoMarkets(),
    fetchMarketAddresses: async () => getDemoMarkets().map(m => m.address),
    executeTrade: async () => ({
      success: true,
      signature: 'mock_sig_' + Date.now(),
      sharesReceived: 10,
      executionPrice: 0.45,
    }),
    getPositions: async () => [],
    claimWinnings: async () => ({
      success: true,
      signature: 'mock_sig_' + Date.now(),
    }),
  }
}

function createMockRangeClient(): RangeClient {
  return {
    getAddressRisk: async () => ({
      riskScore: 5,
      riskLevel: 'low' as const,
      isSanctioned: false,
      isBlacklisted: false,
      hasMaliciousConnections: false,
      numHops: 0,
    }),
    checkCompliance: async () => ({
      passed: true,
      riskScore: 5,
      riskLevel: 'low',
      isSanctioned: false,
      hasMaliciousConnections: false,
    }),
  }
}

export default useSpectreClient
