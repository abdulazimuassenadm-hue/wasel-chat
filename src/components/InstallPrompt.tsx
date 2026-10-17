import { useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { isNative } from '@/lib/platform'
import { installStateKey, isIOS, isStandalone, promptInstall, subscribeInstall } from '@/lib/pwa'

/**
 * شريط «تثبيت التطبيق» يظهر **فوراً** أثناء فتح الموقع.
 *
 * - يظهر مباشرة عند أول رسم (بلا أي مؤقّت أو انتظار) فلا يوجد تأخير.
 * - لا يعيد التوجيه ولا يعيد التحميل إطلاقاً ⇒ لا توجد حلقة لانهائية.
 * - قابل للإغلاق دائماً، ولا يُزعج المستخدم مرة أخرى قبل مرور 24 ساعة.
 * - لا يظهر داخل التطبيق الأصلي (Capacitor) ولا في المسارات الداخلية
 *   (حتى لا يغطّي شريط التنقل السفلي).
 */

const DISMISS_KEY = 'wasel.install.dismissedAt'
const REMIND_AFTER_MS = 24 * 60 * 60 * 1000

/** رابط تحميل التطبيق — يُضبط اختيارياً بعد نشره على Google Play */
const DOWNLOAD_URL = (import.meta.env.VITE_ANDROID_APP_URL || '').trim()

/** هل أغلق المستخدم الرسالة حديثاً؟ */
function isDismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const at = Number(raw)
    return Number.isFinite(at) && Date.now() - at < REMIND_AFTER_MS
  } catch {
    return false
  }
}

export function InstallPrompt() {
  const { t, dir } = useApp()
  const location = useLocation()

  // حالة التثبيت تُقرأ من وحدة pwa (تستقبل الحدث حتى لو وقع قبل الرسم)
  const stateKey = useSyncExternalStore(subscribeInstall, installStateKey)

  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedRecently())

  const canPrompt = stateKey.charAt(0) === '1'
  const justInstalled = stateKey.charAt(1) === '1'

  const insideApp =
    location.pathname.startsWith('/app') || location.pathname.startsWith('/admin')

  // شروط الإخفاء — كلها فورية بلا أي انتظار
  if (isNative || insideApp || justInstalled || dismissed) return null
  if (isStandalone()) return null

  const close = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* التخزين قد يكون معطّلاً — نتجاهل */
    }
  }

  const handleInstall = () => {
    void promptInstall().then((outcome) => {
      // إذا استُهلكت النافذة (قبول/رفض) نُغلق الشريط. إن كانت غير متاحة نُبقيه بالإرشاد.
      if (outcome !== 'unavailable') close()
    })
  }

  const hint = isIOS() ? t('install_ios_hint') : t('install_manual_hint')

  return (
    <div
      dir={dir}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div
        role="region"
        aria-label={t('install_title')}
        className="pointer-events-auto w-full max-w-md rounded-3xl border border-ink-200 bg-white/95 p-4 shadow-soft backdrop-blur dark:border-ink-800 dark:bg-ink-900/95"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Download className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-ink-900 dark:text-ink-50">{t('install_title')}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
              {canPrompt ? t('install_desc') : hint}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canPrompt && (
                <button
                  type="button"
                  onClick={handleInstall}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-brand-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
                >
                  <Download className="h-4 w-4" />
                  {t('install_button')}
                </button>
              )}

              {DOWNLOAD_URL && (
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-ink-200 px-4 py-2 text-xs font-bold text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <Download className="h-4 w-4" />
                  {t('install_download')}
                </a>
              )}

              <button
                type="button"
                onClick={close}
                className="rounded-2xl px-3 py-2 text-xs font-semibold text-ink-500 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              >
                {t('install_later')}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label={t('close')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
