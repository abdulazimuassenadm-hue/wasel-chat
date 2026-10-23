import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Copy,
  CornerUpLeft,
  Info,
  Pencil,
  Share2,
  Smile,
  Trash2,
  X,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { QUICK_REACTIONS } from '@/components/ui/EmojiPicker'
import { cn, formatDateTime, formatTime, splitTextLinks } from '@/lib/utils'
import { builtinStickerUrl, readStickerMeta, stickerPreviewText } from '@/lib/stickers'
import type { ChatMessage, PublicProfile } from '@/types'
import { AudioAttachment, FileAttachment, ImageAttachment, VideoAttachment } from './AttachmentView'

interface MessageBubbleProps {
  message: ChatMessage
  own: boolean
  isGroup: boolean
  /** عدد بقية أعضاء المحادثة (يُستخدم لتفادي إظهار «قُرئت» في المجموعات قبل قراءة الجميع) */
  recipientCount?: number
  sender?: PublicProfile | null
  /** اسم أي عضو في المحادثة (لعرض اسم صاحب الرسالة الأصلية في الرد) */
  nameOf: (userId: string | null | undefined) => string
  highlighted?: boolean
  onJumpToMessage: (messageId: string) => void
  onReply: (message: ChatMessage) => void
  onForward: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onDelete: (message: ChatMessage, forEveryone: boolean) => void
  onCopy: (message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string) => void
  onOpenMedia: (url: string, name: string) => void
  onInfo: (message: ChatMessage) => void
  onRetry: (message: ChatMessage) => void
  currentUserId: string
}

