/**
 * التقاط حدث تثبيت تطبيق الويب (PWA) مبكراً.
 *
 * السبب: حدث `beforeinstallprompt` يُطلَق مرة واحدة فقط، وغالباً **قبل** أن
 * يُرسم React شاشة التثبيت. لذلك نسجّل المستمع على مستوى الوحدة (عند أول
 * import) ونحتفظ بالحدث إلى أن يضغط المستخدم زر «تثبيت التطبيق».
 *
 * ملاحظات مهمة:
 * - لا يوجد هنا أي مؤقّت (setTimeout) ولا إعادة محاولة ولا إعادة توجيه،
 *   لذلك لا يمكن أن يسبّب تأخيراً أو حلقة لانهائية.
 * - كل الدوال آمنة عند غياب واجهات المتصفح (تعيد قيماً افتراضية).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let appInstalled = false

const listeners = new Set<() => void>()

/** إبلاغ كل المشتركين بتغيّر حالة التثبيت (بلا أي استثناءات تتسرّب) */
function notify(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      /* خطأ في مشترك لا يجب أن يمنع البقية */
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // نمنع الشريط التلقائي للمتصفح لنعرض رسالتنا الخاصة بدلاً منه
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    appInstalled = true
    notify()
  })
}

/** هل المتصفح جاهز لعرض نافذة التثبيت الأصلية؟ */
export function canInstall(): boolean {
  return deferredPrompt !== null
}

/** هل اكتمل التثبيت في هذه الجلسة؟ */
export function wasInstalled(): boolean {
  return appInstalled
}

/**
 * مفتاح نصي يمثّل حالة التثبيت — يُستخدم مع `useSyncExternalStore`.
 * (الخارج يجب أن يكون قيمة ثابتة القياس، فالنص مناسب تماماً.)
 */
export function installStateKey(): string {
  return `${deferredPrompt ? 1 : 0}${appInstalled ? 1 : 0}`
}

/** الاشتراك في تغيّرات حالة التثبيت — يعيد دالة إلغاء الاشتراك */
export function subscribeInstall(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/**
 * عرض نافذة التثبيت الأصلية.
 * يعيد اختيار المستخدم، أو 'unavailable' إذا لم تكن النافذة متاحة.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt
  if (!event) return 'unavailable'

  // نستهلك الحدث فوراً: المتصفح يسمح باستخدام واحد فقط لكل حدث
  deferredPrompt = null
  notify()

  try {
    await event.prompt()
    const choice = await event.userChoice
    return choice.outcome
  } catch {
    return 'unavailable'
  }
}

/** هل التطبيق مفتوح حالياً كنسخة مُثبَّتة (standalone)؟ */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'] as const
    for (const mode of modes) {
      if (window.matchMedia(`(display-mode: ${mode})`).matches) return true
    }
  } catch {
    /* matchMedia غير مدعوم — نتجاهل */
  }

  // iOS لا يدعم matchMedia للتثبيت ويعتمد على navigator.standalone
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return legacy === true
}

/** هل النظام iOS/iPadOS؟ (لتخصيص نص الإرشاد) */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPadOS 13+ يعرّف نفسه كـ Mac مع دعم اللمس
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}
