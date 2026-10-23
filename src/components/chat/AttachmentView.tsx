import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Info, Loader2, Pause, Play } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatBytes, formatDuration, cn, downloadFromUrl } from '@/lib/utils'
import type { Attachment } from '@/types'

export function ImageAttachment({
  attachment,
  onOpen,
  compact,
}: {
  attachment: Attachment
  onOpen: (url: string, name: string) => void
  compact?: boolean
}) {
  const { t } = useApp()
  return (
    <div className="group relative overflow-hidden rounded-2xl">
      {attachment.url ? (
        <button
          type="button"
          onClick={() => onOpen(attachment.url as string, attachment.file_name)}
          className="block max-w-full"
          aria-label={t('preview')}
        >
          <img
            src={attachment.url}
            alt={attachment.file_name}
            className={cn('max-h-80 w-full object-cover', compact ? 'max-w-[240px]' : 'max-w-[260px] sm:max-w-[320px]')}
            loading="lazy"
            draggable={false}
          />
        </button>
      ) : (
        <div className="flex h-40 w-56 items-center justify-center bg-ink-100 dark:bg-ink-800">
          <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
        </div>
      )}
      {typeof attachment.progress === 'number' && attachment.uploading && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
          <div className="h-full bg-brand-400 transition-all" style={{ width: `${attachment.progress}%` }} />
        </div>
      )}
      <span className="pointer-events-none absolute bottom-1.5 start-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
        {t('preview')}
      </span>
    </div>
  )
}

export function VideoAttachment({ attachment }: { attachment: Attachment }) {
  if (!attachment.url) {
    return (
      <div className="flex h-40 w-64 items-center justify-center rounded-2xl bg-ink-100 dark:bg-ink-800">
        <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
      </div>
    )
  }
  return (
    <video
      src={attachment.url}
      controls
      playsInline
      preload="metadata"
      className="max-h-80 w-full max-w-[320px] rounded-2xl bg-black"
    />
  )
}

export function AudioAttachment({ attachment, own }: { attachment: Attachment; own: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [current, setCurrent] = useState(0)
  const duration =
    attachment.duration_seconds ??
    (audioRef.current?.duration && Number.isFinite(audioRef.current.duration) ? audioRef.current.duration : 0)

  useEffect(() => {
    const element = audioRef.current
    if (!element) return
    const onTime = () => {
      setCurrent(element.currentTime)
      const total = element.duration && Number.isFinite(element.duration) ? element.duration : duration
      setProgress(total ? (element.currentTime / total) * 100 : 0)
    }
    const onEnd = () => {
      setPlaying(false)
      setProgress(0)
      setCurrent(0)
    }
    element.addEventListener('timeupdate', onTime)
    element.addEventListener('ended', onEnd)
    return () => {
      element.removeEventListener('timeupdate', onTime)
      element.removeEventListener('ended', onEnd)
    }
  }, [duration])

  const toggle = () => {
    const element = audioRef.current
    if (!element) return
    if (playing) {
      element.pause()
      setPlaying(false)
    } else {
      void element.play()
      setPlaying(true)
    }
  }

  return (
    <div className="flex min-w-[200px] items-center gap-3">
      <audio ref={audioRef} src={attachment.url ?? undefined} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        disabled={!attachment.url}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition',
          own ? 'bg-white/25 text-white' : 'bg-brand-600 text-white',
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-0.5 rtl:-translate-x-0.5" />}
      </button>
      <div className="flex-1">
        <div className={cn('h-1.5 w-full overflow-hidden rounded-full', own ? 'bg-white/30' : 'bg-ink-200 dark:bg-ink-700')}>
          <div
            className={cn('h-full rounded-full transition-all', own ? 'bg-white' : 'bg-brand-500')}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={cn('mt-1 flex justify-between text-[10px] font-semibold', own ? 'text-white/80' : 'text-ink-500 dark:text-ink-400')}>
          <span>{formatDuration(current)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
    </div>
  )
}

export function FileAttachment({ attachment, own }: { attachment: Attachment; own: boolean }) {
  const { t, lang } = useApp()
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const extension = attachment.file_name.split('.').pop()?.toUpperCase() ?? 'FILE'

  const download = async () => {
    if (!attachment.url) return
    setDownloading(true)
    try {
      await downloadFromUrl(attachment.url, attachment.file_name)
    } finally {
      setDownloading(false)
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'flex min-w-[210px] max-w-full items-center gap-3 rounded-2xl p-3 text-start transition',
          own
            ? 'bg-white/15 hover:bg-white/25'
            : 'bg-ink-100 hover:bg-ink-200/70 dark:bg-ink-800 dark:hover:bg-ink-700',
        )}
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            own ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
          )}
        >
          <FileText className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-semibold',
              own ? 'text-white' : 'text-ink-800 dark:text-ink-100',
            )}
          >
            {attachment.file_name}
          </span>
          <span className={cn('block text-[11px]', own ? 'text-white/80' : 'text-ink-500 dark:text-ink-400')}>
            {extension} · {formatBytes(attachment.size_bytes, lang)}
          </span>
        </span>
        <Info
          className={cn('h-4 w-4 shrink-0', own ? 'text-white/80' : 'text-ink-400')}
          aria-label={t('file_preview')}
        />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('file_preview')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            {attachment.url && (
              <Button
                variant="outline"
                onClick={() => window.open(attachment.url as string, '_blank', 'noopener,noreferrer')}
              >
                {t('file_open')}
              </Button>
            )}
            {attachment.url && (
              <Button onClick={() => void download()} loading={downloading} icon={<Download className="h-4 w-4" />}>
                {t('download')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
            <FileText className="h-8 w-8" />
          </span>
          <p className="mt-1 break-all text-sm font-bold text-ink-800 dark:text-ink-100">{attachment.file_name}</p>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {extension} · {formatBytes(attachment.size_bytes, lang)}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-400">{t('file_download_hint')}</p>
        </div>
      </Modal>
    </>
  )
}
