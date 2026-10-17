# أصول ونشر «واصل شات» على Google Play

هذا المجلد يحتوي أصول المتجر وقائمة متطلبات النشر.

## أصول جاهزة (مُولَّدة)

| الأصل | الملف | الحالة |
| --- | --- | --- |
| أيقونة المتجر 512×512 | `play-icon-512.png` | ✅ جاهز |
| صورة العرض 1024×500 | `feature-graphic-1024x500.png` | ✅ جاهز (نص الاسم غير مُدرج — يُفضّل إضافة «واصل شات» نصياً) |
| أيقونة التطبيق داخل الجهاز | `android/app/src/main/res/mipmap-*` | ✅ جاهز (عادية + دائرية + adaptive) |
| شاشة البداية | `android/app/src/main/res/drawable*/splash.png` | ✅ جاهز |
| لون الهوية للنظام | `android/app/src/main/res/values/colors.xml` | ✅ جاهز (#1FB09C) |

لإعادة توليد الأصول بعد أي تعديل على الشكل:

```bash
node tools/gen-assets.mjs
```

الشكل مصدره `public/favicon.svg` (فقاعة بيضاء على تدرّج تركوازي).

## ما يلزم قبل الرفع إلى Google Play

1. **معرّف التطبيق (applicationId)**: حالياً `com.wasel.chat`.
   > ⚠️ يُثبَّت نهائياً بعد أول رفع ولا يمكن تغييره لاحقاً. قرّر الاسم النهائي قبل الرفع.
2. **المفتاح والتوقيع**: أنشئ `android/wasel-release.jks` و`android/keystore.properties`
   (انظر `android/keystore.properties.example`)، مع تفعيل **Play App Signing**.
3. **بناء الحزمة (AAB)**: `cd android && ./gradlew bundleRelease`
   → `android/app/build/outputs/bundle/release/app-release.aab`
   (يتطلب JDK 21 + Android SDK).
4. **ترقيم الإصدارات**: عند كل تحديث ارفع `versionCode` و`versionName` في
   `android/app/build.gradle`.
5. **سياسة الخصوصية**: رابط عام مطلوب. الصفحة جاهزة في `public/privacy.html`
   وتُنشر على: `https://<موقعك>/privacy.html`
   > ⚠️ استبدل «ضع بريد التواصل هنا» ببريد حقيقي قبل النشر.
6. **استمارة أمان البيانات (Data safety)** في Play Console: يجب تعبئتها يدوياً وتطابق
   سياسة الخصوصية (نجمع البريد، الاسم، المحتوى، الوسائط — بلا إعلانات ولا تتبّع).
7. **تصنيف المحتوى (Content rating)**: استبيان يدوي في Play Console.
8. **لقطات الشاشة**: 2 على الأقل (هاتف) + وصف قصير/طويل + أيقونة + صورة العرض.
9. **حساب مطوّر Google Play**: رسوم تسجيل لمرة واحدة 25$.
10. **مراجعة الحساب الجديد**: الحسابات الفردية الجديدة تحتاج 12 مُختبِراً لمدة 14 يوماً
    قبل النشر العام (قاعدة Google الحالية) — خطّط لهذا مسبقاً.

## متغيرات لازمة في بيئة البناء

```
JAVA_HOME   → مسار JDK 21
ANDROID_HOME→ مسار Android SDK
```

ثم:

```bash
npm run build
npx cap sync android
cd android && ./gradlew bundleRelease
```
