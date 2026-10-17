import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { isValidEmail } from '@/lib/utils'
import { NotConfigured } from './NotConfigured'
import { AuthShell } from './AuthShell'

export function Signup() {
  const { t } = useApp()
  const { signUp, signInWithGoogle, configured, loading } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)

  if (!configured) return <NotConfigured />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setInfo(null)
    if (!displayName.trim()) return setError(t('name_required'))
    if (!isValidEmail(email)) return setError(t('invalid_email'))
    if (password.length < 8) return setError(t('password_too_short'))
    if (password !== confirm) return setError(t('password_mismatch'))

    try {
      const { needsEmailConfirm } = await signUp({ email, password, displayName })
      if (needsEmailConfirm) {
        setInfo(t('signup_success'))
      } else {
        navigate('/setup', { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('signup_error'))
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
      title={t('auth_create_account')}
      subtitle={t('auth_signup_subtitle')}
      footer={
        <p className="text-center text-sm text-ink-500 dark:text-ink-400">
          {t('have_account')}{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('login')}
          </Link>
        </p>
      }
    >
      {info ? (
        <div className="rounded-2xl bg-brand-50 p-5 text-center dark:bg-brand-950/50">
          <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">{info}</p>
          <Link to="/login" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {t('back_to_login')}
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={submit} noValidate>
            <TextField
              label={t('display_name')}
              autoComplete="name"
              icon={<User className="h-4 w-4" />}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={50}
            />
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
              autoComplete="new-password"
              icon={<Lock className="h-4 w-4" />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint={t('password_too_short')}
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
              {t('signup')}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
            <span className="text-xs font-semibold text-ink-400">{t('or')}</span>
            <span className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
          </div>

          <Button variant="outline" full size="lg" onClick={() => void google()} loading={googleBusy}>
            Google
          </Button>
        </>
      )}
    </AuthShell>
  )
}
