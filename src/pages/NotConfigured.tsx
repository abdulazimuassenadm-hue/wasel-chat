import { Link } from 'react-router-dom'
import { Database, KeyRound, Rocket, Terminal } from 'lucide-react'
import { useApp } from '@/context/AppContext'

export function NotConfigured() {
  const { t } = useApp()

  const steps = [
    { icon: <Database className="h-4 w-4" />, text: t('not_configured_step1') },
    { icon: <Terminal className="h-4 w-4" />, text: t('not_configured_step2') },
    { icon: <KeyRound className="h-4 w-4" />, text: t('not_configured_step3') },
    { icon: <Rocket className="h-4 w-4" />, text: t('not_configured_step4') },
  ]

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-4 py-10 dark:bg-ink-950">
      <div className="w-full max-w-xl rounded-3xl border border-ink-200 bg-white p-8 shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Database className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-extrabold text-ink-900 dark:text-ink-50">{t('not_configured_title')}</h1>
        </div>

        <p className="mb-6 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{t('not_configured_body')}</p>

        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">{t('not_configured_steps')}</h2>
        <ul className="space-y-3">
          {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-3 rounded-2xl bg-ink-50 px-4 py-3 dark:bg-ink-800/60">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950/70 dark:text-brand-200">
                {index + 1}
              </span>
              <span className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
                <span className="mt-0.5 text-brand-600 dark:text-brand-400">{step.icon}</span>
                {step.text}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-center">
          <Link
            to="/"
            className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            {t('app_name')} · Wasel Chat
          </Link>
        </div>
      </div>
    </div>
  )
}
