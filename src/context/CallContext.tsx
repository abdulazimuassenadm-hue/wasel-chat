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
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getIceServers, hasTurnServer, isSupabaseConfigured, supabase } from '@/lib/supabase'
import * as api from '@/lib/api'
import { createRingtone, type Ringtone } from '@/lib/ringtone'
import { errorKey } from '@/lib/utils'
import { useApp } from './AppContext'
import { useAuth } from './AuthContext'
import { useToast } from './ToastContext'
import type { CallMode, CallStatus, PublicProfile } from '@/types'

export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'active' | 'ended' | 'failed'

export interface ActiveCall {
  id: string
  conversationId: string | null
  partner: PublicProfile
  mode: CallMode
  direction: 'incoming' | 'outgoing'
  phase: CallPhase
  startedAt: number
  answeredAt: number | null
  endedAt: number | null
  durationSeconds: number
  iceState: string
  errorKey?: string
}

interface CallContextValue {
  call: ActiveCall | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  micEnabled: boolean
  cameraEnabled: boolean
  turnConfigured: boolean
  supported: boolean
  startCall: (input: {
    partner: PublicProfile
    mode: CallMode
    conversationId?: string | null
  }) => Promise<void>
  acceptCall: () => Promise<void>
  declineCall: () => Promise<void>
  endCall: (reason?: 'ended' | 'declined' | 'missed' | 'failed') => Promise<void>
  toggleMic: () => void
  toggleCamera: () => void
  dismissCall: () => void
}

const CallContext = createContext<CallContextValue | null>(null)

const RING_TIMEOUT_MS = 45000

