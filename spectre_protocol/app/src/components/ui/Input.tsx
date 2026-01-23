import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, icon, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-sm font-medium text-white/80">{label}</label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              'flex h-10 w-full rounded-lg border border-glass-border bg-background-secondary px-3 py-2 text-sm',
              'placeholder:text-white/40',
              'focus:outline-none focus:ring-2 focus:ring-neon-cyan/50 focus:border-neon-cyan/50',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-all duration-200',
              icon && 'pl-10',
              error && 'border-status-error focus:ring-status-error/50 focus:border-status-error/50',
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-status-error">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
