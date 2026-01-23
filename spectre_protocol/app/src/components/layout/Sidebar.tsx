import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Shield,
  Cpu,
  TrendingUp,
  BarChart3,
  ArrowDownToLine,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Shield', href: '/shield', icon: Shield },
  { name: 'Strategy', href: '/strategy', icon: Cpu },
  { name: 'Trade', href: '/trade', icon: TrendingUp },
  { name: 'Positions', href: '/positions', icon: BarChart3 },
  { name: 'Withdraw', href: '/withdraw', icon: ArrowDownToLine },
]

interface SidebarProps {
  open?: boolean
  onClose?: () => void
}

export function Sidebar({ open = true, onClose }: SidebarProps) {
  const location = useLocation()

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-glass-border bg-background-secondary/95 backdrop-blur-xl transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile close button */}
        <div className="flex h-16 items-center justify-between border-b border-glass-border px-4 md:hidden">
          <span className="text-lg font-bold text-neon-cyan">SPECTRE</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href

            return (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 shadow-neon-cyan'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                )}
              >
                <item.icon
                  className={cn(
                    'h-5 w-5',
                    isActive && 'text-neon-cyan'
                  )}
                />
                {item.name}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-glass-border p-4">
          <div className="rounded-lg bg-gradient-to-r from-neon-cyan/10 to-neon-purple/10 p-4 border border-glass-border">
            <h4 className="text-sm font-medium text-white">Privacy Sandwich</h4>
            <p className="mt-1 text-xs text-white/50">
              3-layer architecture for confidential trading
            </p>
            <div className="mt-3 flex gap-2">
              <div className="h-1 flex-1 rounded bg-neon-cyan/50" />
              <div className="h-1 flex-1 rounded bg-neon-purple/50" />
              <div className="h-1 flex-1 rounded bg-status-success/50" />
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
