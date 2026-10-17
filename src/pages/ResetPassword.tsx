import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { NotConfigured } from './NotConfigured'
import { AuthShell } from './AuthShell'

export function ResetPassword() {
  const { t } = useApp()
  const { updatePassword, configured, loading, session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!configured) return <NotConfigured />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8) return setError(t('password_too_short'))
    if (password !== confirm) return setError(t('password_mismatch'))
    try {
      await updatePassword(password)
      toast.success(t('password_updated'))
      navigate('/app/chats', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('generic_error'))
    }
  }

  return (
    <AuthShell title={t('set_new_password')} subtitle={t('new_password_hint')}>
      {!session && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {t('generic_error')}
        </p>
      )}
      <form onSubmit={submit} noValidate>
        <TextField
          label={t('new_password')}
          type="password"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextField
          label={t('confirm_password')}
          type="password"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        <Button type="submit" full size="lg" loading={loading}>
          {t('save')}
        </Button>
      </form>
    </AuthShell>
  )
}
