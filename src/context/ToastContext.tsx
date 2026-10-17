import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const STYLES: Record<ToastKind, string> = {
  success: 'border-brand-500/30 bg-brand-50 text-brand-900 dark:bg-brand-950/60 dark:text-brand-100',
  error: 'border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-100',
  info: 'border-sky-500/30 bg-sky-50 text-sky-900 dark:bg-sky-950/60 dark:text-sky-100',
  warning: 'border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, number>>({})

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current[id]
    if (timer) {
      window.clearTimeout(timer)
      delete timers.current[id]
    }
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }])
      timers.current[id] = window.setTimeout(() => dismiss(id), kind === 'error' ? 6500 : 4200)
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (message: string) => push('success', message),
      error: (message: string) => push('error', message),
      info: (message: string) => push('info', message),
      warning: (message: string) => push('warning', message),
    }),
    [toasts, push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind]
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft backdrop-blur animate-fade-up',
                STYLES[toast.kind],
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="flex-1 leading-relaxed">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-lg p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
