import { isNative } from './platform'

/**
 * رابط إعادة التوجيه المخصّص للتطبيق الأصلي (Android).
 *
 * يجب تسجيل هذا المخطط (wasel) في:
 * - AndroidManifest.xml داخل intent-filter عند بناء تطبيق Android
 * - Supabase → Authentication → URL Configuration → Redirect URLs
 */
export const NATIVE_AUTH_CALLBACK = 'wasel://auth-callback'

/** المخطط (scheme) المخصّص — يُستخدم للتحقق عند استقبال الروابط العميقة */
export const NATIVE_AUTH_SCHEME = 'wasel'

/**
 * الرابط الأساسي للتطبيق في المتصفح، بلا `#` إطلاقاً.
 *
 * سبب عدم إضافة مسار داخلي مثل `#/login`:
 * Supabase يُلحق رموز الجلسة بجزء `#`، فلو أرسلنا `...#/login` لصار الرابط
 * العائد `...#/login#access_token=...` وهو شكل لا يفهمه محلّل supabase-js
 * (راجع src/lib/authCallback.ts). إرسال الرابط الأساسي فقط يجعل الصيغة قياسية:
 * `...#access_token=...` أو `...?code=...`، ثم يتولّى مُعالجنا توجيه المستخدم.
 *
 * مثال: https://abdulazimuassenadm-hue.github.io/wasel-chat/
 */
export function authRedirectUrl(): string {
  if (isNative) return NATIVE_AUTH_CALLBACK
  const { origin, pathname } = window.location
  let path = pathname
  // لو كان الرابط ينتهي باسم ملف (index.html) نُبقي المجلد فقط
  if (path.endsWith('.html')) path = path.slice(0, path.lastIndexOf('/') + 1)
  if (!path.endsWith('/')) path = `${path}/`
  return `${origin}${path}`
}
