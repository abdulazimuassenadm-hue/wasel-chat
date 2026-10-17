import type { CapacitorConfig } from '@capacitor/cli'

/**
 * إعداد Capacitor 8 لتطبيق «واصل شات».
 *
 * ملاحظات مهمة:
 * - webDir = "dist" لأن Vite يُخرج البناء النهائي إلى dist/ (انظر vite.config.ts).
 * - androidScheme = "https" لضمان «سياق آمن» (Secure Context) داخل الـWebView،
 *   وهو مطلوب لعمل crypto و WebRTC و clipboard وبعض واجهات المتصفح.
 * - HashRouter و base: './' في Vite يجعلان التطبيق يعمل داخل الـWebView بلا أي تعديل.
 * - الروابط العميقة (Deep Links) تعتمد على المخطط المخصّص "wasel" المُعرَّف في
 *   src/lib/authRedirect.ts، ويجب تسجيله لاحقاً في AndroidManifest.xml
 *   عند إنشاء مجلد android/ (يتطلب بيئة بناء جاهزة).
 */
const config: CapacitorConfig = {
  appId: 'com.wasel.chat',
  appName: 'Wasel Chat',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // لا نسمح بمحتوى مختلط (HTTP) داخل التطبيق الأصلي
    allowMixedContent: false,
  },
}

export default config
