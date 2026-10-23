import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser, Loader2, Minus, Plus, RotateCcw } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import {
  encodeStickerCanvas,
  removeConnectedBackground,
  trimTransparentCanvas,
} from '@/lib/media'
import { UPLOAD_LIMITS } from '@/lib/supabase'

const VIEW = 260
const OUTPUT = 512
const CHECKERBOARD =
  'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)'

/**
 * أداة تجهيز صورة كملصق:
 * - تكبير/تصغير وسحب لتحديد الجزء الظاهر
 * - معاينة مباشرة للنتيجة
 * - إزالة خلفية محلية اختيارية للخلفيات البسيطة
 * - تصدير مربّع مضغوط (WebP/PNG) مع الحفاظ على الشفافية
 */
export function StickerCropModal({
  open,
  src,
  defaultName,
  onCancel,
  onSave,
}: {
  open: boolean
  src: string | null
  defaultName?: string
  onCancel: () => void
  onSave: (blob: Blob, name: string) => Promise<void> | void
}) {
  const { t } = useApp()
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [tolerance, setTolerance] = useState(38)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewUrl(null)
  }, [])

  useEffect(() => {
    if (!open) return
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setNatural({ w: 0, h: 0 })
    setName(defaultName ?? '')
    setFailed(false)
    setSaving(false)
    setRemoveBackground(false)
    setTolerance(38)
    revokePreview()
  }, [open, src, defaultName, revokePreview])

  useEffect(() => {
    if (open) return
    revokePreview()
  }, [open, revokePreview])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const baseScale = natural.w > 0 && natural.h > 0 ? Math.max(VIEW / natural.w, VIEW / natural.h) : 1
  const scale = baseScale * zoom
  const renderedW = natural.w * scale
  const renderedH = natural.h * scale

  const clampOffset = (zoomValue: number, x: number, y: number) => {
    const s = baseScale * zoomValue
    const maxX = Math.max(0, (natural.w * s - VIEW) / 2)
    const maxY = Math.max(0, (natural.h * s - VIEW) / 2)
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
  }

  const changeZoom = (value: number) => {
    const next = Math.min(3, Math.max(1, value))
    setZoom(next)
    setOffset((prev) => clampOffset(next, prev.x, prev.y))
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!natural.w) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setOffset(clampOffset(zoom, drag.ox + (event.clientX - drag.x), drag.oy + (event.clientY - drag.y)))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const getCropRect = useCallback(() => {
    if (!natural.w || !natural.h) return null
    const s = baseScale * zoom
    const sourceW = Math.min(natural.w, VIEW / s)
    const sourceH = Math.min(natural.h, VIEW / s)
    const imgLeft = (VIEW - renderedW) / 2 + offset.x
    const imgTop = (VIEW - renderedH) / 2 + offset.y
    let sourceX = (0 - imgLeft) / s
    let sourceY = (0 - imgTop) / s
    sourceX = Math.max(0, Math.min(natural.w - sourceW, sourceX))
    sourceY = Math.max(0, Math.min(natural.h - sourceH, sourceY))
    return { sourceX, sourceY, sourceW, sourceH }
  }, [baseScale, natural.h, natural.w, offset.x, offset.y, renderedH, renderedW, zoom])

  const drawCroppedCanvas = useCallback(
    (size: number): HTMLCanvasElement | null => {
      const image = imageRef.current
      const rect = getCropRect()
      if (!image || !rect) return null

      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('CANVAS_UNAVAILABLE')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.clearRect(0, 0, size, size)
      context.drawImage(
        image,
        rect.sourceX,
        rect.sourceY,
        rect.sourceW,
        rect.sourceH,
        0,
        0,
        size,
        size,
      )

      if (removeBackground) {
        removeConnectedBackground(canvas, tolerance)
        return trimTransparentCanvas(canvas, size, Math.max(6, Math.round(size * 0.04)))
      }
      return canvas
    },
    [getCropRect, removeBackground, tolerance],
  )

  // معاينة مصغّرة تتحدّث بعد توقف السحب/التكبير بمدة قصيرة.
  useEffect(() => {
    if (!open || !src || !natural.w || !natural.h) {
      revokePreview()
      return
    }
    let cancelled = false
    setPreviewBusy(true)
    const timer = window.setTimeout(() => {
      try {
        const canvas = drawCroppedCanvas(180)
        if (!canvas) {
          if (!cancelled) setPreviewBusy(false)
          return
        }
        canvas.toBlob((blob) => {
          if (cancelled) return
          if (!blob) {
            setPreviewBusy(false)
            return
          }
          const url = URL.createObjectURL(blob)
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
          previewUrlRef.current = url
          setPreviewUrl(url)
          setPreviewBusy(false)
        }, 'image/png')
      } catch {
        if (!cancelled) setPreviewBusy(false)
      }
    }, 140)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [drawCroppedCanvas, natural.h, natural.w, open, revokePreview, src])

  const save = async () => {
    if (!natural.w || !natural.h) return
    setSaving(true)
    setFailed(false)
    try {
      const canvas = drawCroppedCanvas(OUTPUT)
      if (!canvas) throw new Error('CANVAS_UNAVAILABLE')
      const blob = await encodeStickerCanvas(canvas, UPLOAD_LIMITS.sticker * 1024 * 1024)
      await onSave(blob, name)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onCancel()
      }}
      title={t('sticker_crop_title')}
      subtitle={t('sticker_crop_hint')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!natural.w}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          className="relative mx-auto touch-none overflow-hidden rounded-3xl bg-ink-100 ring-1 ring-ink-200 dark:bg-ink-800 dark:ring-ink-700"
          style={{ width: VIEW, height: VIEW, maxWidth: '100%' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="application"
          aria-label={t('sticker_crop_title')}
        >
          {src && (
            <img
              ref={imageRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(event) =>
                setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })
              }
              onError={() => setFailed(true)}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: natural.w ? renderedW : VIEW,
                height: natural.h ? renderedH : VIEW,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/50" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/30 to-transparent p-2 text-center text-[10px] font-semibold text-white">
            {t('sticker_crop_drag_hint')}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeZoom(zoom - 0.15)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-600 transition hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200"
            aria-label={t('sticker_zoom_out')}
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => changeZoom(Number(event.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-brand-600"
            aria-label={t('sticker_zoom')}
          />
          <button
            type="button"
            onClick={() => changeZoom(zoom + 0.15)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-600 transition hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200"
            aria-label={t('sticker_zoom_in')}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1)
              setOffset({ x: 0, y: 0 })
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-600 transition hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200"
            aria-label={t('sticker_reset')}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-ink-50 p-2.5 dark:bg-ink-800/60">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-700"
            style={{ backgroundImage: CHECKERBOARD, backgroundSize: '14px 14px', backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0px' }}
          >
            {previewUrl ? (
              <img src={previewUrl} alt={t('sticker_result_preview')} className="h-full w-full object-contain" draggable={false} />
            ) : previewBusy ? (
              <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink-700 dark:text-ink-200">{t('sticker_result_preview')}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
              {t('sticker_result_hint')}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-200 px-3 dark:border-ink-700">
          <Switch
            checked={removeBackground}
            onChange={(value) => setRemoveBackground(value)}
            label={t('sticker_remove_background')}
            hint={t('sticker_remove_background_hint')}
          />
          {removeBackground && (
            <div className="pb-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-ink-500 dark:text-ink-400">
                <Eraser className="h-3.5 w-3.5" />
                {t('sticker_background_tolerance')}
              </div>
              <input
                type="range"
                min={18}
                max={70}
                step={2}
                value={tolerance}
                onChange={(event) => setTolerance(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer accent-brand-600"
                aria-label={t('sticker_background_tolerance')}
              />
            </div>
          )}
        </div>

        <div>
          <label className="wasel-label" htmlFor="sticker-name">
            {t('sticker_name')}
          </label>
          <input
            id="sticker-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder={t('sticker_name_placeholder')}
            className="wasel-input"
          />
        </div>

        {failed && <p className="text-sm font-semibold text-rose-600">{t('sticker_saved_failed')}</p>}
      </div>
    </Modal>
  )
}
