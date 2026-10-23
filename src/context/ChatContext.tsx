import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { BUCKETS, isSupabaseConfigured, mediaKindFromMime, supabase } from '@/lib/supabase'
import * as api from '@/lib/api'
import { errorKey } from '@/lib/utils'
import { useApp } from './AppContext'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import type {
  AppNotification,
  Attachment,
  ChatConversation,
  ChatMessage,
  MessageReaction,
  MessageReceipt,
  PublicProfile,
} from '@/types'

interface ChatContextValue {
  conversations: ChatConversation[]
  conversationsLoading: boolean
  activeId: string | null
  activeConversation: ChatConversation | null
  activeMessages: ChatMessage[]
  messagesLoading: boolean
  messagesError: string | null
  hasMore: boolean
  typingUsers: PublicProfile[]
  onlineUsers: Record<string, boolean>
  notifications: AppNotification[]
  unreadNotifications: number
  totalUnread: number
  openConversation: (conversationId: string | null) => Promise<void>
  loadMore: () => Promise<void>
  refreshConversations: () => Promise<void>
  refreshMessages: (conversationId?: string) => Promise<void>
  getMessages: (conversationId: string) => ChatMessage[]
  sendText: (text: string, options?: { replyTo?: string | null }) => Promise<void>
  sendFiles: (
    files: File[],
    options?: {
      replyTo?: string | null
      caption?: string | null
      metadata?: Record<string, unknown>
      onProgress?: (p: number) => void
    },
  ) => Promise<void>
  sendVoice: (blob: Blob, durationSeconds: number, options?: { replyTo?: string | null }) => Promise<void>
  sendSticker: (
    sticker:
      | { kind: 'builtin'; id: string }
      | { kind: 'library'; id: string; name: string; url: string; path?: string },
    options?: { replyTo?: string | null },
  ) => Promise<void>
  retryMessage: (message: ChatMessage) => Promise<void>
  forwardMessage: (message: ChatMessage, targetConversationIds: string[]) => Promise<void>
  editMessage: (messageId: string, body: string) => Promise<void>
  deleteMessage: (messageId: string, forEveryone: boolean) => Promise<void>
  reactToMessage: (messageId: string, emoji: string) => Promise<void>
  setTyping: (conversationId: string, typing: boolean) => void
  startDirect: (userId: string) => Promise<string>
  createGroup: (name: string, memberIds: string[], description?: string, avatarUrl?: string | null) => Promise<string>
  togglePin: (conversationId: string) => Promise<void>
  toggleArchive: (conversationId: string) => Promise<void>
  toggleMute: (conversationId: string) => Promise<void>
  clearChat: (conversationId: string) => Promise<void>
  hideConversation: (conversationId: string) => Promise<void>
  leaveGroupChat: (conversationId: string) => Promise<void>
  removeGroupMember: (conversationId: string, userId: string) => Promise<void>
  addGroupMember: (conversationId: string, userId: string) => Promise<void>
  updateGroupRole: (conversationId: string, userId: string, role: 'owner' | 'admin' | 'member') => Promise<void>
  updateGroupMemberPermissions: (
    conversationId: string,
    userId: string,
    patch: { can_send?: boolean; can_add_members?: boolean },
  ) => Promise<void>
  markNotificationsRead: () => Promise<void>
  searchMessages: (term: string) => Promise<ChatMessage[]>
  updateProfileInCache: (profile: PublicProfile) => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

const TYPING_TIMEOUT = 4000

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const { t, lang } = useApp()
  const toast = useToast()

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({})
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({})
  const [typingByConv, setTypingByConv] = useState<Record<string, Record<string, number>>>({})
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({})
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [profilesCache, setProfilesCache] = useState<Record<string, PublicProfile>>({})

  const conversationsRef = useRef<ChatConversation[]>([])
  const activeIdRef = useRef<string | null>(null)
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingTimerRef = useRef<number | null>(null)

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // --------------------------------------------------------------------------
  // تحميل المحادثات
  // --------------------------------------------------------------------------
  const refreshConversations = useCallback(async () => {
    if (!user) return
    setConversationsLoading(true)
    try {
      const list = await api.listConversations(user.id)
      setConversations(list)
      setProfilesCache((prev) => {
        const next = { ...prev }
        for (const conv of list) {
          for (const [id, p] of Object.entries(conv.profiles)) next[id] = p
        }
        return next
      })
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[wasel] conversations', error)
    } finally {
      setConversationsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setConversations([])
      setMessagesByConv({})
      setActiveId(null)
      setNotifications([])
      return
    }
    void refreshConversations()
  }, [user, refreshConversations])

