// ============================================================================
// الملصقات الجاهزة — كتالوج محلي (SVG) لا يحتاج تخزيناً خارجياً
// ----------------------------------------------------------------------------
// الملصقات الجاهزة تُرسل كرسالة تحتوي على بيانات وصفية فقط:
//   { sticker: true, sticker_kind: 'builtin', sticker_id: 'wasel-love' }
// فيراها كل الأطراف من ملفات التطبيق نفسها. أما ملصقات المستخدم المرفوعة
// فتُنسخ إلى تخزين المحادثة (chat-media) عند الإرسال حتى تبقى متاحة للطرف الآخر.
// ============================================================================

export type StickerPackId = 'wasel' | 'moods'

export interface BuiltinSticker {
  id: string
  pack: StickerPackId
  labelAr: string
  labelEn: string
}

export interface StickerPack {
  id: StickerPackId
  titleAr: string
  titleEn: string
  icon: string
}

export const STICKER_PACKS: StickerPack[] = [
  { id: 'wasel', titleAr: 'ملصقات واصل', titleEn: 'Wasel stickers', icon: '💚' },
  { id: 'moods', titleAr: 'مشاعر', titleEn: 'Moods', icon: '✨' },
]

export const BUILTIN_STICKERS: BuiltinSticker[] = [
  { id: 'wasel-hi', pack: 'wasel', labelAr: 'مرحباً', labelEn: 'Hello' },
  { id: 'wasel-love', pack: 'wasel', labelAr: 'محبة', labelEn: 'Love' },
  { id: 'wasel-laugh', pack: 'wasel', labelAr: 'ضحك', labelEn: 'Laugh' },
  { id: 'wasel-wink', pack: 'wasel', labelAr: 'غمزة', labelEn: 'Wink' },
  { id: 'wasel-sad', pack: 'wasel', labelAr: 'حزين', labelEn: 'Sad' },
  { id: 'wasel-wow', pack: 'wasel', labelAr: 'مندهش', labelEn: 'Wow' },
  { id: 'wasel-sleep', pack: 'wasel', labelAr: 'نعسان', labelEn: 'Sleepy' },
  { id: 'wasel-thanks', pack: 'wasel', labelAr: 'شكراً', labelEn: 'Thanks' },
  { id: 'mood-angry', pack: 'moods', labelAr: 'غاضب', labelEn: 'Angry' },
  { id: 'mood-cool', pack: 'moods', labelAr: 'رائع', labelEn: 'Cool' },
  { id: 'mood-cry', pack: 'moods', labelAr: 'بكاء', labelEn: 'Crying' },
  { id: 'mood-think', pack: 'moods', labelAr: 'تفكير', labelEn: 'Thinking' },
  { id: 'mood-party', pack: 'moods', labelAr: 'احتفال', labelEn: 'Party' },
  { id: 'mood-kiss', pack: 'moods', labelAr: 'قبلة', labelEn: 'Kiss' },
  { id: 'mood-shy', pack: 'moods', labelAr: 'خجل', labelEn: 'Shy' },
  { id: 'mood-strong', pack: 'moods', labelAr: 'قوي', labelEn: 'Strong' },
]

export const BUILTIN_STICKER_IDS = new Set(BUILTIN_STICKERS.map((sticker) => sticker.id))

/** رابط ملف الملصق الجاهز مع احترام مسار النشر على GitHub Pages */
export function builtinStickerUrl(id: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}stickers/${id}.svg`
}

export interface StickerMeta {
  kind: 'builtin' | 'library'
  id: string
}

/** استخراج بيانات الملصق من رسالة (إن كانت رسالة ملصق) */
export function readStickerMeta(metadata: Record<string, unknown> | null | undefined): StickerMeta | null {
  if (!metadata) return null
  if (metadata.sticker !== true) return null
  const kind = metadata.sticker_kind
  const id = metadata.sticker_id
  if ((kind !== 'builtin' && kind !== 'library') || typeof id !== 'string' || !id) return null
  return { kind, id }
}

export function stickerPackTitle(packId: StickerPackId, lang: 'ar' | 'en'): string {
  const pack = STICKER_PACKS.find((item) => item.id === packId)
  if (!pack) return ''
  return lang === 'ar' ? pack.titleAr : pack.titleEn
}

export function stickerLabel(sticker: BuiltinSticker, lang: 'ar' | 'en'): string {
  return lang === 'ar' ? sticker.labelAr : sticker.labelEn
}

/** رسالة وصفية لمقتطف الرد / معاينة المحادثة */
export function stickerPreviewText(lang: 'ar' | 'en'): string {
  return lang === 'ar' ? '🎨 ملصق' : '🎨 Sticker'
}
