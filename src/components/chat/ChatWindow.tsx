import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ChevronLeft, Info, MessageSquare, Phone, Search, Video } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { useCall } from '@/context/CallContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/Button'
import { EmptyState, Spinner } from '@/components/ui/Misc'
import { MessageBubble, MessageInfoModal } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { ChatInfoModal, ChatSearchPanel, ForwardModal, MediaLightbox } from './ChatModals'
import * as api from '@/lib/api'
import { cn, copyToClipboard, formatChatDate, formatLastSeen, groupByDay } from '@/lib/utils'
import type { ChatMessage, PublicProfile } from '@/types'

export function ChatWindow({ conversationId }: { conversationId: string | null }) {
  const { t, lang } = useApp()
  const { user } = useAuth()
  const chat = useChat()
  const call = useCall()
  const toast = useToast()
  const navigate = useNavigate()

  const conversation = chat.activeConversation
  const messages = chat.activeMessages
  const participants = conversation?.profiles ?? {}
  // عدد المستلمين باستثناء المرسل — يُستخدم لتحديد «قُرئت» في المجموعات
  const recipientCount = Math.max(0, (conversation?.members.length ?? 1) - 1)

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const [infoMessage, setInfoMessage] = useState<ChatMessage | null>(null)
  const [showJump, setShowJump] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [replyCache, setReplyCache] = useState<Record<string, ChatMessage>>({})

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const prevCountRef = useRef(0)

  const currentUserId = user?.id ?? ''

  // فتح المحادثة
  useEffect(() => {
    setReplyTo(null)
    setEditing(null)
    setForwarding(null)
    setSearchOpen(false)
    setInfoMessage(null)
    prevCountRef.current = 0
    setReplyCache({})
    void chat.openConversation(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // فحص الحظر في المحادثات الفردية
  useEffect(() => {
    if (!user || !conversation || conversation.type !== 'direct' || !conversation.partner) {
      setBlocked(false)
      return
    }
    let active = true
    void api
      .listBlocks(user.id)
      .then((blocks) => {
        if (active) setBlocked(blocks.some((b) => b.blocked_id === conversation.partner?.id))
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [user, conversation])

  // حلّ معاينات الردود من قائمة الرسائل
  const resolvedMessages = useMemo(() => {
    const byId = new Map<string, ChatMessage>()
    for (const message of messages) byId.set(message.id, message)
    return messages.map((message) => {
      if (!message.reply_to) return message
      const preview = message.replyPreview ?? byId.get(message.reply_to) ?? replyCache[message.reply_to] ?? null
      return { ...message, replyPreview: preview }
    })
  }, [messages, replyCache])

  // جلب معاينات الردود غير الموجودة محلياً
  useEffect(() => {
    const missing = new Set<string>()
    const localIds = new Set(messages.map((m) => m.id))
    for (const message of messages) {
      if (message.reply_to && !localIds.has(message.reply_to) && !replyCache[message.reply_to]) {
        missing.add(message.reply_to)
      }
    }
    if (!missing.size) return
    let active = true
    void Promise.all(
      Array.from(missing).map((id) =>
        api
          .fetchMessageById(id)
          .then((found) => [id, found] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((pairs) => {
      if (!active) return
      setReplyCache((prev) => {
        const next = { ...prev }
        for (const [id, found] of pairs) if (found) next[id] = found
        return next
      })
    })
    return () => {
      active = false
    }
  }, [messages, replyCache])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
    atBottomRef.current = true
    setShowJump(false)
  }, [])

  useEffect(() => {
    const grew = resolvedMessages.length > prevCountRef.current
    prevCountRef.current = resolvedMessages.length
    if (grew && atBottomRef.current) requestAnimationFrame(() => scrollToBottom('auto'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedMessages.length])

  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom('auto'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const onScroll = () => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    atBottomRef.current = distance < 120
    setShowJump(distance > 400)
    if (element.scrollTop < 60 && chat.hasMore && !chat.messagesLoading) void chat.loadMore()
  }

  const handleCopy = async (message: ChatMessage) => {
    if (!message.body) return
    if (await copyToClipboard(message.body)) toast.success(t('copied'))
  }

  const startCall = (mode: 'audio' | 'video') => {
    if (!conversation) return
    if (conversation.type === 'group' || !conversation.partner) {
      toast.info(t('call_not_supported'))
      return
    }
    void call.startCall({ partner: conversation.partner, mode, conversationId: conversation.id })
  }

  const openDirect = (userId: string) => {
    void chat
      .startDirect(userId)
      .then((id) => navigate(`/app/chats/${id}`))
      .catch(() => toast.error(t('generic_error')))
  }

  const isGroup = conversation?.type === 'group'
  const partner = conversation?.partner ?? null
  const online = Boolean(partner && (chat.onlineUsers[partner.id] || partner.presence === 'online'))
  const typing = chat.typingUsers

  const subtitle = (() => {
    if (!conversation) return ''
    if (typing.length === 1) return `${typing[0].display_name} ${t('typing_in')}`
    if (typing.length > 1) return t('several_typing', { n: typing.length })
    if (isGroup) return t('members_count', { n: conversation.members.length })
    if (online) return t('online')
    return formatLastSeen(partner?.last_seen, lang)
  })()

  if (!conversationId || !conversation) {
    return (
      <div className="hidden min-h-0 flex-1 items-center justify-center bg-ink-50 dark:bg-ink-950 sm:flex">
        <EmptyState
          icon={<MessageSquare className="h-7 w-7" />}
          title={t('select_conversation')}
          description={t('select_conversation_hint')}
        />
      </div>
    )
  }

  const canSend = !isGroup || conversation.membership.can_send
  const blockedReason = isGroup && !conversation.membership.can_send ? t('only_admins_can_edit') : null

  const dayGroups = groupByDay(resolvedMessages)

  let lastSenderId: string | null = null
  let lastDay = ''

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ink-50 dark:bg-ink-950">
      <header className="flex h-16 shrink-0 items-center gap-1.5 border-b border-ink-200/80 bg-white px-2 dark:border-ink-800 dark:bg-ink-900 sm:gap-2 sm:px-3">
        <button
          type="button"
          onClick={() => navigate('/app/chats')}
          className="rounded-full p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-ink-800 sm:hidden"
          aria-label={t('back')}
        >
          <ChevronLeft className="h-6 w-6 rtl:rotate-180" />
        </button>

        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-start"
        >
          <Avatar
            src={conversation.displayAvatar}
            name={conversation.displayTitle}
            id={conversation.id}
            size="md"
            rounded={isGroup ? 'xl' : 'full'}
            showPresence={!isGroup}
            online={online}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink-900 dark:text-ink-50">
              {conversation.displayTitle}
            </span>
            <span
              className={cn(
                'block truncate text-xs',
                typing.length ? 'font-semibold text-brand-600 dark:text-brand-400' : 'text-ink-500 dark:text-ink-400',
              )}
            >
              {subtitle}
            </span>
          </span>
        </button>

        {!isGroup && (
          <>
            <IconButton label={t('call')} onClick={() => startCall('audio')}>
              <Phone className="h-5 w-5" />
            </IconButton>
            <IconButton label={t('video_call')} onClick={() => startCall('video')}>
              <Video className="h-5 w-5" />
            </IconButton>
          </>
        )}
        <IconButton label={t('search')} onClick={() => setSearchOpen((value) => !value)}>
          <Search className="h-5 w-5" />
        </IconButton>
        <IconButton label={t('contact_info')} onClick={() => setInfoOpen(true)}>
          <Info className="h-5 w-5" />
        </IconButton>
      </header>

      <ChatSearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} messages={resolvedMessages} />

      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
        {chat.messagesLoading && !messages.length && (
          <div className="flex justify-center py-10">
            <Spinner size={26} />
          </div>
        )}

        {chat.hasMore && messages.length > 0 && chat.messagesLoading && (
          <div className="flex justify-center py-2">
            <Spinner size={18} />
          </div>
        )}

        {!chat.messagesLoading && messages.length === 0 && (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" />}
            title={t('no_messages_yet')}
            description={isGroup ? t('members_count', { n: conversation.members.length }) : undefined}
          />
        )}

        {dayGroups.map((group) => (
          <div key={group.date}>
            <div className="my-3 flex justify-center">
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink-500 shadow-sm dark:bg-ink-800 dark:text-ink-300">
                {formatChatDate(group.items[0]?.created_at ?? '', lang)}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {group.items.map((message) => {
                if (message.type === 'system') {
                  return (
                    <p key={message.id} className="my-1 text-center text-[11px] font-medium text-ink-400">
                      {message.body}
                    </p>
                  )
                }
                const own = message.sender_id === currentUserId
                if (group.date !== lastDay) {
                  lastDay = group.date
                  lastSenderId = null
                }
                const showAvatar = isGroup && !own && message.sender_id !== lastSenderId
                lastSenderId = own ? null : message.sender_id
                return (
                  <div key={message.id} className="flex items-end gap-1.5">
                    {isGroup && !own && (
                      <span className="w-6 shrink-0">
                        {showAvatar ? (
                          <Avatar
                            src={participants[message.sender_id ?? '']?.avatar_url}
                            name={participants[message.sender_id ?? '']?.display_name}
                            id={message.sender_id}
                            size="xs"
                          />
                        ) : null}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <MessageBubble
                        message={message}
                        own={own}
                        isGroup={isGroup}
                        recipientCount={recipientCount}
                        sender={message.sender_id ? participants[message.sender_id] ?? null : null}
                        currentUserId={currentUserId}
                        onReply={(target) => {
                          setEditing(null)
                          setReplyTo(target)
                        }}
                        onForward={(target) => setForwarding(target)}
                        onEdit={(target) => {
                          setReplyTo(null)
                          setEditing(target)
                        }}
                        onDelete={(target, forEveryone) => void chat.deleteMessage(target.id, forEveryone)}
                        onCopy={(target) => void handleCopy(target)}
                        onReact={(target, emoji) => void chat.reactToMessage(target.id, emoji)}
                        onOpenMedia={(url, name) => setLightbox({ url, name })}
                        onInfo={(target) => setInfoMessage(target)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        <div ref={bottomRef} className="h-1" />

        {showJump && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="sticky bottom-3 float-end me-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft transition hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-200"
            aria-label={t('jump_to_latest')}
            title={t('jump_to_latest')}
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        )}
      </div>

      <MessageComposer
        conversationId={conversation.id}
        replyTo={replyTo}
        editing={editing}
        canSend={canSend}
        blockedReason={blockedReason}
        currentUserId={currentUserId}
        participants={participants as Record<string, { display_name: string }>}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditing(null)}
        onSubmitText={(text) => {
          void chat.sendText(text, { replyTo: replyTo?.id ?? null })
          setReplyTo(null)
        }}
        onSubmitEdit={(text) => {
          if (editing) void chat.editMessage(editing.id, text)
          setEditing(null)
        }}
        onSendFiles={(files) => {
          void chat.sendFiles(files, { replyTo: replyTo?.id ?? null })
          setReplyTo(null)
        }}
        onSendVoice={(blob, duration) => {
          void chat.sendVoice(blob, duration, { replyTo: replyTo?.id ?? null })
          setReplyTo(null)
        }}
        onTyping={(typingNow) => chat.setTyping(conversation.id, typingNow)}
      />

      <ForwardModal open={Boolean(forwarding)} message={forwarding} onClose={() => setForwarding(null)} />
      <ChatInfoModal
        conversation={conversation}
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        onCall={(mode) => {
          setInfoOpen(false)
          startCall(mode)
        }}
        onStartChat={(userId) => {
          setInfoOpen(false)
          openDirect(userId)
        }}
      />
      <MediaLightbox url={lightbox?.url ?? null} name={lightbox?.name} onClose={() => setLightbox(null)} />
      {infoMessage && (
        <InfoModalWrapper message={infoMessage} participants={participants} recipientCount={recipientCount} onClose={() => setInfoMessage(null)} />
      )}
    </div>
  )
}

function InfoModalWrapper({
  message,
  participants,
  recipientCount,
  onClose,
}: {
  message: ChatMessage
  participants: Record<string, PublicProfile>
  recipientCount?: number
  onClose: () => void
}) {
  const { t } = useApp()
  return (
    <div
      className="fixed inset-0 z-[92] flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-ink-200 bg-white p-5 shadow-soft animate-fade-up dark:border-ink-800 dark:bg-ink-900 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-bold text-ink-900 dark:text-ink-50">{t('message_info')}</h2>
        <MessageInfoModal message={message} participants={participants} recipientCount={recipientCount} onClose={onClose} />
      </div>
    </div>
  )
}