export function MessageBubble({
  message,
  own,
  isGroup,
  recipientCount,
  sender,
  nameOf,
  highlighted,
  onJumpToMessage,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onCopy,
  onReact,
  onOpenMedia,
  onInfo,
  onRetry,
  currentUserId,
}: MessageBubbleProps) {
  const { t, lang } = useApp()
  const [hovered, setHovered] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const longPressRef = useRef<number | null>(null)
  const longPressFiredRef = useRef(false)

  const deleted = Boolean(message.deleted_at)
  const stickerMeta = !deleted ? readStickerMeta(message.metadata) : null
  const isSticker = Boolean(stickerMeta)
  const stickerUrl = stickerMeta
    ? stickerMeta.kind === 'builtin'
      ? builtinStickerUrl(stickerMeta.id)
      : message.attachments.find((attachment) => attachment.url)?.url ?? null
    : null
  const isEmojiOnly = Boolean(
    message.body &&
      message.body.trim().length <= 8 &&
      /\p{Extended_Pictographic}/u.test(message.body) &&
      !/\w/.test(message.body),
  )

  const reactionsByEmoji = message.reactions.reduce<Record<string, number>>((accumulator, reaction) => {
    accumulator[reaction.emoji] = (accumulator[reaction.emoji] || 0) + 1
    return accumulator
  }, {})
  const myReaction = message.reactions.find((reaction) => reaction.user_id === currentUserId)?.emoji

  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current)
    longPressRef.current = null
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    // لا نفعّل القائمة المطوّلة إذا بدأ اللمس على زر أو رابط أو وسائط تفاعلية،
    // حتى لا تُنفَّذ عمليتان من نقرة واحدة.
    const target = event.target as HTMLElement | null
    if (target?.closest('button, a, input, textarea, audio, video, [data-no-long-press]')) return
    cancelLongPress()
    longPressFiredRef.current = false
    longPressRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true
      setSheetOpen(true)
      if (typeof navigator.vibrate === 'function') navigator.vibrate(12)
    }, 450)
  }

  const handleTouchEnd = () => {
    cancelLongPress()
    if (longPressFiredRef.current) {
      // نترك النقر التالي يُلتقط ويُلغى في onClickCapture
      window.setTimeout(() => {
        longPressFiredRef.current = false
      }, 500)
    }
  }

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!longPressFiredRef.current) return
    event.preventDefault()
    event.stopPropagation()
    longPressFiredRef.current = false
  }

  // علامات القراءة: في المجموعات لا نعتبر الرسالة «مقروءة» حتى يقرأها جميع الأعضاء
  const readReceiptCount = (message.receipts ?? []).filter((receipt) => receipt.status === 'read').length
  const recipients = recipientCount ?? 1
  const fullyRead = recipients > 1 ? readReceiptCount >= recipients : readReceiptCount > 0
  const anyDelivered = (message.receipts ?? []).length > 0

  const renderStatus = (variant: 'bubble' | 'sticker' = 'bubble') => {
    if (!own || deleted) return null
    const muted = variant === 'sticker' ? 'text-white/80' : 'text-white/80'
    const read = variant === 'sticker' ? 'text-sky-300' : 'text-sky-200'
    if (message.pending) return <Clock className={cn('h-3.5 w-3.5', muted)} aria-label={t('sending')} />
    if (message.failed)
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRetry(message)
          }}
          className="inline-flex items-center"
          aria-label={t('tap_to_retry')}
          title={t('tap_to_retry')}
        >
          <AlertCircle className="h-3.5 w-3.5 text-rose-200" />
        </button>
      )
    if (fullyRead) return <CheckCheck className={cn('h-3.5 w-3.5', read)} aria-label={t('read')} />
    if (anyDelivered || message.status === 'delivered') {
      return <CheckCheck className={cn('h-3.5 w-3.5', muted)} aria-label={t('delivered')} />
    }
    return <Check className={cn('h-3.5 w-3.5', muted)} aria-label={t('sent')} />
  }

  const actionItems = deleted
    ? [
        { key: 'info', label: t('message_info'), icon: <Info className="h-4 w-4" />, onClick: () => onInfo(message) },
        {
          key: 'delete-me',
          label: t('delete_for_me'),
          icon: <Trash2 className="h-4 w-4" />,
          danger: true,
          onClick: () => onDelete(message, false),
        },
      ]
    : [
        { key: 'reply', label: t('reply'), icon: <CornerUpLeft className="h-4 w-4" />, onClick: () => onReply(message) },
        { key: 'forward', label: t('forward'), icon: <Share2 className="h-4 w-4" />, onClick: () => onForward(message) },
        ...(message.type === 'text' && message.body
          ? [{ key: 'copy', label: t('copy_text'), icon: <Copy className="h-4 w-4" />, onClick: () => onCopy(message) }]
          : []),
        ...(own && message.type === 'text'
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

  const replyQuote = message.replyPreview && !deleted && (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onJumpToMessage(message.replyPreview?.id ?? '')
      }}
      className={cn(
        'mb-1.5 block w-full rounded-xl border-s-4 px-2.5 py-1.5 text-start text-xs transition',
        own
          ? 'border-white/60 bg-white/15 text-white/90 hover:bg-white/20'
          : 'border-brand-500 bg-ink-50 text-ink-600 hover:bg-ink-100 dark:bg-ink-900/60 dark:text-ink-300 dark:hover:bg-ink-800/80',
      )}
      title={t('jump_to_original')}
    >
      <span className="flex items-center gap-1 font-bold">
        <CornerUpLeft className="h-3 w-3 shrink-0" />
        <span className="truncate">{nameOf(message.replyPreview.sender_id)}</span>
      </span>
      <span className="mt-0.5 line-clamp-2 break-words">{previewText(message.replyPreview, t, lang)}</span>
    </button>
  )

  return (
    <div
      id={`message-${message.id}`}
      data-message-id={message.id}
      className={cn('group/msg flex w-full gap-2 px-1', own ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
      onClickCapture={handleClickCapture}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest('a')) return
        event.preventDefault()
        setSheetOpen(true)
      }}
    >
      {/* أزرار التفاعل السريع على الجانب (حاسوب) */}
      <div
        className={cn(
          'hidden items-center gap-0.5 self-center transition sm:flex',
          hovered ? 'opacity-100' : 'opacity-0',
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

      <div
        className={cn(
          'relative min-w-0',
          isSticker ? 'max-w-[60%] sm:max-w-[45%]' : 'max-w-[85%] sm:max-w-[70%]',
          own ? 'order-1' : 'order-2',
          highlighted && 'rounded-3xl ring-2 ring-brand-400 ring-offset-2 ring-offset-ink-50 dark:ring-offset-ink-950',
        )}
      >
        {isSticker ? (
          <div className={cn('flex flex-col', own ? 'items-end' : 'items-start')}>
            {isGroup && !own && sender && (
              <p className="mb-1 px-1 text-xs font-bold text-brand-700 dark:text-brand-300">{sender.display_name}</p>
            )}

            {message.forwarded_from && (
              <p className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold italic text-ink-400">
                <Share2 className="h-3 w-3" /> {t('forwarded')}
              </p>
            )}

            {replyQuote}

            {stickerUrl ? (
              <button
                type="button"
                onClick={() => onOpenMedia(stickerUrl, t('sticker'))}
                className="block rounded-2xl p-0.5 transition active:scale-95"
                aria-label={t('sticker_preview_title')}
                title={t('sticker')}
              >
                <img
                  src={stickerUrl}
                  alt={t('sticker')}
                  className="h-32 w-32 object-contain drop-shadow-sm sm:h-36 sm:w-36"
                  draggable={false}
                  loading="lazy"
                />
              </button>
            ) : (
              <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-ink-100 dark:bg-ink-800">
                <Clock className="h-5 w-5 animate-pulse text-ink-400" />
              </div>
            )}

            <div className="mt-1 flex items-center gap-1.5 rounded-full bg-ink-950/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {message.edited_at && <span>{t('edited_label')}</span>}
              <span title={formatDateTime(message.created_at, lang)}>{formatTime(message.created_at, lang)}</span>
              {renderStatus('sticker')}
            </div>

            {message.failed && (
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="mt-1 text-end text-[11px] font-semibold text-rose-500 underline-offset-2 hover:underline"
              >
                {t('failed_to_send')} · {t('tap_to_retry')}
              </button>
            )}
          </div>
        ) : (
          <>
            <div
              className={cn(
                'relative rounded-2xl px-3 py-2 shadow-sm',
                own ? 'bg-brand-600 text-white' : 'bg-white text-ink-900 dark:bg-ink-800 dark:text-ink-50',
                own ? 'rounded-br-md' : 'rounded-bl-md',
              )}
            >
              {isGroup && !own && sender && (
                <p className="mb-1 text-xs font-bold text-brand-700 dark:text-brand-300">{sender.display_name}</p>
              )}

              {message.forwarded_from && !deleted && (
                <p
                  className={cn(
                    'mb-1 flex items-center gap-1 text-[11px] font-semibold italic',
                    own ? 'text-white/80' : 'text-ink-400',
                  )}
                >
                  <Share2 className="h-3 w-3" /> {t('forwarded')}
                </p>
              )}

              {replyQuote}

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
                      dir="auto"
                      className={cn(
                        'whitespace-pre-wrap break-words text-sm leading-relaxed',
                        isEmojiOnly && 'text-3xl leading-tight',
                      )}
                    >
                      {splitTextLinks(message.body).map((part, index) =>
                        part.href ? (
                          <a
                            key={`${part.href}-${index}`}
                            href={part.href}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            onClick={(event) => event.stopPropagation()}
                            onTouchStart={(event) => event.stopPropagation()}
                            className={cn(
                              'underline underline-offset-2',
                              own ? 'text-white' : 'text-brand-700 dark:text-brand-300',
                            )}
                          >
                            {part.text}
                          </a>
                        ) : (
                          <span key={index}>{part.text}</span>
                        ),
                      )}
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
                <span title={formatDateTime(message.created_at, lang)}>{formatTime(message.created_at, lang)}</span>
                {renderStatus()}
              </div>
            </div>

            {message.failed && (
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="mt-1 block w-full text-end text-[11px] font-semibold text-rose-500 underline-offset-2 hover:underline"
              >
                {t('failed_to_send')} · {t('tap_to_retry')}
              </button>
            )}
          </>
        )}

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

        <ActionSheet
          open={sheetOpen}
          title={own ? t('you') : nameOf(message.sender_id)}
          subtitle={formatDateTime(message.created_at, lang)}
          items={actionItems}
          allowReactions={!deleted}
          onClose={() => setSheetOpen(false)}
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

function ActionSheet({
  open,
  title,
  subtitle,
  items,
  onClose,
  quickReactions,
  onReact,
  allowReactions,
}: {
  open: boolean
  title: string
  subtitle?: string
  items: Array<{ key: string; label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void }>
  onClose: () => void
  quickReactions: string[]
  onReact: (emoji: string) => void
  allowReactions: boolean
}) {
  const { t } = useApp()
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-t-3xl border border-ink-200 bg-white p-3 shadow-soft animate-fade-up dark:border-ink-800 dark:bg-ink-900 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink-300 dark:bg-ink-700 sm:hidden" />
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-800 dark:text-ink-100">{title}</p>
            {subtitle && <p className="truncate text-[11px] text-ink-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {allowReactions && (
          <div className="mb-2 flex justify-between gap-0.5 rounded-2xl bg-ink-50 p-1 dark:bg-ink-800/60">
            {quickReactions.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(emoji)
                  onClose()
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-white active:scale-90 dark:hover:bg-ink-700"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[45dvh] overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                item.onClick()
                onClose()
              }}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm font-semibold transition',
                item.danger
                  ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40'
                  : 'text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
              )}
            >
              <span className="shrink-0 opacity-80">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function previewText(message: ChatMessage, t: (key: string) => string, lang: 'ar' | 'en'): string {
  if (message.deleted_at) return t('deleted_message')
  if (readStickerMeta(message.metadata)) return stickerPreviewText(lang)
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
  recipientCount,
  onClose,
}: {
  message: ChatMessage | null
  participants: Record<string, PublicProfile>
  recipientCount?: number
  onClose: () => void
}) {
  const { t, lang } = useApp()
  if (!message) return null
  const receipts = message.receipts ?? []
  const readCount = receipts.filter((receipt) => receipt.status === 'read').length
  const total = recipientCount ?? receipts.length
  const summary =
    total > 1
      ? readCount >= total
        ? t('all_members_read')
        : t('read_by_count', { n: readCount, total })
      : null

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600 dark:text-ink-300">
        {t('sent')}: {formatDateTime(message.created_at, lang)}
      </p>
      {summary && (
        <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-200">
          {summary}
        </p>
      )}
      <div className="space-y-1.5">
        {receipts.length === 0 && <p className="text-sm text-ink-400">{t('sending')}</p>}
        {receipts.map((receipt) => (
          <div
            key={receipt.id}
            className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/60"
          >
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
        <button type="button" onClick={onClose} className="underline">
          {t('close')}
        </button>
      </p>
    </div>
  )
}
