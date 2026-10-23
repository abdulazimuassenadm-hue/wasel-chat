import { isSupabaseConfigured, supabase } from './supabase'

/**
 * إعدادات WebRTC الآمنة.
 *
 * لا تُوضع بيانات TURN السرية في متغيرات VITE_* لأن Vite يحقنها داخل ملفات
 * JavaScript المنشورة. بدلاً من ذلك يطلب التطبيق بيانات دخول TURN مؤقتة من
 * Edge Function اسمها turn-credentials، وتُخزَّن أسرار TURN في بيئة Supabase فقط.
 *
 * عند غياب الدالة أو إعدادها يبقى STUN العام فعالاً، وتظهر للمستخدم ملاحظة
 * صادقة بأن بعض الشبكات قد لا تسمح بالمكالمة.
 */

export interface IceConfig {
  iceServers: RTCIceServer[]
  turn: boolean
}

interface LoadedIceConfig extends IceConfig {
  ttl: number
}

const STUN_URLS = (import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const TURN_TIMEOUT_MS = 4500
const FAILURE_BACKOFF_MS = 60 * 1000

let cached: { config: IceConfig; expiresAt: number } | null = null
let inflight: Promise<IceConfig> | null = null
let retryAfter = 0
let loggedFailure = false

function stunOnly(): IceConfig {
  return {
    iceServers: STUN_URLS.length ? [{ urls: STUN_URLS }] : [],
    turn: false,
  }
}

interface TurnResponse {
  urls?: string | string[]
  username?: string
  credential?: string
  ttl?: number
  iceServers?: { urls?: string | string[]; username?: string; credential?: string }
}

function normalizeUrls(value: TurnResponse['urls']): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

async function requestTurnCredentials(): Promise<LoadedIceConfig | null> {
  if (!isSupabaseConfigured) return null

  const call = supabase.functions.invoke<TurnResponse>('turn-credentials', { body: {} })
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), TURN_TIMEOUT_MS))
  const result = await Promise.race([call, timeout])
  if (!result) return null
  if (result.error) throw result.error

  const body = result.data
  if (!body) return null
  const nested = body.iceServers
  const urls = normalizeUrls(body.urls ?? nested?.urls)
  if (!urls.length) return null

  const username = body.username ?? nested?.username
  const credential = body.credential ?? nested?.credential
  const ttl = Math.min(86400, Math.max(60, Number(body.ttl) || 3600))

  const config: LoadedIceConfig = {
    iceServers: [
      ...stunOnly().iceServers,
      { urls, username, credential },
    ],
    turn: true,
    ttl,
  }
  return config
}

/**
 * يُحمّل إعدادات ICE مع تخزين مؤقت حتى انتهاء صلاحية بيانات TURN.
 * يعيد STUN فقط عند تعذّر الوصول إلى الدالة أو عدم إعداد الخادم.
 */
export async function loadIceConfig(force = false): Promise<IceConfig> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.config
  if (!force && Date.now() < retryAfter) return stunOnly()
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const loaded = await requestTurnCredentials()
      if (!loaded) {
        retryAfter = Date.now() + FAILURE_BACKOFF_MS
        const config = stunOnly()
        cached = { config, expiresAt: Date.now() + FAILURE_BACKOFF_MS }
        return config
      }

      const withTtl = loaded
      const ttlMs = Math.max(60, (withTtl.ttl ?? 3600) - 60) * 1000
      const { ttl: _ttl, ...config } = withTtl
      void _ttl
      cached = { config, expiresAt: Date.now() + ttlMs }
      retryAfter = 0
      loggedFailure = false
      return config
    } catch (error) {
      retryAfter = Date.now() + FAILURE_BACKOFF_MS
      if (import.meta.env.DEV && !loggedFailure) {
        loggedFailure = true
        console.info('[wasel] TURN credentials are not available; calls will use STUN only.', error)
      }
      const config = stunOnly()
      cached = { config, expiresAt: retryAfter }
      return config
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** يُستخدم عند بدء المكالمة لإنشاء RTCPeerConnection */
export async function getIceServers(): Promise<RTCIceServer[]> {
  return (await loadIceConfig()).iceServers
}

/** هل توجد بيانات TURN صالحة؟ تُفحص مرة عند تسجيل الدخول. */
export async function probeTurn(): Promise<boolean> {
  return (await loadIceConfig()).turn
}

/** بعد تسجيل الخروج/الدخول بحساب آخر */
export function resetIceConfig(): void {
  cached = null
  retryAfter = 0
  inflight = null
  loggedFailure = false
}
