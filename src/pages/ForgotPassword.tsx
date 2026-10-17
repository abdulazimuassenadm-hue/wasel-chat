import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { isValidEmail } from '@/lib/utils'
import { NotConfigured } from './NotConfigured'
import { AuthShell } from './AuthShell'

export function ForgotPassword() {
  const { t } = useApp()
  const { sendPasswordReset, configured, loading } = useAuth()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (!configured) return <NotConfigured />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!isValidEmail(email)) return setError(t('invalid_email'))
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('generic_error'))
    }
  }

  return (
    <AuthShell
      title={t('reset_password')}
      subtitle={t('reset_password_subtitle')}
      footer={
        <p className="text-center text-sm text-ink-500 dark:text-ink-400">
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('back_to_login')}
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="rounded-2xl bg-brand-50 p-5 text-center dark:bg-brand-950/50">
          <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">{t('reset_sent')}</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <TextField
            label={t('email')}
            type="email"
            autoComplete="email"
            icon={<Mail className="h-4 w-4" />}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          {error && (
            <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
          <Button type="submit" full size="lg" loading={loading}>
            {t('send_reset_link')}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
