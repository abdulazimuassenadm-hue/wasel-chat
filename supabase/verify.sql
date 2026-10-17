-- ============================================================================
-- Wasel Chat | واصل شات
-- سكربت تحقّق (قراءة فقط) — لا يعدّل أي بيانات.
-- شغّله في: Supabase Dashboard → SQL Editor بعد تنفيذ:
--   schema.sql → policies.sql → storage.sql
-- يُظهر حالة الجداول، وRLS، والصلاحيات، والدوال، وRealtime، وحاويات التخزين.
-- ============================================================================

-- 1) هل كل الجداول المطلوبة موجودة؟
--    المتوقع: 19 صفاً، والعمود rls = true لجميعها.
with expected(name) as (
  values
    ('profiles'), ('profiles_public'), ('conversations'), ('conversation_members'),
    ('messages'), ('message_receipts'), ('message_reactions'), ('attachments'),
    ('contacts'), ('groups'), ('statuses'), ('status_views'), ('status_audience'),
    ('calls'), ('notifications'), ('reports'), ('user_blocks'),
    ('push_subscriptions'), ('app_settings')
)
select
  e.name as table_name,
  (c.relkind is not null) as exists,
  coalesce(c.relrowsecurity, false) as rls_enabled
from expected e
left join pg_class c
  on c.relname = e.name
 and c.relnamespace = 'public'::regnamespace
order by e.name;

-- 2) عدد سياسات RLS لكل جدول (يجب أن يكون > 0 لكل جدول عليه RLS)
select
  schemaname,
  tablename,
  count(*) as policies_count
from pg_policies
where schemaname = 'public'
group by schemaname, tablename
order by tablename;

-- 3) صلاحيات الجدول للمستخدم authenticated (يجب أن تشمل profiles و profiles_public وغيرها)
select
  table_name,
  string_agg(distinct privilege_type, ', ' order by privilege_type) as authenticated_privileges
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
group by table_name
order by table_name;

-- 4) الدوال الأمنية (security definer) المطلوبة وصلاحيات تنفيذها
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin','is_conversation_member','is_conversation_admin',
    'can_send_in_conversation','is_blocked_between','is_contact_of',
    'can_view_status','get_user_public_profile','is_conversation_member_any',
    'start_direct_conversation','create_group_conversation','add_group_member',
    'leave_group','mark_conversation_read','admin_stats','find_user_by_email',
    'delete_my_account_data','delete_expired_statuses'
  )
order by p.proname;

-- 5) هل الجداول المطلوبة مضافة إلى Realtime؟
select
  schemaname,
  tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;

-- 6) حاويات التخزين وإعداداتها
select id, name, public, file_size_limit
from storage.buckets
order by id;

-- 7) هل المُشغّلات (triggers) الأساسية موجودة؟
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'trg_new_message','trg_message_update','trg_message_notification',
    'trg_prevent_role_escalation','trg_restrict_message_changes',
    'trg_restrict_membership_changes','trg_profiles_touch','trg_profiles_public_touch'
  )
order by event_object_table, trigger_name;

-- 7.b) مشغّل إنشاء الملف الشخصي التلقائي (يقع على auth.users وليس public)
select
  tgname as trigger_name,
  tgrelid::regclass as on_table,
  tgenabled as enabled
from pg_trigger
where not tgisinternal
  and tgname = 'on_auth_user_created';

-- 8) فحص وجود المتجر (storage) — سياسات storage.objects
select
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- 9) جرد أعمدة الجداول الأساسية (يكشف أَي جداول أُنشئت بنسخة قديمة/ناقصة)
select
  table_name,
  string_agg(column_name, ', ' order by ordinal_position) as columns
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles','profiles_public','conversations',
    'conversation_members','messages'
  )
group by table_name
order by table_name;
