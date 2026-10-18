# خطوات إعداد خارجية مطلوبة (Supabase / Google) — لا تُنفَّذ من الكود

> هذه الخطوات إعدادات على لوحات خارجية، ولا يمكن تنفيذها من داخل المشروع.
> الحالة الحالية مُتحقَّق منها فعلياً: مزوّد البريد مُفعّل، ومزوّد Google **غير مُفعّل**.

## 1) تفعيل تسجيل الدخول عبر Google (هو العائق الوحيد حالياً)

الدليل الفعلي (فحص مباشر لواجهة Supabase):
- `GET /auth/v1/settings` → `"google": false` (ومزوّد البريد `"email": true`).
- `GET /auth/v1/authorize?provider=google` → `400 {"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`.

### أ) في Google Cloud Console (مشروع جديد أو موجود)
1. APIs & Services → OAuth consent screen: أنشئ الشاشة (External) واملأ اسم التطبيق والبريد.
2. APIs & Services → Credentials → Create credentials → **OAuth client ID** → نوع **Web application**.
3. **Authorized redirect URIs** — أضف بالضبط:
   ```
   https://vtmkdnybcvgwxptjaasz.supabase.co/auth/v1/callback
   ```
4. انسخ **Client ID** و **Client Secret**.

### ب) في Supabase (المشروع vtmkdnybcvgwxptjaasz)
5. Authentication → Providers → **Google** → Enable.
6. الصق **Client ID** و **Client Secret** → Save.
7. Authentication → URL Configuration:
   - **Site URL**: `https://abdulazimuassenadm-hue.github.io/wasel-chat/`
   - **Redirect URLs** (أضف كل سطر):
     ```
     https://abdulazimuassenadm-hue.github.io/wasel-chat/**
     http://localhost:5173/**
     wasel://auth-callback
     ```

بعد ذلك يعمل زر Google مباشرة، لأن الكود يستدعي `supabase.auth.signInWithOAuth({ provider: 'google' })` فعلياً
(الملف `src/context/AuthContext.tsx`)، ولا حاجة لأي تعديل برمجي.

## 2) تأكيد البريد — السبب الجذري المؤكد لمشكلة «يرجى تأكيد بريدك»

الدليل الفعلي (فحص مباشر لنقطة تحقق Supabase برمز غير صالح، دون كشف أي بيانات):
```
GET https://vtmkdnybcvgwxptjaasz.supabase.co/auth/v1/verify?token=...&type=signup
    &redirect_to=https://abdulazimuassenadm-hue.github.io/wasel-chat/
→ 303 Location: http://localhost:3000#error=access_denied&error_code=otp_expired...
```
أي أن Supabase **تجاهل** `redirect_to` الخاص بموقعنا واستخدم **Site URL الافتراضي `http://localhost:3000`**.
هذا يعني أن رابط التأكيد يعيد المستخدم إلى `localhost` (صفحة غير موجودة) بدل الموقع المنشور.

**الإصلاح المطلوب (خارجي — في Supabase فقط):**
1. Authentication → **URL Configuration** → **Site URL**:
   ```
   https://abdulazimuassenadm-hue.github.io/wasel-chat/
   ```
2. **Redirect URLs** — أضف:
   ```
   https://abdulazimuassenadm-hue.github.io/wasel-chat/**
   http://localhost:5173/**
   wasel://auth-callback
   ```

بعد ذلك: رابط التأكيد والاستعادة يعودان إلى الموقع مباشرة، ويتولّى الكود
(`src/lib/authCallback.ts`) إنشاء الجلسة والتوجيه الصحيح.

> ملاحظة: تم إصلاح جانب الكود بالكامل (كان يعتمد على صيغة `#/login#access_token=...`
> التي لا يفهمها محلّل supabase-js). متبقٍ فقط هذا الإعداد الخارجي.

## 2.1) استعادة كلمة المرور
- تستخدم نفس إعداد `Redirect URLs` أعلاه.
- الكود يوجّه تلقائياً إلى `/reset-password` عند عودة رابط الاستعادة (حدث PASSWORD_RECOVERY).
- مزوّد البريد مُفعّل حالياً وواجهة الدخول ترجع `invalid_credentials` بشكل صحيح (مُتحقَّق منه فعلياً).

## 3) تطبيق Android لاحقاً (غير مطلوب الآن)
- مخطط الروابط العميقة المستخدم في الكود: `wasel://` (انظر `src/lib/authRedirect.ts`).
- عند إنشاء مجلد `android/` أضف intent-filter للمخطط `wasel` في `AndroidManifest.xml`.
- سجّل `wasel://auth-callback` في Supabase Redirect URLs.

## 4) ملاحظات أمنية
- لا تُضف مفتاح `service_role` إلى الواجهة أبداً. المشروع يستخدم `VITE_SUPABASE_ANON_KEY` فقط.
- قيم Supabase تُمرَّر في بناء GitHub Actions عبر متغيرات المستودع (وليست أسراراً مكشوفة في المستودع).
