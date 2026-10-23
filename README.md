# Wasel Chat | واصل شات

منصة مراسلة فورية حقيقية مبنية على **React + TypeScript + Vite + Tailwind CSS** و **Supabase**
(مصادقة + PostgreSQL + Realtime + Storage)، مع مكالمات صوتية ومرئية عبر **WebRTC**.

> هذا مشروع حقيقي متكامل (قاعدة بيانات، مصادقة، اتصال فوري)، وليس واجهة شكلية.
> أي ميزة تحتاج إعداداً خارجياً (Google OAuth، TURN، Web Push، حذف الحساب النهائي) موثّقة
> أدناه بوضوح، ولن تعمل قبل إتمام إعدادها.

---

## المحتويات

- [المزايا](#المزايا)
- [التقنيات](#التقنيات)
- [المتطلبات](#المتطلبات)
- [التشغيل السريع](#التشغيل-السريع)
- [إعداد Supabase](#إعداد-supabase)
- [جداول قاعدة البيانات](#جداول-قاعدة-البيانات)
- [تخزين الملفات](#تخزين-الملفات)
- [Realtime](#realtime)
- [مصادقة البريد وكلمة المرور](#مصادقة-البريد-وكلمة-المرور)
- [تسجيل الدخول عبر Google (اختياري)](#تسجيل-الدخول-عبر-google-اختياري)
- [المكالمات و WebRTC (STUN / TURN)](#المكالمات-و-webrtc-stun--turn)
- [إشعارات الويب (Web Push، اختياري)](#إشعارات-الويب-web-push-اختياري)
- [حذف الحساب (Edge Function)](#حذف-الحساب-edge-function)
- [لوحة الإدارة](#لوحة-الإدارة)
- [الأوامر](#الأوامر)
- [النشر](#النشر)
- [الأمان](#الأمان)
- [بنية المشروع](#بنية-المشروع)
- [قائمة تحقق للاختبار](#قائمة-تحقق-للاختبار)

---

## المزايا

- **واجهة احترافية** عربية/إنجليزية مع دعم RTL/LTR، وضع ليلي/فاتح، وتصميم متجاوب بالكامل.
- **مصادقة حقيقية**: تسجيل، دخول، خروج، تأكيد البريد، استعادة كلمة المرور، تغيير كلمة المرور، إدارة الجلسات.
- **محادثات فردية وجماعية** فورية مع حالة الرسالة (أُرسلت/تم التسليم/تمت القراءة)، مؤشر الكتابة، الرد، إعادة التوجيه،
  التعديل والحذف، البحث، التثبيت، الأرشفة، الكتم، الرموز التعبيرية والتفاعلات.
- **وسائط وملفات**: صور، فيديو، رسائل صوتية، مستندات/PDF، مع معاينة، شريط تقدم، والتحقق من النوع والحجم.
- **مكالمات صوتية ومرئية** عبر WebRTC مع قبول/رفض، كتم، تشغيل/إيقاف الكاميرا، وسجل مكالمات.
- **الحالات (Statuses)**: نصية وصور وفيديو، مع الجمهور والمشاهدات والحذف التلقائي بعد 24 ساعة.
- **الإشعارات**: داخل التطبيق + دعم Web Push.
- **الملف الشخصي والخصوصية**: الصورة، الاسم، النبذة، حالة الاتصال، إعدادات الخصوصية، الحظر والإبلاغ.
- **لوحة إدارة** محمية: المستخدمون، البلاغات، المجموعات، الإحصاءات، وإعدادات المنصة.

---

## التقنيات

| الطبقة | التقنية |
| --- | --- |
| الواجهة | React 18 + TypeScript + Vite |
| التصميم | Tailwind CSS (+ دعم الوضع الليلي والـ RTL) |
| التوجيه | React Router (HashRouter — يعمل على الاستضافة الثابتة) |
| الخلفية | Supabase (Auth + PostgreSQL + Realtime + Storage) |
| المكالمات | WebRTC (STUN/TURN) |
| الإشعارات | Web Push (VAPID) + Supabase Edge Functions (اختياري) |

---

## المتطلبات

- Node.js 18+ و npm.
- حساب [Supabase](https://supabase.com) (الخطة المجانية تكفي للتجربة).

---

## التشغيل السريع

```bash
# 1) ثبّت الحزم
npm install

# 2) جهّز ملف الإعدادات (.env.local جاهز في مساحة العمل هذه؛ إن لم يوجد فانسخه)
copy .env.example .env.local      # Windows (تخطَّ الخطوة إن كان .env.local موجوداً)
# cp .env.example .env.local      # macOS/Linux

# 3) املأ قيم Supabase في .env.local (انظر القسم التالي)

# 4) شغّل خادم التطوير
npm run dev
```

ثم افتح `http://localhost:5173`.

> إن لم تضبط `.env.local` ستظهر شاشة توضيحية (NotConfigured) بدل أخطاء غامضة.

---

## إعداد Supabase (بالترتيب)

> ترتيب العمل: إنشاء المشروع → نسخ الرابط والمفتاح إلى `.env.local` → تنفيذ ملفات SQL →
> ضبط المصادقة وRealtime → (اختياري) نشر Edge Function → إنشاء الحساب ثم ترقيته لمدير.

### 1) إنشاء المشروع وربطه بالتطبيق

1. أنشئ مشروعاً جديداً على [Supabase](https://supabase.com).
2. من **Project Settings → API** انسخ:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
3. افتح `.env.local` (جاهز وفارغ في جذر المشروع، ومستثنى من Git) واملأ القيمتين:

   ```env
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
   ```

4. أعد تشغيل خادم التطوير (`npm run dev`) بعد أي تعديل على `.env.local`.

> **لا تضع `service_role key` في `.env.local` أو في أي كود متصفح أبداً.** يُستخدم فقط داخل Edge Functions.
> ما دامت القيم فارغة سيعرض التطبيق شاشة "لم يتم إعداد Supabase بعد" بدل أخطاء غامضة.

### 2) تنفيذ ملفات SQL (الترتيب إلزامي)

افتح **SQL Editor** في Supabase، وأنشئ استعلاماً جديداً لكل ملف بالترتيب:

| الترتيب | الملف | الوظيفة |
| --- | --- | --- |
| 1 | `supabase/schema.sql` | الجداول، العلاقات، الفهارس، الدوال والمشغلات، وجدول الإعدادات |
| 2 | `supabase/policies.sql` | تفعيل **Row Level Security** وكتابة كل السياسات والصلاحيات |
| 3 | `supabase/storage.sql` | حاويات التخزين (Buckets) وسياسات الوصول للملفات |
| 4 | `supabase/verify.sql` | (اختياري) تحقّق **قراءة فقط** من الجداول وRLS والصلاحيات وRealtime والحاويات |
| 5 | `supabase/seed_admin.sql` | تعيين حسابك مديراً — يُنفّذ **بعد** التسجيل وليس الآن (راجع «لوحة الإدارة») |

> **اعتماديات الترتيب:** `policies.sql` يعتمد على الجداول والدوال في `schema.sql`،
> و`storage.sql` يعتمد على `is_conversation_member` (من `schema.sql`) و`can_view_status`
> (من `policies.sql`)، و`seed_admin.sql` يعتمد على `profiles` والمشغّل المُعرّف في `policies.sql`.

### 3) ضبط المصادقة وRealtime

- **المصادقة:** اضبط Site URL و Redirect URLs — التفاصيل في قسم «مصادقة البريد وكلمة المرور».
- **Realtime:** تُضاف الجداول إلى المنشور تلقائياً عبر `schema.sql` — راجع قسم «Realtime».
- **التخزين:** تُنشأ الحاويات عبر `storage.sql` — راجع قسم «تخزين الملفات».

### 4) (اختياري) نشر Edge Function لحذف الحساب نهائياً

راجع قسم «حذف الحساب (Edge Function)».

### 5) إنشاء حساب المدير

سجّل حساباً من الواجهة، ثم نفّذ `supabase/seed_admin.sql` بعد تعديل البريد داخله — راجع قسم «لوحة الإدارة».

---

## جداول قاعدة البيانات

`profiles` · `profiles_public` (عرض عام يحترم الخصوصية) · `conversations` · `conversation_members` ·
`messages` · `message_receipts` · `message_reactions` · `attachments` · `contacts` · `groups` ·
`group_members` · `statuses` · `status_views` · `calls` · `notifications` · `reports` · `user_blocks` ·
`app_settings` · `push_subscriptions`.

- كل الجداول الحساسة محمية بـ **RLS**.
- الدوال المهمة: `admin_stats()` (إحصاءات المدير) و `delete_my_account_data()` (حذف بيانات المستخدم).
- الفهارس والقيود (unique, FK, check) معرّفة داخل `schema.sql`.

---

## تخزين الملفات

أربع حاويات (Buckets):

| Bucket | النوع | الاستخدام |
| --- | --- | --- |
| `avatars` | عام | صور المستخدمين |
| `group-avatars` | عام | صور المجموعات |
| `chat-media` | خاص | مرفقات المحادثات (صور/فيديو/صوت/ملفات) — وصول عبر روابط موقّعة |
| `status-media` | خاص | وسائط الحالات — وصول عبر روابط موقّعة |

الملفات الخاصة تُعرض عبر **روابط موقّعة (Signed URLs)** مؤقتة، ولا يمكن الوصول إليها بدون صلاحية.

---

## Realtime

- تُفعّل قنوات Realtime على الجداول `messages`, `message_receipts`, `message_reactions`,
  `conversation_members`, `notifications`, `calls`, بالإضافة إلى قناة الحالة (presence) وقناة الكتابة (typing).
- تأكد من تفعيل **Realtime** للمشروع (Settings → API → Realtime) ومن إضافتها إلى المنشور `supabase_realtime` إن لزم
  (schema.sql يتولّى ذلك).

---

## مصادقة البريد وكلمة المرور

في **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:5173` (أو رابط موقعك المنشور).
- **Redirect URLs**: أضف:
  - `http://localhost:5173/#/login`
  - `http://localhost:5173/#/reset-password`
  - ورابط موقعك المنشور بنفس الصيغ.

التطبيق يستخدم **HashRouter**، لذا تُضاف المسارات بعد `#`.

- **تأكيد البريد**: فعّله من Authentication → Providers → Email (Confirm email).
  بعد التأكيد يعود المستخدم إلى `#/login`.
- **استعادة كلمة المرور**: يعود الرابط إلى `#/reset-password` ويكمل المستخدم تعيين كلمة مرور جديدة.
- الحظر بعد محاولات متكررة: مطبّق عبر Supabase Auth Rate Limits (Authentication → Rate Limits).

---

## تسجيل الدخول عبر Google (اختياري)

1. أنشئ OAuth Client على Google Cloud Console.
2. في Supabase: Authentication → Providers → Google، وأدخل Client ID و Secret، وأضف رابط الاستدعاء الذي يوفّره Supabase.
3. سيظهر زر Google في صفحات الدخول/التسجيل تلقائياً.

---

## المكالمات و WebRTC (STUN / TURN)

**سبب الرسالة القديمة:** كان الكود يقرأ `VITE_TURN_URL` و`VITE_TURN_USERNAME` و`VITE_TURN_CREDENTIAL`، وهذه تُحقن داخل JavaScript المنشور، كما أن `.env.local` لا يُرفع إلى GitHub Actions ولا يُنشر مع GitHub Pages. لذلك كانت المكالمات تعمل عبر STUN فقط، وتظهر رسالة «أضف TURN في .env.local».

**الحل الحالي:**

- STUN عام افتراضي: `stun:stun.l.google.com:19302` و`stun:stun.cloudflare.com:3478`.
- لا توجد أي كلمة مرور TURN في الحزمة. يطلب التطبيق بيانات TURN مؤقتة عند تسجيل الدخول من Edge Function `turn-credentials`، التي تعيد بيانات صالحة لمدة محددة فقط.
- عند غياب TURN تبقى المكالمات ممكنة على الشبكات المفتوحة، وتظهر ملاحظة صادقة داخل شاشة المكالمة.

### إعداد TURN موثوق (مرة واحدة)

1. جهّز خادم TURN يدعم `use-auth-secret` (coturn على VPS) أو مزوّداً يعطي بيانات مؤقتة. مثال coturn:

   ```conf
   listening-port=3478
   tls-listening-port=5349
   fingerprint
   lt-cred-mech
   use-auth-secret
   static-auth-secret=<سر-طويل-عشوائي>
   realm=turn.example.com
   external-ip=<IP-العام>
   # شهادة TLS لـ turns: (Let's Encrypt)
   cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
   pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
   min-port=49152
   max-port=65535
   ```

2. افتح المنافذ: `3478/tcp` و`3478/udp` و`5349/tcp` و`5349/udp`، ومجال UDP `49152–65535`، واسم نطاق بشهادة TLS عند استخدام `turns:`.

3. انشر الدالة واضبط أسرارها (لا تضعها في Git أو GitHub Pages):

   ```bash
   supabase functions deploy turn-credentials
   supabase secrets set \
     TURN_URLS="turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp" \
     TURN_SECRET="<نفس static-auth-secret>" \
     TURN_TTL_SECONDS=3600
   ```

4. اختبر بـ [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) من شبكة بيانات الجوال، ثم جرّب مكالمة بين جهازين على شبكتين مختلفتين.

**التكلفة:** خادم VPS صغير لـ coturn عادةً ضمن نطاق 5–10 دولارات شهرياً + استهلاك النطاق. مزوّدات TURN المُدارة (Cloudflare Realtime TURN، Twilio Network Traversal، Metered) تسعّر حسب الاستخدام وغالباً لها طبقة مجانية محدودة؛ راجع أسعارها الحالية قبل الاعتماد عليها. TURN المجاني غير المحدود غير موثوق ولا يُنصح به.

> لا يمكن اختبار سماع الصوت في الاتجاهين من داخل بيئة التطوير بلا حسابين وجهازين وشبكتين. الكود يتحقق من صلاحية الميكروفون وتبادل SDP/ICE، لكن اختبار TURN الفعلي يتطلب الخطوات أعلاه.

---

## إشعارات الويب (Web Push) وإشعارات المكالمات

**ما يعمل داخل الكود:**

- تسجيل Service Worker واستقبال `push` وعرض إشعارات النظام حتى عندما تكون الصفحة في الخلفية أو مغلقة (بعد الإعداد).
- اشتراك لكل جهاز يُخزَّن في `push_subscriptions` (RLS: صاحب الاشتراك فقط).
- Edge Function `push-notify` ترسل للرسائل والمكالمات، ولا ترسل للمرسل نفسه، وتحترم:
  - إشعارات الرسائل (`browser`) والمكالمات (`calls`) على حدة.
  - كتم المحادثة، والحساب الموقوف، وإعداد معاينة الرسالة، والأصوات.
  - منع التكرار عبر `push_deliveries`.
- الضغط على إشعار رسالة يفتح المحادثة الصحيحة عبر HashRouter.
- إشعار المكالمة يحتوي اسم المتصل وصورته إن سمحت خصوصيته، وأزرار «رد» و«رفض» حيث تدعمها المنصة.

### خطوات التفعيل

1. نفّذ `supabase/upgrade-2026-10-notifications.sql` في SQL Editor (ينشئ `push_deliveries` ويضيف خيار `calls` دون حذف بيانات).
2. أنشئ مفاتيح VAPID مرة واحدة:

   ```bash
   npx web-push generate-vapid-keys
   ```

3. ضع **المفتاح العام** في متغيرات مستودع GitHub باسم `VITE_VAPID_PUBLIC_KEY` (آمن للنشر)، أو في `.env.local` محلياً.
4. اضبط أسرار Supabase (المفتاح الخاص لا يغادر الخادم):

   ```bash
   supabase secrets set \
     VAPID_SUBJECT="mailto:you@example.com" \
     VAPID_PUBLIC_KEY="<العام>" \
     VAPID_PRIVATE_KEY="<الخاص>" \
     PUSH_WEBHOOK_SECRET="<سلسلة-عشوائية-طويلة>"
   ```

5. انشر الدالة:

   ```bash
   supabase functions deploy push-notify --no-verify-jwt
   ```

6. من Supabase → Database → Webhooks أنشئ Hookين على `public.messages` و`public.calls` عند `INSERT`، إلى:
   `https://<project>.supabase.co/functions/v1/push-notify`
   مع الترويسة `x-webhook-secret: <نفس PUSH_WEBHOOK_SECRET>`.
7. من التطبيق: الإعدادات → الإشعارات → فعّل «الرسائل الجديدة» و/أو «المكالمات الواردة»، ثم اسمح بالإشعارات من المتصفح/الهاتف.

### القيود الواقعية

- **Android/Chrome:** يعمل Web Push، ويفضّل تثبيت التطبيق. قد يؤخر نظام توفير الطاقة الإشعارات قليلاً.
- **iPhone/iPad:** يتطلب iOS 16.4+ وإضافة «واصل» إلى الشاشة الرئيسية، ثم السماح بالإشعارات. أزرار الإشعار قد لا تظهر على iOS؛ الضغط يفتح التطبيق.
- **رفض المكالمة من الإشعار:** زر «رفض» يفتح التطبيق ويكمل الرفض بجلسة المستخدم؛ لا توجد طريقة موثوقة لإجراء رفض كامل والتطبيق مغلق عبر Web Push وحده. الإشعار المرتبط يُغلق عند الرد/الرفض/انتهاء المكالمة إذا كان التطبيق مفتوحاً؛ وإلا يبقى حتى يزيله النظام.
- **الحساب الموقوف أو الإشعارات المرفوضة من النظام:** لا يمكن تجاوز قرار النظام؛ ستظهر رسالة توضيحية في الإعدادات.
- **GitHub Pages:** لا يشغّل خادماً؛ لذلك الإرسال يتم حصراً عبر Supabase Edge Function وDatabase Webhooks. لا تضع `service_role` أو `VAPID_PRIVATE_KEY` في متغيرات `VITE_*`.

> لا يمكن اختبار التسليم الفعلي إلى جهاز حقيقي من هذه البيئة بلا مفاتيح VAPID وجهاز مشترك. الاختبارات المنفذة محلياً تغطي بناء التطبيق، ومنطق Service Worker، وتوليد بيانات TURN، وعدم تسرب الأسرار.

---

## حذف الحساب (Edge Function)

التطبيق ينادي دالة `delete-account` لحذف مستخدم المصادقة نهائياً:

```bash
supabase functions deploy delete-account
```

- الدالة تستخدم `SUPABASE_SERVICE_ROLE_KEY` المتوفر تلقائياً داخل Edge Functions،
  و**لا** يوضع في الواجهة.
- المستخدم يستطيع حذف حسابه بنفسه، ويمكن للمدير حذف مستخدم بتمرير `{ userId }`.
- إن لم تُنشر الدالة، سيُحذف *بيانات* المستخدم فقط (`delete_my_account_data`) ويظهر تنبيه.

---

## لوحة الإدارة

- تُمنح صلاحية المدير يدوياً، ولا تُمنح بمجرد التسجيل.
- بعد تسجيل حسابك، نفّذ `supabase/seed_admin.sql` (بعد تعديل البريد داخله) لتعيينه مديراً.
- اللوحة متاحة على `/#/admin` وتشمل: الإحصاءات، المستخدمون (إيقاف/تفعيل، ترقية/تنزيل، حذف),
  البلاغات (تغيير الحالة وإضافة ملاحظة)، المجموعات، وإعدادات المنصة.

---

## الأوامر

| الأمر | الوصف |
| --- | --- |
| `npm run dev` | خادم التطوير |
| `npm run build` | فحص الأنواع + بناء الإنتاج إلى `dist/` |
| `npm run preview` | معاينة بناء الإنتاج |
| `npm run typecheck` | فحص الأنواع فقط |

---

## النشر

### استضافة ثابتة (Vercel / Netlify / GitHub Pages)

المشروع **واجهة أمامية فقط** (Supabase هو الخادم)، لذا يمكن نشره كموقع ثابت:

- **Vercel / Netlify**: اربط المستودع، أمر البناء `npm run build`، مجلد النشر `dist`،
  وأضف متغيّرات البيئة (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, ...).
- **GitHub Pages**: ترفع محتوى `dist`. لأن التطبيق يستخدم **HashRouter** وتُبنى الأصول بمسار نسبي
  (`base: './'`)، يعمل دون إعداد خادم أو ملفات إعادة توجيه.

> **مهم:** GitHub Pages يستضيف ملفات ثابتة فقط ولا يشغّل خادم Node خلفي. أي ميزة تحتاج خادماً
> (مثل إرسال Web Push أو حذف الحساب النهائي) تُنفّذ عبر **Supabase Edge Functions** أو خدمة استضافة تدعم الخادم.

بعد النشر، أضف روابط الموقع إلى **Redirect URLs** في إعدادات Supabase (بنفس صيغ `#`).

---

## الأمان

- كلمات المرور لا تُخزَّن كنص عادي (Supabase Auth).
- **RLS** مفعّل على كل الجداول الحساسة، والتحقق من الصلاحيات يتم في قاعدة البيانات وليس في الواجهة فقط.
- `service_role key` لا يظهر في كود المتصفح أبداً.
- التحقق من الملفات المرفوعة (النوع والحجم) قبل الرفع، وحاويات خاصة مع روابط موقّعة.
- حماية الجلسات وإدارة الجلسات وتأكيد البريد.
- لا يُدَّعى وجود **تشفير شامل بين الطرفين (E2EE)** — التشفير الحالي هو تشفير النقل (HTTPS) فقط.

---

## بنية المشروع

```
src/
  main.tsx                 # نقطة الدخول + مزوّدات السياق + HashRouter
  App.tsx                  # المسارات وحمايات الوصول (RequireAuth / RequireAdmin)
  index.css                # أنماط Tailwind والأساسيات
  types.ts                 # أنواع البيانات المطابقة للمخطط
  lib/
    supabase.ts            # عميل Supabase وإعداداته وحدود الرفع
    api.ts                 # كل استدعاءات قاعدة البيانات والتخزين
    i18n.ts                # الترجمات (عربي/إنجليزي)
    utils.ts               # أدوات مساعدة (تنسيق، تحقق، إلخ)
    ringtone.ts            # نغمة المكالمات
  context/                 # App / Auth / Chat / Call / Toast
  components/              # الواجهات المشتركة (chat / call / layout / ui)
  pages/                   # الصفحات + admin/
supabase/
  schema.sql               # الجداول والدوال والمشغلات
  policies.sql             # سياسات RLS والصلاحيات
  storage.sql              # حاويات التخزين وسياساتها
  seed_admin.sql           # تعيين مدير
  functions/delete-account # Edge Function لحذف الحساب نهائياً
```

---

## قائمة تحقق للاختبار

- [ ] التسجيل بالبريد ثم تأكيد البريد ثم الدخول.
- [ ] استعادة كلمة المرور عبر البريد وتغييرها.
- [ ] إكمال الملف الشخصي (الاسم، الصورة، النبذة).
- [ ] إرسال/استقبال الرسائل فورياً بين **حسابين مختلفين** وحالة الرسالة الصحيحة.
- [ ] إرسال صورة/ملف/رسالة صوتية ومعاينتها.
- [ ] إنشاء مجموعة وإضافة/إزالة أعضاء.
- [ ] نشر حالة ومشاهدتها ثم حذفها.
- [ ] مكالمة صوتية/مرئية بين حسابين (مع ضبط TURN إن لزم).
- [ ] دخول حساب المدير إلى `/#/admin` وتجربة الإدارة.
- [ ] حذف الحساب (مع نشر Edge Function).

---

© Wasel Chat — هوية بصرية مستقلة، لا تعتمد على أي علامة تجارية أخرى.
