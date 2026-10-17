import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Flag,
  LayoutDashboard,
  MessagesSquare,
  Settings2,
  Users,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/admin', end: true, icon: LayoutDashboard, labelKey: 'admin_dashboard' },
  { to: '/admin/users', end: false, icon: Users, labelKey: 'admin_users' },
  { to: '/admin/reports', end: false, icon: Flag, labelKey: 'admin_reports' },
  { to: '/admin/groups', end: false, icon: MessagesSquare, labelKey: 'admin_groups' },
  { to: '/admin/settings', end: false, icon: Settings2, labelKey: 'admin_settings' },
]

export function AdminLayout() {
  const { t, dir } = useApp()
  const { publicProfile } = useAuth()
  const navigate = useNavigate()
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft

  return (
    <div className="flex h-dvh-screen flex-col bg-ink-50 dark:bg-ink-950 lg:flex-row">
      {/* الشريط الجانبي */}
      <aside className="shrink-0 border-b border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-900 lg:w-64 lg:border-b-0 lg:border-e">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-extrabold text-ink-900 dark:text-ink-50">{t('admin_title')}</p>
            <p className="text-[10px] font-medium text-ink-400">{t('app_name')}</p>
          </div>
        </div>

        <nav className="flex gap-1.5 overflow-x-auto px-2 pb-3 no-scrollbar lg:flex-col lg:overflow-visible">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition lg:w-full',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200'
                      : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{t(item.labelKey)}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>

      {/* المحتوى */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-ink-200/80 bg-white px-4 dark:border-ink-800 dark:bg-ink-900">
          <button
            type="button"
            onClick={() => navigate('/app/chats')}
            className="flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            <Back className="h-4 w-4" />
            {t('back')}
          </button>
          <div className="flex-1" />
          <Link to="/app/settings" className="flex items-center gap-2">
            <Avatar
              src={publicProfile?.avatar_url}
              name={publicProfile?.display_name}
              id={publicProfile?.id}
              size="sm"
            />
          </Link>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
