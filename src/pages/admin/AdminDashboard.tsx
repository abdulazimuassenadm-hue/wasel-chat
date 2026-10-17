import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  Flag,
  MessageSquare,
  MessagesSquare,
  Phone,
  Radio,
  Users,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Spinner } from '@/components/ui/Misc'
import * as api from '@/lib/api'
import { errorKey, formatBytes } from '@/lib/utils'
import type { AdminStats } from '@/types'

export function AdminDashboard() {
  const { t, lang } = useApp()
  const toast = useToast()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStats(await api.fetchAdminStats())
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    )
  }

  if (!stats) return null

  const cards = [
    { key: 'stat_users', value: stats.users_total, icon: Users, tone: 'brand' },
    { key: 'stat_online', value: stats.users_online, icon: Radio, tone: 'emerald' },
    { key: 'stat_new_users', value: stats.new_users_7d, icon: Activity, tone: 'sky' },
    { key: 'stat_messages', value: stats.messages_total, icon: MessageSquare, tone: 'brand' },
    { key: 'stat_messages_24h', value: stats.messages_24h, icon: MessageSquare, tone: 'sky' },
    { key: 'stat_conversations', value: stats.conversations_total, icon: MessagesSquare, tone: 'ink' },
    { key: 'stat_groups', value: stats.groups_total, icon: MessagesSquare, tone: 'ink' },
    { key: 'stat_statuses', value: stats.statuses_active, icon: Activity, tone: 'amber' },
    { key: 'stat_calls', value: stats.calls_total, icon: Phone, tone: 'brand' },
    { key: 'stat_reports', value: stats.reports_open, icon: Flag, tone: 'rose' },
    { key: 'stat_storage', value: formatBytes(stats.storage_bytes, lang), icon: Activity, tone: 'ink' },
    { key: 'admin_users', value: stats.admins, icon: Users, tone: 'brand' },
  ] as const

  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
    ink: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-200',
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink-900 dark:text-ink-50">{t('admin_dashboard')}</h1>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-2xl px-3.5 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/50"
        >
          {t('refresh')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.key} className="wasel-card p-4">
              <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tones[card.tone]}`}>
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-2xl font-extrabold text-ink-900 dark:text-ink-50">{card.value}</p>
              <p className="mt-0.5 text-xs font-semibold text-ink-500 dark:text-ink-400">{t(card.key)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
