# نشر موقع «واصل شات»

الموقع جاهز للنشر في المجلد **`dist/`** — موقع ثابت بلا خادم.
(المشروع يستخدم HashRouter، لذا لا يحتاج أي قواعد إعادة كتابة/توجيه على الخادم.)

لإعادة البناء بعد أي تعديل: `npm run build`

## طرق النشر

### ١) Netlify Drop (الأسرع — اسحب مجلد `dist`)

افتح <https://app.netlify.com/drop> واسحب **مجلد `dist`** إليه.
ستحصل على رابط فوري. أنشئ حساباً (مجاناً) للاحتفاظ به وتثبيت النطاق.

### ٢) Netlify بأمر واحد (يلزم رمز وصول)

أنشئ رمزاً من: Netlify → User settings → Applications → Personal access tokens، ثم:

```powershell
npx netlify-cli deploy --dir=dist --prod --auth=<NETLIFY_AUTH_TOKEN>
```

### ٣) بدائل

- Cloudflare Pages: `npx wrangler pages deploy dist --project-name=wasel-chat`
- Vercel: `npx vercel deploy --prod dist`
- GitHub Pages: ارفع محتوى `dist/` إلى فرع `gh-pages`.

## ⚠️ خطوة لازمة بعد النشر (في Supabase — لا تُنفَّذ آلياً)

لتعمل روابط تأكيد البريد واستعادة كلمة المرور ودخول Google على النطاق الجديد،
أضف نطاق الموقع المنشور إلى:

**Supabase → Authentication → URL Configuration → Redirect URLs**

مثال: `https://<اسم-موقعك>.netlify.app/**`

(التطبيق يبني رابط الإرجاع تلقائياً من نطاق الصفحة الحالية، فلا حاجة لأي تعديل في الكود.)

## ما ينشره الموقع

| المسار | الوصف |
| --- | --- |
| `/` | التطبيق (Landing + الدخول + التطبيق عبر `#/...`) |
| `/privacy.html` | سياسة الخصوصية (المطلوبة في Google Play) |
| `/favicon.svg` | أيقونة الموقع |
