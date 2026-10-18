/**
 * إخفاء الاسم / اسم المستخدم — ميزة خصوصية تعمل على مستوى الحساب.
 *
 * الفكرة: اسم الشخص كما يراه الآخرون محفوظ في جدول `profiles_public`
 * (`display_name` و`username`). لا توجد سياسة خصوصية على الخادم تُخفي الاسم
 * تلقائياً حسب المستوى (everyone/contacts/nobody)، لذلك نُنفّذ الإخفاء بطريقة
 * صحيحة وملموسة: عند تشغيل الميزة نستبدل الاسم الظاهر باسم محايد («مستخدم واصل»)
 * ونحذف اسم المستخدم (@username)، فيختفي الاسم الحقيقي فعلاً عند كل الأجهزة
 * الأخرى — لا في هذا الجهاز فقط.
 *
 * ولأن العملية قابلة للعكس، نحفظ الاسم الأصلي **محلياً على هذا الجهاز** لكل حساب
 * على حدة (مفتاح لكل معرّف مستخدم) لاستعادته بنقرة واحدة.
 *
 * ملاحظة صريحة: إذا فُقد التخزين المحلي (تصفير بيانات المتصفح أو تغيير الجهاز)
 * فلن نعرف الاسم الأصلي، ويمكن للمستخدم كتابته من جديد من تبويب «الملف الشخصي».
 */

const PREFIX = 'wasel.namePrivacy.v1.'

export interface HiddenIdentity {
  /** الاسم الأصلي وقت الإخفاء */
  displayName: string
  /** اسم المستخدم (@handle) الأصلي، أو null إن لم يكن موجوداً */
  username: string | null
  /** وقت الإخفاء */
  hiddenAt: number
}

function key(userId: string): string {
  return `${PREFIX}${userId}`
}

/** هل الاسم مُخفى لهذا الحساب على هذا الجهاز؟ */
export function isNameHidden(userId: string | null | undefined): boolean {
  if (!userId) return false
  try {
    return window.localStorage.getItem(key(userId)) !== null
  } catch {
    return false
  }
}

/** الاسم الأصلي المحفوظ محلياً (لاستعادته) */
export function getHiddenIdentity(userId: string | null | undefined): HiddenIdentity | null {
  if (!userId) return null
  try {
    const raw = window.localStorage.getItem(key(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HiddenIdentity>
    return {
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      username: typeof parsed.username === 'string' ? parsed.username : null,
      hiddenAt: typeof parsed.hiddenAt === 'number' ? parsed.hiddenAt : Date.now(),
    }
  } catch {
    return null
  }
}

export function setHiddenIdentity(
  userId: string,
  identity: { displayName: string; username: string | null },
): void {
  try {
    const payload: HiddenIdentity = {
      displayName: identity.displayName,
      username: identity.username,
      hiddenAt: Date.now(),
    }
    window.localStorage.setItem(key(userId), JSON.stringify(payload))
  } catch {
    /* التخزين معطّل — نكمل الإخفاء، لكن الاستعادة ستتطلب كتابة الاسم يدوياً */
  }
}

export function clearHiddenIdentity(userId: string | null | undefined): void {
  if (!userId) return
  try {
    window.localStorage.removeItem(key(userId))
  } catch {
    /* تجاهل */
  }
}
