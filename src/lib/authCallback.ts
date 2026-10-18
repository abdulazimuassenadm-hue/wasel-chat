import { isSupabaseConfigured, supabase } from './supabase'

/**
 * معالجة روابط عودة المصادقة (تأكيد البريد / استعادة كلمة المرور / Google).
 *
 * المشكلة التي يحلّها هذا الملف:
 * Supabase يُلحق رموز الجلسة بجزء `#` من الرابط. وبما أن التطبيق يستخدم HashRouter
 * فإن رابط العودة يبدو هكذا:
 *     https://site/wasel-chat/#/login#access_token=...&refresh_token=...
 * ومحلّل supabase-js الافتراضي (`parseParametersFromURL`) يقرأ الـhash ككتلة واحدة
 * فيرى مفتاحاً اسمه `/login#access_token` بدل `access_token`، وبالتالي لا تُنشأ
 * الجلسة أبداً عند العودة من رابط التأكيد. هنا نحلّل الرابط يدوياً بشكله الصحيح
 * فتعمل روابط التأكيد والاستعادة مهما كان شكل الرابط.
 */

const NOTICE_KEY = 'wasel.auth.notice'

export interface AuthCallbackParams {
  accessToken: string | null
  refreshToken: string | null
  code: string | null
  type: string | null
  errorCode: string | null
  errorDescription: string | null
}

const EMPTY: AuthCallbackParams = {
  accessToken: null,
  refreshToken: null,
  code: null,
  type: null,
  errorCode: null,
  errorDescription: null,
}

/**
 * يستخرج معاملات المصادقة من الرابط مهماً كان شكلها:
 * - `?code=...` في الاستعلام
 * - `#access_token=...` في الـhash
 * - `#/login#access_token=...` (hash داخل hash — وهي حالتنا مع HashRouter)
 */
export function parseAuthParams(href: string): AuthCallbackParams {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { ...EMPTY }
  }

  const acc: Record<string, string> = {}
  const merge = (raw: string) => {
    const cleaned = raw.startsWith('#') || raw.startsWith('?') ? raw.slice(1) : raw
    if (!cleaned || cleaned.indexOf('=') === -1) return
    let params: URLSearchParams
    try {
      params = new URLSearchParams(cleaned)
    } catch {
      return
    }
    params.forEach((value, key) => {
      if (!(key in acc) || acc[key] === '') acc[key] = value
    })
  }

  merge(url.search)
  for (const segment of url.hash.split('#')) merge(segment)

  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = acc[key]
      if (value) return value
    }
    return null
  }

  return {
    accessToken: pick('access_token'),
    refreshToken: pick('refresh_token'),
    code: pick('code'),
    type: pick('type'),
    errorCode: pick('error_code', 'error'),
    errorDescription: pick('error_description'),
  }
}

/** هل الرابط الحالي يحمل عودة من رابط مصادقة؟ */
export function hasAuthCallbackInUrl(href: string): boolean {
  const p = parseAuthParams(href)
  return Boolean(p.accessToken || p.refreshToken || p.code || p.errorCode || p.errorDescription)
}

/** الوجهة بعد نجاح المصادقة: استعادة كلمة المرور ← صفحة التعيين، وإلا التطبيق */
function destinationFor(type: string | null): string {
  return type === 'recovery' ? '/reset-password' : '/app/chats'
}

function cleanUrlAndGo(route: string): void {
  const base = `${window.location.origin}${window.location.pathname}`
  try {
    window.history.replaceState(null, '', base)
  } catch {
    /* لا شيء — المتصفح رفض replaceState */
  }
  if (window.location.hash !== `#${route}`) window.location.hash = `#${route}`
}

export function storeAuthNotice(code: string): void {
  try {
    window.sessionStorage.setItem(NOTICE_KEY, code)
  } catch {
    /* لا شيء */
  }
}

/** يقرأ إشعار عودة فاشلة (رابط منتهي مثلاً) مرة واحدة فقط */
export function takeAuthNotice(): string | null {
  try {
    const value = window.sessionStorage.getItem(NOTICE_KEY)
    if (value) window.sessionStorage.removeItem(NOTICE_KEY)
    return value
  } catch {
    return null
  }
}

/** يترجم رمز خطأ العودة إلى مفتاح ترجمة يُعرض للمستخدم */
export function authNoticeKey(code: string): string {
  if (code === 'otp_expired') return 'auth_link_expired'
  if (code === 'callback_failed') return 'auth_callback_failed'
  return 'auth_link_invalid'
}

export interface AuthCallbackResult {
  handled: boolean
  ok: boolean
  route: string | null
  errorCode: string | null
}

/**
 * يعالج عودة رابط المصادقة: يُنشئ الجلسة ثم ينقل المستخدم إلى الوجهة الصحيحة.
 * يُستدعى مرة واحدة عند بدء التطبيق قبل رسم الواجهة (src/main.tsx).
 */
export async function consumeAuthCallback(): Promise<AuthCallbackResult> {
  const notHandled: AuthCallbackResult = { handled: false, ok: false, route: null, errorCode: null }
  if (typeof window === 'undefined') return notHandled
  if (!isSupabaseConfigured) return notHandled

  const params = parseAuthParams(window.location.href)
  const looksLikeCallback = Boolean(
    params.accessToken || params.refreshToken || params.code || params.errorCode || params.errorDescription,
  )
  if (!looksLikeCallback) return notHandled

  const route = destinationFor(params.type)

  // رابط منتهي/مرفوض — نُخبر المستخدم بالسبب الحقيقي بدل تجاهله
  if (params.errorCode || params.errorDescription) {
    storeAuthNotice(params.errorCode ?? 'access_denied')
    cleanUrlAndGo('/login')
    return { handled: true, ok: false, route, errorCode: params.errorCode ?? 'access_denied' }
  }

  try {
    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code)
      if (error) throw error
    } else if (params.accessToken && params.refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
      })
      if (error) throw error
    } else {
      storeAuthNotice('callback_failed')
      cleanUrlAndGo('/login')
      return { handled: true, ok: false, route, errorCode: 'callback_failed' }
    }
  } catch {
    storeAuthNotice('callback_failed')
    cleanUrlAndGo('/login')
    return { handled: true, ok: false, route, errorCode: 'callback_failed' }
  }

  cleanUrlAndGo(route)
  return { handled: true, ok: true, route, errorCode: null }
}
