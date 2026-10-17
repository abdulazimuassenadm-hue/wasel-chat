import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Languages,
  MessageSquare,
  Moon,
  Paperclip,
  Phone,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  CircleDot,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'

function BrandMark() {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
      <svg viewBox="0 0 64 64" className="h-6 w-6" aria-hidden>
        <path
          d="M32 13c-10.5 0-19 7.4-19 16.6 0 5.2 2.7 9.8 7 12.9-.4 2.6-1.7 5.3-4.1 7.4 3.9-.3 7.4-1.6 10.2-3.5 1.9.4 3.9.6 5.9.6 10.5 0 19-7.4 19-16.6S42.5 13 32 13z"
          fill="currentColor"
        />
        <circle cx="24" cy="29.5" r="2.6" fill="#148d7f" />
        <circle cx="32" cy="29.5" r="2.6" fill="#148d7f" />
        <circle cx="40" cy="29.5" r="2.6" fill="#148d7f" />
      </svg>
    </span>
  )
}

/**
 * صفحة المزايا — نُقلت إليها النصوص التعريفية الطويلة من الصفحة الرئيسية
 * لتبقى الواجهة الرئيسية للتطبيق مرتّبة ومشابهة لتجربة واتساب.
 */
export function Features() {
  const { t, lang, setLang, isDark, toggleTheme, dir } = useApp()
  const { session } = useAuth()

  const features = [
    { icon: MessageSquare, title: t('feature_chat_title'), desc: t('feature_chat_desc') },
    { icon: Phone, title: t('feature_calls_title'), desc: t('feature_calls_desc') },
    { icon: CircleDot, title: t('feature_status_title'), desc: t('feature_status_desc') },
    { icon: Users, title: t('feature_groups_title'), desc: t('feature_groups_desc') },
    { icon: ShieldCheck, title: t('feature_privacy_title'), desc: t('feature_privacy_desc') },
    { icon: Paperclip, title: t('feature_media_title'), desc: t('feature_media_desc') },
  ]

  const steps = [
    { title: t('how_1_title'), desc: t('how_1_desc') },
    { title: t('how_2_title'), desc: t('how_2_desc') },
    { title: t('how_3_title'), desc: t('how_3_desc') },
  ]

  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  return (
    <div className="min-h-dvh bg-white text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/80 backdrop-blur dark:border-ink-800/80 dark:bg-ink-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-extrabold">{t('app_name')}</span>
              <span className="text-[10px] font-medium text-ink-400">Wasel Chat</span>
            </span>
          </Link>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="hidden h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800 sm:flex"
            title={t('language')}
          >
            <Languages className="h-4 w-4" />
            <span className="text-xs font-bold">ع/EN</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
            title={isDark ? t('light_mode') : t('dark_mode')}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <Link
            to={session ? '/app/chats' : '/login'}
            className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            {session ? t('nav_chats') : t('login')}
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-14 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-4 py-1.5 text-xs font-bold text-brand-700 dark:bg-brand-950/70 dark:text-brand-200">
            <Sparkles className="h-3.5 w-3.5" />
            {t('hero_badge')}
          </span>
          <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl">{t('features_page_title')}</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{t('features_page_subtitle')}</p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="rounded-3xl border border-ink-100 bg-white p-6 transition hover:-translate-y-1 hover:shadow-soft dark:border-ink-800 dark:bg-ink-900"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-base font-bold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{feature.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="bg-ink-50 py-16 dark:bg-ink-900/40 lg:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold">{t('how_title')}</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-3xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 text-base font-extrabold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 lg:py-20">
        <div className="overflow-hidden rounded-[2rem] border border-ink-100 bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white sm:p-12 dark:border-ink-800">
          <ShieldCheck className="h-10 w-10" />
          <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">{t('security_title')}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/85">{t('security_desc')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to={session ? '/app/chats' : '/signup'}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-brand-700 transition hover:bg-white/90"
            >
              {t('cta_start')}
              <Arrow className="h-4 w-4" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/40 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              {t('back_home')}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-100 py-10 dark:border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-sm font-extrabold">{t('app_name')}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-ink-500 dark:text-ink-400">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              {t('feature_chat_title')}
            </span>
            <Link to="/" className="hover:text-brand-600 dark:hover:text-brand-400">
              {t('back_home')}
            </Link>
            <Link to={session ? '/app/chats' : '/login'} className="hover:text-brand-600 dark:hover:text-brand-400">
              {session ? t('nav_chats') : t('login')}
            </Link>
          </div>
          <p className="text-xs text-ink-400">
            © {new Date().getFullYear()} {t('app_name')} · {t('footer_rights')}
          </p>
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">{t('footer_supervisor')}</p>
        </div>
      </footer>
    </div>
  )
}
