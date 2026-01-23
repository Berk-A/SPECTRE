import { Link } from 'react-router-dom'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { Shield, Menu } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

interface HeaderProps {
  onMenuClick?: () => void
  className?: string
}

export function Header({ onMenuClick, className }: HeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b border-glass-border bg-background/80 backdrop-blur-xl',
        className
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* Logo and mobile menu */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <Shield className="h-8 w-8 text-neon-cyan transition-all group-hover:scale-110" />
              <div className="absolute inset-0 blur-lg bg-neon-cyan/30 group-hover:bg-neon-cyan/50 transition-all" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-neon-cyan text-glow-cyan">SPECTRE</span>
              </h1>
              <p className="text-[10px] text-white/40 -mt-1">
                Confidential Market Maker
              </p>
            </div>
          </Link>
        </div>

        {/* Network badge and wallet */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-neon-purple/10 border border-neon-purple/30">
            <div className="w-2 h-2 rounded-full bg-neon-purple animate-pulse" />
            <span className="text-xs font-medium text-neon-purple">Devnet</span>
          </div>

          <WalletMultiButton className="!h-10" />
        </div>
      </div>
    </header>
  )
}

export default Header
