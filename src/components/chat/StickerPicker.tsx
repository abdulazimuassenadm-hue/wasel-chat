import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/Button'
import * as api from '@/lib/api'
import { errorKey } from '@/lib/utils'
import {
  BUILTIN_STICKERS,
  STICKER_PACKS,
  builtinStickerUrl,
  stickerLabel,
  type StickerPackId,
} from '@/lib/stickers'
import { UPLOAD_LIMITS } from '@/lib/supabase'
import type { UserSticker } from '@/types'
import { StickerCropModal } from './StickerCropModal'

type Tab = StickerPackId | 'mine'

type Preview =
  | { kind: 'builtin'; id: string; url: string; label: string }
  | { kind: 'library'; sticker: UserSticker }

interface StickerPickerProps {
  open: boolean
  userId: string
  onClose: () => void
  onSendBuiltin: (id: string) => Promise<void> | void
  onSendLibrary: (sticker: UserSticker) => Promise<void> | void
}

function setupError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string }
  const code = String(candidate?.code ?? '')
  const message = String(candidate?.message ?? '').toLowerCase()
  return (
    code === '42P01' ||
    code === '404' ||
    message.includes('user_stickers') ||
    message.includes('bucket not found') ||
    message.includes('storage')
  )
}

export function StickerPicker({ open, userId, onClose, onSendBuiltin, onSendLibrary }: StickerPickerProps) {
  const { t, lang } = useApp()
  const toast = useToast()

  const [tab, setTab] = useState<Tab>('wasel')
  const [mine, setMine] = useState<UserSticker[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<UserSticker | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropName, setCropName] = useState('')
  const [savingSticker, setSavingSticker] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const cropUrlRef = useRef<string | null>(null)

  const loadLibrary = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLibraryError(null)
    try {
      const list = await api.listUserStickers(userId)
      setMine(list)
      setLoaded(true)
    } catch (error) {
      setLibraryError(setupError(error) ? 'setup' : 'generic')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (open && tab === 'mine' && !loaded && !loading) void loadLibrary()
  }, [open, tab, loaded, loading, loadLibrary])

  useEffect(() => {
    if (open) return
    setPreview(null)
    setConfirmDelete(null)
    setCropSrc(null)
  }, [open])

  useEffect(() => {
    return () => {
      if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current)
    }
  }, [])

  if (!open) return null

  const startUpload = (file: File | null) => {
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) {
      toast.error(t('file_type_not_allowed'))
      return
    }
    if (file.size > UPLOAD_LIMITS.sticker * 1024 * 1024) {
      toast.error(t('file_too_large', { n: UPLOAD_LIMITS.sticker }))
      return
    }
    if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current)
    const url = URL.createObjectURL(file)
    cropUrlRef.current = url
    setCropName(file.name.replace(/\.[^.]+$/, ''))
    setCropSrc(url)
  }

  const saveSticker = async (blob: Blob, name: string) => {
    setSavingSticker(true)
    try {
      const created = await api.createUserSticker(userId, blob, name)
      setMine((prev) => [created, ...prev])
      setLoaded(true)
      setLibraryError(null)
      setCropSrc(null)
      if (cropUrlRef.current) {
        URL.revokeObjectURL(cropUrlRef.current)
        cropUrlRef.current = null
      }
      setTab('mine')
      toast.success(t('sticker_saved'))
    } catch (error) {
      toast.error(t(setupError(error) ? 'sticker_upload_unavailable' : errorKey(error)))
      throw error
    } finally {
      setSavingSticker(false)
    }
  }

  const removeSticker = async (sticker: UserSticker) => {
    setConfirmDelete(null)
    try {
      await api.deleteUserSticker(sticker)
      setMine((prev) => prev.filter((item) => item.id !== sticker.id))
      toast.success(t('sticker_deleted'))
    } catch (error) {
      toast.error(t(errorKey(error)))
    }
  }

  const send = async () => {
    if (!preview) return
    setSending(true)
    try {
      if (preview.kind === 'builtin') {
        await onSendBuiltin(preview.id)
      } else {
        await onSendLibrary(preview.sticker)
      }
      setPreview(null)
      onClose()
    } finally {
      setSending(false)
    }
  }

  const previewUrl = preview
    ? preview.kind === 'builtin'
      ? preview.url
      : preview.sticker.url
    : null
  const previewLabel = preview
    ? preview.kind === 'builtin'
      ? preview.label
      : preview.sticker.name
    : ''

  return (
    <>
      <div className="mt-1 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft animate-fade-up dark:border-ink-700 dark:bg-ink-900">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-ink-100 px-2 py-1.5 no-scrollbar dark:border-ink-800">
          {STICKER_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => setTab(pack.id)}
              className={
                tab === pack.id
                  ? 'shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white'
                  : 'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
              }
            >
              <span className="me-1">{pack.icon}</span>
              {lang === 'ar' ? pack.titleAr : pack.titleEn}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTab('mine')}
            className={
              tab === 'mine'
                ? 'shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white'
                : 'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
            }
          >
            ⭐ {t('sticker_my')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ms-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[34dvh] min-h-[132px] overflow-y-auto p-2 sm:max-h-[260px]">
          {tab !== 'mine' && (
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-5 md:grid-cols-6">
              {BUILTIN_STICKERS.filter((sticker) => sticker.pack === tab).map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  onClick={() =>
                    setPreview({
                      kind: 'builtin',
                      id: sticker.id,
                      url: builtinStickerUrl(sticker.id),
                      label: stickerLabel(sticker, lang),
                    })
                  }
                  className="flex aspect-square items-center justify-center rounded-xl transition hover:bg-ink-100 active:scale-95 dark:hover:bg-ink-800"
                  aria-label={stickerLabel(sticker, lang)}
                  title={stickerLabel(sticker, lang)}
                >
                  <img
                    src={builtinStickerUrl(sticker.id)}
                    alt={stickerLabel(sticker, lang)}
                    className="h-full w-full object-contain p-1"
                    loading="lazy"
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          )}

          {tab === 'mine' && (
            <>
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
                </div>
              )}

              {!loading && libraryError && (
                <div className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {libraryError === 'setup' ? t('sticker_upload_unavailable') : t('generic_error')}
                </div>
              )}

              {!loading && !libraryError && (
                <div className="grid grid-cols-4 gap-1 sm:grid-cols-5 md:grid-cols-6">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-300 text-ink-500 transition hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-600 dark:border-ink-600 dark:text-ink-300 dark:hover:bg-brand-950/30"
                  >
                    <Plus className="h-5 w-5" />
                    <span className="text-[10px] font-bold">{t('sticker_add_short')}</span>
                  </button>
                  {mine.map((sticker) => (
                    <div key={sticker.id} className="group relative aspect-square">
                      <button
                        type="button"
                        onClick={() => setPreview({ kind: 'library', sticker })}
                        className="flex h-full w-full items-center justify-center rounded-xl p-1 transition hover:bg-ink-100 active:scale-95 dark:hover:bg-ink-800"
                        aria-label={sticker.name}
                        title={sticker.name}
                      >
                        {sticker.url ? (
                          <img
                            src={sticker.url}
                            alt={sticker.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-ink-400" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(sticker)}
                        className="absolute -end-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100"
                        aria-label={t('sticker_delete_title')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!loading && !libraryError && mine.length === 0 && (
                <p className="mt-2 px-2 text-center text-[11px] leading-relaxed text-ink-400">
                  {t('sticker_library_empty_hint')}
                </p>
              )}

              {confirmDelete && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-rose-50 p-2 dark:bg-rose-950/40">
                  <p className="min-w-0 flex-1 text-xs font-semibold text-rose-700 dark:text-rose-200">
                    {t('sticker_delete_desc')}
                  </p>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                    {t('cancel')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void removeSticker(confirmDelete)}>
                    {t('delete')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            startUpload(event.target.files?.[0] ?? null)
            event.target.value = ''
          }}
        />
      </div>

      <StickerCropModal
        open={Boolean(cropSrc)}
        src={cropSrc}
        defaultName={cropName}
        onCancel={() => {
          setCropSrc(null)
          if (cropUrlRef.current) {
            URL.revokeObjectURL(cropUrlRef.current)
            cropUrlRef.current = null
          }
        }}
        onSave={saveSticker}
      />

      {preview &&
        createPortal(
          <div
            className="fixed inset-0 z-[96] flex items-end justify-center bg-ink-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setPreview(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-sm rounded-t-3xl border border-ink-200 bg-white p-5 shadow-2xl animate-fade-up dark:border-ink-800 dark:bg-ink-900 sm:rounded-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">{t('sticker_preview_title')}</h2>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
                  aria-label={t('close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex min-h-[190px] items-center justify-center py-3">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={previewLabel}
                    className="h-44 w-44 object-contain drop-shadow-sm"
                    draggable={false}
                  />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-ink-400" />
                )}
              </div>
              <p className="mb-4 truncate text-center text-sm font-semibold text-ink-600 dark:text-ink-300">{previewLabel}</p>
              <div className="flex gap-2">
                <Button variant="outline" full onClick={() => setPreview(null)} disabled={sending}>
                  {t('cancel')}
                </Button>
                <Button full onClick={() => void send()} loading={sending || savingSticker} disabled={!previewUrl}>
                  {t('sticker_send')}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
