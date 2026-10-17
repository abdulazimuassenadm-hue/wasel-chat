import { isNative } from './platform'

/**
 * رابط إعادة التوجيه المخصّص للتطبيق الأصلي.
 *
 * يجب تسجيل هذا المخطط (wasel) في:
 * - AndroidManifest.xml داخل intent-filter عند إنشاء مجلد android/
 * - Supabase → Authentication → URL Configuration → Redirect URLs
 */
export const NATIVE_AUTH_CALLBACK = 'wasel://auth-callback'

/** المخطط (scheme) المخصّص — يُستخدم للتحقق عند استقبال الروابط العميقة */
export const NATIVE_AUTH_SCHEME = 'wasel'

/**
 * يبني رابط إعادة التوجيه المناسب للبيئة الحالية.
 *
 * - **الويب**: نفس سلوك المشروع السابق حرفياً:
 *   `${origin}${pathname}#/route` (مثال: http://localhost:5173/#/login)
 * - **التطبيق الأصلي**: مخطط مخصّص يعيد فتح التطبيق:
 *   `wasel://auth-callback`
 *
 * ملاحظة: في الوضع الأصلي لا نحتاج تمرير المسار داخل الرابط، لأن الوجهة
 * تُستنتج من نوع العملية (type) عند العودة — راجع src/lib/deepLinks.ts.
 *
 * @param route مسار داخلي بصيغة HashRouter مثل "/login" أو "/reset-password"
 */
export function authRedirectUrl(route: string): string {
  if (isNative) return NATIVE_AUTH_CALLBACK
  const normalized = route.startsWith('/') ? route : `/${route}`
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#${normalized}`
}
