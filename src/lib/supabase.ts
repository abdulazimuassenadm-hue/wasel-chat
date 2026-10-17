import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isNative } from './platform'

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

/**
 * هل تم إعداد Supabase؟ إن لم يتم، نعرض شاشة إعداد واضحة بدلاً من أخطاء غامضة.
 * لا تُستخدم أبداً مفاتيح service_role في الواجهة الأمامية.
 */
export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes('xxxxxxxxxxxxxxxx') && url.startsWith('http'),
)

const fallbackUrl = 'https://placeholder.supabase.co'
const fallbackKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder.placeholder-signature-not-a-real-key'

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url : fallbackUrl,
  isSupabaseConfigured ? anonKey : fallbackKey,
  {
    auth: {
      persistSession: isSupabaseConfigured,
      autoRefreshToken: isSupabaseConfigured,
      // الويب: يبقى true كما كان (روابط البريد تُحلَّل تلقائياً).
      // الأصلي: false لأن الروابط العميقة تُعالَج في src/lib/deepLinks.ts
      detectSessionInUrl: isSupabaseConfigured && !isNative,
      storageKey: 'wasel.auth',
    },
    realtime: {
      params: { eventsPerSecond: 20 },
    },
    global: {
      headers: { 'x-application-name': 'wasel-chat' },
    },
  },
)

export const SUPABASE_URL = isSupabaseConfigured ? url : ''
export const SUPABASE_ANON_KEY = isSupabaseConfigured ? anonKey : ''

/** الحاويات المستخدمة في التخزين */
export const BUCKETS = {
  avatars: 'avatars',
  groupAvatars: 'group-avatars',
  chatMedia: 'chat-media',
  statusMedia: 'status-media',
} as const

/** حدود الرفع (بالميجابايت) */
export const UPLOAD_LIMITS = {
  avatar: 5,
  chatMedia: 25,
  statusMedia: 25,
}

/** أنواع الملفات المسموح بها */
export const ALLOWED_MIME: Record<string, string[]> = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/mp4'],
  file: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
  ],
}

export function isAllowedFile(mime: string, sizeBytes: number): { ok: boolean; reason?: string } {
  if (sizeBytes > UPLOAD_LIMITS.chatMedia * 1024 * 1024) {
    return { ok: false, reason: `FILE_TOO_LARGE:${UPLOAD_LIMITS.chatMedia}` }
  }
  const all = [...ALLOWED_MIME.image, ...ALLOWED_MIME.video, ...ALLOWED_MIME.audio, ...ALLOWED_MIME.file]
  if (!all.includes(mime)) {
    return { ok: false, reason: 'FILE_TYPE_NOT_ALLOWED' }
  }
  return { ok: true }
}

export function mediaKindFromMime(mime: string): 'image' | 'video' | 'audio' | 'file' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

/** إعدادات WebRTC (STUN/TURN) */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = []
  const stun = import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302'
  if (stun) servers.push({ urls: stun.split(',').map((s) => s.trim()).filter(Boolean) })

  const turnUrl = import.meta.env.VITE_TURN_URL
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(',').map((s) => s.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    })
  }
  return servers
}

export const hasTurnServer = Boolean(import.meta.env.VITE_TURN_URL)

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
