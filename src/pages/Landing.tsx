import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Languages,
  MessageSquare,
  Moon,
  Phone,
  ShieldCheck,
  Sun,
  Users,
  CircleDot,
  Paperclip,
  Sparkles,
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

export function Landing() {
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
      {/* الرأس */}
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

          {session ? (
            <Link
              to="/app/chats"
              className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              {t('nav_chats')}
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden rounded-2xl px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800 sm:block"
              >
                {t('login')}
              </Link>
              <Link
                to="/signup"
                className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                {t('signup')}
              </Link>
            </>
          )}
        </div>
      </header>

      {/* البطل */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50/70 to-transparent dark:from-brand-950/30" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-4 py-1.5 text-xs font-bold text-brand-700 dark:bg-brand-950/70 dark:text-brand-200">
              <Sparkles className="h-3.5 w-3.5" />
              {t('hero_badge')}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              {t('hero_title')}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-600 dark:text-ink-300">
              {t('hero_subtitle')}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to={session ? '/app/chats' : '/signup'}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-3.5 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700"
              >
                {t('cta_start')}
                <Arrow className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-6 py-3.5 text-sm font-bold text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
              >
                {t('cta_browse')}
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-semibold text-ink-500 dark:text-ink-400">
              {[t('feature_chat_title'), t('feature_calls_title'), t('feature_groups_title')].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* معاينة واجهة مبسّطة */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="rounded-[2rem] border border-ink-200 bg-white p-3 shadow-soft dark:border-ink-800 dark:bg-ink-900">
              <div className="rounded-3xl bg-brand-600 p-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-full bg-white/20" />
                  <div className="flex-1">
                    <div className="h-3 w-24 rounded-full bg-white/70" />
                    <div className="mt-1.5 h-2 w-16 rounded-full bg-white/40" />
                  </div>
                </div>
              </div>
              <div className="space-y-2.5 p-4">
                <div className="ms-auto h-9 w-3/5 rounded-2xl rounded-br-md bg-brand-500/90" />
                <div className="h-9 w-2/3 rounded-2xl rounded-bl-md bg-ink-100 dark:bg-ink-800" />
                <div className="ms-auto h-9 w-1/2 rounded-2xl rounded-br-md bg-brand-500/90" />
                <div className="h-9 w-3/5 rounded-2xl rounded-bl-md bg-ink-100 dark:bg-ink-800" />
              </div>
              <div className="flex items-center gap-2 border-t border-ink-100 px-4 pb-4 pt-3 dark:border-ink-800">
                <div className="h-10 flex-1 rounded-full bg-ink-100 dark:bg-ink-800" />
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Arrow className="h-4 w-4" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* المزايا */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold">{t('features_title')}</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{t('features_subtitle')}</p>
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

      {/* كيف تبدأ */}
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

      {/* الأمان */}
      <section className="mx-auto max-w-5xl px-4 py-16 lg:py-20">
        <div className="overflow-hidden rounded-[2rem] border border-ink-100 bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white sm:p-12 dark:border-ink-800">
          <ShieldCheck className="h-10 w-10" />
          <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">{t('security_title')}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/85">{t('security_desc')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-brand-700 transition hover:bg-white/90"
            >
              {t('cta_start')}
              <Arrow className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/40 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
            >
              {t('cta_login')}
            </Link>
          </div>
        </div>
      </section>

      {/* التذييل */}
      <footer className="border-t border-ink-100 py-10 dark:border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-sm font-extrabold">{t('app_name')}</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-ink-500 dark:text-ink-400">
            <a href="#features" className="hover:text-brand-600 dark:hover:text-brand-400">{t('footer_about')}</a>
            <Link to="/login" className="hover:text-brand-600 dark:hover:text-brand-400">{t('login')}</Link>
            <Link to="/signup" className="hover:text-brand-600 dark:hover:text-brand-400">{t('signup')}</Link>
          </nav>
          <p className="text-xs text-ink-400">
            © {new Date().getFullYear()} {t('app_name')} · {t('footer_rights')}
          </p>
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">
            {t('footer_supervisor')}
          </p>
        </div>
      </footer>
    </div>
  )
}
