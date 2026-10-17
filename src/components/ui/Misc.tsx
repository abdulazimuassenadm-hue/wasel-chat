import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return <Loader2 className={cn('animate-spin text-brand-600', className)} style={{ width: size, height: size }} />
}

export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-ink-500 dark:text-ink-400">
      <Spinner size={28} />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-ink-800 dark:text-ink-100">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">{description}</p>
      )}
      {action}
    </div>
  )
}

export function Badge({
  children,
  color = 'brand',
  className,
}: {
  children: ReactNode
  color?: 'brand' | 'rose' | 'amber' | 'sky' | 'ink' | 'emerald'
  className?: string
}) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-100 text-brand-800 dark:bg-brand-950/70 dark:text-brand-200',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200',
    ink: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold',
        colors[color],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function UnreadBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('wasel-card p-5', className)}>
      {title && (
        <header className="mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{title}</h2>
          {description && <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{description}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

export function ListRow({
  children,
  onClick,
  className,
  active,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  active?: boolean
}) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-start transition',
        onClick && 'hover:bg-ink-100/70 dark:hover:bg-ink-800/60',
        active && 'bg-brand-50 dark:bg-brand-950/40',
        className,
      )}
    >
      {children}
    </Component>
  )
}
