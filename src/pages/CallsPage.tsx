import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Video,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { useCall } from '@/context/CallContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/Button'
import { EmptyState, Spinner } from '@/components/ui/Misc'
import { PageHeader } from '@/components/layout/AppLayout'
import * as api from '@/lib/api'
import { errorKey, formatDuration, formatListTime, timeAgo } from '@/lib/utils'
import type { CallRecord } from '@/types'

export function CallsPage() {
  const { t, lang } = useApp()
  const { user } = useAuth()
  const { startDirect } = useChat()
  const call = useCall()
  const toast = useToast()
  const navigate = useNavigate()

  const [calls, setCalls] = useState<CallRecord[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setCalls(await api.listCalls(user.id))
    } catch {
      setCalls([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  const startCall = (record: CallRecord, mode: 'audio' | 'video') => {
    if (!record.partner) return
    void call.startCall({ partner: record.partner, mode, conversationId: record.conversation_id })
  }

  const openChat = (record: CallRecord) => {
    if (!record.partner) return
    void startDirect(record.partner.id)
      .then((id) => navigate(`/app/chats/${id}`))
      .catch((error) => toast.error(t(errorKey(error))))
  }

  const label = useMemo(
    () => (record: CallRecord) => {
      if (record.status === 'missed') return t('missed_call')
      if (record.status === 'declined') return t('declined_call')
      if (record.status === 'failed') return t('call_failed')
      if (record.status === 'answered' || record.status === 'ended') {
        return record.duration_seconds > 0
          ? formatDuration(record.duration_seconds)
          : t('call_ended')
      }
      return record.direction === 'outgoing' ? t('outgoing_call') : t('incoming_call')
    },
    [t],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-ink-900">
      <PageHeader
        title={t('calls_title')}
        action={
          <IconButton label={t('refresh')} size="sm" onClick={() => void load()}>
            <Phone className="h-4 w-4" />
          </IconButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-12">
            <Spinner size={26} />
          </div>
        )}

        {!loading && calls.length === 0 && (
          <EmptyState icon={<PhoneCall className="h-7 w-7" />} title={t('no_calls')} description={t('no_calls_hint')} />
        )}

        {!loading &&
          calls.map((record) => {
            const partner = record.partner
            const online = partner?.presence === 'online'
            const missed = record.status === 'missed' && record.direction === 'incoming'
            const DirectionIcon =
              record.direction === 'outgoing'
                ? missed
                  ? PhoneMissed
                  : PhoneOutgoing
                : missed
                  ? PhoneMissed
                  : PhoneIncoming

            return (
              <div key={record.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => openChat(record)} className="shrink-0">
                  <Avatar
                    src={partner?.avatar_url}
                    name={partner?.display_name}
                    id={partner?.id}
                    size="md"
                    showPresence
                    online={online}
                  />
                </button>

                <button type="button" onClick={() => openChat(record)} className="min-w-0 flex-1 text-start">
                  <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                    {partner?.display_name ?? t('unknown')}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-500 dark:text-ink-400">
                    <DirectionIcon
                      className={
                        missed ? 'h-3.5 w-3.5 text-rose-500' : 'h-3.5 w-3.5 text-brand-600 dark:text-brand-400'
                      }
                    />
                    <span className={missed ? 'text-rose-500' : undefined}>{label(record)}</span>
                    <span aria-hidden>·</span>
                    <span className="text-ink-400">
                      {record.type === 'video' ? t('video_call_short') : t('audio_call')}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="text-ink-400" title={timeAgo(record.started_at, lang)}>
                      {formatListTime(record.started_at, lang)}
                    </span>
                  </p>
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  <IconButton label={t('call')} size="sm" onClick={() => startCall(record, 'audio')}>
                    <Phone className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  </IconButton>
                  <IconButton label={t('video_call')} size="sm" onClick={() => startCall(record, 'video')}>
                    <Video className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  </IconButton>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
