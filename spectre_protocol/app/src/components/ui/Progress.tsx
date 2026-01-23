import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '@/lib/utils'

interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  variant?: 'cyan' | 'purple' | 'green' | 'warning' | 'danger'
  showValue?: boolean
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, variant = 'cyan', showValue = false, ...props }, ref) => {
  const colorClasses = {
    cyan: 'bg-neon-cyan shadow-neon-cyan',
    purple: 'bg-neon-purple shadow-neon-purple',
    green: 'bg-status-success shadow-neon-green',
    warning: 'bg-status-warning',
    danger: 'bg-status-error',
  }

  return (
    <div className="relative">
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full bg-white/10',
          className
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            'h-full w-full flex-1 transition-all duration-500 ease-out',
            colorClasses[variant]
          )}
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      </ProgressPrimitive.Root>
      {showValue && (
        <span className="absolute -top-6 right-0 text-xs text-white/60">
          {value}%
        </span>
      )}
    </div>
  )
})

Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
