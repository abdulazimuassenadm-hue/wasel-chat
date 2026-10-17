import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  danger?: boolean
  onClick: () => void
}

interface DropdownProps {
  trigger: (open: boolean) => ReactNode
  items: MenuItem[]
  align?: 'start' | 'end'
  className?: string
}

export function Dropdown({ trigger, items, align = 'end', className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className={cn('relative', className)} ref={ref}>
      <div onClick={() => setOpen((value) => !value)}>{trigger(open)}</div>
      {open && (
        <div
          className={cn(
            'absolute top-full z-50 mt-2 min-w-[190px] overflow-hidden rounded-2xl border border-ink-200 bg-white py-1.5 shadow-soft animate-pop-in dark:border-ink-700 dark:bg-ink-900',
            align === 'end' ? 'end-0' : 'start-0',
          )}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm font-medium transition',
                item.danger
                  ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
                  : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
