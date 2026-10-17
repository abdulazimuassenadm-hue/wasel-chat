import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Languages, Moon, Sun } from 'lucide-react'
import { useApp } from '@/context/AppContext'

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const { t, lang, setLang, isDark, toggleTheme, dir } = useApp()
  const navigate = useNavigate()
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50 dark:bg-ink-950">
      <header className="flex items-center gap-2 px-4 py-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          aria-label={t('back')}
        >
          <Back className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden>
              <path
                d="M32 13c-10.5 0-19 7.4-19 16.6 0 5.2 2.7 9.8 7 12.9-.4 2.6-1.7 5.3-4.1 7.4 3.9-.3 7.4-1.6 10.2-3.5 1.9.4 3.9.6 5.9.6 10.5 0 19-7.4 19-16.6S42.5 13 32 13z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className="text-sm font-extrabold text-ink-900 dark:text-ink-50">{t('app_name')}</span>
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          title={t('language')}
        >
          <Languages className="h-4 w-4" />
          ع/EN
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          title={isDark ? t('light_mode') : t('dark_mode')}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-6 shadow-soft dark:border-ink-800 dark:bg-ink-900 sm:p-8">
          <h1 className="text-2xl font-extrabold text-ink-900 dark:text-ink-50">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t border-ink-100 pt-5 dark:border-ink-800">{footer}</div>}
        </div>
      </main>

      <footer className="px-4 pb-6 text-center">
        <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">{t('footer_supervisor')}</p>
      </footer>
    </div>
  )
}