  // --------------------------------------------------------------------------
  // تحميل الرسائل
  // --------------------------------------------------------------------------
  const mergeMessages = useCallback((conversationId: string, incoming: ChatMessage[], prepend = false) => {
    setMessagesByConv((prev) => {
      const existing = prev[conversationId] ?? []
      const map = new Map<string, ChatMessage>()
      for (const m of existing) map.set(m.id, m)
      for (const m of incoming) {
        const current = map.get(m.id)
        map.set(m.id, current ? { ...current, ...m, attachments: m.attachments.length ? m.attachments : current.attachments, reactions: m.reactions.length || !current.reactions.length ? m.reactions : current.reactions } : m)
      }
      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )
      return { ...prev, [conversationId]: merged }
    })
    void prepend
  }, [])

  const resolveAttachmentUrls = useCallback(async (conversationId: string, items: Attachment[]) => {
    const pending = items.filter((a) => !a.url)
    if (!pending.length) return
    const signed = await api.getSignedUrls(BUCKETS.chatMedia, pending.map((a) => a.path))
    if (!Object.keys(signed).length) return
    setMessagesByConv((prev) => {
      const list = prev[conversationId]
      if (!list) return prev
      return {
        ...prev,
        [conversationId]: list.map((message) => {
          if (!message.attachments.length) return message
          let changed = false
          const attachments = message.attachments.map((a) => {
            if (!a.url && signed[a.path]) {
              changed = true
              return { ...a, url: signed[a.path] }
            }
            return a
          })
          return changed ? { ...message, attachments } : message
        }),
      }
    })
  }, [])

  const refreshMessages = useCallback(
    async (conversationId?: string) => {
      const targetId = conversationId ?? activeIdRef.current
      if (!targetId || !user) return
      const conversation = conversationsRef.current.find((c) => c.id === targetId)
      setMessagesLoading(true)
      setMessagesError(null)
      try {
        const page = await api.listMessages(targetId, {
          clearedAt: conversation?.membership.cleared_at ?? null,
        })
        const attachmentsByMessage: Record<string, Attachment[]> = {}
        for (const a of page.attachments) (attachmentsByMessage[a.message_id] ||= []).push(a)
        const reactionsByMessage: Record<string, MessageReaction[]> = {}
        for (const r of page.reactions) (reactionsByMessage[r.message_id] ||= []).push(r)
        const receiptsByMessage: Record<string, MessageReceipt[]> = {}
        for (const r of page.receipts) (receiptsByMessage[r.message_id] ||= []).push(r)

        const hydrated = page.messages.map((m) => ({
          ...m,
          attachments: attachmentsByMessage[m.id] ?? [],
          reactions: reactionsByMessage[m.id] ?? [],
          receipts: receiptsByMessage[m.id] ?? [],
        }))

        setMessagesByConv((prev) => ({ ...prev, [targetId]: hydrated }))
        setHasMore((prev) => ({ ...prev, [targetId]: page.messages.length >= 50 }))

        const needsSigning = hydrated.flatMap((m) => m.attachments)
        if (needsSigning.length) void resolveAttachmentUrls(targetId, needsSigning)
      } catch (error) {
        if (import.meta.env.DEV) console.warn('[wasel] messages', error)
        setMessagesError(t('messages_load_failed'))
      } finally {
        setMessagesLoading(false)
      }
    },
    [user, resolveAttachmentUrls, t],
  )

  const loadMore = useCallback(async () => {
    const targetId = activeIdRef.current
    if (!targetId || !user) return
    const list = messagesByConv[targetId] ?? []
    if (!list.length) return
    const conversation = conversationsRef.current.find((c) => c.id === targetId)
    setMessagesLoading(true)
    try {
      const page = await api.listMessages(targetId, {
        before: list[0].created_at,
        clearedAt: conversation?.membership.cleared_at ?? null,
      })
      if (!page.messages.length) {
        setHasMore((prev) => ({ ...prev, [targetId]: false }))
        return
      }
      const attachmentsByMessage: Record<string, Attachment[]> = {}
      for (const a of page.attachments) (attachmentsByMessage[a.message_id] ||= []).push(a)
      const reactionsByMessage: Record<string, MessageReaction[]> = {}
      for (const r of page.reactions) (reactionsByMessage[r.message_id] ||= []).push(r)
      const hydrated = page.messages.map((m) => ({
        ...m,
        attachments: attachmentsByMessage[m.id] ?? [],
        reactions: reactionsByMessage[m.id] ?? [],
        receipts: [],
      }))
      mergeMessages(targetId, hydrated, true)
      void resolveAttachmentUrls(targetId, hydrated.flatMap((m) => m.attachments))
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[wasel] loadMore', error)
    } finally {
      setMessagesLoading(false)
    }
  }, [user, messagesByConv, mergeMessages, resolveAttachmentUrls])

  // --------------------------------------------------------------------------
  // فتح محادثة + تعليم كمقروءة
  // --------------------------------------------------------------------------
  const openConversation = useCallback(
    async (conversationId: string | null) => {
      setActiveId(conversationId)
      activeIdRef.current = conversationId
      setMessagesError(null)
      if (!conversationId || !user) return

      if (!messagesByConv[conversationId]) {
        await refreshMessages(conversationId)
      }
      try {
        await api.markConversationRead(conversationId)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, membership: { ...c.membership, unread_count: 0, last_read_at: new Date().toISOString() } }
              : c,
          ),
        )
      } catch (error) {
        if (import.meta.env.DEV) console.warn('[wasel] markRead', error)
      }
    },
    [user, messagesByConv, refreshMessages],
  )

  // --------------------------------------------------------------------------
  // الإرسال
  // --------------------------------------------------------------------------
  const appendOptimistic = useCallback((message: ChatMessage) => {
    setMessagesByConv((prev) => ({
      ...prev,
      [message.conversation_id]: [...(prev[message.conversation_id] ?? []), message],
    }))
  }, [])

  /**
   * حماية من الإرسال المزدوج: نفس المحتوى في نفس المحادثة خلال أقل من ثانية
   * يُعتبر تكراراً غير مقصود (نقرتان سريعتان أو Enter + نقر).
   */
  const recentSendsRef = useRef<Map<string, number>>(new Map())
  const isDuplicateSend = useCallback((key: string) => {
    const now = Date.now()
    const map = recentSendsRef.current
    for (const [entry, at] of map) {
      if (now - at > 5000) map.delete(entry)
    }
    const last = map.get(key)
    if (last && now - last < 900) return true
    map.set(key, now)
    return false
  }, [])

  const replaceOptimistic = useCallback((conversationId: string, clientId: string, saved: ChatMessage) => {
    setMessagesByConv((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] ?? []).map((m) => (m.clientId === clientId ? saved : m)),
    }))
  }, [])

  const markOptimisticFailed = useCallback((conversationId: string, clientId: string) => {
    setMessagesByConv((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] ?? []).map((m) =>
        m.clientId === clientId ? { ...m, pending: false, failed: true } : m,
      ),
    }))
  }, [])

  const sendText = useCallback(
    async (text: string, options?: { replyTo?: string | null }) => {
      const conversationId = activeIdRef.current
      const body = text.trim()
      if (!conversationId || !user || !body) return
      if (isDuplicateSend(`${conversationId}:text:${options?.replyTo ?? ''}:${body}`)) return

      const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
      appendOptimistic({
        id: clientId,
        conversation_id: conversationId,
        sender_id: user.id,
        type: 'text',
        body,
        reply_to: options?.replyTo ?? null,
        forwarded_from: null,
        status: 'sent',
        metadata: {},
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        attachments: [],
        reactions: [],
        pending: true,
        clientId,
      })

      try {
        const saved = await api.sendMessage({
          conversationId,
          senderId: user.id,
          type: 'text',
          body,
          replyTo: options?.replyTo ?? null,
        })
        replaceOptimistic(conversationId, clientId, { ...saved, attachments: [], reactions: [] })
      } catch (error) {
        markOptimisticFailed(conversationId, clientId)
        toast.error(t(errorKey(error)))
      }
    },
    [user, appendOptimistic, replaceOptimistic, markOptimisticFailed, toast, t, isDuplicateSend],
  )

  const sendFiles = useCallback(
    async (
      files: File[],
      options?: {
        replyTo?: string | null
        caption?: string | null
        metadata?: Record<string, unknown>
        onProgress?: (p: number) => void
      },
    ) => {
      const conversationId = activeIdRef.current
      if (!conversationId || !user || !files.length) return

      for (const file of files) {
        const kind = mediaKindFromMime(file.type || 'application/octet-stream')
        const dedupeKey = `${conversationId}:file:${file.name}:${file.size}:${file.lastModified}`
        if (isDuplicateSend(dedupeKey)) continue
        const metadata = options?.metadata ?? {}
        const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const localUrl = kind === 'image' || kind === 'video' || kind === 'audio' ? URL.createObjectURL(file) : null

        appendOptimistic({
          id: clientId,
          conversation_id: conversationId,
          sender_id: user.id,
          type: kind,
          body: options?.caption ?? null,
          reply_to: options?.replyTo ?? null,
          forwarded_from: null,
          status: 'sent',
          metadata,
          edited_at: null,
          deleted_at: null,
          created_at: new Date().toISOString(),
          attachments: [
            {
              id: clientId,
              message_id: clientId,
              conversation_id: conversationId,
              uploader_id: user.id,
              bucket: BUCKETS.chatMedia,
              path: '',
              file_name: file.name,
              mime_type: file.type,
              size_bytes: file.size,
              width: null,
              height: null,
              duration_seconds: null,
              created_at: new Date().toISOString(),
              url: localUrl,
              uploading: true,
              progress: 0,
            },
          ],
          reactions: [],
          pending: true,
          clientId,
          localFilePreview: localUrl,
          localFiles: [file],
        })

        try {
          const saved = await api.sendMessage({
            conversationId,
            senderId: user.id,
            type: kind,
            body: options?.caption ?? null,
            replyTo: options?.replyTo ?? null,
            metadata,
            files: [file],
            onProgress: (percent) => {
              options?.onProgress?.(percent)
              setMessagesByConv((prev) => ({
                ...prev,
                [conversationId]: (prev[conversationId] ?? []).map((m) =>
                  m.clientId === clientId
                    ? {
                        ...m,
                        attachments: m.attachments.map((a) => ({ ...a, progress: percent, uploading: percent < 100 })),
                      }
                    : m,
                ),
              }))
            },
          })
          const attachments = saved.attachments.map((a) => ({ ...a, url: localUrl, uploading: false }))
          replaceOptimistic(conversationId, clientId, { ...saved, attachments, reactions: [] })
          void resolveAttachmentUrls(conversationId, saved.attachments)
        } catch (error) {
          markOptimisticFailed(conversationId, clientId)
          toast.error(t(errorKey(error)))
        }
      }
    },
    [user, appendOptimistic, replaceOptimistic, markOptimisticFailed, resolveAttachmentUrls, toast, t, isDuplicateSend],
  )

  const sendVoice = useCallback(
    async (blob: Blob, durationSeconds: number, options?: { replyTo?: string | null }) => {
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' })
      const conversationId = activeIdRef.current
      if (!conversationId || !user) return
      const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const localUrl = URL.createObjectURL(blob)

      appendOptimistic({
        id: clientId,
        conversation_id: conversationId,
        sender_id: user.id,
        type: 'audio',
        body: null,
        reply_to: options?.replyTo ?? null,
        forwarded_from: null,
        status: 'sent',
        metadata: { duration: Math.round(durationSeconds), voice: true },
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        attachments: [
          {
            id: clientId,
            message_id: clientId,
            conversation_id: conversationId,
            uploader_id: user.id,
            bucket: BUCKETS.chatMedia,
            path: '',
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            width: null,
            height: null,
            duration_seconds: durationSeconds,
            created_at: new Date().toISOString(),
            url: localUrl,
            uploading: true,
            progress: 0,
          },
        ],
        reactions: [],
        pending: true,
        clientId,
        localFiles: [file],
      })

      try {
        const saved = await api.sendMessage({
          conversationId,
          senderId: user.id,
          type: 'audio',
          replyTo: options?.replyTo ?? null,
          metadata: { duration: Math.round(durationSeconds), voice: true },
          files: [file],
        })
        replaceOptimistic(conversationId, clientId, {
          ...saved,
          attachments: saved.attachments.map((a) => ({ ...a, url: localUrl, uploading: false })),
          reactions: [],
        })
        void resolveAttachmentUrls(conversationId, saved.attachments)
      } catch (error) {
        markOptimisticFailed(conversationId, clientId)
        toast.error(t(errorKey(error)))
      }
    },
    [user, appendOptimistic, replaceOptimistic, markOptimisticFailed, resolveAttachmentUrls, toast, t],
  )

  const sendSticker = useCallback(
    async (
      sticker:
        | { kind: 'builtin'; id: string }
        | { kind: 'library'; id: string; name: string; url: string; path?: string },
      options?: { replyTo?: string | null },
    ) => {
      const conversationId = activeIdRef.current
      if (!conversationId || !user) return

      if (sticker.kind === 'builtin') {
        const metadata: Record<string, unknown> = {
          sticker: true,
          sticker_kind: 'builtin',
          sticker_id: sticker.id,
        }
        const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
        appendOptimistic({
          id: clientId,
          conversation_id: conversationId,
          sender_id: user.id,
          type: 'image',
          body: null,
          reply_to: options?.replyTo ?? null,
          forwarded_from: null,
          status: 'sent',
          metadata,
          edited_at: null,
          deleted_at: null,
          created_at: new Date().toISOString(),
          attachments: [],
          reactions: [],
          pending: true,
          clientId,
        })
        try {
          const saved = await api.sendMessage({
            conversationId,
            senderId: user.id,
            type: 'image',
            replyTo: options?.replyTo ?? null,
            metadata,
          })
          replaceOptimistic(conversationId, clientId, { ...saved, attachments: [], reactions: [] })
        } catch (error) {
          markOptimisticFailed(conversationId, clientId)
          toast.error(t(errorKey(error)))
        }
        return
      }

      // ملصق من مكتبة المستخدم: نجلبه ثم نرفع نسخة إلى تخزين المحادثة
      // حتى يبقى ظاهراً للطرف الآخر حتى لو حُذف من المكتبة لاحقاً.
      try {
        let response = await fetch(sticker.url, { mode: 'cors', credentials: 'omit' }).catch(() => null)
        if ((!response || !response.ok) && sticker.path) {
          const fresh = await api.getSignedUrl(BUCKETS.stickers, sticker.path, 300)
          if (fresh) response = await fetch(fresh, { mode: 'cors', credentials: 'omit' })
        }
        if (!response || !response.ok) throw new Error('STICKER_FETCH_FAILED')
        const blob = await response.blob()
        const type = blob.type || 'image/png'
        const ext = type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : 'png'
        const file = new File([blob], `${sticker.name || 'sticker'}.${ext}`, { type })
        await sendFiles([file], {
          replyTo: options?.replyTo ?? null,
          metadata: { sticker: true, sticker_kind: 'library', sticker_id: sticker.id },
        })
      } catch (error) {
        if (import.meta.env.DEV) console.warn('[wasel] sticker', error)
        toast.error(t('sticker_send_failed'))
      }
    },
    [user, appendOptimistic, replaceOptimistic, markOptimisticFailed, sendFiles, toast, t],
  )

  const removeOptimistic = useCallback((conversationId: string, clientId?: string) => {
    if (!clientId) return
    setMessagesByConv((prev) => ({
      ...prev,
      [conversationId]: (prev[conversationId] ?? []).filter((message) => message.clientId !== clientId),
    }))
  }, [])

  const retryMessage = useCallback(
    async (message: ChatMessage) => {
      if (!message.failed) return
      // نسمح بإعادة الإرسال فوراً حتى لو كانت المحاولة الفاشلة قبل أقل من ثانية
      recentSendsRef.current.clear()
      removeOptimistic(message.conversation_id, message.clientId)
      const metadata = message.metadata ?? {}
      if (
        metadata.sticker === true &&
        metadata.sticker_kind === 'builtin' &&
        typeof metadata.sticker_id === 'string'
      ) {
        await sendSticker({ kind: 'builtin', id: metadata.sticker_id }, { replyTo: message.reply_to })
        return
      }
      if (message.localFiles?.length) {
        await sendFiles(message.localFiles, {
          replyTo: message.reply_to,
          caption: message.body,
          metadata,
        })
        return
      }
      if (message.type === 'text' && message.body) {
        await sendText(message.body, { replyTo: message.reply_to })
        return
      }
      toast.info(t('retry_unavailable'))
    },
    [removeOptimistic, sendSticker, sendFiles, sendText, toast, t],
  )

  const forwardMessage = useCallback(
    async (message: ChatMessage, targetConversationIds: string[]) => {
      if (!user) return
      for (const conversationId of targetConversationIds) {
        try {
          await api.sendMessage({
            conversationId,
            senderId: user.id,
            type: message.type === 'system' ? 'text' : message.type,
            body: message.body,
            forwardedFrom: message.id,
            metadata: { ...message.metadata, forwarded: true },
          })
        } catch (error) {
          toast.error(t(errorKey(error)))
        }
      }
      toast.success(t('sent'))
    },
    [user, toast, t],
  )

  const editMessage = useCallback(
    async (messageId: string, body: string) => {
      try {
        await api.editMessage(messageId, body)
        setMessagesByConv((prev) => {
          const next: Record<string, ChatMessage[]> = {}
          for (const [key, list] of Object.entries(prev)) {
            next[key] = list.map((m) =>
              m.id === messageId ? { ...m, body, edited_at: new Date().toISOString() } : m,
            )
          }
          return next
        })
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [toast, t],
  )

  const deleteMessage = useCallback(
    async (messageId: string, forEveryone: boolean) => {
      try {
        await api.deleteMessage(messageId, forEveryone)
        setMessagesByConv((prev) => {
          const next: Record<string, ChatMessage[]> = {}
          for (const [key, list] of Object.entries(prev)) {
            next[key] = forEveryone
              ? list.map((m) =>
                  m.id === messageId
                    ? { ...m, deleted_at: new Date().toISOString(), body: null, metadata: {}, attachments: [] }
                    : m,
                )
              : list.filter((m) => m.id !== messageId)
          }
          return next
        })
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [toast, t],
  )

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return
      try {
        await api.toggleReaction(messageId, user.id, emoji)
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [user, toast, t],
  )

  // --------------------------------------------------------------------------
  // مؤشر الكتابة (Realtime Broadcast)
  // --------------------------------------------------------------------------
  const setTyping = useCallback(
    (conversationId: string, typing: boolean) => {
      if (!user) return
      if (typingChannelRef.current) {
        void supabase.removeChannel(typingChannelRef.current)
        typingChannelRef.current = null
      }
      if (!typing) return

      const channel = supabase.channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } })
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId: user.id, name: profile ? undefined : undefined, at: Date.now() },
          })
        }
      })
      typingChannelRef.current = channel

      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = window.setTimeout(() => {
        if (typingChannelRef.current) {
          void supabase.removeChannel(typingChannelRef.current)
          typingChannelRef.current = null
        }
      }, TYPING_TIMEOUT)
    },
    [user, profile],
  )

  // قناة الاستقبال لمؤشر الكتابة للمحادثة النشطة
  useEffect(() => {
    if (!activeId || !user) return
    const channel = supabase.channel(`typing:${activeId}`)
    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const data = payload.payload as { userId: string }
        if (!data?.userId || data.userId === user.id) return
        setTypingByConv((prev) => ({
          ...prev,
          [activeId]: { ...(prev[activeId] ?? {}), [data.userId]: Date.now() },
        }))
      })
      .subscribe()

    const interval = window.setInterval(() => {
      setTypingByConv((prev) => {
        const current = prev[activeId]
        if (!current) return prev
        const now = Date.now()
        const next: Record<string, number> = {}
        for (const [id, at] of Object.entries(current)) {
          if (now - at < TYPING_TIMEOUT) next[id] = at
        }
        return { ...prev, [activeId]: next }
      })
    }, 1500)

    return () => {
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [activeId, user])

  // --------------------------------------------------------------------------
  // قنوات Realtime الرئيسية
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return

    const matchesAnyConversation = (conversationId: string) =>
      conversationsRef.current.some((c) => c.id === conversationId)

    const channel = supabase
      .channel('wasel-db')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const message = payload.new as unknown as ChatMessage
          if (!message?.conversation_id) return
          // تجاهل نسختنا المحلية (تحدث مباشرة بعد الإرسال)
          if (message.sender_id === user.id) return
          if (!matchesAnyConversation(message.conversation_id)) {
            void refreshConversations()
            return
          }

          void (async () => {
            const attachments = await api.getAttachmentsFor([message])
            const hydrated: ChatMessage = { ...message, attachments, reactions: [], receipts: [] }
            mergeMessages(message.conversation_id, [hydrated])
            void resolveAttachmentUrls(message.conversation_id, attachments)
            void api.markMessagesDelivered([message.id], user.id).catch(() => undefined)

            // زيادة العدّاد للمحادثة غير المفتوحة
            if (activeIdRef.current !== message.conversation_id || document.hidden) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === message.conversation_id
                    ? {
                        ...c,
                        last_message_at: message.created_at,
                        membership: { ...c.membership, unread_count: c.membership.unread_count + 1 },
                      }
                    : c,
                ),
              )
              const conversation = conversationsRef.current.find((c) => c.id === message.conversation_id)
              if (conversation && !conversation.membership.muted && profile?.notification_settings.browser) {
                notifyBrowser(conversation.displayTitle, previewOf(message, t), conversation.id)
              }
            } else {
              void api.markConversationRead(message.conversation_id).catch(() => undefined)
            }
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30)
          })()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const message = payload.new as unknown as ChatMessage
          if (!message?.conversation_id) return
          setMessagesByConv((prev) => {
            const list = prev[message.conversation_id]
            if (!list) return prev
            return {
              ...prev,
              [message.conversation_id]: list.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
            }
          })
          if (message.sender_id === user.id) {
            void refreshConversations()
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const reaction = payload.new as unknown as MessageReaction
          setMessagesByConv((prev) => {
            const next: Record<string, ChatMessage[]> = {}
            for (const [key, list] of Object.entries(prev)) {
              next[key] = list.map((m) =>
                m.id === reaction.message_id
                  ? { ...m, reactions: [...m.reactions.filter((r) => r.user_id !== reaction.user_id), reaction] }
                  : m,
              )
            }
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'message_reactions' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const reaction = payload.new as unknown as MessageReaction
          setMessagesByConv((prev) => {
            const next: Record<string, ChatMessage[]> = {}
            for (const [key, list] of Object.entries(prev)) {
              next[key] = list.map((m) =>
                m.id === reaction.message_id
                  ? {
                      ...m,
                      reactions: [...m.reactions.filter((r) => r.user_id !== reaction.user_id), reaction],
                    }
                  : m,
              )
            }
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const removed = payload.old as unknown as { id?: string }
          if (!removed?.id) return
          setMessagesByConv((prev) => {
            const next: Record<string, ChatMessage[]> = {}
            for (const [key, list] of Object.entries(prev)) {
              next[key] = list.map((m) =>
                m.reactions.some((r) => r.id === removed.id)
                  ? { ...m, reactions: m.reactions.filter((r) => r.id !== removed.id) }
                  : m,
              )
            }
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_receipts' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const receipt = payload.new as unknown as MessageReceipt
          if (!receipt?.message_id) return
          setMessagesByConv((prev) => {
            const next: Record<string, ChatMessage[]> = {}
            for (const [key, list] of Object.entries(prev)) {
              next[key] = list.map((m) =>
                m.id === receipt.message_id
                  ? {
                      ...m,
                      status: receipt.status === 'read' ? 'read' : m.status === 'read' ? 'read' : 'delivered',
                      receipts: [...(m.receipts ?? []).filter((r) => r.user_id !== receipt.user_id), receipt],
                    }
                  : m,
              )
            }
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members' },
        () => {
          void refreshConversations()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => {
          void refreshConversations()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles_public' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const updated = payload.new as unknown as PublicProfile
          if (!updated?.id) return
          setProfilesCache((prev) => ({ ...prev, [updated.id]: { ...prev[updated.id], ...updated } }))
          setConversations((prev) =>
            prev.map((c) => {
              const profiles = { ...c.profiles, [updated.id]: { ...c.profiles[updated.id], ...updated } }
              const partner = c.type === 'direct' && c.partner?.id === updated.id ? profiles[updated.id] : c.partner
              return {
                ...c,
                profiles,
                partner,
                displayTitle: c.type === 'group' ? c.displayTitle : partner?.display_name ?? c.displayTitle,
                displayAvatar: c.type === 'group' ? c.avatar_url : partner?.avatar_url ?? null,
              }
            }),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const notification = payload.new as unknown as AppNotification
          if (!notification?.id) return
          setNotifications((prev) => [notification, ...prev].slice(0, 60))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, mergeMessages, refreshConversations, resolveAttachmentUrls, profile, t])

  // --------------------------------------------------------------------------
  // Presence — من متصل الآن
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return
    const channel = supabase.channel('wasel-presence', {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const map: Record<string, boolean> = {}
        for (const key of Object.keys(state)) map[key] = true
        setOnlineUsers(map)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ userId: user.id, online_at: new Date().toISOString() })
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  // --------------------------------------------------------------------------
  // الإشعارات
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return
    void api
      .listNotifications(user.id)
      .then(setNotifications)
      .catch(() => undefined)
  }, [user])

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  )

  const markNotificationsRead = useCallback(async () => {
    if (!user) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await api.markAllNotificationsRead(user.id).catch(() => undefined)
  }, [user])

  const updateProfileInCache = useCallback((updated: PublicProfile) => {
    setProfilesCache((prev) => ({ ...prev, [updated.id]: updated }))
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        profiles: { ...c.profiles, [updated.id]: { ...c.profiles[updated.id], ...updated } },
      })),
    )
  }, [])

  // --------------------------------------------------------------------------
  // عمليات المحادثة
  // --------------------------------------------------------------------------
  const startDirect = useCallback(
    async (userId: string) => {
      const conversationId = await api.startDirectConversation(userId)
      await refreshConversations()
      await openConversation(conversationId)
      return conversationId
    },
    [refreshConversations, openConversation],
  )

  const createGroup = useCallback(
    async (name: string, memberIds: string[], description = '', avatarUrl: string | null = null) => {
      const conversationId = await api.createGroupConversation(name, memberIds, description, avatarUrl)
      await refreshConversations()
      await openConversation(conversationId)
      toast.success(t('group_created'))
      return conversationId
    },
    [refreshConversations, openConversation, toast, t],
  )

  const toggleFlag = useCallback(
    async (conversationId: string, flag: 'pinned' | 'archived' | 'muted') => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId)
      if (!conversation) return
      const nextValue = !conversation.membership[flag]
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, membership: { ...c.membership, [flag]: nextValue } } : c,
        ),
      )
      try {
        await api.updateMembership(conversationId, conversation.membership.user_id, { [flag]: nextValue })
      } catch (error) {
        toast.error(t(errorKey(error)))
        void refreshConversations()
      }
    },
    [refreshConversations, toast, t],
  )

  const clearChat = useCallback(
    async (conversationId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId)
      if (!conversation) return
      try {
        await api.clearChatForMe(conversationId, conversation.membership.user_id)
        setMessagesByConv((prev) => ({ ...prev, [conversationId]: [] }))
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [toast, t],
  )

  const hideConversation = useCallback(
    async (conversationId: string) => {
      const conversation = conversationsRef.current.find((c) => c.id === conversationId)
      if (!conversation || !user) return
      try {
        if (conversation.type === 'group') {
          await api.leaveGroup(conversationId)
        } else {
          await api.updateMembership(conversationId, user.id, { archived: true, cleared_at: new Date().toISOString() })
        }
        setConversations((prev) => prev.filter((c) => c.id !== conversationId))
        if (activeIdRef.current === conversationId) setActiveId(null)
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [user, toast, t],
  )

  const leaveGroupChat = useCallback(
    async (conversationId: string) => {
      try {
        await api.leaveGroup(conversationId)
        setConversations((prev) => prev.filter((c) => c.id !== conversationId))
        if (activeIdRef.current === conversationId) setActiveId(null)
        toast.success(t('you_left_group'))
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [toast, t],
  )

  const removeGroupMember = useCallback(
    async (conversationId: string, userId: string) => {
      try {
        await api.removeGroupMember(conversationId, userId)
        toast.success(t('member_removed'))
        await refreshConversations()
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [refreshConversations, toast, t],
  )

  const addGroupMember = useCallback(
    async (conversationId: string, userId: string) => {
      try {
        await api.addGroupMember(conversationId, userId)
        toast.success(t('member_added'))
        await refreshConversations()
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [refreshConversations, toast, t],
  )

  const updateGroupRole = useCallback(
    async (conversationId: string, userId: string, role: 'owner' | 'admin' | 'member') => {
      try {
        await api.updateMemberRole(conversationId, userId, role)
        toast.success(t('role_updated'))
        await refreshConversations()
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [refreshConversations, toast, t],
  )

  const updateGroupMemberPermissions = useCallback(
    async (conversationId: string, userId: string, patch: { can_send?: boolean; can_add_members?: boolean }) => {
      try {
        await api.updateMemberPermissions(conversationId, userId, patch)
        await refreshConversations()
      } catch (error) {
        toast.error(t(errorKey(error)))
      }
    },
    [refreshConversations, toast, t],
  )

  const searchMessages = useCallback(
    async (term: string) => {
      const ids = conversationsRef.current.map((c) => c.id)
      return api.fetchMessageIdsForSearch(ids, term)
    },
    [],
  )

  // --------------------------------------------------------------------------
  // القيم المشتقة
  // --------------------------------------------------------------------------
  const typingUsers = useMemo(() => {
    if (!activeId) return []
    const ids = Object.keys(typingByConv[activeId] ?? {})
    return ids
      .map((id) => profilesCache[id])
      .filter(Boolean) as PublicProfile[]
  }, [activeId, typingByConv, profilesCache])

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.membership.archived ? 0 : c.membership.unread_count), 0),
    [conversations],
  )

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  const getMessages = useCallback(
    (conversationId: string) => messagesByConv[conversationId] ?? [],
    [messagesByConv],
  )

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations,
      conversationsLoading,
      activeId,
      activeConversation,
      activeMessages: activeId ? messagesByConv[activeId] ?? [] : [],
      messagesLoading,
      messagesError,
      hasMore: activeId ? hasMore[activeId] ?? false : false,
      typingUsers,
      onlineUsers,
      notifications,
      unreadNotifications,
      totalUnread,
      openConversation,
      loadMore,
      refreshConversations,
      refreshMessages,
      getMessages,
      sendText,
      sendFiles,
      sendVoice,
      sendSticker,
      retryMessage,
      forwardMessage,
      editMessage,
      deleteMessage,
      reactToMessage,
      setTyping,
      startDirect,
      createGroup,
      togglePin: (id: string) => toggleFlag(id, 'pinned'),
      toggleArchive: (id: string) => toggleFlag(id, 'archived'),
      toggleMute: (id: string) => toggleFlag(id, 'muted'),
      clearChat,
      hideConversation,
      leaveGroupChat,
      removeGroupMember,
      addGroupMember,
      updateGroupRole,
      updateGroupMemberPermissions,
      markNotificationsRead,
      searchMessages,
      updateProfileInCache,
    }),
    [
      conversations,
      conversationsLoading,
      activeId,
      activeConversation,
      messagesByConv,
      messagesLoading,
      messagesError,
      hasMore,
      typingUsers,
      onlineUsers,
      notifications,
      unreadNotifications,
      totalUnread,
      openConversation,
      loadMore,
      refreshConversations,
      refreshMessages,
      getMessages,
      sendText,
      sendFiles,
      sendVoice,
      sendSticker,
      retryMessage,
      forwardMessage,
      editMessage,
      deleteMessage,
      reactToMessage,
      setTyping,
      startDirect,
      createGroup,
      toggleFlag,
      clearChat,
      hideConversation,
      leaveGroupChat,
      removeGroupMember,
      addGroupMember,
      updateGroupRole,
      updateGroupMemberPermissions,
      markNotificationsRead,
      searchMessages,
      updateProfileInCache,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

function previewOf(message: ChatMessage, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (message.type) {
    case 'image':
      return t('photo')
    case 'video':
      return t('video')
    case 'audio':
      return t('voice_message')
    case 'file':
      return t('document')
    default:
      return message.body ?? ''
  }
}

async function notifyBrowser(title: string, body: string, conversationId: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    if (document.visibilityState === 'visible') return
    const registration = await navigator.serviceWorker?.getRegistration()
    // عند وجود اشتراك Web Push يتولّى Service Worker العرض (حتى لا يتكرر الإشعار)
    if (registration) {
      const subscription = registration.pushManager
        ? await registration.pushManager.getSubscription().catch(() => null)
        : null
      if (subscription) return
    }
    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: './favicon.svg',
        badge: './favicon.svg',
        tag: `wasel-${conversationId}`,
        data: { conversationId },
      })
    } else {
      new Notification(title, { body, icon: './favicon.svg' })
    }
  } catch {
    /* تجاهل أخطاء الإشعارات */
  }
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used inside ChatProvider')
  return ctx
}
