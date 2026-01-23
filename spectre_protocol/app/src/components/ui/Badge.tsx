import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30',
        secondary: 'bg-neon-purple/10 text-neon-purple border border-neon-purple/30',
        success: 'bg-status-success/10 text-status-success border border-status-success/30',
        warning: 'bg-status-warning/10 text-status-warning border border-status-warning/30',
        error: 'bg-status-error/10 text-status-error border border-status-error/30',
        outline: 'text-white/70 border border-glass-border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  pulse?: boolean
}

function Badge({ className, variant, pulse, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), pulse && 'animate-pulse', className)} {...props} />
  )
}

export { Badge, badgeVariants }
