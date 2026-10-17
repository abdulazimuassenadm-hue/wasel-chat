import { useEffect, useRef, useState } from 'react'
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
  AlertTriangle,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useCall } from '@/context/CallContext'
import { Avatar } from '@/components/ui/Avatar'
import { cn, formatDuration } from '@/lib/utils'

export function CallOverlay() {
  const { t } = useApp()
  const {
    call,
    localStream,
    remoteStream,
    micEnabled,
    cameraEnabled,
    turnConfigured,
    supported,
    acceptCall,
    declineCall,
    endCall,
    toggleMic,
    toggleCamera,
    dismissCall,
  } = useCall()

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const [elapsed, setElapsed] = useState(0)

  // ربط المسارات بعناصر الفيديو/الصوت
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream, call?.phase])

  useEffect(() => {
    const element = call?.mode === 'video' ? remoteVideoRef.current : remoteAudioRef.current
    if (element && remoteStream) {
      element.srcObject = remoteStream
      void element.play?.().catch(() => undefined)
    }
  }, [remoteStream, call?.mode, call?.phase])

  // عدّاد مدة المكالمة
  useEffect(() => {
    if (!call || !call.answeredAt) {
      setElapsed(0)
      return
    }
    const update = () => setElapsed(Math.max(0, Math.round((Date.now() - (call.answeredAt as number)) / 1000)))
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [call])

  if (!call) return null

  const { phase, partner, mode, direction, iceState } = call
  const isVideo = mode === 'video'
  const active = phase === 'active' || phase === 'connecting'
  const showEnded = phase === 'ended' || phase === 'failed'

  const statusText = (() => {
    if (phase === 'incoming') return isVideo ? t('video_call_short') : t('audio_call')
    if (phase === 'outgoing') return t('calling')
    if (phase === 'connecting') return t('connecting')
    if (phase === 'active') return formatDuration(elapsed)
    if (phase === 'failed') return t('call_failed')
    return call.answeredAt ? t('call_ended_duration', { t: formatDuration(call.durationSeconds) }) : t('call_ended')
  })()

  const poorConnection = active && (iceState === 'failed' || iceState === 'disconnected')

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-ink-950 text-white">
      {/* الفيديو البعيد */}
      {isVideo && (
        <video
          ref={remoteVideoRef}
          playsInline
          autoPlay
          className={cn('absolute inset-0 h-full w-full bg-black object-cover', !remoteStream && 'opacity-0')}
        />
      )}

      {/* المعاينة المحلية */}
      {isVideo && (phase === 'active' || phase === 'connecting') && (
        <video
          ref={localVideoRef}
          playsInline
          autoPlay
          muted
          className="absolute end-4 top-4 z-20 h-40 w-28 rounded-2xl border border-white/20 bg-black object-cover shadow-lg sm:h-48 sm:w-36"
        />
      )}

      {/* خلفية متدرجة في المكالمات الصوتية */}
      {!isVideo && <div className="absolute inset-0 bg-gradient-to-b from-ink-900 to-ink-950" />}

      <audio ref={remoteAudioRef} autoPlay />

      {/* المحتوى */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        {!isVideo && (
          <div className="animate-pulse-ring">
            <Avatar
              src={partner.avatar_url}
              name={partner.display_name}
              id={partner.id}
              size="2xl"
              className="ring-4 ring-white/10"
            />
          </div>
        )}

        <div>
          <h2 className="text-2xl font-bold">{partner.display_name}</h2>
          <p className={cn('mt-1 text-sm', poorConnection ? 'text-rose-300' : 'text-white/70')}>{statusText}</p>
        </div>

        {phase === 'outgoing' && (
          <p className="text-xs text-white/50">{isVideo ? t('video_call') : t('audio_call')}</p>
        )}

        {active && iceState && iceState !== 'connected' && iceState !== 'completed' && (
          <p className="text-xs text-white/50">{t('ice_state', { s: iceState })}</p>
        )}

        {poorConnection && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('call_quality_poor')}
          </span>
        )}

        {!turnConfigured && active && (
          <p className="max-w-sm text-[11px] text-amber-200/80">{t('turn_required_hint')}</p>
        )}

        {!supported && <p className="max-w-sm text-xs text-rose-200">{t('call_not_supported')}</p>}

        {phase === 'failed' && <p className="max-w-sm text-xs text-rose-200">{t('call_failed_hint')}</p>}

        {isVideo && !remoteStream && active && (
          <p className="text-xs text-white/50">{t('connecting')}</p>
        )}
      </div>

      {/* الأزرار */}
      <div className="relative z-10 flex items-center justify-center gap-4 pb-10 safe-bottom">
        {phase === 'incoming' ? (
          <>
            <CallButton label={t('decline')} variant="danger" onClick={() => void declineCall()}>
              <PhoneOff className="h-6 w-6" />
            </CallButton>
            <CallButton label={t('accept')} variant="success" onClick={() => void acceptCall()}>
              <Phone className="h-6 w-6" />
            </CallButton>
          </>
        ) : showEnded ? (
          <button
            type="button"
            onClick={dismissCall}
            className="rounded-2xl bg-white/10 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            {t('close')}
          </button>
        ) : (
          <>
            <CallButton
              label={micEnabled ? t('mute_mic') : t('unmute_mic')}
              variant={micEnabled ? 'neutral' : 'active'}
              onClick={toggleMic}
            >
              {micEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
            </CallButton>

            {isVideo && (
              <CallButton
                label={cameraEnabled ? t('camera_off') : t('camera_on')}
                variant={cameraEnabled ? 'neutral' : 'active'}
                onClick={toggleCamera}
              >
                {cameraEnabled ? <VideoIcon className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
              </CallButton>
            )}

            <CallButton label={t('end_call')} variant="danger" onClick={() => void endCall('ended')}>
              <PhoneOff className="h-6 w-6" />
            </CallButton>
          </>
        )}
      </div>

      {direction === 'incoming' && phase === 'incoming' && (
        <p className="relative z-10 pb-4 text-center text-xs text-white/50">{t('incoming_call')}</p>
      )}
    </div>
  )
}

function CallButton({
  label,
  variant,
  onClick,
  children,
}: {
  label: string
  variant: 'neutral' | 'danger' | 'success' | 'active'
  onClick: () => void
  children: React.ReactNode
}) {
  const variants = {
    neutral: 'bg-white/15 hover:bg-white/25 text-white',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    active: 'bg-white text-ink-900 hover:bg-white/90',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition active:scale-95',
        variants[variant],
      )}
    >
      {children}
    </button>
  )
}
