import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessagesSquare, Users } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState, Spinner } from '@/components/ui/Misc'
import * as api from '@/lib/api'
import { errorKey, formatDateTime } from '@/lib/utils'

type AdminGroup = {
  conversation_id: string
  name: string
  description: string
  avatar_url: string | null
  owner_id: string
  created_at: string
  members: number
}

export function AdminGroups() {
  const { t, lang } = useApp()
  const toast = useToast()
  const navigate = useNavigate()

  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setGroups(await api.adminListGroups())
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink-900 dark:text-ink-50">{t('admin_groups')}</h1>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          {t('refresh')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="h-7 w-7" />} title={t('no_results')} />
      ) : (
        <div className="space-y-2.5">
          {groups.map((group) => (
            <div key={group.conversation_id} className="wasel-card flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap">
              <Avatar src={group.avatar_url} name={group.name} id={group.conversation_id} size="md" rounded="xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{group.name || t('unnamed')}</p>
                {group.description && (
                  <p className="line-clamp-1 text-xs text-ink-500 dark:text-ink-400">{group.description}</p>
                )}
                <p className="mt-0.5 text-[11px] text-ink-400">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {t('group_members_count')}: {group.members}
                  </span>
                  <span className="mx-1.5">·</span>
                  {t('group_created_at')}: {formatDateTime(group.created_at, lang)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/app/chats/${group.conversation_id}`)}
                className="shrink-0"
              >
                {t('view_group')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
