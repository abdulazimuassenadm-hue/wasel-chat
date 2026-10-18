import type { Session } from '@supabase/supabase-js'

/**
 * تعدّد الحسابات — تخزين محلي للحسابات المحفوظة على هذا الجهاز.
 *
 * كيف يعمل:
 * - جلسة Supabase الحالية تُخزَّن في `localStorage` تحت مفتاح `wasel.auth` (سلوك المكتبة).
 * - هذا الملف يحفظ **نسخة لكل حساب** (رمز الوصول + رمز التجديد + بيانات العرض) تحت
 *   مفتاح `wasel.accounts.v1`، فيمكن التبديل بين الحسابات بنقرة واحدة دون إعادة
 *   كتابة كلمة المرور.
 *
 * ملاحظة أمنية صريحة:
 * - رمز التجديد (refresh token) يُخزَّن في `localStorage`، وهو **نفس ما تفعله مكتبة
 *   Supabase مع الجلسة الحالية** — فالتخزين المحلي ليس تراجعاً أمنياً جديداً، لكنه
 *   يعني أن أي شخص يملك وصولاً كاملاً إلى تخزين المتصفح/الجهاز يستطيع استخدام
 *   الجلسات المحفوظة. على الأجهزة المشتركة استخدم «تسجيل الخروج» لا «التبديل».
 * - لا نُخزّن كلمات المرور أبداً، ولا نُرسل هذه القائمة إلى أي خادم.
 * - «التبديل» يُبقي جلسة الحساب السابق صالحة، أما «تسجيل الخروج» فيحذفها.
 */

export interface SavedAccount {
  /** معرّف المستخدم في Supabase */
  id: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  accessToken: string
  refreshToken: string
  /** أول مرة أُضيف فيها الحساب */
  addedAt: number
  /** آخر مرة كان فيها الحساب نشِطاً */
  lastUsedAt: number
}

const STORAGE_KEY = 'wasel.accounts.v1'
const ACTIVE_KEY = 'wasel.accounts.active'
const ADDING_KEY = 'wasel.accounts.adding'

/** أكبر عدد حسابات محفوظة على الجهاز */
export const MAX_SAVED_ACCOUNTS = 5

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* التخزين معطّل (وضع خاص) — نتجاهل بهدوء */
  }
}

/** قائمة الحسابات المحفوظة، الأحدث استخداماً أولاً */
export function listAccounts(): SavedAccount[] {
  const raw = readRaw(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is SavedAccount => {
        if (!item || typeof item !== 'object') return false
        const account = item as Partial<SavedAccount>
        return typeof account.id === 'string' && typeof account.refreshToken === 'string'
      })
      .map((account) => ({
        id: account.id,
        email: account.email ?? null,
        displayName: account.displayName ?? null,
        avatarUrl: account.avatarUrl ?? null,
        accessToken: account.accessToken ?? '',
        refreshToken: account.refreshToken,
        addedAt: typeof account.addedAt === 'number' ? account.addedAt : Date.now(),
        lastUsedAt: typeof account.lastUsedAt === 'number' ? account.lastUsedAt : Date.now(),
      }))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  } catch {
    return []
  }
}

function write(list: SavedAccount[]): SavedAccount[] {
  const sorted = [...list].sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  writeRaw(STORAGE_KEY, JSON.stringify(sorted))
  return sorted
}

export function getAccount(id: string): SavedAccount | null {
  return listAccounts().find((account) => account.id === id) ?? null
}

/** هل الحساب محفوظ على هذا الجهاز؟ */
export function hasAccount(id: string): boolean {
  return getAccount(id) !== null
}

export function countAccounts(): number {
  return listAccounts().length
}

/**
 * يحفظ (أو يُحدّث) جلسة حساب في القائمة.
 * يُستدعى بعد كل تسجيل دخول وبعد كل تجديد رموز، لتبقى الرموز المحفوظة صالحة.
 */
