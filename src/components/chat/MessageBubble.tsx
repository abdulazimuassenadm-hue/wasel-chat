import { useRef, useState } from 'react'
import {
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  Info,
  Pencil,
  Share2,
  Smile,
  Trash2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { QUICK_REACTIONS } from '@/components/ui/EmojiPicker'
import { cn, formatTime, formatLastSeen } from '@/lib/utils'
import type { ChatMessage, PublicProfile } from '@/types'
import { AudioAttachment, FileAttachment, ImageAttachment, VideoAttachment } from './AttachmentView'

interface MessageBubbleProps {
  message: ChatMessage
  own: boolean
  isGroup: boolean
  sender?: PublicProfile | null
  onReply: (message: ChatMessage) => void
  onForward: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onDelete: (message: ChatMessage, forEveryone: boolean) => void
  onCopy: (message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string) => void
  onOpenMedia: (url: string, name: string) => void
  onInfo: (message: ChatMessage) => void
  currentUserId: string
}

export function MessageBubble({
  message,
  own,
  isGroup,
  sender,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onCopy,
  onReact,
  onOpenMedia,
  onInfo,
  currentUserId,
}: MessageBubbleProps) {
  const { t, lang } = useApp()
  const [showActions, setShowActions] = useState(false)
  const longPressRef = useRef<number | null>(null)

  const deleted = Boolean(message.deleted_at)
  const isEmojiOnly = Boolean(message.body && message.body.trim().length <= 8 && /\p{Extended_Pictographic}/u.test(message.body) && !/\w/.test(message.body))

  const reactionsByEmoji = message.reactions.reduce<Record<string, number>>((accumulator, reaction) => {
    accumulator[reaction.emoji] = (accumulator[reaction.emoji] || 0) + 1
    return accumulator
  }, {})
  const myReaction = message.reactions.find((reaction) => reaction.user_id === currentUserId)?.emoji

  const handleTouchStart = () => {
    longPressRef.current = window.setTimeout(() => setShowActions(true), 480)
  }
  const clearLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current)
    longPressRef.current = null
  }

  const renderStatus = () => {
    if (!own || deleted) return null
    if (message.pending) return <Clock className="h-3.5 w-3.5 text-white/70" aria-label={t('sending')} />
    if (message.failed) return <AlertCircle className="h-3.5 w-3.5 text-rose-200" aria-label={t('failed_to_send')} />
    if (message.status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-200" aria-label={t('read')} />
    if (message.status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-white/80" aria-label={t('delivered')} />
    return <Check className="h-3.5 w-3.5 text-white/80" aria-label={t('sent')} />
  }

  const actionItems = [
    { key: 'reply', label: t('reply'), icon: <CornerUpLeft className="h-4 w-4" />, onClick: () => onReply(message) },
    { key: 'forward', label: t('forward'), icon: <Share2 className="h-4 w-4" />, onClick: () => onForward(message) },
    ...(message.type === 'text' && message.body
      ? [{ key: 'copy', label: t('copy_text'), icon: <Copy className="h-4 w-4" />, onClick: () => onCopy(message) }]
      : []),
    ...(own && message.type === 'text' && !deleted
      ? [{ key: 'edit', label: t('edit'), icon: <Pencil className="h-4 w-4" />, onClick: () => onEdit(message) }]
      : []),
    { key: 'info', label: t('message_info'), icon: <Info className="h-4 w-4" />, onClick: () => onInfo(message) },
    ...(own
      ? [
          {
            key: 'delete-all',
            label: t('delete_for_everyone'),
            icon: <Trash2 className="h-4 w-4" />,
            danger: true,
            onClick: () => onDelete(message, true),
          },
        ]
      : []),
    {
      key: 'delete-me',
      label: t('delete_for_me'),
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      onClick: () => onDelete(message, false),
    },
  ]

  return (
    <div
      className={cn('group/msg flex w-full gap-2 px-1', own ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
    >
      {/* أزرار التفاعل السريع على الجانب */}
      <div
        className={cn(
          'hidden items-center gap-0.5 self-center transition sm:flex',
          showActions ? 'opacity-100' : 'opacity-0',
          own ? 'order-2' : 'order-1',
        )}
      >
        <QuickReactionButton onSelect={(emoji) => onReact(message, emoji)} />
        <button
          type="button"
          onClick={() => onReply(message)}
          className="rounded-full p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
          aria-label={t('reply')}
          title={t('reply')}
        >
          <CornerUpLeft className="h-4 w-4" />
        </button>
      </div>

      <div className={cn('relative max-w-[85%] sm:max-w-[70%]', own ? 'order-1' : 'order-2')}>
        <div
          className={cn(
            'relative rounded-2xl px-3 py-2 shadow-sm',
            own
              ? 'bg-brand-600 text-white'
              : 'bg-white text-ink-900 dark:bg-ink-800 dark:text-ink-50',
            own ? 'rounded-br-md' : 'rounded-bl-md',
          )}
        >
          {isGroup && !own && sender && (
            <p className="mb-1 text-xs font-bold text-brand-700 dark:text-brand-300">{sender.display_name}</p>
          )}

          {message.forwarded_from && !deleted && (
            <p className={cn('mb-1 flex items-center gap-1 text-[11px] font-semibold italic', own ? 'text-white/80' : 'text-ink-400')}>
              <Share2 className="h-3 w-3" /> {t('forwarded')}
            </p>
          )}

          {message.replyPreview && !deleted && (
            <div
              className={cn(
                'mb-1.5 rounded-xl border-s-4 px-2.5 py-1.5 text-xs',
                own ? 'border-white/60 bg-white/15 text-white/90' : 'border-brand-500 bg-ink-50 text-ink-600 dark:bg-ink-900/60 dark:text-ink-300',
              )}
            >
              <p className="font-bold">{message.replyPreview.sender_id === currentUserId ? t('you') : t('user')}</p>
              <p className="line-clamp-2 break-words">{previewText(message.replyPreview, t)}</p>
            </div>
          )}

          {deleted ? (
            <p className={cn('text-sm italic', own ? 'text-white/80' : 'text-ink-400')}>
              {own ? t('you_deleted') : t('deleted_message')}
            </p>
          ) : (
            <>
              {message.attachments.length > 0 && (
                <div className="mb-1.5 flex flex-col gap-1.5">
                  {message.attachments.map((attachment) => {
                    if (message.type === 'image') {
                      return <ImageAttachment key={attachment.id} attachment={attachment} onOpen={onOpenMedia} />
                    }
                    if (message.type === 'video') {
                      return <VideoAttachment key={attachment.id} attachment={attachment} />
                    }
                    if (message.type === 'audio') {
                      return <AudioAttachment key={attachment.id} attachment={attachment} own={own} />
                    }
                    return <FileAttachment key={attachment.id} attachment={attachment} own={own} />
                  })}
                </div>
              )}

              {message.body && (
                <p
                  className={cn(
                    'whitespace-pre-wrap break-words text-sm leading-relaxed',
                    isEmojiOnly && 'text-3xl leading-tight',
                  )}
                >
                  {message.body}
                </p>
              )}

              {message.attachments.some((a) => a.uploading) && (
                <p className={cn('mt-1 text-[11px] font-semibold', own ? 'text-white/80' : 'text-ink-500')}>
                  {t('uploading')}
                </p>
              )}
            </>
          )}

          <div
            className={cn(
              'mt-1 flex items-center justify-end gap-1.5 text-[10px] font-semibold',
              own ? 'text-white/80' : 'text-ink-400',
            )}
          >
            {message.edited_at && !deleted && <span>{t('edited_label')}</span>}
            <span>{formatTime(message.created_at, lang)}</span>
            {renderStatus()}
          </div>
        </div>

        {/* التفاعلات */}
        {Object.keys(reactionsByEmoji).length > 0 && (
          <div className={cn('mt-1 flex flex-wrap gap-1', own ? 'justify-end' : 'justify-start')}>
            {Object.entries(reactionsByEmoji).map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message, emoji)}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition',
                  myReaction === emoji
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/60'
                    : 'border-ink-200 bg-white hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-800 dark:hover:bg-ink-700',
                )}
              >
                <span>{emoji}</span>
                <span className="font-bold text-ink-500 dark:text-ink-300">{count}</span>
              </button>
            ))}
          </div>
        )}

        {message.failed && (
          <p className="mt-1 text-end text-[11px] font-semibold text-rose-500">
            {t('failed_to_send')} · {t('tap_to_retry')}
          </p>
        )}

        {/* قائمة الإجراءات (جوال) */}
        {showActions && (
          <div className="absolute inset-x-0 -bottom-1 z-20 hidden sm:hidden" />
        )}
        <MobileActionSheet
          open={showActions}
          items={actionItems}
          onClose={() => setShowActions(false)}
          quickReactions={QUICK_REACTIONS}
          onReact={(emoji) => onReact(message, emoji)}
        />
      </div>
    </div>
  )
}

function QuickReactionButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-full p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
        aria-label="react"
      >
        <Smile className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-full z-40 mb-1 flex gap-0.5 rounded-full border border-ink-200 bg-white p-1 shadow-soft dark:border-ink-700 dark:bg-ink-900">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji)
                setOpen(false)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function MobileActionSheet({
  open,
  items,
  onClose,
  quickReactions,
  onReact,
}: {
  open: boolean
  items: Array<{ key: string; label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }>
  onClose: () => void
  quickReactions: string[]
  onReact: (emoji: string) => void
}) {
  if (!open) return null
  return (
    <div className="mt-1 flex flex-wrap justify-end gap-1 sm:hidden">
      <div className="flex w-full flex-wrap justify-end gap-1 rounded-2xl border border-ink-200 bg-white p-1.5 dark:border-ink-700 dark:bg-ink-900">
        <div className="flex w-full justify-end gap-1 border-b border-ink-100 pb-1.5 dark:border-ink-800">
          {quickReactions.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(emoji)
                onClose()
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              {emoji}
            </button>
          ))}
        </div>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition',
              item.danger
                ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function previewText(message: ChatMessage, t: (key: string) => string): string {
  if (message.deleted_at) return t('deleted_message')
  if (message.body) return message.body
  if (message.type === 'image') return t('photo')
  if (message.type === 'video') return t('video')
  if (message.type === 'audio') return t('voice_message')
  if (message.type === 'file') return t('document')
  return ''
}

export function MessageInfoModal({
  message,
  participants,
  onClose,
}: {
  message: ChatMessage | null
  participants: Record<string, PublicProfile>
  onClose: () => void
}) {
  const { t, lang } = useApp()
  if (!message) return null
  const receipts = message.receipts ?? []

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600 dark:text-ink-300">
        {t('sent')}: {formatTime(message.created_at, lang)}
      </p>
      <div className="space-y-1.5">
        {receipts.length === 0 && <p className="text-sm text-ink-400">{t('sending')}</p>}
        {receipts.map((receipt) => (
          <div key={receipt.id} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/60">
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              {participants[receipt.user_id]?.display_name ?? t('user')}
            </span>
            <span className="text-xs text-ink-500 dark:text-ink-400">
              {receipt.status === 'read' ? t('read') : t('delivered')} ·{' '}
              {formatTime(receipt.read_at ?? receipt.delivered_at, lang)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-400">
        {formatLastSeen(message.created_at, lang)} · <button type="button" onClick={onClose} className="underline">إغلاق</button>
      </p>
    </div>
  )
}
