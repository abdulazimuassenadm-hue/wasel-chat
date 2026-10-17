import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'subtle'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  full?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-soft active:scale-[0.98]',
  outline:
    'border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:hover:bg-ink-800',
  ghost: 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98]',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950/70 dark:text-brand-100',
}

const SIZES = {
  sm: 'px-3 py-2 text-xs rounded-xl',
  md: 'px-4 py-2.5 text-sm rounded-2xl',
  lg: 'px-6 py-3.5 text-base rounded-2xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'solid' | 'outline'
}

export function IconButton({ label, size = 'md', variant = 'ghost', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-full transition active:scale-95',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        variant === 'ghost' && 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
        variant === 'solid' && 'bg-brand-600 text-white hover:bg-brand-700',
        variant === 'outline' &&
          'border border-ink-200 bg-white/80 text-ink-700 hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-900/70 dark:text-ink-200',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
