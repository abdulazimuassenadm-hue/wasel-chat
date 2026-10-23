-- ============================================================================
-- Wasel Chat | واصل شات
-- تحديث ترقية: الملصقات الشخصية فقط (تأجيل البحث برقم الهاتف)
-- ----------------------------------------------------------------------------
-- طريقة التطبيق:
--   1) افتح لوحة Supabase → SQL Editor.
--   2) الصق المحتوى التالي واضغط Run (سيتم لفه تلقائياً بـ BEGIN…COMMIT).
--   3) الملف آمن للتشغيل أكثر من مرة (idempotent) ولا يحذف بيانات موجودة.
-- ============================================================================

begin;

-- ============================================================================
-- 1) جدول ملصقات المستخدم (مكتبة «ملصقاتي»)
--    الصور تُرفع إلى حاوية خاصة اسمها stickers، والمسار يبدأ بمعرّف المستخدم.
-- ============================================================================
create table if not exists public.user_stickers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'ملصق',
  bucket text not null default 'stickers',
  path text not null,
  created_at timestamptz not null default now()
);

create index if not exists user_stickers_user_created_idx
  on public.user_stickers (user_id, created_at desc);

alter table public.user_stickers enable row level security;

-- قيد دفاعي إضافي: يمنع حتى service_role من إدخال صف يشير إلى حاوية أخرى
-- أو إلى مجلد مستخدم آخر. NOT VALID لا يفحص الصفوف القديمة، لكنه يُطبّق على
-- كل إدخال/تعديل جديد. راجع الصفوف القديمة بالاستعلام الموجود في نهاية الملف.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_stickers'::regclass
      and conname = 'user_stickers_owner_path_check'
  ) then
    alter table public.user_stickers
      add constraint user_stickers_owner_path_check
      check (
        bucket = 'stickers'
        and path like user_id::text || '/%'
        and position('..' in path) = 0
      ) not valid;
  end if;
end $$;

drop policy if exists user_stickers_select_own on public.user_stickers;
create policy user_stickers_select_own on public.user_stickers
  for select to authenticated
  using (auth.uid() = user_id);

-- لا يسمح الإدخال إلا داخل مجلد المستخدم نفسه وفي حاوية stickers.
drop policy if exists user_stickers_insert_own on public.user_stickers;
create policy user_stickers_insert_own on public.user_stickers
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and bucket = 'stickers'
    and path like auth.uid()::text || '/%'
    and position('..' in path) = 0
  );

drop policy if exists user_stickers_update_own on public.user_stickers;
create policy user_stickers_update_own on public.user_stickers
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and bucket = 'stickers'
    and path like auth.uid()::text || '/%'
    and position('..' in path) = 0
  );

drop policy if exists user_stickers_delete_own on public.user_stickers;
create policy user_stickers_delete_own on public.user_stickers
  for delete to authenticated
  using (auth.uid() = user_id);

-- المستخدم لا يعدّل إلا اسم الملصق. تحديث user_id/bucket/path ممنوع أصلاً
-- على مستوى صلاحيات الأعمدة، إضافةً إلى RLS وقيد الجدول أعلاه.
-- نسحب كل الصلاحيات الافتراضية أولاً (بما فيها anon وPUBLIC) ثم نمنح الحد الأدنى.
revoke all on public.user_stickers from public, anon, authenticated;
grant select, insert, delete on public.user_stickers to authenticated;
grant update (name) on public.user_stickers to authenticated;

-- ============================================================================
-- 2) حاوية التخزين الخاصة بملصقات المستخدمين
--    خاصة (public = false): لا يقرأها إلا صاحبها عبر روابط موقّعة.
--    عند إرسال ملصق في محادثة تُنسخ الصورة إلى chat-media ليصل إليها الطرف الآخر.
-- ============================================================================
do $$
declare
  v_bucket record;
