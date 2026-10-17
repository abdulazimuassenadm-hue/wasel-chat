import { supabase } from './supabase'
import { isNative } from './platform'
import { NATIVE_AUTH_SCHEME } from './authRedirect'

/**
 * يستنتج المسار المطلوب داخل التطبيق بعد العودة من رابط مصادقة.
 *
 * نوع العملية (type) يأتي من Supabase:
 * - recovery            : استعادة كلمة المرور → صفحة تعيين كلمة مرور جديدة
 * - signup / email_change / invite : تم تأكيد البريد (المستخدم أصبح مسجّلاً) → التطبيق
 * - بدون نوع (Google OAuth)        : التطبيق
 */
function resolveRouteFromType(type: string | null): string {
  if (type === 'recovery') return '/reset-password'
  return '/app/chats'
}

/** هل الرابط يخصّ تطبيقنا؟ (مخطط wasel أو المخطط الافتراضي لـCapacitor) */
export function isAppAuthUrl(rawUrl: string): boolean {
  return rawUrl.startsWith(`${NATIVE_AUTH_SCHEME}://`) || rawUrl.startsWith('https://localhost')
}

/**
 * يستقبل رابط العودة من رابط مصادقة (تأكيد بريد / استعادة كلمة مرور / Google)
 * ويُنشئ الجلسة ثم ينقل المستخدم إلى المسار المناسب.
 *
 * يدعم تدفّقي المصادقة:
 * - implicit (الافتراضي في supabase-js v2): التوكنات في الـhash
 * - pkce (إن فُعِّل مستقبلاً): رمز code في الـquery
 *
 * @returns true إذا نجح إنشاء الجلسة
 */
export async function handleAuthCallbackUrl(rawUrl: string): Promise<boolean> {
  if (!rawUrl) return false

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }

  const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash)

  // أخطاء يعيدها Supabase داخل الرابط
  const errorDescription =
    hashParams.get('error_description') ?? parsed.searchParams.get('error_description')
  if (errorDescription) return false

  const type = hashParams.get('type') ?? parsed.searchParams.get('type')
  const code = parsed.searchParams.get('code')
  const accessToken = hashParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token')

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) return false
    } else if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error) return false
    } else {
      return false
    }
  } catch {
    return false
  }

  // إغلاق المتصفح الداخلي إن كان مفتوحاً (Google OAuth)
  if (isNative) {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.close()
    } catch {
      /* المتصفح لم يكن مفتوحاً */
    }
  }

  // الانتقال عبر HashRouter دون الحاجة إلى سياق React
  const route = resolveRouteFromType(type)
  if (window.location.hash !== `#${route}`) {
    window.location.hash = `#${route}`
  }

  return true
}

/**
 * يسجّل مستمعات الروابط العميقة.
 * يعمل فقط داخل التطبيق الأصلي، ولا يفعل شيئاً في المتصفح.
 *
 * يُستدعى مرة واحدة عند بدء التطبيق (src/main.tsx).
 */
export async function initDeepLinks(): Promise<void> {
  if (!isNative) return

  try {
    const { App } = await import('@capacitor/app')

    // رابط وصل والتطبيق مفتوح أو في الخلفية
    await App.addListener('appUrlOpen', (event) => {
      if (isAppAuthUrl(event.url)) void handleAuthCallbackUrl(event.url)
    })

    // رابط فتح التطبيق من البداية (cold start)
    const launch = await App.getLaunchUrl()
    if (launch?.url && isAppAuthUrl(launch.url)) void handleAuthCallbackUrl(launch.url)
  } catch {
    /* بيئة غير أصلية أو الحزمة غير متاحة */
  }
}
