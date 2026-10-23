import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, Image as ImageIcon, Mic, Paperclip, Send, Smile, Sticker, Trash2, X, Video } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { EmojiPicker } from '@/components/ui/EmojiPicker'
import { IconButton } from '@/components/ui/Button'
import { useToast } from '@/context/ToastContext'
import { isAllowedFile, UPLOAD_LIMITS } from '@/lib/supabase'
import { cn, formatDuration } from '@/lib/utils'
import type { ChatMessage, UserSticker } from '@/types'
import { StickerPicker } from './StickerPicker'

interface MessageComposerProps {
  conversationId: string
  replyTo: ChatMessage | null
  editing: ChatMessage | null
  canSend: boolean
  blockedReason?: string | null
  onCancelReply: () => void
  onCancelEdit: () => void
  onSubmitText: (text: string) => void
  onSubmitEdit: (text: string) => void
  onSendFiles: (files: File[]) => void
  onSendVoice: (blob: Blob, duration: number) => void
  onSendBuiltinSticker: (id: string) => Promise<void> | void
  onSendLibrarySticker: (sticker: UserSticker) => Promise<void> | void
  onTyping: (typing: boolean) => void
  participants: Record<string, { display_name: string }>
  currentUserId: string
}

export function MessageComposer({
  conversationId,
  replyTo,
  editing,
  canSend,
  blockedReason,
  onCancelReply,
  onCancelEdit,
  onSubmitText,
  onSubmitEdit,
  onSendFiles,
  onSendVoice,
  onSendBuiltinSticker,
  onSendLibrarySticker,
  onTyping,
  participants,
  currentUserId,
}: MessageComposerProps) {
  const { t } = useApp()
  const toast = useToast()
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const typingRef = useRef(false)
  const typingTimeoutRef = useRef<number | null>(null)
  const recordSecondsRef = useRef(0)
  // يمنع إرسال الرسالة مرتين عند الضغط المتكرر السريع قبل إعادة الرسم
  const submitLockRef = useRef(0)

  // إعادة تعيين الحالة عند تغيير المحادثة
  useEffect(() => {
    setText('')
    setPendingFiles([])
    setShowAttach(false)
    setShowEmoji(false)
    setShowStickers(false)
  }, [conversationId])

  // عند بدء التعديل نعرض النص الحالي
  useEffect(() => {
    if (editing) {
      setText(editing.body ?? '')
      textareaRef.current?.focus()
    }
  }, [editing])

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus()
  }, [replyTo])

  const autoResize = () => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`
  }

  const handleChange = (value: string) => {
    setText(value)
    autoResize()
    if (!typingRef.current && value.trim()) {
      typingRef.current = true
      onTyping(true)
    }
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = window.setTimeout(() => {
      typingRef.current = false
      onTyping(false)
    }, 1800)
  }

  const submit = () => {
    const now = Date.now()
    if (now - submitLockRef.current < 700) return
    const value = text.trim()
    if (editing) {
      if (!value) return
      submitLockRef.current = now
      onSubmitEdit(value)
      setText('')
      onCancelEdit()
      return
    }
    if (pendingFiles.length) {
      submitLockRef.current = now
      onSendFiles(pendingFiles)
      setPendingFiles([])
      if (value) {
        // نص مصاحب يرسل كرسالة منفصلة للحفاظ على بساطة النموذج
        onSubmitText(value)
      }
      setText('')
      return
    }
    if (!value) return
    submitLockRef.current = now
    onSubmitText(value)
    setText('')
    if (typingRef.current) {
      typingRef.current = false
      onTyping(false)
    }
    requestAnimationFrame(autoResize)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const validateAndAdd = (files: FileList | null) => {
    if (!files?.length) return
    const accepted: File[] = []
    for (const file of Array.from(files)) {
      const check = isAllowedFile(file.type, file.size)
      if (!check.ok) {
        if (check.reason === 'FILE_TYPE_NOT_ALLOWED') toast.error(t('file_type_not_allowed'))
        else toast.error(t('file_too_large', { n: UPLOAD_LIMITS.chatMedia }))
        continue
      }
      accepted.push(file)
    }
    if (accepted.length) setPendingFiles((prev) => [...prev, ...accepted].slice(0, 10))
  }

  // --------------------------------------------------------------------------
  // تسجيل الرسائل الصوتية
  // --------------------------------------------------------------------------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeCandidates = ['audio/webm', 'audio/mp4', 'audio/ogg']
      const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        // نقرأ المدة من ref لأن الحالة داخل هذا الإغلاق تبقى بقيمتها الأولى (0)
        const seconds = recordSecondsRef.current
        setRecording(false)
        setRecordSeconds(0)
        recordSecondsRef.current = 0
        if (blob.size > 0 && seconds >= 1) onSendVoice(blob, seconds)
      }

      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      recordSecondsRef.current = 0
      timerRef.current = window.setInterval(() => {
        recordSecondsRef.current += 1
        setRecordSeconds(recordSecondsRef.current)
      }, 1000)
    } catch {
      toast.error(t('call_denied_permission'))
    }
  }

  const stopRecording = (cancel = false) => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (cancel) {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        setRecordSeconds(0)
        recordSecondsRef.current = 0
      }
    }
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    recorder.stop()
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [])

  const replyLabel = replyTo
    ? replyTo.sender_id === currentUserId
      ? t('you')
      : participants[replyTo.sender_id ?? '']?.display_name ?? t('user')
    : ''

  if (!canSend) {
    return (
      <div className="shrink-0 border-t border-ink-200/80 bg-white px-4 pt-4 text-center text-sm text-ink-500 safe-bottom-composer dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
        {blockedReason ?? t('permission_denied')}
      </div>
    )
  }

  return (
    <div className="relative shrink-0 border-t border-ink-200/80 bg-white px-1.5 pt-1.5 safe-bottom-composer dark:border-ink-800 dark:bg-ink-900 sm:px-4 sm:pt-2">
      {/* شريط الرد */}
      {replyTo && !editing && (
        <div className="mx-1 mb-2 flex items-center gap-2 rounded-xl border-s-4 border-brand-500 bg-ink-50 px-3 py-2 dark:bg-ink-800/70">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-brand-700 dark:text-brand-300">{t('reply')} · {replyLabel}</p>
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">
              {replyTo.metadata?.sticker === true
                ? t('sticker')
                : replyTo.body ??
                  (replyTo.type === 'image'
                    ? t('photo')
                    : replyTo.type === 'audio'
                      ? t('voice_message')
                      : t('document'))}
            </p>
          </div>
          <IconButton label={t('cancel')} size="sm" onClick={onCancelReply}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      )}

      {/* شريط التعديل */}
      {editing && (
        <div className="mx-1 mb-2 flex items-center gap-2 rounded-xl border-s-4 border-amber-500 bg-amber-50 px-3 py-2 dark:bg-amber-950/40">
          <p className="min-w-0 flex-1 truncate text-xs font-bold text-amber-700 dark:text-amber-300">{t('edit')}</p>
          <IconButton
            label={t('cancel')}
            size="sm"
            onClick={() => {
              setText('')
              onCancelEdit()
            }}
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      )}

      {/* معاينة الملفات قبل الإرسال */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {pendingFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-xs dark:border-ink-700 dark:bg-ink-800"
            >
              {file.type.startsWith('image/') ? (
                <img src={URL.createObjectURL(file)} alt={file.name} className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <FileText className="h-4 w-4 text-ink-400" />
              )}
              <span className="max-w-[140px] truncate font-semibold text-ink-700 dark:text-ink-200">{file.name}</span>
              <button
                type="button"
                onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                className="rounded-full p-1 text-ink-400 hover:bg-ink-200 dark:hover:bg-ink-700"
                aria-label={t('remove')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* لوحة الملصقات */}
      <StickerPicker
        open={showStickers}
        userId={currentUserId}
        onClose={() => setShowStickers(false)}
        onSendBuiltin={onSendBuiltinSticker}
        onSendLibrary={onSendLibrarySticker}
      />

      {recording ? (
        <div className="flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 dark:bg-rose-950/40">
          <span className="flex h-3 w-3 shrink-0 animate-pulse rounded-full bg-rose-500" />
          <span className="shrink-0 text-sm font-semibold text-rose-700 dark:text-rose-300">{formatDuration(recordSeconds)}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-rose-600 dark:text-rose-300">{t('recording_audio')}</span>
          <IconButton label={t('cancel_recording')} onClick={() => stopRecording(true)}>
            <Trash2 className="h-4 w-4 text-rose-600" />
          </IconButton>
          <IconButton label={t('send_recording')} variant="solid" onClick={() => stopRecording(false)}>
            <Send className="h-4 w-4" />
          </IconButton>
        </div>
      ) : (
        <div className="flex items-end gap-1 sm:gap-1.5">
          {/* الرموز التعبيرية */}
          <div className="relative">
            <EmojiPicker
              open={showEmoji}
              onClose={() => setShowEmoji(false)}
              onSelect={(emoji) => {
                setText((value) => value + emoji)
                requestAnimationFrame(() => {
                  autoResize()
                  textareaRef.current?.focus()
                })
              }}
            />
            <IconButton
              label={t('emoji')}
              className="max-sm:h-9 max-sm:w-9"
              onClick={() => {
                setShowStickers(false)
                setShowAttach(false)
                setShowEmoji((value) => !value)
              }}
            >
              <Smile className="h-5 w-5" />
            </IconButton>
          </div>

          {/* المرفقات */}
          <div className="relative">
            <IconButton
              label={t('attach_file')}
              className="max-sm:h-9 max-sm:w-9"
              onClick={() => {
                setShowStickers(false)
                setShowEmoji(false)
                setShowAttach((value) => !value)
              }}
            >
              <Paperclip className={cn('h-5 w-5 transition', showAttach && 'rotate-45')} />
            </IconButton>
            {showAttach && (
              <div className="absolute bottom-full start-0 z-40 mb-2 w-48 overflow-hidden rounded-2xl border border-ink-200 bg-white py-1.5 shadow-soft animate-pop-in dark:border-ink-700 dark:bg-ink-900">
                {[
                  { key: 'image', label: t('photo'), icon: <ImageIcon className="h-4 w-4" />, input: imageInputRef },
                  { key: 'video', label: t('video'), icon: <Video className="h-4 w-4" />, input: videoInputRef },
                  { key: 'file', label: t('document'), icon: <FileText className="h-4 w-4" />, input: fileInputRef },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setShowAttach(false)
                      item.input.current?.click()
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm font-medium text-ink-700 transition hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setShowAttach(false)
                    imageInputRef.current?.setAttribute('capture', 'environment')
                    imageInputRef.current?.click()
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm font-medium text-ink-700 transition hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <Camera className="h-4 w-4" />
                  {t('camera')}
                </button>
              </div>
            )}
          </div>

          {/* الملصقات */}
          <IconButton
            label={t('stickers')}
            className={cn('max-sm:h-9 max-sm:w-9', showStickers && 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300')}
            onClick={() => {
              setShowEmoji(false)
              setShowAttach(false)
              setShowStickers((value) => !value)
            }}
          >
            <Sticker className="h-5 w-5" />
          </IconButton>

          {/* حقل النص */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={t('write_message')}
            className="max-h-[120px] min-h-[40px] min-w-0 flex-1 resize-none rounded-2xl border border-ink-200 bg-ink-50 px-3 py-2.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-50 dark:focus:bg-ink-800 sm:max-h-[140px] sm:min-h-[44px] sm:px-4 sm:py-3"
          />

          {/* إرسال أو تسجيل */}
          {text.trim() || pendingFiles.length ? (
            <button
              type="button"
              onClick={submit}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 active:scale-95 sm:h-11 sm:w-11"
              aria-label={t('send')}
            >
              <Send className="h-5 w-5 rtl:-scale-x-100" />
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 transition hover:bg-ink-200 active:scale-95 sm:h-11 sm:w-11 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700"
              aria-label={t('record_voice')}
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {/* مدخلات الملفات المخفية */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          validateAndAdd(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(event) => {
          validateAndAdd(event.target.files)
          event.target.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        multiple
        hidden
        onChange={(event) => {
          validateAndAdd(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
