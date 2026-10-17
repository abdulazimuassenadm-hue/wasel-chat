import { Capacitor } from '@capacitor/core'

/**
 * بيئة التشغيل الحالية:
 * - 'web'     : المتصفح (سلوك النسخة الحالية كما هو تماماً)
 * - 'android' : تطبيق Android داخل Capacitor
 * - 'ios'     : تطبيق iOS داخل Capacitor (غير مُفعَّل حالياً)
 */
export const platform = Capacitor.getPlatform() as 'web' | 'android' | 'ios'

/**
 * true فقط داخل تطبيق أصلي (Capacitor)، وfalse في المتصفح.
 *
 * يُستخدم لعزل كل سلوك خاص بالجوال حتى لا تتأثر نسخة الويب إطلاقاً.
 */
export const isNative = Capacitor.isNativePlatform()
