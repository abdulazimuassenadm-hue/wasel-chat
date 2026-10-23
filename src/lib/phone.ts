// ============================================================================
// أدوات أرقام الهاتف — التطبيع والبحث
// ----------------------------------------------------------------------------
// التطبيق يستخدم السودان (+249) كرمز افتراضي، لكنه يقبل أي رمز دولة:
// - يخزّن الرقم بصيغة أرقام فقط مع رمز الدولة (مثال: 249912345678).
// - يزيل المسافات والشرطات والأقواس والأصفار المحلية عند البحث.
// ============================================================================

import type { Lang } from '@/types'

export const DEFAULT_COUNTRY_CODE = '249'

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** يحوّل الأرقام العربية/الفارسية إلى لاتينية ويحتفظ بالأرقام فقط */
export function digitsOnly(value: string | null | undefined): string {
  if (!value) return ''
  let out = ''
  for (const char of value) {
    const arIndex = AR_DIGITS.indexOf(char)
    if (arIndex >= 0) {
      out += String(arIndex)
      continue
    }
    const faIndex = FA_DIGITS.indexOf(char)
    if (faIndex >= 0) {
      out += String(faIndex)
      continue
    }
    if (char >= '0' && char <= '9') out += char
  }
  return out
}

/**
 * تطبيع رقم هاتف إلى أرقام فقط مع رمز الدولة.
 * أمثلة (السودان):
 *   +249 91 234 5678 → 249912345678
 *   0912345678       → 249912345678
 *   912345678        → 249912345678
 *   00249912345678   → 249912345678
 */
export function normalizePhone(
  value: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string {
  let digits = digitsOnly(value)
  if (!digits) return ''
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith(countryCode) && digits.length >= countryCode.length + 7) return digits
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '')
  return `${countryCode}${digits}`
}

/**
 * هل النص رقم هاتف كامل قابل للبحث؟
 * نطلب 9 أرقام على الأقل حتى لا نرسل بحثاً جزئياً يستهلك طلبات بلا نتيجة.
 */
export function isPhoneLike(value: string): boolean {
  const clean = value.trim()
  if (!clean) return false
  const digits = digitsOnly(clean)
  if (digits.length < 9) return false
  // نسمح فقط بالأرقام ورموز الهاتف الشائعة حتى لا نحاول البحث بالرقم في نص عادي
  return /^[+\d\s\-().٠-٩۰-۹]+$/.test(clean)
}

/** عرض مقروء للرقم: +249 91 234 5678 */
export function formatPhone(value: string | null | undefined, lang: Lang = 'ar'): string {
  const normalized = normalizePhone(value)
  if (!normalized) return ''
  if (normalized.startsWith('249') && normalized.length === 12) {
    return `+249 ${normalized.slice(3, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8)}`
  }
  const grouped = normalized.replace(/(\d{3})(?=\d)/g, '$1 ')
  return `+${grouped}`.trim()
}

/** صيغة مختصرة للعرض داخل الحقول (بدون رمز الدولة عند كونه افتراضياً) */
export function localPhoneInput(value: string | null | undefined): string {
  const normalized = normalizePhone(value)
  if (!normalized) return ''
  if (normalized.startsWith(DEFAULT_COUNTRY_CODE) && normalized.length === 12) {
    return `+${normalized}`
  }
  return `+${normalized}`
}

/** هل الخطأ يعني أن دالة البحث بالرقم غير موجودة على الخادم؟ */
export function isMissingPhoneSearchRpc(error: unknown): boolean {
  if (!error) return false
  const candidate = error as { code?: string; message?: string; key?: string }
  const code = String(candidate.code ?? '')
  const message = String(candidate.message ?? '').toLowerCase()
  const key = String(candidate.key ?? '').toLowerCase()
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    message.includes('search_user_by_phone') ||
    key.includes('search_user_by_phone')
  )
}
