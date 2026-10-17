import { useState } from 'react'
import { KeyRound, Lock, LockOpen, ShieldCheck, Zap } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useChat } from '@/context/ChatContext'
import { MIN_PIN_LENGTH, useLock } from '@/context/LockContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Switch, TextField } from '@/components/ui/Field'
import { SectionCard } from '@/components/ui/Misc'

/**
 * الخصوصية والأمان: قفل التطبيق وقفل المحادثات.
 *
 * القفل محلي بالكامل: رمز PIN مُشتق بـ PBKDF2 (لا يُحفظ كنص صريح) وبياناته على
 * الجهاز فقط، ولا يمسّ جلسة Supabase ولا يُبطل تسجيل الدخول التلقائي.
 */
export function SecuritySection() {
  const { t } = useApp()
  const lock = useLock()
  const chat = useChat()
  const toast = useToast()

  const [modal, setModal] = useState<null | 'enable' | 'change' | 'disable'>(null)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setModal(null)
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
    setError(null)
    setBusy(false)
  }

  const lockedChats = lock.lockedChats
    .map((id) => ({ id, title: chat.conversations.find((c) => c.id === id)?.displayTitle ?? t('chat_locked_title') }))
    .filter((item) => Boolean(chat.conversations.find((c) => c.id === item.id)))

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (modal === 'disable') {
        if (!(await lock.disable(currentPin))) {
          setError(t('pin_wrong'))
          return
        }
        toast.success(t('pin_removed'))
        close()
        return
      }

      if (newPin.length < MIN_PIN_LENGTH) {
        setError(t('pin_too_short'))
        return
      }
      if (newPin !== confirmPin) {
        setError(t('pin_mismatch'))
        return
      }
      if (modal === 'change' && !(await lock.verify(currentPin))) {
        setError(t('pin_wrong'))
        return
      }
      await lock.setPin(newPin)
      toast.success(t('pin_saved'))
      close()
    } catch {
      setError(t('lock_not_supported'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionCard title={t('privacy_security')} description={t('security_intro')}>
        {!lock.supported ? (
          <p className="rounded-2xl bg-ink-50 p-4 text-xs leading-relaxed text-ink-500 dark:bg-ink-800/60 dark:text-ink-400">
            {t('lock_not_supported')}
          </p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                <Lock className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('app_lock')}</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{t('app_lock_desc')}</p>
              </div>
            </div>

            {lock.enabled && (
              <div className="mt-2 space-y-0.5">
                <Switch
                  label={t('lock_on_open')}
                  hint={t('lock_on_open_hint')}
                  checked={lock.lockOnOpen}
                  onChange={(value) => lock.setLockOnOpen(value)}
                />
                {lock.biometricSupported && (
                  <Switch
                    label={t('biometric_unlock')}
                    hint={lock.biometricEnabled ? t('biometric_enabled') : t('biometric_unavailable')}
                    checked={lock.biometricEnabled}
                    onChange={(value) => {
                      if (value) {
                        void lock.enableBiometric().then((ok) => {
                          if (ok) toast.success(t('biometric_enabled'))
                          else toast.error(t('biometric_failed'))
                        })
                      } else {
                        lock.disableBiometric()
                      }
                    }}
                  />
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {!lock.enabled ? (
                <Button size="sm" icon={<Lock className="h-4 w-4" />} onClick={() => setModal('enable')}>
                  {t('app_lock_enable')}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" icon={<KeyRound className="h-4 w-4" />} onClick={() => setModal('change')}>
                    {t('change_pin')}
                  </Button>
                  <Button size="sm" variant="outline" icon={<Zap className="h-4 w-4" />} onClick={() => lock.lockNow()}>
                    {t('lock_now')}
                  </Button>
                  <Button size="sm" variant="outline" icon={<LockOpen className="h-4 w-4" />} onClick={() => setModal('disable')}>
                    {t('app_lock_disable')}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title={t('locked_chats')} description={t('locked_chats_hint')}>
        {lockedChats.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-500 dark:text-ink-400">{t('no_locked_chats')}</p>
        )}
        {lockedChats.map((item) => (
          <div key={item.id} className="flex items-center gap-3 border-b border-ink-50 py-3 last:border-0 dark:border-ink-800/70">
            <Avatar src={null} name={item.title} id={item.id} size="md" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800 dark:text-ink-100">{item.title}</p>
            <Button size="sm" variant="outline" icon={<LockOpen className="h-4 w-4" />} onClick={() => lock.toggleChatLock(item.id)}>
              {t('unlock_chat')}
            </Button>
          </div>
        ))}
      </SectionCard>

      <SectionCard title={t('read_receipts')} description={t('read_receipts_note')}>
        <div className="flex items-start gap-3 rounded-2xl bg-ink-50 p-4 dark:bg-ink-800/60">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <p className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">{t('read_receipts_note')}</p>
        </div>
      </SectionCard>

      {/* تعيين / تغيير / إلغاء الرمز */}
      <Modal
        open={Boolean(modal)}
        onClose={close}
        title={modal === 'disable' ? t('app_lock_disable') : modal === 'change' ? t('change_pin') : t('set_pin_title')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              {t('save')}
            </Button>
          </>
        }
      >
        {modal !== 'enable' && (
          <TextField
            label={t('current_pin')}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={currentPin}
            onChange={(event) => setCurrentPin(event.target.value)}
          />
        )}
        {modal !== 'disable' && (
          <>
            <TextField
              label={t('new_pin')}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ''))}
            />
            <TextField
              label={t('confirm_pin')}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))}
            />
          </>
        )}
        {error && <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
      </Modal>
    </>
  )
}
