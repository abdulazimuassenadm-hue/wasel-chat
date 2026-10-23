import { useEffect, useRef } from 'react'
import { Outlet, useMatch } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { takeAccountNotice } from '@/lib/accounts'
import { BottomNav, NavRail } from './NavRail'

export function AppLayout() {
  const { isOnline } = useApp()
  const { t } = useApp()
  const toast = useToast()
  const noticeShown = useRef(false)
  const inChat = useMatch('/app/chats/:conversationId')

  useEffect(() => {
    if (noticeShown.current) return
    noticeShown.current = true
    const notice = takeAccountNotice()
    if (notice) toast.success(notice)
  }, [toast])

  // على iOS لا يقلّل المتصفح ارتفاع الصفحة عند فتح لوحة المفاتيح،
  // فنضبط ارتفاع التطبيق على الارتفاع المرئي الفعلي حتى يبقى شريط الكتابة ظاهراً.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    const update = () => {
      // نتجاهل التكبير بإصبعين (scale > 1) حتى لا نسحق الواجهة
      const keyboard = window.innerHeight - viewport.height - viewport.offsetTop
      if (viewport.scale <= 1.01 && keyboard > 120) {
        root.style.setProperty('--app-height', `${Math.round(viewport.height)}px`)
      } else {
        root.style.removeProperty('--app-height')
      }
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      root.style.removeProperty('--app-height')
    }
  }, [])

  return (
    <div className="flex h-dvh-screen overflow-hidden bg-ink-50 dark:bg-ink-950">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {!isOnline && (
          <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-white">{t('offline_banner')}</div>
        )}
        <main className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>
        {!inChat && <BottomNav />}
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  back?: () => void
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-ink-200/80 bg-white px-4 dark:border-ink-800 dark:bg-ink-900">
      {back && (
        <button
          type="button"
          onClick={back}
          className="rounded-full p-2 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          aria-label="back"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 rtl:rotate-180" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-ink-900 dark:text-ink-50">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
