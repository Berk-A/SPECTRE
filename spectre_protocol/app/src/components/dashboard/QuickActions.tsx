import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shield, Cpu, TrendingUp, ArrowDownToLine } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'

interface QuickActionProps {
  title: string
  description: string
  icon: React.ReactNode
  href: string
  color: string
  delay?: number
}

function QuickAction({
  title,
  description,
  icon,
  href,
  color,
  delay = 0,
}: QuickActionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
    >
      <Link to={href}>
        <Card
          hover
          className={cn(
            'group cursor-pointer transition-all duration-300',
            'hover:border-opacity-50',
            color.replace('text-', 'hover:border-')
          )}
        >
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'p-3 rounded-lg transition-all duration-300',
                color.replace('text-', 'bg-') + '/10',
                'group-hover:' + color.replace('text-', 'bg-') + '/20',
                'group-hover:scale-110'
              )}
            >
              {icon}
            </div>
            <div>
              <h4 className="font-medium">{title}</h4>
              <p className="text-sm text-white/50">{description}</p>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  )
}

export function QuickActions() {
  const actions: QuickActionProps[] = [
    {
      title: 'Shield Funds',
      description: 'Deposit SOL into privacy pool',
      icon: <Shield className="h-6 w-6 text-neon-cyan" />,
      href: '/shield',
      color: 'text-neon-cyan',
    },
    {
      title: 'Delegate to TEE',
      description: 'Enable confidential trading',
      icon: <Cpu className="h-6 w-6 text-neon-purple" />,
      href: '/strategy',
      color: 'text-neon-purple',
    },
    {
      title: 'Trade Markets',
      description: 'Browse prediction markets',
      icon: <TrendingUp className="h-6 w-6 text-status-success" />,
      href: '/trade',
      color: 'text-status-success',
    },
    {
      title: 'Withdraw',
      description: 'Compliant withdrawal flow',
      icon: <ArrowDownToLine className="h-6 w-6 text-status-warning" />,
      href: '/withdraw',
      color: 'text-status-warning',
    },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      <div className="grid gap-3">
        {actions.map((action, i) => (
          <QuickAction key={action.title} {...action} delay={i * 0.1} />
        ))}
      </div>
    </div>
  )
}

export default QuickActions
