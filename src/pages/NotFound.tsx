import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'

export function NotFound() {
  const { t } = useApp()
  const { session } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink-50 px-4 text-center dark:bg-ink-950">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
        <Compass className="h-9 w-9" />
      </span>
      <h1 className="text-3xl font-extrabold text-ink-900 dark:text-ink-50">404</h1>
      <p className="text-sm text-ink-500 dark:text-ink-400">{t('page_not_found')}</p>
      <Link
        to={session ? '/app/chats' : '/'}
        className="mt-2 inline-flex items-center rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700"
      >
        {session ? t('nav_chats') : t('go_home')}
      </Link>
    </div>
  )
}
