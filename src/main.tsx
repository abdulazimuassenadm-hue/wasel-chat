import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App'
import { initDeepLinks } from '@/lib/deepLinks'
import { ToastProvider } from '@/context/ToastContext'
import { AppProvider } from '@/context/AppContext'
import { AuthProvider } from '@/context/AuthContext'
import { LockProvider } from '@/context/LockContext'
import { ChatProvider } from '@/context/ChatContext'
import { CallProvider } from '@/context/CallContext'

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element #root not found')
}

// تهيئة الروابط العميقة (لا تفعل شيئاً في المتصفح — تعمل داخل تطبيق Android فقط)
void initDeepLinks()

/**
 * تسجيل Service Worker بسيط (بلا تخزين مؤقت إطلاقاً) — الغرض الوحيد هو جعل
 * تطبيق الويب «قابلاً للتثبيت» في Chrome/Android ليظهر زر «تثبيت التطبيق».
 *
 * - لا يعمل في وضع التطوير، ولا داخل التطبيق الأصلي (Capacitor).
 * - لا نُفشل التشغيل أبداً إن فشل التسجيل (ندخله في catch صامت).
 */
if (
  import.meta.env.PROD &&
  !Capacitor.isNativePlatform() &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator
) {
  try {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  } catch {
    /* لا شيء — الموقع يعمل بشكل طبيعي بدون Service Worker */
  }
}

createRoot(container).render(
  <StrictMode>
    {/* ترتيب المزوّدات مهم: الثيم/اللغة ← الإشعارات ← المصادقة ← القفل ← المحادثات ← المكالمات */}
    <AppProvider>
      <ToastProvider>
        <AuthProvider>
          <LockProvider>
            <ChatProvider>
              <CallProvider>
                <HashRouter>
                  <App />
                </HashRouter>
              </CallProvider>
            </ChatProvider>
          </LockProvider>
        </AuthProvider>
      </ToastProvider>
    </AppProvider>
  </StrictMode>,
)
