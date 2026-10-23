/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_STUN_URL?: string
  readonly VITE_VAPID_PUBLIC_KEY?: string
  /** رابط تحميل تطبيق Android (متجر Play) — اختياري، يُظهر زر «تحميل التطبيق» */
  readonly VITE_ANDROID_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
