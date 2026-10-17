import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useChat } from '@/context/ChatContext'
import { useLock } from '@/context/LockContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState, Spinner, UnreadBadge } from '@/components/ui/Misc'
import { PageHeader } from '@/components/layout/AppLayout'
import { NewGroupModal } from '@/components/chat/NewGroupModal'
import { formatListTime } from '@/lib/utils'

/**
 * صفحة المجموعات — تعرض محادثات المجموعات الموجود في الهيكل الحالي
 * (نوع المحادثة group) دون أي وظيفة وهمية، وتتيح إنشاء مجموعة جديدة.
 */
export function GroupsPage() {
  const { t, lang } = useApp()
  const chat = useChat()
  const navigate = useNavigate()
  const { isChatLocked, isChatUnlocked } = useLock()
  const [showNew, setShowNew] = useState(false)

  const groups = useMemo(
    () =>
      chat.conversations
        .filter((conversation) => conversation.type === 'group')
        // المحادثات المقفلة تُخفى كبقية القوائم حتى تُفتح بالرمز
        .filter((conversation) => !isChatLocked(conversation.id) || isChatUnlocked(conversation.id))
        .slice()
        .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
    [chat.conversations, isChatLocked, isChatUnlocked],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-ink-900">
      <PageHeader
        title={t('groups_title')}
        subtitle={`${groups.length}`}
        action={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowNew(true)}>
            {t('new_group')}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {chat.conversationsLoading && !chat.conversations.length && (
          <div className="flex justify-center py-10">
            <Spinner size={26} />
          </div>
        )}

        {!chat.conversationsLoading && groups.length === 0 && (
          <EmptyState icon={<Users className="h-7 w-7" />} title={t('no_groups')} description={t('no_groups_hint')} />
        )}

        {groups.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => {
              void chat.openConversation(conversation.id)
              navigate(`/app/chats/${conversation.id}`)
            }}
            className="flex w-full items-center gap-3 border-b border-ink-50 px-4 py-3 text-start transition hover:bg-ink-50 dark:border-ink-800/70 dark:hover:bg-ink-800/60"
          >
            <Avatar src={conversation.displayAvatar} name={conversation.displayTitle} id={conversation.id} size="md" rounded="xl" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                  {conversation.displayTitle}
                </p>
                <span className="shrink-0 text-[11px] text-ink-400">
                  {formatListTime(conversation.last_message_at, lang)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-ink-500 dark:text-ink-400">
                {conversation.last_message_preview ?? ''}
              </p>
            </div>
            {conversation.membership.unread_count > 0 && <UnreadBadge count={conversation.membership.unread_count} />}
          </button>
        ))}
      </div>

      <NewGroupModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  )
}
