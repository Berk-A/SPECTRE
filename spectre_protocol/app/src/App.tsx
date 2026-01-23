import { useMemo } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { clusterApiUrl } from '@solana/web3.js'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets'
import { Toaster } from 'sonner'

// Wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css'

// Pages
import Dashboard from '@/pages/Dashboard'
import Shield from '@/pages/Shield'
import Strategy from '@/pages/Strategy'
import Trade from '@/pages/Trade'
import Positions from '@/pages/Positions'
import Withdraw from '@/pages/Withdraw'

// Layout
import PageLayout from '@/components/layout/PageLayout'

// Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

function App() {
  // Configure Solana network
  const network = WalletAdapterNetwork.Devnet
  const endpoint = useMemo(() => clusterApiUrl(network), [network])

  // Configure wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <BrowserRouter>
              <div className="min-h-screen bg-background grid-bg">
                <Routes>
                  <Route element={<PageLayout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/shield" element={<Shield />} />
                    <Route path="/strategy" element={<Strategy />} />
                    <Route path="/trade" element={<Trade />} />
                    <Route path="/positions" element={<Positions />} />
                    <Route path="/withdraw" element={<Withdraw />} />
                  </Route>
                </Routes>
              </div>
            </BrowserRouter>
            <Toaster
              theme="dark"
              position="bottom-right"
              toastOptions={{
                style: {
                  background: '#12121a',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'white',
                },
              }}
            />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  )
}

export default App
