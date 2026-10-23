-- ============================================================================
-- Wasel Chat | ترقية إشعارات Web Push والمكالمات (أكتوبر 2026)
-- ----------------------------------------------------------------------------
-- نفّذ هذا الملف مرة واحدة في Supabase → SQL Editor بعد ملفات schema/policies
-- الأساسية. لا يحذف أي بيانات ولا يغيّر الرسائل أو المحادثات.
--
-- ما يضيفه:
--   1) جدول push_deliveries لمنع إرسال الإشعار نفسه مرتين لنفس المستخدم.
--   2) فهرس اشتراكات لكل مستخدم لتسريع الإرسال.
--   3) مفتاح calls في notification_settings (افتراضياً true) للتحكم المستقل
--      في إشعارات المكالمات دون التأثير على إشعارات الرسائل.
--
-- ملاحظة أمنية: push_deliveries للخادم فقط (service_role). لا تُمنح أي سياسة
-- للمستخدمين، ولا تحتوي أي رسالة أو محتوى، بل مفتاح منع تكرار فقط.
-- ============================================================================

begin;

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists push_deliveries_user_created_idx
  on public.push_deliveries (user_id, created_at desc);

alter table public.push_deliveries enable row level security;
revoke all on table public.push_deliveries from anon, authenticated;

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- إضافة خيار إشعارات المكالمات للحسابات القائمة دون المساس ببقية الخيارات
update public.profiles
set notification_settings = notification_settings || jsonb_build_object('calls', true)
where notification_settings is null
   or not (notification_settings ? 'calls');

alter table public.profiles
  alter column notification_settings
  set default jsonb_build_object(
    'sounds', true,
    'browser', true,
    'preview', true,
    'reactions', true,
    'calls', true
  );

commit;

-- ----------------------------------------------------------------------------
-- تنظيف اختياري لسجلات منع التكرار الأقدم من 30 يوماً (يمكن جدولته بـ pg_cron):
-- delete from public.push_deliveries where created_at < now() - interval '30 days';
-- ----------------------------------------------------------------------------
