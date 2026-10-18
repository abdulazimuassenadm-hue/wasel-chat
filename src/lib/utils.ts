import type { Lang } from '@/types'

/** دمج أصناف CSS */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** حروف الاسم الأولى (للأفاتار البديل) */
export function initials(name?: string | null): string {
  const value = (name || '').trim()
  if (!value) return '؟'
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  '#148d7f',
  '#1fb09c',
  '#0e7490',
  '#4f46e5',
  '#7c3aed',
  '#db2777',
  '#e11d48',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0d9488',
  '#2563eb',
]

/** لون ثابت مشتق من المعرّف */
export function colorFromId(id?: string | null): string {
  if (!id) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function formatBytes(bytes?: number | null, lang: Lang = 'ar'): string {
  if (!bytes || bytes <= 0) return lang === 'ar' ? '0 بايت' : '0 B'
  const units = lang === 'ar' ? ['بايت', 'ك.ب', 'م.ب', 'ج.ب'] : ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const localeOf = (lang: Lang) => (lang === 'ar' ? 'ar-EG' : 'en-US')

export function formatTime(iso: string | Date, lang: Lang = 'ar'): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

export function formatChatDate(iso: string, lang: Lang = 'ar'): string {
  const date = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (isSameDay(date, now)) return lang === 'ar' ? 'اليوم' : 'Today'
  if (isSameDay(date, yesterday)) return lang === 'ar' ? 'أمس' : 'Yesterday'

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays < 7) {
    return date.toLocaleDateString(localeOf(lang), { weekday: 'long' })
  }
  return date.toLocaleDateString(localeOf(lang), {
    day: '2-digit',
    month: '2-digit',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined, lang: Lang = 'ar'): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${formatChatDate(iso, lang)} ${formatTime(date, lang)}`
}

/** وقت نسبي: قبل 5 دقائق */
export function timeAgo(iso: string | null | undefined, lang: Lang = 'ar'): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  const ar = lang === 'ar'

  if (seconds < 60) return ar ? 'الآن' : 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return ar ? `قبل ${minutes} دقيقة` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return ar ? `قبل ${hours} ساعة` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return ar ? `قبل ${days} يوم` : `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return ar ? `قبل ${months} شهر` : `${months}mo ago`
  const years = Math.floor(months / 12)
  return ar ? `قبل ${years} سنة` : `${years}y ago`
}

/** آخر ظهور بصيغة مفهومة */
export function formatLastSeen(iso: string | null | undefined, lang: Lang = 'ar'): string {
  if (!iso) return lang === 'ar' ? 'غير متاح' : 'Unavailable'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return lang === 'ar' ? 'متصل الآن' : 'online now'
  return lang === 'ar' ? `آخر ظهور ${timeAgo(iso, lang)}` : `last seen ${timeAgo(iso, lang)}`
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,24}$/.test(username.trim())
}

/** تنظيف اسم الملف من المحارف غير الآمنة */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'file'
  return base.replace(/[^\w.\-\u0600-\u06FF\s]/g, '_').slice(0, 120)
}

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  if (idx < 0 || idx === name.length - 1) return ''
  return name.slice(idx + 1).toLowerCase()
}

export function isImageMime(mime?: string | null): boolean {
  return Boolean(mime && mime.startsWith('image/'))
}
export function isVideoMime(mime?: string | null): boolean {
  return Boolean(mime && mime.startsWith('video/'))
}
export function isAudioMime(mime?: string | null): boolean {
  return Boolean(mime && mime.startsWith('audio/'))
}

/** تنسيق مضغوط لعرض الوقت في قائمة المحادثات */
export function formatListTime(iso: string, lang: Lang = 'ar'): string {
  const date = new Date(iso)
  const now = new Date()
  if (isSameDay(date, now)) return formatTime(date, lang)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) return lang === 'ar' ? 'أمس' : 'Yesterday'
  return date.toLocaleDateString(localeOf(lang), { day: '2-digit', month: '2-digit' })
}

export function truncate(text: string, max = 60): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/** مسجّل أخطاء موحّد (لا يكشف بيانات حساسة) */
export function logError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(`[wasel:${context}]`, error)
  }
}

/** ترجمة أكواد أخطاء Supabase إلى مفاتيح رسائل */
export function errorKey(error: unknown): string {
  const raw = error as { message?: string; error_description?: string; status?: number } | null
  const message = (raw?.message || raw?.error_description || '').toLowerCase()

  if (!message) return 'generic_error'
  if (message.includes('provider is not enabled') || message.includes('unsupported provider'))
    return 'auth_provider_not_enabled'
  if (message.includes('invalid login credentials')) return 'login_error'
  if (message.includes('email not confirmed')) return 'email_not_confirmed'
  if (message.includes('user already registered') || message.includes('already been registered'))
    return 'signup_error'
  if (message.includes('rate limit') || raw?.status === 429) return 'too_many_attempts'
  if (message.includes('password should be at least')) return 'password_too_short'
  if (message.includes('unable to validate email') || message.includes('invalid email')) return 'invalid_email'
  if (message.includes('row-level security') || message.includes('permission denied')) return 'permission_denied'
  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network'))
    return 'network_error'
  if (message.includes('file too large') || message.includes('exceeded the maximum allowed size'))
    return 'file_too_large'
  if (message.includes('mime type') || message.includes('not allowed')) return 'file_type_not_allowed'
  return 'generic_error'
}

/** هل الرسالة فاشلة أو معلّقة؟ */
export function groupByDay<T extends { created_at: string }>(items: T[]): Array<{ label: string; date: string; items: T[] }> {
  const groups: Array<{ label: string; date: string; items: T[] }> = []
  for (const item of items) {
    const date = new Date(item.created_at)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const last = groups[groups.length - 1]
    if (last && last.date === key) {
      last.items.push(item)
    } else {
      groups.push({ label: key, date: key, items: [item] })
    }
  }
  return groups
}

export function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false)
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return Promise.resolve(ok)
  } catch {
    return Promise.resolve(false)
  }
}

export function isSystemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}
