import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  BellOff,
  Bell,
  CheckCheck,
  Eraser,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useChat } from '@/context/ChatContext'
import { Avatar } from '@/components/ui/Avatar'
import { Dropdown } from '@/components/ui/Dropdown'
import { EmptyState, Spinner, UnreadBadge } from '@/components/ui/Misc'
import { ConfirmDialog } from '@/components/ui/Modal'
import { cn, formatListTime } from '@/lib/utils'
import type { ChatConversation, ChatMessage } from '@/types'
import { NewChatModal } from './NewChatModal'

type Filter = 'all' | 'unread' | 'pinned' | 'archived'

const FILTERS: Filter[] = ['all', 'unread', 'pinned', 'archived']

export function ConversationList() {
  const { t, lang } = useApp()
  const chat = useChat()
  const navigate = useNavigate()

  const [term, setTerm] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showNew, setShowNew] = useState(false)
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([])
  const [searching, setSearching] = useState(false)
  const [confirmClear, setConfirmClear] = useState<ChatConversation | null>(null)
  const [confirmHide, setConfirmHide] = useState<ChatConversation | null>(null)

  // بحث في نص الرسائل
  useEffect(() => {
    const clean = term.trim()
    if (clean.length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timeout = window.setTimeout(() => {
      void chat
        .searchMessages(clean)
        .then((found) => setSearchResults(found))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    }, 400)
    return () => window.clearTimeout(timeout)
  }, [term, chat])

  const conversations = useMemo(() => {
    const clean = term.trim().toLowerCase()
    let list = chat.conversations
    if (filter === 'archived') list = list.filter((c) => c.membership.archived)
    else {
      list = list.filter((c) => !c.membership.archived)
      if (filter === 'unread') list = list.filter((c) => c.membership.unread_count > 0)
      if (filter === 'pinned') list = list.filter((c) => c.membership.pinned)
    }
    if (clean.length >= 2) list = list.filter((c) => c.displayTitle.toLowerCase().includes(clean))

    return list.slice().sort((a, b) => {
      if (a.membership.pinned !== b.membership.pinned) return a.membership.pinned ? -1 : 1
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    })
  }, [chat.conversations, filter, term])

  const conversationTitle = (conversationId: string) =>
    chat.conversations.find((c) => c.id === conversationId)?.displayTitle ?? t('chats_title')

  const openConversation = (conversationId: string) => {
    void chat.openConversation(conversationId)
    navigate(`/app/chats/${conversationId}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col border-e border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-900">
      {/* رأس القائمة */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-ink-200/80 px-3 dark:border-ink-800">
        <h1 className="flex-1 truncate text-xl font-extrabold text-ink-900 dark:text-ink-50">
          {t('chats_title')}
        </h1>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 active:scale-95"
          aria-label={t('new_chat')}
          title={t('new_chat')}
        >
          <Plus className="h-5 w-5" />
        </button>
      </header>

      {/* البحث */}
      <div className="px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-400" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('search_chats')}
            className="wasel-input py-2.5 pe-10 ps-10"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              className="absolute inset-y-0 end-2 my-auto flex h-7 w-7 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
              aria-label={t('clear')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* فلاتر */}
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                filter === item
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700',
              )}
            >
              {t(`filter_${item}`)}
            </button>
          ))}
        </div>
      </div>

      {/* القائمة */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chat.conversationsLoading && !chat.conversations.length && (
          <div className="flex justify-center py-10">
            <Spinner size={26} />
          </div>
        )}

        {/* نتائج البحث في الرسائل */}
        {term.trim().length >= 2 && (searching || searchResults.length > 0) && (
          <div className="mb-1 border-b border-ink-100 pb-1 dark:border-ink-800">
            <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
              {t('messages')}
            </p>
            {searching && (
              <div className="flex justify-center py-3">
                <Spinner size={18} />
              </div>
            )}
            {searchResults.map((message) => (
              <button
                key={message.id}
                type="button"
                onClick={() => openConversation(message.conversation_id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-ink-100/70 dark:hover:bg-ink-800/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
                    {conversationTitle(message.conversation_id)}
                  </p>
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                    {message.body || t('document')}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-ink-400">
                  {formatListTime(message.created_at, lang)}
                </span>
              </button>
            ))}
          </div>
        )}

        {!chat.conversationsLoading && conversations.length === 0 && (
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title={filter === 'archived' ? t('filter_archived') : t('no_chats')}
            description={term.trim().length >= 2 ? t('no_results') : t('no_chats_hint')}
          />
        )}

        {conversations.map((conversation) => {
          const partnerId = conversation.type === 'direct' ? conversation.partner?.id : undefined
          const online = Boolean(
            partnerId && (chat.onlineUsers[partnerId] || conversation.partner?.presence === 'online'),
          )
          const isActive = chat.activeId === conversation.id

          return (
            <div
              key={conversation.id}
              className={cn(
                'group relative flex items-center gap-3 px-3 py-2.5 transition',
                isActive ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-ink-100/70 dark:hover:bg-ink-800/60',
              )}
            >
              <button type="button" onClick={() => openConversation(conversation.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                <Avatar
                  src={conversation.displayAvatar}
                  name={conversation.displayTitle}
                  id={conversation.id}
                  size="md"
                  rounded={conversation.type === 'group' ? 'xl' : 'full'}
                  showPresence={conversation.type === 'direct'}
                  online={online}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                      {conversation.displayTitle}
                    </span>
                    {conversation.membership.pinned && <Pin className="h-3 w-3 shrink-0 text-ink-400" />}
                    {conversation.membership.muted && <BellOff className="h-3 w-3 shrink-0 text-ink-400" />}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-xs text-ink-500 dark:text-ink-400">
                      {conversation.last_message_preview ?? ''}
                    </span>
                  </span>
                </span>
              </button>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[10px] font-semibold text-ink-400">
                  {formatListTime(conversation.last_message_at, lang)}
                </span>
                {conversation.membership.unread_count > 0 && !conversation.membership.muted ? (
                  <UnreadBadge count={conversation.membership.unread_count} />
                ) : conversation.membership.unread_count > 0 ? (
                  <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-ink-300 px-1.5 py-0.5 text-[11px] font-bold text-white dark:bg-ink-600">
                    {conversation.membership.unread_count > 99 ? '99+' : conversation.membership.unread_count}
                  </span>
                ) : null}
              </div>

              <Dropdown
                align="end"
                className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
                trigger={() => (
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-400 hover:bg-ink-200 dark:hover:bg-ink-700"
                    aria-label={t('more')}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                )}
                items={[
                  {
                    key: 'pin',
                    label: conversation.membership.pinned ? t('unpin') : t('pin'),
                    icon: conversation.membership.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />,
                    onClick: () => void chat.togglePin(conversation.id),
                  },
                  {
                    key: 'mute',
                    label: conversation.membership.muted ? t('unmute') : t('mute'),
                    icon: conversation.membership.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />,
                    onClick: () => void chat.toggleMute(conversation.id),
                  },
                  {
                    key: 'archive',
                    label: conversation.membership.archived ? t('unarchive') : t('archive'),
                    icon: conversation.membership.archived ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    ),
                    onClick: () => void chat.toggleArchive(conversation.id),
                  },
                  {
                    key: 'read',
                    label: t('mark_read'),
                    icon: <CheckCheck className="h-4 w-4" />,
                    onClick: () => void chat.openConversation(conversation.id).then(() => chat.openConversation(null)),
                  },
                  {
                    key: 'clear',
                    label: t('clear_chat'),
                    icon: <Eraser className="h-4 w-4" />,
                    onClick: () => setConfirmClear(conversation),
                  },
                  {
                    key: 'delete',
                    label: conversation.type === 'group' ? t('delete_group') : t('delete_chat'),
                    icon: <Trash2 className="h-4 w-4" />,
                    danger: true,
                    onClick: () => setConfirmHide(conversation),
                  },
                ]}
              />
            </div>
          )
        })}
      </div>

      <NewChatModal open={showNew} onClose={() => setShowNew(false)} />

      <ConfirmDialog
        open={Boolean(confirmClear)}
        title={t('clear_chat')}
        message={t('confirm_clear_chat')}
        confirmLabel={t('clear')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirmClear(null)}
        onConfirm={() => {
          if (confirmClear) void chat.clearChat(confirmClear.id)
          setConfirmClear(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmHide)}
        title={confirmHide?.type === 'group' ? t('delete_group') : t('delete_chat')}
        message={confirmHide?.type === 'group' ? t('confirm_leave_group') : t('confirm_delete_chat')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirmHide(null)}
        onConfirm={() => {
          if (confirmHide) {
            if (confirmHide.type === 'group') void chat.leaveGroupChat(confirmHide.id)
            else void chat.hideConversation(confirmHide.id)
          }
          setConfirmHide(null)
        }}
      />
    </div>
  )
}
