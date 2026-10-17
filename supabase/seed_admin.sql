-- ============================================================================
-- Wasel Chat | واصل شات
-- تعيين حساب المدير (لوحة الإدارة)
-- ============================================================================
-- مهم: لا تُمنح صلاحيات المدير تلقائياً عند التسجيل.
-- الخطوات:
--   1) سجّل حساباً عادياً من واجهة الموقع (أو من Authentication → Users).
--   2) استبدل البريد التالي ببريد حسابك.
--   3) شغّل هذا الملف في SQL Editor.
-- ============================================================================

-- 1) عرض المستخدمين الحاليين لمعرفة المعرّف/البريد
-- select id, email, created_at from auth.users order by created_at desc;

-- 2) ترقية مستخدم إلى مدير
-- ملاحظة مهمة: عند التشغيل من SQL Editor تكون auth.uid() فارغة، لذا يعتبر
-- مُشغّل الحماية (prevent_role_escalation) أن هذا تغيير غير مصرّح به ويُرجع الدور.
-- لذلك نعطّل المُشغّل مؤقتاً أثناء الترقية ثم نعيده.
alter table public.profiles disable trigger trg_prevent_role_escalation;

update public.profiles
   set role = 'admin'
 where id = (
   select id from auth.users where email = 'admin@example.com'
 );

alter table public.profiles enable trigger trg_prevent_role_escalation;

-- 3) التحقق
select p.id, u.email, p.role, p.is_suspended
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.role = 'admin';

-- ============================================================================
-- إلغاء صلاحية مدير (عند الحاجة)
-- ============================================================================
-- update public.profiles set role = 'user'
--  where id = (select id from auth.users where email = 'admin@example.com');

-- ============================================================================
-- حظر / إلغاء حظر حساب (من لوحة الإدارة أيضاً)
-- ============================================================================
-- update public.profiles set is_suspended = true
--  where id = (select id from auth.users where email = 'spammer@example.com');
