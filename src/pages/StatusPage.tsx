import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, CircleDot, Eye, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SelectField, TextArea } from '@/components/ui/Field'
import { EmptyState, Spinner } from '@/components/ui/Misc'
import { PageHeader } from '@/components/layout/AppLayout'
import * as api from '@/lib/api'
import { UPLOAD_LIMITS } from '@/lib/supabase'
import { cn, errorKey, formatBytes, formatLastSeen, timeAgo } from '@/lib/utils'
import type { Contact, Status, StatusAudience } from '@/types'

const BACKGROUNDS = [
  'from-brand-600 to-brand-800',
  'from-rose-500 to-rose-700',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-indigo-600',
  'from-emerald-500 to-teal-700',
  'from-fuchsia-600 to-purple-700',
]

export function StatusPage() {
  const { t, lang } = useApp()
  const { user } = useAuth()
  const toast = useToast()

  const [statuses, setStatuses] = useState<Status[]>([])
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [viewer, setViewer] = useState<{ userId: string; ids: string[] } | null>(null)
  const [viewersOf, setViewersOf] = useState<Status | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const contacts = await api.listContacts(user.id)
      const ids = contacts.map((c) => c.contact_user_id)
      setStatuses(await api.listStatuses(ids, user.id))
    } catch {
      setStatuses([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  const mine = useMemo(() => statuses.filter((s) => s.user_id === user?.id), [statuses, user])

  const others = useMemo(() => {
    const map = new Map<string, Status[]>()
    for (const status of statuses) {
      if (status.user_id === user?.id) continue
      const list = map.get(status.user_id) ?? []
      list.push(status)
      map.set(status.user_id, list)
    }
    return Array.from(map.values())
  }, [statuses, user])

  const unseen = others.filter((list) => list.some((s) => !s.viewedByMe))
  const seen = others.filter((list) => list.every((s) => s.viewedByMe))

  const openViewer = (list: Status[]) => {
    setViewer({ userId: list[0].user_id, ids: list.map((s) => s.id) })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-ink-900">
      <PageHeader
        title={t('status_title')}
        action={
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setComposerOpen(true)}>
            {t('add_status')}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-10">
            <Spinner size={26} />
          </div>
        )}

        {!loading && (
          <>
            {/* حالتي */}
            <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
              <button type="button" onClick={() => (mine.length ? openViewer(mine) : setComposerOpen(true))} className="relative">
                <Avatar src={user?.user_metadata?.avatar_url} name={t('my_status')} id={user?.id} size="lg" />
                <span className="absolute -bottom-0.5 -end-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white dark:border-ink-900">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{t('my_status')}</p>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {mine.length ? timeAgo(mine[0].created_at, lang) : t('my_status_empty')}
                </p>
              </div>
              {mine.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewersOf(mine[0])}
                    className="flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-200"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {mine[0].viewerCount ?? 0}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(t('confirm_delete_status'))) return
                      void api
                        .deleteStatus(mine[0].id)
                        .then(() => {
                          toast.success(t('status_deleted'))
                          void load()
                        })
                        .catch(() => toast.error(t('generic_error')))
                    }}
                    className="rounded-full p-2 text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    aria-label={t('delete_status')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {others.length === 0 && (
              <EmptyState
                icon={<CircleDot className="h-7 w-7" />}
                title={t('no_statuses')}
                description={t('no_statuses_hint')}
              />
            )}

            {unseen.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                  {t('recent_updates')}
                </p>
                {unseen.map((list) => (
                  <StatusRow key={list[0].user_id} list={list} lang={lang} onClick={() => openViewer(list)} unseen />
                ))}
              </>
            )}

            {seen.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                  {t('viewed_updates')}
                </p>
                {seen.map((list) => (
                  <StatusRow key={list[0].user_id} list={list} lang={lang} onClick={() => openViewer(list)} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      <StatusComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={() => {
          setComposerOpen(false)
          void load()
        }}
      />

      {viewer && (
        <StoryViewer
          ids={viewer.ids}
          statuses={statuses}
          onClose={() => {
            setViewer(null)
            void load()
          }}
          onShowViewers={(status) => {
            setViewer(null)
            setViewersOf(status)
          }}
          onDelete={(status) => {
            if (!window.confirm(t('confirm_delete_status'))) return
            void api
              .deleteStatus(status)
              .then(() => {
                toast.success(t('status_deleted'))
                setViewer(null)
                void load()
              })
              .catch(() => toast.error(t('generic_error')))
          }}
        />
      )}

      <Modal open={Boolean(viewersOf)} onClose={() => setViewersOf(null)} title={t('viewers')} size="sm">
        <ViewersList statusId={viewersOf?.id ?? null} />
      </Modal>
    </div>
  )
}

function StatusRow({
  list,
  lang,
  onClick,
  unseen,
}: {
  list: Status[]
  lang: 'ar' | 'en'
  onClick: () => void
  unseen?: boolean
}) {
  const author = list[0].author
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-ink-100/70 dark:hover:bg-ink-800/60"
    >
      <div className={cn('rounded-full p-0.5', unseen ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-600')}>
        <div className="rounded-full bg-white p-0.5 dark:bg-ink-900">
          <Avatar src={author?.avatar_url} name={author?.display_name} id={author?.id} size="md" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{author?.display_name ?? ''}</p>
        <p className="truncate text-xs text-ink-500 dark:text-ink-400">
          {list.length} · {timeAgo(list[0].created_at, lang)}
        </p>
      </div>
    </button>
  )
}

function StoryViewer({
  ids,
  statuses,
  onClose,
  onShowViewers,
  onDelete,
}: {
  ids: string[]
  statuses: Status[]
  onClose: () => void
  onShowViewers?: (status: Status) => void
  onDelete?: (status: Status) => void
}) {
  const { t, lang, dir } = useApp()
  const { user } = useAuth()
  const [index, setIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<number | null>(null)

  const ordered = useMemo(() => {
    const map = new Map(statuses.map((s) => [s.id, s]))
    return ids.map((id) => map.get(id)).filter(Boolean) as Status[]
  }, [ids, statuses])

  const current = ordered[index]
  const Next = dir === 'rtl' ? ChevronLeft : ChevronRight
  const Prev = dir === 'rtl' ? ChevronRight : ChevronLeft

  const goNext = useCallback(() => {
    setIndex((value) => {
      if (value >= ordered.length - 1) {
        onClose()
        return value
      }
      return value + 1
    })
  }, [ordered.length, onClose])

  const goPrev = () => setIndex((value) => Math.max(0, value - 1))

  // تعليم كمشاهدة + مؤقّت التقدّم
  useEffect(() => {
    if (!current || !user || current.user_id === user.id) return
    void api.viewStatus(current.id, user.id).catch(() => undefined)
  }, [current, user])

  useEffect(() => {
    setProgress(0)
    if (!current || current.type === 'video') return
    const duration = current.type === 'text' ? 5000 : 6000
    const start = Date.now()
    const tick = window.setInterval(() => {
      const percent = Math.min(100, ((Date.now() - start) / duration) * 100)
      setProgress(percent)
      if (percent >= 100) {
        window.clearInterval(tick)
        goNext()
      }
    }, 60)
    timerRef.current = tick
    return () => window.clearInterval(tick)
  }, [current, goNext])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [])

  if (!current) return null
  const author = current.author

  const header = (
    <>
      <div className="flex gap-1 px-3 pt-3">
        {ordered.map((status, i) => (
          <span key={status.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <span
              className="block h-full bg-white transition-all"
              style={{ width: i < index ? '100%' : i === index ? `${progress}%` : '0%' }}
            />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar src={author?.avatar_url} name={author?.display_name} id={author?.id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{author?.display_name}</p>
          <p className="text-[11px] text-white/60">{timeAgo(current.created_at, lang)}</p>
        </div>
        {current.user_id === user?.id && onShowViewers && (
          <button
            type="button"
            onClick={() => onShowViewers(current)}
            className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            title={t('viewers')}
          >
            <Eye className="h-4 w-4" />
            {current.viewerCount ?? 0}
          </button>
        )}
        {current.user_id === user?.id && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(current)}
            className="rounded-full p-2 text-white/80 transition hover:bg-rose-500/30 hover:text-white"
            aria-label={t('delete_status')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-white transition hover:bg-white/10"
          aria-label={t('close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </>
  )

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black/95">
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col">
        {header}

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4">
          {current.type === 'text' && (
            <div
              className={cn(
                'flex h-full w-full items-center justify-center rounded-3xl bg-gradient-to-br p-8 text-center',
                current.background || BACKGROUNDS[0],
              )}
            >
              <p className="whitespace-pre-wrap break-words text-2xl font-bold leading-relaxed text-white">
                {current.content}
              </p>
            </div>
          )}
          {current.type === 'image' && current.mediaUrl && (
            <img src={current.mediaUrl} alt={current.caption ?? ''} className="max-h-full max-w-full rounded-2xl object-contain" />
          )}
          {current.type === 'video' && current.mediaUrl && (
            <video
              src={current.mediaUrl}
              autoPlay
              controls
              playsInline
              preload="metadata"
              className="max-h-full max-w-full rounded-2xl"
              onTimeUpdate={(event) => {
                const duration = event.currentTarget.duration
                if (Number.isFinite(duration) && duration > 0) {
                  setProgress(Math.min(100, (event.currentTarget.currentTime / duration) * 100))
                }
              }}
              onEnded={goNext}
            />
          )}
          {current.caption && current.type !== 'text' && (
            <p
              className={cn(
                'absolute inset-x-4 rounded-2xl bg-black/60 px-4 py-2 text-center text-sm text-white',
                current.type === 'video' ? 'bottom-20' : 'bottom-6',
              )}
            >
              {current.caption}
            </p>
          )}

          {/* أزرار التنقل — نترك أسفل الفيديو لأدوات التحكم الأصلية */}
          <button
            type="button"
            onClick={goPrev}
            className={cn(
              'absolute start-0 w-1/4',
              current.type === 'video' ? 'top-0 bottom-24' : 'inset-y-0',
            )}
            aria-label={t('prev_status')}
          />
          <button
            type="button"
            onClick={goNext}
            className={cn(
              'absolute end-0 w-1/4',
              current.type === 'video' ? 'top-0 bottom-24' : 'inset-y-0',
            )}
            aria-label={t('next_status')}
          />
          <span className="pointer-events-none absolute start-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70">
            <Prev className="h-5 w-5" />
          </span>
          <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70">
            <Next className="h-5 w-5" />
          </span>
        </div>
      </div>
    </div>
  )
}

function StatusComposer({
  open,
  onClose,
  onPosted,
}: {
  open: boolean
  onClose: () => void
  onPosted: () => void
}) {
  const { t, lang } = useApp()
  const { user, profile } = useAuth()
  const toast = useToast()

  const [type, setType] = useState<'text' | 'image' | 'video'>('text')
  const [content, setContent] = useState('')
  const [background, setBackground] = useState(BACKGROUNDS[0])
  const [caption, setCaption] = useState('')
  const [audience, setAudience] = useState<StatusAudience>('everyone')
  const [audienceIds, setAudienceIds] = useState<string[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactTerm, setContactTerm] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileInfo, setFileInfo] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const previewRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  // تحميل جهات الاتصال عند فتح النافذة + تهيئة الخصوصية من إعدادات المستخدم
  useEffect(() => {
    if (!open || !user) return
    void api
      .listContacts(user.id)
      .then(setContacts)
      .catch(() => setContacts([]))
  }, [open, user])

  useEffect(() => {
    if (!open) return
    const pref = profile?.privacy.status
    setAudience(pref === 'everyone' ? 'everyone' : pref === 'nobody' ? 'selected' : 'contacts')
  }, [open, profile])

  const filteredContacts = useMemo(() => {
    const term = contactTerm.trim().toLowerCase()
    if (!term) return contacts
    return contacts.filter((c) => (c.profile?.display_name ?? '').toLowerCase().includes(term))
  }, [contacts, contactTerm])

  const toggleAudience = (userId: string) => {
    setAudienceIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))
  }

  const clearFile = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
    setFile(null)
    setPreview(null)
    setFileInfo('')
    setProgress(0)
  }

  const reset = () => {
    setType('text')
    setContent('')
    setBackground(BACKGROUNDS[0])
    setCaption('')
    setAudience('everyone')
    setAudienceIds([])
    setContactTerm('')
    clearFile()
    setBusy(false)
  }

  const selectType = (next: 'text' | 'image' | 'video') => {
    if (next === 'text') {
      setType('text')
      return
    }
    if (file) {
      const matches = next === 'image' ? file.type.startsWith('image/') : file.type.startsWith('video/')
      if (!matches) clearFile()
    }
    setType(next)
  }

  const pickFile = (selected: File | null) => {
    if (!selected) return
    if (!selected.type.startsWith('image/') && !selected.type.startsWith('video/')) {
      toast.error(t('file_type_not_allowed'))
      return
    }
    if (selected.size > UPLOAD_LIMITS.statusMedia * 1024 * 1024) {
      toast.error(t('file_too_large', { n: UPLOAD_LIMITS.statusMedia }))
      return
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const url = URL.createObjectURL(selected)
    previewRef.current = url
    setFile(selected)
    setPreview(url)
    setFileInfo(formatBytes(selected.size, lang))
    setProgress(0)
    if (selected.type.startsWith('video')) setType('video')
    else setType('image')
  }

  const submit = async () => {
    if (!user) return
    if (type === 'text' && !content.trim()) return
    if (type !== 'text' && !file) {
      toast.error(t('no_file_selected'))
      return
    }
    if ((audience === 'selected' || audience === 'except') && !audienceIds.length) {
      toast.error(t('choose_contacts'))
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      await api.createStatus({
        userId: user.id,
        type,
        content: type === 'text' ? content.trim() : null,
        background: type === 'text' ? background : null,
        caption: type === 'text' ? null : caption.trim() || null,
        audience,
        audienceIds: audience === 'selected' || audience === 'except' ? audienceIds : undefined,
        file: type === 'text' ? null : file,
        onProgress: setProgress,
      })
      toast.success(t('status_posted'))
      reset()
      onPosted()
    } catch (error) {
      const key = errorKey(error)
      toast.error(t(key, key === 'file_too_large' ? { n: UPLOAD_LIMITS.statusMedia } : undefined))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return
        reset()
        onClose()
      }}
      title={t('add_status')}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset()
              onClose()
            }}
            disabled={busy}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={() => void submit()}
            loading={busy}
            disabled={type === 'text' ? !content.trim() : !file}
          >
            {t('post_status')}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-2">
        {(['text', 'image', 'video'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => selectType(item)}
            className={cn(
              'flex-1 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition',
              type === item
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200'
                : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
            )}
          >
            {item === 'text' ? t('status_text') : item === 'image' ? t('status_photo') : t('status_video')}
          </button>
        ))}
      </div>

      {busy && (
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-ink-500 dark:text-ink-400">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('status_uploading')}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(4, progress)}%` }} />
          </div>
        </div>
      )}

      {type === 'text' ? (
        <div className={cn('mb-4 flex min-h-[160px] items-center justify-center rounded-3xl bg-gradient-to-br p-5', background)}>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t('status_placeholder')}
            maxLength={300}
            className="h-full w-full resize-none bg-transparent text-center text-xl font-bold text-white outline-none placeholder:text-white/60"
          />
        </div>
      ) : (
        <div className="mb-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-ink-300 py-10 text-ink-500 transition hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800/60">
            {preview ? (
              type === 'video' ? (
                <video
                  src={preview}
                  className="max-h-56 rounded-2xl"
                  controls
                  playsInline
                  preload="metadata"
                  onClick={(event) => event.stopPropagation()}
                />
              ) : (
                <img
                  src={preview}
                  alt=""
                  className="max-h-56 rounded-2xl object-contain"
                  onError={() => {
                    toast.error(t('file_type_not_allowed'))
                    clearFile()
                  }}
                />
              )
            ) : (
              <>
                <Plus className="h-6 w-6" />
                <span className="text-sm font-semibold">{t('status_choose_media')}</span>
              </>
            )}
            <input
              type="file"
              accept={type === 'video' ? 'video/*' : 'image/*'}
              hidden
              onChange={(event) => {
                pickFile(event.target.files?.[0] ?? null)
                event.currentTarget.value = ''
              }}
            />
          </label>
          <p className="mt-2 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {file ? `${file.name} · ${fileInfo}` : ''}
            {file ? ' — ' : ''}
            {type === 'image' ? t('status_image_compress_hint') : t('status_video_hint')}
          </p>
        </div>
      )}

      {type === 'text' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {BACKGROUNDS.map((bg) => (
            <button
              key={bg}
              type="button"
              onClick={() => setBackground(bg)}
              className={cn(
                'h-8 w-8 rounded-full bg-gradient-to-br ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-ink-900',
                bg,
                background === bg ? 'ring-brand-500' : 'ring-transparent',
              )}
              aria-label="background"
            />
          ))}
        </div>
      )}

      {type !== 'text' && (
        <TextArea
          label={`${t('status_caption')} (${t('optional')})`}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={200}
        />
      )}

      <SelectField label={t('status_who_can_see')} value={audience} onChange={(event) => setAudience(event.target.value as StatusAudience)}>
        <option value="everyone">{t('audience_everyone')}</option>
        <option value="contacts">{t('audience_contacts')}</option>
        <option value="selected">{t('audience_selected')}</option>
        <option value="except">{t('audience_except')}</option>
      </SelectField>

      {/* اختيار جهات الاتصال للخصوصية المخصّصة (تُفرض على الخادم عبر status_audience) */}
      {(audience === 'selected' || audience === 'except') && (
        <div className="mt-2">
          <label className="wasel-label">{t('choose_contacts')}</label>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-400" />
            <input
              value={contactTerm}
              onChange={(event) => setContactTerm(event.target.value)}
              placeholder={t('search_contacts')}
              className="wasel-input py-2.5 pe-3 ps-10"
            />
          </div>
          <div className="max-h-52 overflow-y-auto rounded-2xl border border-ink-200 dark:border-ink-700">
            {filteredContacts.length === 0 && (
              <p className="px-3 py-5 text-center text-xs text-ink-500 dark:text-ink-400">{t('no_contacts')}</p>
            )}
            {filteredContacts.map((contact) => {
              const selected = audienceIds.includes(contact.contact_user_id)
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => toggleAudience(contact.contact_user_id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-start transition hover:bg-ink-50 dark:hover:bg-ink-800/60"
                >
                  <Avatar
                    src={contact.profile?.avatar_url}
                    name={contact.profile?.display_name}
                    id={contact.contact_user_id}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
                    {contact.profile?.display_name ?? t('user')}
                  </span>
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                      selected
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-ink-300 dark:border-ink-600',
                    )}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{t('selected_count', { n: audienceIds.length })}</p>
        </div>
      )}
    </Modal>
  )
}

function ViewersList({ statusId }: { statusId: string | null }) {
  const { t, lang } = useApp()
  const [loading, setLoading] = useState(false)
  const [viewers, setViewers] = useState<Awaited<ReturnType<typeof api.listStatusViews>>>([])

  useEffect(() => {
    if (!statusId) return
    setLoading(true)
    void api
      .listStatusViews(statusId)
      .then(setViewers)
      .catch(() => setViewers([]))
      .finally(() => setLoading(false))
  }, [statusId])

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    )
  }

  if (!viewers.length) return <p className="py-6 text-center text-sm text-ink-500 dark:text-ink-400">{t('no_viewers')}</p>

  return (
    <div className="space-y-1.5">
      {viewers.map((view) => (
        <div key={view.id} className="flex items-center gap-3 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/60">
          <Avatar src={view.viewer?.avatar_url} name={view.viewer?.display_name} id={view.viewer_id} size="sm" />
          <span className="flex-1 truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
            {view.viewer?.display_name ?? t('user')}
          </span>
          <span className="text-[11px] text-ink-400">{formatLastSeen(view.viewed_at, lang)}</span>
        </div>
      ))}
    </div>
  )
}