export function CallProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const { t } = useApp()
  const toast = useToast()

  const [call, setCall] = useState<ActiveCall | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(true)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const callRef = useRef<ActiveCall | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const offerRetryRef = useRef<number | null>(null)
  const ringTimerRef = useRef<number | null>(null)
  const ringtoneRef = useRef<Ringtone | null>(null)
  const durationTimerRef = useRef<number | null>(null)
  const incomingCallIdsRef = useRef<Set<string>>(new Set())

  const supported =
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    callRef.current = call
  }, [call])

  const stopRingtone = useCallback(() => {
    ringtoneRef.current?.stop()
    ringtoneRef.current = null
  }, [])

  const playRingtone = useCallback((pattern: 'incoming' | 'outgoing') => {
    stopRingtone()
    const ringtone = createRingtone(pattern)
    ringtoneRef.current = ringtone
    ringtone.start()
  }, [stopRingtone])

  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    pendingCandidatesRef.current = []
    if (pcRef.current) {
      pcRef.current.onicecandidate = null
      pcRef.current.ontrack = null
      pcRef.current.onconnectionstatechange = null
      pcRef.current.close()
      pcRef.current = null
    }
    if (offerRetryRef.current) {
      window.clearInterval(offerRetryRef.current)
      offerRetryRef.current = null
    }
    if (ringTimerRef.current) {
      window.clearTimeout(ringTimerRef.current)
      ringTimerRef.current = null
    }
    if (durationTimerRef.current) {
      window.clearInterval(durationTimerRef.current)
      durationTimerRef.current = null
    }
    stopRingtone()
  }, [stopRingtone])

  const closeChannel = useCallback(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  const finishCall = useCallback(
    async (nextStatus: CallStatus) => {
      const current = callRef.current
      const endedAt = Date.now()
      cleanupMedia()
      closeChannel()

      if (current) {
        const duration = current.answeredAt
          ? Math.max(0, Math.round((endedAt - current.answeredAt) / 1000))
          : 0
        setCall({
          ...current,
          phase: nextStatus === 'failed' ? 'failed' : 'ended',
          endedAt,
          durationSeconds: duration,
        })
        try {
          await api.updateCall(current.id, {
            status: nextStatus,
            ended_at: new Date(endedAt).toISOString(),
            duration_seconds: duration,
          })
        } catch {
          /* تسجيل المكالمة ليس حرجاً */
        }
      }
    },
    [cleanupMedia, closeChannel],
  )

  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) window.clearInterval(durationTimerRef.current)
    durationTimerRef.current = window.setInterval(() => {
      setCall((prev) => {
        if (!prev?.answeredAt) return prev
        return { ...prev, durationSeconds: Math.round((Date.now() - prev.answeredAt) / 1000) }
      })
    }, 1000)
  }, [])

  const createPeerConnection = useCallback(
    async (callId: string) => {
      const pc = new RTCPeerConnection({ iceServers: getIceServers(), iceCandidatePoolSize: 4 })
      pcRef.current = pc

      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          void channelRef.current.send({
            type: 'broadcast',
            event: 'ice',
            payload: { from: user?.id, candidate: event.candidate.toJSON() },
          })
        }
      }

      pc.ontrack = (event) => {
        const [stream] = event.streams
        if (stream) setRemoteStream(stream)
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        setCall((prev) => (prev ? { ...prev, iceState: state } : prev))
        if (state === 'connected') {
          setCall((prev) =>
            prev && (prev.phase === 'connecting' || prev.phase === 'outgoing' || prev.phase === 'incoming')
              ? { ...prev, phase: 'active', answeredAt: prev.answeredAt ?? Date.now(), iceState: state }
              : prev ? { ...prev, iceState: state } : prev,
          )
        }
        if (state === 'failed') {
          void finishCall('failed')
        }
      }

      pc.oniceconnectionstatechange = () => {
        setCall((prev) => (prev ? { ...prev, iceState: pc.iceConnectionState } : prev))
      }

      const stream = localStreamRef.current
      if (stream) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream)
      }

      return pc
    },
    [user, finishCall],
  )

  const ensureLocalStream = useCallback(
    async (mode: CallMode) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: mode === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      })
      localStreamRef.current = stream
      setLocalStream(stream)
      setMicEnabled(true)
      setCameraEnabled(mode === 'video')
      return stream
    },
    [],
  )

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    const queued = pendingCandidatesRef.current
    pendingCandidatesRef.current = []
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate)
      } catch {
        /* تجاهل مرشحاً غير صالح */
      }
    }
  }, [])

  const sendOffer = useCallback(async () => {
    const pc = pcRef.current
    const channel = channelRef.current
    if (!pc || !channel) return
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
    await pc.setLocalDescription(offer)
    void channel.send({
      type: 'broadcast',
      event: 'offer',
      payload: { from: user?.id, sdp: pc.localDescription?.toJSON() },
    })
  }, [user])

  const subscribeToSignaling = useCallback(
    (callId: string, mode: CallMode, isCaller: boolean, partner: PublicProfile) => {
      closeChannel()
      const channel = supabase.channel(`call:${callId}`, { config: { broadcast: { self: false } } })
      channelRef.current = channel

      channel
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          const pc = pcRef.current
          if (!pc || isCaller) return
          try {
            const data = payload as { sdp: RTCSessionDescriptionInit }
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
            await flushCandidates()
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            void channel.send({
              type: 'broadcast',
              event: 'answer',
              payload: { from: user?.id, sdp: pc.localDescription?.toJSON() },
            })
            setCall((prev) => (prev ? { ...prev, phase: 'connecting' } : prev))
          } catch (error) {
            if (import.meta.env.DEV) console.warn('[wasel] offer handling failed', error)
            void finishCall('failed')
          }
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          const pc = pcRef.current
          if (!pc || !isCaller) return
          try {
            const data = payload as { sdp: RTCSessionDescriptionInit }
            if (pc.signalingState === 'stable') return
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
            await flushCandidates()
            if (offerRetryRef.current) {
              window.clearInterval(offerRetryRef.current)
              offerRetryRef.current = null
            }
            setCall((prev) => (prev ? { ...prev, phase: 'connecting' } : prev))
          } catch (error) {
            if (import.meta.env.DEV) console.warn('[wasel] answer handling failed', error)
          }
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          const pc = pcRef.current
          const data = payload as { candidate: RTCIceCandidateInit; from?: string }
          if (!pc || !data?.candidate || data.from === user?.id) return
          if (!pc.remoteDescription) {
            pendingCandidatesRef.current.push(data.candidate)
            return
          }
          try {
            await pc.addIceCandidate(data.candidate)
          } catch {
            /* تجاهل */
          }
        })
        .on('broadcast', { event: 'ready' }, async ({ payload }) => {
          const data = payload as { from?: string }
          if (!isCaller || data.from === user?.id) return
          // الطرف الآخر جاهز للاستقبال — أعِد إرسال العرض
          await sendOffer()
        })
        .on('broadcast', { event: 'hangup' }, ({ payload }) => {
          const data = payload as { from?: string; reason?: string }
          if (data.from === user?.id) return
          const status: CallStatus = data.reason === 'declined' ? 'declined' : 'ended'
          void finishCall(status)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && !isCaller) {
            void channel.send({ type: 'broadcast', event: 'ready', payload: { from: user?.id } })
          }
        })

      // رنين المكالمة الصادرة + إعادة إرسال العرض حتى يصل الرد
      if (isCaller) {
        playRingtone('outgoing')
        offerRetryRef.current = window.setInterval(() => {
          const pc = pcRef.current
          if (!pc) return
          if (pc.remoteDescription) {
            if (offerRetryRef.current) {
              window.clearInterval(offerRetryRef.current)
              offerRetryRef.current = null
            }
            return
          }
          void sendOffer()
        }, 2500)
        ringTimerRef.current = window.setTimeout(() => {
          const pc = pcRef.current
          if (pc && !pc.remoteDescription) {
            void finishCall('missed')
            toast.warning(t('no_answer'))
          }
        }, RING_TIMEOUT_MS)
      }

      void partner
      void mode
    },
    [closeChannel, flushCandidates, sendOffer, user, finishCall, playRingtone, toast, t],
  )

  // --------------------------------------------------------------------------
  // الاتصال الصادر
  // --------------------------------------------------------------------------
  const startCall = useCallback(
    async ({
      partner,
      mode,
      conversationId = null,
    }: {
      partner: PublicProfile
      mode: CallMode
      conversationId?: string | null
    }) => {
      if (!user) return
      if (!supported) {
        toast.error(t('call_not_supported'))
        return
      }
      if (callRef.current) {
        toast.warning(t('in_call'))
        return
      }

      try {
        const stream = await ensureLocalStream(mode)
        void stream
      } catch (error) {
        toast.error(t('call_denied_permission'))
        if (import.meta.env.DEV) console.warn('[wasel] getUserMedia', error)
        return
      }

      try {
        const record = await api.createCall({
          callerId: user.id,
          calleeId: partner.id,
          type: mode,
          conversationId,
        })

        const nextCall: ActiveCall = {
          id: record.id,
          conversationId,
          partner,
          mode,
          direction: 'outgoing',
          phase: 'outgoing',
          startedAt: Date.now(),
          answeredAt: null,
          endedAt: null,
          durationSeconds: 0,
          iceState: 'new',
        }
        callRef.current = nextCall
        setCall(nextCall)

        await createPeerConnection(record.id)
        subscribeToSignaling(record.id, mode, true, partner)
      } catch (error) {
        cleanupMedia()
        toast.error(t(errorKey(error)))
      }
    },
    [user, supported, ensureLocalStream, createPeerConnection, subscribeToSignaling, cleanupMedia, toast, t],
  )

  // --------------------------------------------------------------------------
  // استقبال المكالمات (Realtime على جدول calls)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return

    const channel = supabase
      .channel('wasel-calls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${user.id}` },
        async (payload) => {
          const record = payload.new as { id: string; caller_id: string; type: CallMode; conversation_id: string | null; status: string }
          if (!record?.id || record.status !== 'ringing') return
          if (callRef.current) {
            // مشغول — نرفض تلقائياً
            await api.updateCall(record.id, { status: 'declined', ended_at: new Date().toISOString() })
            return
          }
          const partner = await api.fetchUserProfile(record.caller_id)
          if (!partner) return
          incomingCallIdsRef.current.add(record.id)
          const nextCall: ActiveCall = {
            id: record.id,
            conversationId: record.conversation_id,
            partner,
            mode: record.type,
            direction: 'incoming',
            phase: 'incoming',
            startedAt: Date.now(),
            answeredAt: null,
            endedAt: null,
            durationSeconds: 0,
            iceState: 'new',
          }
          callRef.current = nextCall
          setCall(nextCall)
          playRingtone('incoming')
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls' },
        (payload) => {
          const record = payload.new as { id: string; status: CallStatus }
          const current = callRef.current
          if (!current || current.id !== record.id) return
          if (record.status === 'declined') {
            toast.info(t('declined_call'))
            void finishCall('declined')
          } else if (record.status === 'ended' && current.phase === 'incoming') {
            void finishCall('ended')
          } else if (record.status === 'missed') {
            void finishCall('missed')
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, playRingtone, finishCall, toast, t])

  // --------------------------------------------------------------------------
  // قبول المكالمة
  // --------------------------------------------------------------------------
  const acceptCall = useCallback(async () => {
    const current = callRef.current
    if (!current || current.direction !== 'incoming') return
    if (!supported) {
      toast.error(t('call_not_supported'))
      return
    }
    stopRingtone()
    try {
      await ensureLocalStream(current.mode)
      await createPeerConnection(current.id)
      await api.updateCall(current.id, {
        status: 'answered',
        answered_at: new Date().toISOString(),
      })
      setCall((prev) => (prev ? { ...prev, phase: 'connecting', answeredAt: Date.now() } : prev))
      subscribeToSignaling(current.id, current.mode, false, current.partner)
      startDurationTimer()
    } catch (error) {
      toast.error(t('call_denied_permission'))
      if (import.meta.env.DEV) console.warn('[wasel] accept', error)
      await finishCall('failed')
    }
  }, [supported, ensureLocalStream, createPeerConnection, subscribeToSignaling, startDurationTimer, finishCall, stopRingtone, toast, t])

  const declineCall = useCallback(async () => {
    const current = callRef.current
    if (!current) return
    stopRingtone()
    if (current.direction === 'incoming') {
      try {
        await api.updateCall(current.id, { status: 'declined', ended_at: new Date().toISOString() })
      } catch {
        /* ignore */
      }
    }
    channelRef.current?.send({ type: 'broadcast', event: 'hangup', payload: { from: user?.id, reason: 'declined' } })
    await finishCall(current.direction === 'incoming' ? 'declined' : 'ended')
  }, [user, finishCall, stopRingtone])

  const endCall = useCallback(
    async (reason: 'ended' | 'declined' | 'missed' | 'failed' = 'ended') => {
      const current = callRef.current
      if (!current) return
      channelRef.current?.send({ type: 'broadcast', event: 'hangup', payload: { from: user?.id, reason } })
      const status: CallStatus = current.answeredAt ? 'ended' : reason === 'declined' ? 'declined' : reason
      await finishCall(status)
    },
    [user, finishCall],
  )

  const dismissCall = useCallback(() => {
    cleanupMedia()
    closeChannel()
    callRef.current = null
    setCall(null)
  }, [cleanupMedia, closeChannel])

  // تنظيف عند خروج المستخدم
  useEffect(() => {
    return () => {
      cleanupMedia()
      closeChannel()
    }
  }, [cleanupMedia, closeChannel])

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const enabled = !micEnabled
    stream.getAudioTracks().forEach((track) => (track.enabled = enabled))
    setMicEnabled(enabled)
  }, [micEnabled])

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const enabled = !cameraEnabled
    stream.getVideoTracks().forEach((track) => (track.enabled = enabled))
    setCameraEnabled(enabled)
  }, [cameraEnabled])

  const value = useMemo<CallContextValue>(
    () => ({
      call,
      localStream,
      remoteStream,
      micEnabled,
      cameraEnabled,
      turnConfigured: hasTurnServer,
      supported,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMic,
      toggleCamera,
      dismissCall,
    }),
    [
      call,
      localStream,
      remoteStream,
      micEnabled,
      cameraEnabled,
      supported,
      startCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMic,
      toggleCamera,
      dismissCall,
    ],
  )

  void profile

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used inside CallProvider')
  return ctx
}