export function rememberSession(
  session: Session,
  patch?: { displayName?: string | null; avatarUrl?: string | null },
): SavedAccount[] {
  const user = session.user
  if (!user || !session.refresh_token) return listAccounts()

  const list = listAccounts()
  const existing = list.find((account) => account.id === user.id)
  const metaName = (user.user_metadata?.display_name as string | undefined) ?? null
  const metaAvatar = (user.user_metadata?.avatar_url as string | undefined) ?? null

  const next: SavedAccount = {
    id: user.id,
    email: user.email ?? existing?.email ?? null,
    displayName: patch?.displayName ?? existing?.displayName ?? metaName,
    avatarUrl: patch?.avatarUrl ?? existing?.avatarUrl ?? metaAvatar,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    addedAt: existing?.addedAt ?? Date.now(),
    lastUsedAt: Date.now(),
  }

  const others = list.filter((account) => account.id !== user.id)
  // نحتفظ بالأحدث فقط عند تجاوز الحد الأعلى
  return write([next, ...others].slice(0, MAX_SAVED_ACCOUNTS))
}

/** يُحدّث بيانات العرض (الاسم/الصورة) دون لمس الرموز */
export function updateAccountProfile(
  id: string,
  patch: { displayName?: string | null; avatarUrl?: string | null },
): SavedAccount[] {
  const list = listAccounts()
  const index = list.findIndex((account) => account.id === id)
  if (index === -1) return list
  const current = list[index]
  const next = [...list]
  next[index] = {
    ...current,
    displayName: patch.displayName ?? current.displayName,
    avatarUrl: patch.avatarUrl ?? current.avatarUrl,
  }
  return write(next)
}

/** يحذف حساباً من القائمة (لا يُنهي جلسته على الخادم) */
export function forgetAccount(id: string): SavedAccount[] {
  const next = write(listAccounts().filter((account) => account.id !== id))
  if (getActiveAccountId() === id) setActiveAccountId(null)
  return next
}

export function clearAccounts(): void {
  writeRaw(STORAGE_KEY, null)
  writeRaw(ACTIVE_KEY, null)
}

export function getActiveAccountId(): string | null {
  return readRaw(ACTIVE_KEY)
}

export function setActiveAccountId(id: string | null): void {
  writeRaw(ACTIVE_KEY, id)
}

/** علامة تُوضع في sessionStorage عند «إضافة حساب» ليعرضها نموذج الدخول */
export function markAddingAccount(): void {
  try {
    window.sessionStorage.setItem(ADDING_KEY, '1')
  } catch {
    /* تجاهل */
  }
}

/** يقرأ علامة «إضافة حساب» ويحذفها (تُعرض مرة واحدة) */
export function takeAddingAccount(): boolean {
  try {
    const value = window.sessionStorage.getItem(ADDING_KEY)
    if (value) window.sessionStorage.removeItem(ADDING_KEY)
    return value === '1'
  } catch {
    return false
  }
}

export function clearAddingAccount(): void {
  try {
    window.sessionStorage.removeItem(ADDING_KEY)
  } catch {
    /* تجاهل */
  }
}

const NOTICE_KEY = 'wasel.accounts.notice'

/**
 * رسالة تُعرض بعد إعادة تحميل الصفحة (لأن التبديل يُعيد التحميل، فلا يكفي
 * إظهار إشعار قبلها). تُقرأ مرة واحدة ثم تُحذف.
 */
export function setAccountNotice(message: string): void {
  try {
    window.sessionStorage.setItem(NOTICE_KEY, message)
  } catch {
    /* تجاهل */
  }
}

export function takeAccountNotice(): string | null {
  try {
    const value = window.sessionStorage.getItem(NOTICE_KEY)
    if (value) window.sessionStorage.removeItem(NOTICE_KEY)
    return value
  } catch {
    return null
  }
}

/** الاسم المعروض للحساب المحفوظ */
export function accountLabel(account: SavedAccount): string {
  return account.displayName?.trim() || account.email || '—'
}
