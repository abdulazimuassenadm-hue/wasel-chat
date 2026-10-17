import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { isValidEmail } from '@/lib/utils'
import { NotConfigured } from './NotConfigured'
import { AuthShell } from './AuthShell'

export function Login() {
  const { t } = useApp()
  const { signIn, signInWithGoogle, configured, loading } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)

  if (!configured) return <NotConfigured />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!email.trim()) return setError(t('email_required'))
    if (!isValidEmail(email)) return setError(t('invalid_email'))
    if (!password) return setError(t('password_required'))
    try {
      await signIn({ email, password })
      navigate('/app/chats', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login_error'))
    }
  }

  const google = async () => {
    setGoogleBusy(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('generic_error'))
      setGoogleBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('auth_welcome_back')}
      subtitle={t('auth_login_subtitle')}
      footer={
        <p className="text-center text-sm text-ink-500 dark:text-ink-400">
          {t('no_account')}{' '}
          <Link to="/signup" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('signup')}
          </Link>
        </p>
      }
    >
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
        <TextField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          icon={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <div className="mb-4 flex justify-end">
          <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('forgot_password')}
          </Link>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <Button type="submit" full size="lg" loading={loading}>
          {t('login')}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
        <span className="text-xs font-semibold text-ink-400">{t('or')}</span>
        <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
      </div>

      <Button variant="outline" full size="lg" onClick={() => void google()} loading={googleBusy}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
          />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
          />
        </svg>
        Google
      </Button>
    </AuthShell>
  )
}
