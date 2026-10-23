import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

const VIEW = 260
const OUTPUT = 512

/**
 * أداة بسيطة لتجهيز صورة كملصق:
 * - تكبير/تصغير
 * - سحب لتحديد الجزء الظاهر
 * - تصدير مربّع 512×512 بصيغة PNG
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

  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setNatural({ w: 0, h: 0 })
    setName(defaultName ?? '')
    setFailed(false)
    setSaving(false)
  }, [open, src, defaultName])

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

  const save = async () => {
    const image = imageRef.current
    if (!image || !natural.w || !natural.h) return
    setSaving(true)
    setFailed(false)
    try {
      const s = baseScale * zoom
      const sourceW = Math.min(natural.w, VIEW / s)
      const sourceH = Math.min(natural.h, VIEW / s)
      const imgLeft = (VIEW - renderedW) / 2 + offset.x
      const imgTop = (VIEW - renderedH) / 2 + offset.y
      let sourceX = (0 - imgLeft) / s
      let sourceY = (0 - imgTop) / s
      sourceX = Math.max(0, Math.min(natural.w - sourceW, sourceX))
      sourceY = Math.max(0, Math.min(natural.h - sourceH, sourceY))

      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      const context = canvas.getContext('2d')
      if (!context) throw new Error('CANVAS_UNAVAILABLE')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.clearRect(0, 0, OUTPUT, OUTPUT)
      context.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, OUTPUT, OUTPUT)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95))
      if (!blob) throw new Error('EXPORT_FAILED')
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
      onClose={onCancel}
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
