# نشر موقع «واصل شات» على GitHub Pages

- **المستودع:** <https://github.com/abdulazimuassenadm-hue/wasel-chat>
- **الرابط المباشر:** <https://abdulazimuassenadm-hue.github.io/wasel-chat/>
- **الفرع الرئيسي:** `main`

النشر **تلقائي بالكامل** عبر GitHub Actions عند كل دفع إلى `main`.
لا يلزم أي خادم ولا أي نشر يدوي، ولا حاجة إلى رفع مجلد `dist/` (يُبنى داخل السير).

(المشروع يستخدم `HashRouter`، لذا لا يحتاج أي قواعد إعادة كتابة/توجيه على الخادم.)

## كيف يعمل النشر

الملف: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

عند كل دفع إلى `main` (أو تشغيل يدوي عبر `workflow_dispatch`):

1. `actions/checkout` ثم `actions/setup-node` (Node 20 مع تخزين npm).
2. `npm ci`.
3. `npm run build` — وهو `tsc --noEmit && vite build`.
4. `touch dist/.nojekyll` لمنع معالجة Jekyll.
5. رفع `dist/` كأثر ثم `actions/deploy-pages` لنشره على GitHub Pages.

## متغيّرات المستودع المطلوبة

Settings → Secrets and variables → Actions → **Variables**:

| الاسم | الوصف |
| --- | --- |
| `VITE_SUPABASE_URL` | رابط مشروع Supabase |
| `VITE_SUPABASE_ANON_KEY` | المفتاح العام `anon` / `sb_publishable_...` — **ليس سراً** (يظهر أصلاً داخل حزمة الموقع المنشورة) |

> بدون هذين المتغيّرين **يفشل البناء عن قصد**، حمايةً من نشر نسخة بلا قاعدة بيانات
> (لن يستطيع أحد تسجيل الدخول).

هما يُمرَّران كـ `env` في خطوة البناء فقط، ولا يُخزَّن أي منهما في ملفات المستودع.

## مسار الأساس (Vite base)

| البيئة | القيمة | السبب |
| --- | --- | --- |
| GitHub Pages (أثناء البناء في السير) | `VITE_BASE_PATH=/wasel-chat/` | يطابق اسم المستودع على مسار فرعي |
| محلياً وداخل Capacitor | `./` (نسبي — الافتراضي) | يعمل على أي مسار، ولا يتأثر `npm run dev` ولا التطبيق الأصلي |

القيمة النسبية `./` تعمل أيضاً على GitHub Pages؛ لكننا نمرّر المسار الصريح في النشر
ليكون مطابقاً تماماً لاسم المستودع.

> ⚠️ إذا أُضيف **نطاق مخصص** لاحقاً فسيعمل الموقع من الجذر `/`؛ عندها يجب تغيير
> `VITE_BASE_PATH` إلى `/` في الـworkflow، وإلا تعطّلت الأصول (CSS/JS).

## تحديث الموقع

```powershell
git add -A
git commit -m "وصف التعديل"
git push origin main
```

ثم تُعاد النشرة تلقائياً خلال دقيقة أو دقيقتين. يمكن متابعة التنفيذ من تبويب
**Actions** في المستودع.

## ⚠️ خطوة يدوية لازمة (في Supabase — لا تُنفَّذ آلياً)

لتعمل روابط تأكيد البريد واستعادة كلمة المرور ودخول Google على النطاق الجديد:

**Supabase → Authentication → URL Configuration**

- **Site URL:** `https://abdulazimuassenadm-hue.github.io/wasel-chat/`
- **Redirect URLs:** `https://abdulazimuassenadm-hue.github.io/wasel-chat/**`

(التطبيق يبني رابط الإرجاع تلقائياً من نطاق الصفحة الحالية، فلا حاجة لأي تعديل في الكود.)

## ما ينشره الموقع

| المسار | الوصف |
| --- | --- |
| `/` | التطبيق كاملاً (Landing + الدخول + التطبيق عبر `#/...`) |
| `/privacy.html` | سياسة الخصوصية (مطلوبة في Google Play) |
| `/sw.js` | Service Worker بسيط **بلا أي تخزين مؤقت** — لجعل التطبيق قابلاً للتثبيت |
| `/manifest.webmanifest` | بيانات تطبيق الويب (PWA) |
| `/icon-192.png`, `/icon-512.png` | أيقونات التطبيق |
| `/icon-maskable-512.png` | أيقونة maskable (أندرويد) |
| `/apple-touch-icon.png` | أيقونة iOS |
| `/favicon.svg` | أيقونة الموقع |

## تثبيت التطبيق على الجهاز (PWA)

- شريط «ثبّت تطبيق واصل شات» يظهر **فوراً** عند فتح الموقع في المتصفح
  (ويُخفى داخل التطبيق الأصلي وفي المسارات الداخلية)، وهو قابل للإغلاق
  ولا يعود قبل 24 ساعة — بلا أي مؤقّتات أو إعادة توجيه، فلا يوجد أي تأخير أو حلقة.
- عند توفّر نافذة التثبيت الأصلية (Chrome/Android) يظهر زر **«تثبيت التطبيق»**.
- لتفعيل زر **«تحميل التطبيق»** بعد النشر على Google Play: أضف متغيّر مستودع
  `VITE_ANDROID_APP_URL` بقيمة رابط صفحة التطبيق.

## لإعادة البناء محلياً

```powershell
npm run build        # الناتج في dist/ (بمسار نسبي — مناسب لـ Capacitor)
npx vite preview     # لمعاينة الناتج محلياً
```
