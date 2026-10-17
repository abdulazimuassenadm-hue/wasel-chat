import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  Bell,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  Phone,
  Settings,
  Sun,
  User as UserIcon,
  Users,
  CircleDot,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Dropdown } from '@/components/ui/Dropdown'
import { cn, timeAgo } from '@/lib/utils'

export function Logo({ compact = false }: { compact?: boolean }) {
  const { t } = useApp()
  return (
    <Link to="/app/chats" className="flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
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
      {!compact && (
        <span className="hidden flex-col leading-tight lg:flex">
          <span className="text-sm font-extrabold text-ink-900 dark:text-ink-50">{t('app_name')}</span>
          <span className="text-[10px] font-medium text-ink-400">Wasel Chat</span>
        </span>
      )}
    </Link>
  )
}

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  badge?: number
  end?: boolean
}

function NavItem({ to, icon, label, badge, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        cn(
          'group relative flex h-12 w-12 items-center justify-center rounded-2xl transition',
          isActive
            ? 'bg-brand-100 text-brand-700 dark:bg-brand-950/80 dark:text-brand-300'
            : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800',
        )
      }
    >
      {icon}
      {badge ? (
        <span className="absolute -top-0.5 end-0 flex min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
      <span className="pointer-events-none absolute start-full z-30 ms-3 hidden whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-soft transition group-hover:opacity-100 lg:block dark:bg-ink-700">
        {label}
      </span>
    </NavLink>
  )
}

function NotificationsButton() {
  const { t, lang } = useApp()
  const { notifications, unreadNotifications, markNotificationsRead } = useChat()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={t('notifications')}
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-ink-500 transition hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
      >
        <Bell className="h-5 w-5" />
        {unreadNotifications > 0 && (
          <span className="absolute top-1.5 end-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-ink-900" />
        )}
      </button>

      {open && (
        <div className="absolute bottom-0 start-full z-50 ms-3 w-[320px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft animate-pop-in dark:border-ink-700 dark:bg-ink-900">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-800">
            <h3 className="text-sm font-bold text-ink-800 dark:text-ink-100">{t('notifications')}</h3>
            {unreadNotifications > 0 && (
              <button
                type="button"
                onClick={() => void markNotificationsRead()}
                className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                {t('mark_all_read')}
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-500 dark:text-ink-400">{t('no_notifications')}</p>
            )}
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'border-b border-ink-50 px-4 py-3 last:border-0 dark:border-ink-800/70',
                  !notification.is_read && 'bg-brand-50/60 dark:bg-brand-950/30',
                )}
              >
                <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                  {notification.title || t('notifications')}
                </p>
                {notification.body && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">{notification.body}</p>
                )}
                <p className="mt-1 text-[10px] text-ink-400">{timeAgo(notification.created_at, lang)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function NavRail() {
  const { t, isDark, toggleTheme, lang, setLang } = useApp()
  const { publicProfile, isAdmin, signOut } = useAuth()
  const { totalUnread } = useChat()
  const toast = useToast()
  const navigate = useNavigate()

  return (
    <nav className="hidden h-full w-[76px] shrink-0 flex-col items-center gap-2 border-e border-ink-200/80 bg-white py-4 sm:flex dark:border-ink-800 dark:bg-ink-900">
      <div className="mb-2">
        <Logo compact />
      </div>

      <NavItem to="/app/chats" icon={<MessageSquare className="h-5 w-5" />} label={t('nav_chats')} badge={totalUnread} />
      <NavItem to="/app/status" icon={<CircleDot className="h-5 w-5" />} label={t('nav_status')} />
      <NavItem to="/app/calls" icon={<Phone className="h-5 w-5" />} label={t('nav_calls')} />
      <NavItem to="/app/contacts" icon={<Users className="h-5 w-5" />} label={t('nav_contacts')} />

      <div className="flex-1" />

      <NotificationsButton />

      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? t('light_mode') : t('dark_mode')}
        className="flex h-12 w-12 items-center justify-center rounded-2xl text-ink-500 transition hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <Dropdown
        align="start"
        className="w-12"
        trigger={() => (
          <button type="button" className="flex h-12 w-12 items-center justify-center" title={publicProfile?.display_name ?? ''}>
            <Avatar
              src={publicProfile?.avatar_url}
              name={publicProfile?.display_name}
              id={publicProfile?.id}
              size="sm"
            />
          </button>
        )}
        items={[
          {
            key: 'profile',
            label: t('nav_profile'),
            icon: <UserIcon className="h-4 w-4" />,
            onClick: () => navigate('/app/settings?tab=profile'),
          },
          {
            key: 'settings',
            label: t('nav_settings'),
            icon: <Settings className="h-4 w-4" />,
            onClick: () => navigate('/app/settings'),
          },
          {
            key: 'lang',
            label: lang === 'ar' ? t('english') : t('arabic'),
            icon: <span className="text-xs font-bold">ع/EN</span>,
            onClick: () => setLang(lang === 'ar' ? 'en' : 'ar'),
          },
          ...(isAdmin
            ? [
                {
                  key: 'admin',
                  label: t('nav_admin'),
                  icon: <LayoutDashboard className="h-4 w-4" />,
                  onClick: () => navigate('/admin'),
                },
              ]
            : []),
          {
            key: 'logout',
            label: t('logout'),
            icon: <LogOut className="h-4 w-4" />,
            danger: true,
            onClick: async () => {
              await signOut()
              toast.info(t('signed_out'))
            },
          },
        ]}
      />
    </nav>
  )
}

export function BottomNav() {
  const { t } = useApp()
  const { totalUnread } = useChat()

  const items = [
    { to: '/app/chats', icon: <MessageSquare className="h-5 w-5" />, label: t('nav_chats'), badge: totalUnread },
    { to: '/app/status', icon: <CircleDot className="h-5 w-5" />, label: t('nav_status') },
    { to: '/app/calls', icon: <Phone className="h-5 w-5" />, label: t('nav_calls') },
    { to: '/app/contacts', icon: <Users className="h-5 w-5" />, label: t('nav_contacts') },
    { to: '/app/settings', icon: <Settings className="h-5 w-5" />, label: t('nav_settings') },
  ]

  return (
    <nav className="flex h-16 shrink-0 items-center justify-around border-t border-ink-200/80 bg-white px-2 safe-bottom dark:border-ink-800 dark:bg-ink-900 sm:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] font-semibold transition',
              isActive ? 'text-brand-600 dark:text-brand-400' : 'text-ink-500 dark:text-ink-400',
            )
          }
        >
          {item.icon}
          <span>{item.label}</span>
          {item.badge ? (
            <span className="absolute top-0 end-1/4 flex min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}
