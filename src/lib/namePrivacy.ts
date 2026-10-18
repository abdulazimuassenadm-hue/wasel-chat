/**
 * إخفاء الاسم / اسم المستخدم — ميزة خصوصية تعمل على مستوى الحساب.
 *
 * الفكرة: اسم الشخص كما يراه الآخرون محفوظ في جدول `profiles_public`
 * (`display_name` و`username`). لا توجد سياسة خصوصية على الخادم تُخفي الاسم
 * تلقائياً حسب المستوى (everyone/contacts/nobody)، لذلك نُنفّذ الإخفاء بطريقة
 * صحيحة وملموسة:
 *   • إخفاء الاسم الظاهر  → نستبدله باسم محايد («مستخدم واصل»).
 *   • إخفاء اسم المستخدم  → نحذف @username من الملف العام.
 * فيختفي الاسم الحقيقي فعلاً عند كل الأجهزة الأخرى — لا في هذا الجهاز فقط.
 *
 * ولأن العملية قابلة للعكس، نحفظ القيم الأصلية **محلياً على هذا الجهاز** لكل
 * حساب على حدة (مفتاح لكل معرّف مستخدم) لاستعادتها بنقرة واحدة.
 *
 * ملاحظة صريحة: إذا فُقد التخزين المحلي (تصفير بيانات المتصفح أو تغيير الجهاز)
 * فلن نعرف الاسم الأصلي، ويمكن للمستخدم كتابته من جديد من تبويب «الملف الشخصي».
 */

const PREFIX = 'wasel.namePrivacy.v1.'

export interface HiddenIdentity {
  /** هل الاسم الظاهر مُخفى حالياً؟ */
  nameHidden: boolean
  /** الاسم الظاهر الأصلي وقت الإخفاء */
  nameOriginal: string
  /** هل اسم المستخدم (@) مُخفى حالياً؟ */
  usernameHidden: boolean
  /** اسم المستخدم الأصلي وقت الإخفاء (قد يكون null) */
  usernameOriginal: string | null
}

const EMPTY: HiddenIdentity = {
  nameHidden: false,
  nameOriginal: '',
  usernameHidden: false,
  usernameOriginal: null,
}

function key(userId: string): string {
  return `${PREFIX}${userId}`
}

/** يقرأ سجل الإخفاء المحلي لهذا الحساب (أو null إن لم يوجد شيء) */
export function getHiddenIdentity(userId: string | null | undefined): HiddenIdentity | null {
  if (!userId) return null
  try {
    const raw = window.localStorage.getItem(key(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HiddenIdentity>
    return {
      nameHidden: parsed.nameHidden === true,
      nameOriginal: typeof parsed.nameOriginal === 'string' ? parsed.nameOriginal : '',
      usernameHidden: parsed.usernameHidden === true,
      usernameOriginal: typeof parsed.usernameOriginal === 'string' ? parsed.usernameOriginal : null,
    }
  } catch {
    return null
  }
}

function write(userId: string, value: HiddenIdentity): void {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(value))
  } catch {
    /* التخزين معطّل — نكمل الإخفاء، لكن الاستعادة ستتطلب كتابة الاسم يدوياً */
  }
}

/** هل الاسم الظاهر مُخفى لهذا الحساب على هذا الجهاز؟ */
export function isNameHidden(userId: string | null | undefined): boolean {
  return getHiddenIdentity(userId)?.nameHidden === true
}

/** هل اسم المستخدم (@) مُخفى لهذا الحساب على هذا الجهاز؟ */
export function isUsernameHidden(userId: string | null | undefined): boolean {
  return getHiddenIdentity(userId)?.usernameHidden === true
}

/** يحفظ الاسم الظاهر الأصلي ثم يعلّمه كمُخفى */
export function markNameHidden(userId: string, original: string): void {
  const current = getHiddenIdentity(userId) ?? EMPTY
  write(userId, {
    ...current,
    nameHidden: true,
    nameOriginal: current.nameHidden && current.nameOriginal ? current.nameOriginal : original,
  })
}

/** يحفظ اسم المستخدم الأصلي ثم يعلّمه كمُخفى */
export function markUsernameHidden(userId: string, original: string | null): void {
  const current = getHiddenIdentity(userId) ?? EMPTY
  write(userId, {
    ...current,
    usernameHidden: true,
    usernameOriginal: current.usernameHidden ? current.usernameOriginal : original,
  })
}

export function unmarkNameHidden(userId: string): void {
  const current = getHiddenIdentity(userId)
  if (!current) return
  write(userId, { ...current, nameHidden: false })
}

export function unmarkUsernameHidden(userId: string): void {
  const current = getHiddenIdentity(userId)
  if (!current) return
  write(userId, { ...current, usernameHidden: false })
}

export function clearHiddenIdentity(userId: string | null | undefined): void {
  if (!userId) return
  try {
    window.localStorage.removeItem(key(userId))
  } catch {
    /* تجاهل */
  }
}