begin
  select
    b.id,
    b.public as is_public,
    b.file_size_limit,
    b.allowed_mime_types
  into v_bucket
  from storage.buckets b
  where b.id = 'stickers';

  if found then
    if v_bucket.is_public is distinct from false then
      raise exception
        'STICKERS_BUCKET_PUBLIC_CONFLICT: الحاوية stickers موجودة كعامة. راجعها يدوياً قبل التنفيذ، ثم أعد المحاولة.';
    end if;

    if v_bucket.file_size_limit is distinct from 3145728
       or v_bucket.allowed_mime_types is null
       or not (
         v_bucket.allowed_mime_types @>
           array['image/png', 'image/jpeg', 'image/webp']::text[]
         and v_bucket.allowed_mime_types <@
           array['image/png', 'image/jpeg', 'image/webp']::text[]
       ) then
      raise exception
        'STICKERS_BUCKET_SETTINGS_CONFLICT: الحاوية stickers موجودة بإعدادات مختلفة (public=%, size=%, mime=%). عدّلها يدوياً إلى public=false وsize=3145728 وأنواع PNG/JPEG/WebP فقط، ثم أعد المحاولة. لم تُعدّل الحاوية تلقائياً.',
        v_bucket.is_public,
        v_bucket.file_size_limit,
        v_bucket.allowed_mime_types;
    end if;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stickers',
  'stickers',
  false,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "stickers_read_own" on storage.objects;
create policy "stickers_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and position('..' in name) = 0
  );

drop policy if exists "stickers_insert_own" on storage.objects;
create policy "stickers_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and position('..' in name) = 0
  );

drop policy if exists "stickers_update_own" on storage.objects;
create policy "stickers_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and position('..' in name) = 0
  );

drop policy if exists "stickers_delete_own" on storage.objects;
create policy "stickers_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
    and position('..' in name) = 0
  );

-- ============================================================================
-- 3) دالة المعاينة improved – دعم الملصقات في قائمة المحادثات
-- ============================================================================
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview text;
begin
  v_preview := case
    when new.deleted_at is not null then ''
    when new.metadata @> '{"sticker": true}'::jsonb then '🎨 ملصق'
    when new.type = 'text' then left(coalesce(new.body, ''), 140)
    when new.type = 'image' then '📷 صورة'
    when new.type = 'video' then '🎬 فيديو'
    when new.type = 'audio' then '🎤 رسالة صوتية'
    when new.type = 'file' then '📎 ملف'
    else left(coalesce(new.body, ''), 140)
  end;

  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = v_preview,
         last_message_sender = new.sender_id,
         updated_at = now()
   where id = new.conversation_id;

  update public.conversation_members
     set unread_count = unread_count + 1
   where conversation_id = new.conversation_id
     and user_id <> coalesce(new.sender_id, user_id)
     and user_id <> auth.uid();

  return new;
end;
$$;

-- 5.1) إصلاح معاينات المحادثات التي كانت آخر Message فيها ملصقاً قبل التحديث.
--      يقتصر علىآخر رسالة فعلية، ويحدّث last_message_preview فقط.
--      ملاحظة: جداول conversations_touch قد تحديث updated_at العام،
--      لكن last_message_at وآخر مرسل وعدّاد غير المقروء لا تتغيّر.
update public.conversations c
   set last_message_preview = '🎨 ملصق'
 where c.last_message_preview is distinct from '🎨 ملصق'
   and exists (
     select 1
     from public.messages m
     where m.id = (
       select m2.id
       from public.messages m2
       where m2.conversation_id = c.id
       order by m2.created_at desc
       limit 1
     )
     and m.deleted_at is null
     and m.metadata @> '{"sticker": true}'::jsonb
   );

-- ============================================================================
-- 4) صلاحيات دالة الملف العام (get_user_public_profile)
--    لا نغيّر تعريفها هنا. التعريف الحالي في schema.sql يعيد حقولاً عامة فقط
--    ويطبّق خصوصية الصورة/آخر ظهور/الحالة. نمنع anon وPUBLIC صراحةً، ونبقي
--    authenticated للواجهة وservice_role لخدمة الإشعارات.
-- ============================================================================
revoke all on function public.get_user_public_profile(uuid) from public, anon;
grant execute on function public.get_user_public_profile(uuid) to authenticated, service_role;

-- ============================================================================
-- 5) تحقق سريع بعد التطبيق (قراءة فقط، للأغراض التفقّضية)
-- ============================================================================
-- select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'stickers';

-- select id, user_id, bucket, path
--   from public.user_stickers
--  where bucket <> 'stickers'
--    or path not like user_id::text || '/%'
--    or position('..' in path) > 0
--  limit 50;

-- select pg_get_functiondef('public.handle_new_message()'::regprocedure);

commit;