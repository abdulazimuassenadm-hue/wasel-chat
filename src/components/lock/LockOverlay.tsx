import { useEffect, useState, type ReactNode } from 'react'
import { Delete, Fingerprint, Lock, ShieldAlert } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { MIN_PIN_LENGTH, useLock } from '@/context/LockContext'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Misc'
import { cn } from '@/lib/utils'

/**
 * لوحة إدخال رمز القفل — تُستخدم في قفل التطبيق وقفل المحادثات.
 * لا تعرض الرمز أبداً، وتعيده فقط عبر onSubmit.
 */
function PinEntry({
  title,
  subtitle,
  onSubmit,
  busy,
  error,
  onBiometric,
  biometricLabel,
}: {
  title: string
  subtitle?: string
  onSubmit: (pin: string) => void
  busy?: boolean
  error?: string | null
  onBiometric?: () => void
  biometricLabel?: string
}) {
  const { t } = useApp()
  const [pin, setPin] = useState('')

  useEffect(() => {
    setPin('')
  }, [title])

  const press = (digit: string) => {
    if (busy) return
    setPin((value) => (value.length >= 8 ? value : value + digit))
  }

  const back = () => setPin((value) => value.slice(0, -1))

  const submit = () => {
    if (pin.length < MIN_PIN_LENGTH) return
    onSubmit(pin)
    setPin('')
  }

  return (
    <div className="w-full max-w-xs text-center">
      <p className="text-base font-extrabold text-ink-900 dark:text-ink-50">{title}</p>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{subtitle}</p>}

      {/* نقاط الرمز */}
      <div className="my-6 flex items-center justify-center gap-2.5" aria-label={t('enter_pin')}>
        {Array.from({ length: Math.max(MIN_PIN_LENGTH, pin.length) }).map((_, index) => (
          <span
            key={index}
            className={cn(
              'h-3.5 w-3.5 rounded-full transition',
              index < pin.length ? 'bg-brand-600 dark:bg-brand-400' : 'bg-ink-200 dark:bg-ink-700',
            )}
          />
        ))}
      </div>

      {error && (
        <p className="mb-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
          <ShieldAlert className="h-3.5 w-3.5" />
          {error}
        </p>
      )}

      {/* لوحة الأرقام */}
      <div className="mx-auto grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="flex h-14 items-center justify-center rounded-2xl bg-ink-100 text-xl font-bold text-ink-800 transition active:scale-95 dark:bg-ink-800 dark:text-ink-100"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={onBiometric}
          disabled={!onBiometric}
          className={cn(
            'flex h-14 items-center justify-center rounded-2xl transition active:scale-95',
            onBiometric ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300' : 'opacity-0',
          )}
          aria-label={biometricLabel}
          title={biometricLabel}
        >
          <Fingerprint className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => press('0')}
          className="flex h-14 items-center justify-center rounded-2xl bg-ink-100 text-xl font-bold text-ink-800 transition active:scale-95 dark:bg-ink-800 dark:text-ink-100"
        >
          0
        </button>
        <button
          type="button"
          onClick={back}
          className="flex h-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-600 transition active:scale-95 dark:bg-ink-800 dark:text-ink-300"
          aria-label={t('cancel')}
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>

      <Button className="mt-5 w-full" onClick={submit} disabled={pin.length < MIN_PIN_LENGTH} loading={busy}>
        {t('unlock')}
      </Button>
    </div>
  )
}

/** قفل التطبيق الكامل — طبقة تغطي الواجهة حتى إدخال الرمز */
export function LockOverlay() {
  const { t } = useApp()
  const { signOut } = useAuth()
  const { unlock, unlockWithBiometric, biometricEnabled, locked, enabled } = useLock()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)

  if (!enabled || !locked) return null

  const submit = async (pin: string) => {
    setBusy(true)
    setError(null)
    try {
      const ok = await unlock(pin)
      if (!ok) setError(t('pin_wrong'))
    } finally {
      setBusy(false)
    }
  }

  const biometric = async () => {
    setError(null)
    const ok = await unlockWithBiometric()
    if (!ok) setError(t('biometric_failed'))
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-ink-50 px-6 dark:bg-ink-950">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-600 text-white shadow-soft">
          <Lock className="h-8 w-8" />
        </span>
        <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{t('app_name')}</p>
      </div>

      <PinEntry
        title={t('app_locked_title')}
        subtitle={t('app_locked_subtitle')}
        onSubmit={(pin) => void submit(pin)}
        busy={busy}
        error={error}
        onBiometric={biometricEnabled ? () => void biometric() : undefined}
        biometricLabel={t('use_biometric')}
      />

      <button
        type="button"
        onClick={() => setForgot(true)}
        className="mt-6 text-xs font-semibold text-ink-500 underline hover:text-ink-700 dark:text-ink-400"
      >
        {t('forgot_pin')}
      </button>

      <ConfirmDialog
        open={forgot}
        title={t('forgot_pin')}
        message={t('forgot_pin_hint')}
        confirmLabel={t('logout')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setForgot(false)}
        onConfirm={async () => {
          setForgot(false)
          await signOut()
          toast.info(t('signed_out'))
        }}
      />
    </div>
  )
}

/** بوابة قفل محادثة معيّنة — تُعرض بدل نافذة المحادثة حتى إدخال الرمز */
export function ChatLockGate({ conversationId, children }: { conversationId: string; children: ReactNode }) {
  const { t } = useApp()
  const { isChatLocked, isChatUnlocked, verify, markChatUnlocked } = useLock()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locked = isChatLocked(conversationId) && !isChatUnlocked(conversationId)

  if (!locked) return <>{children}</>

  const submit = async (pin: string) => {
    setBusy(true)
    setError(null)
    try {
      const ok = await verify(pin)
      if (ok) markChatUnlocked(conversationId)
      else setError(t('pin_wrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-ink-50 px-6 dark:bg-ink-950">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
        <Lock className="h-7 w-7" />
      </span>
      <PinEntry
        title={t('chat_locked_title')}
        subtitle={t('chat_locked_hint')}
        onSubmit={(pin) => void submit(pin)}
        busy={busy}
        error={error}
      />
    </div>
  )
}

/** شاشة انتظار صغيرة أثناء تجهيز القفل */
export function LockLoading() {
  return (
    <div className="flex items-center justify-center py-6">
      <Spinner />
    </div>
  )
}
