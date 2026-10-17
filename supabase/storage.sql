-- ============================================================================
-- Wasel Chat | واصل شات
-- إعداد التخزين الآمن (Supabase Storage) + سياسات الوصول
-- شغّل هذا الملف بعد schema.sql و policies.sql
-- ============================================================================

-- ============================================================================
-- 1) إنشاء الحاويات (Buckets)
--    avatars      : صور الملف الشخصي  (عامة القراءة)
--    chat-media   : الصور/الفيديو/الصوت/الملفات داخل المحادثات (خاصة)
--    status-media : وسائط الحالات (خاصة، تُقرأ بروابط موقّعة)
--    group-avatars: صور المجموعات (عامة القراءة)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880,
    array['image/png','image/jpeg','image/webp','image/gif']),
  ('group-avatars', 'group-avatars', true, 5242880,
    array['image/png','image/jpeg','image/webp','image/gif']),
  ('chat-media', 'chat-media', false, 26214400,
    array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime',
          'audio/mpeg','audio/ogg','audio/webm','audio/wav','audio/mp4',
          'application/pdf','application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain','text/csv','application/zip','application/x-zip-compressed']),
  ('status-media', 'status-media', false, 26214400,
    array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================================
-- 2) سياسات storage.objects
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 avatars : كل مستخدم يتحكم بمجلده فقط (المجلد = معرّف المستخدم)
-- ---------------------------------------------------------------------------
drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 2.2 group-avatars : أي عضو يمكنه الرفع، والمشرف فقط يحذف/يعدّل
--     المسار بالشكل: {conversation_id}/{file}
-- ---------------------------------------------------------------------------
drop policy if exists "group_avatars_read" on storage.objects;
create policy "group_avatars_read" on storage.objects
  for select to public
  using (bucket_id = 'group-avatars');

drop policy if exists "group_avatars_insert" on storage.objects;
create policy "group_avatars_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-avatars'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "group_avatars_update" on storage.objects;
create policy "group_avatars_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'group-avatars'
    and public.is_conversation_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "group_avatars_delete" on storage.objects;
create policy "group_avatars_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-avatars'
    and public.is_conversation_admin(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- 2.3 chat-media : المسار بالشكل {conversation_id}/{file}
--     القراءة والكتابة لأعضاء المحادثة فقط — لا يمكن لأي مستخدم آخر الوصول للملف
-- ---------------------------------------------------------------------------
drop policy if exists "chat_media_read" on storage.objects;
create policy "chat_media_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "chat_media_insert" on storage.objects;
create policy "chat_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.can_send_in_conversation(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "chat_media_update_own" on storage.objects;
create policy "chat_media_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'chat-media'
    and owner = auth.uid()
  );

drop policy if exists "chat_media_delete_own" on storage.objects;
create policy "chat_media_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (owner = auth.uid() or public.is_conversation_admin(((storage.foldername(name))[1])::uuid))
  );

-- ---------------------------------------------------------------------------
-- 2.4 status-media : المسار بالشكل {user_id}/{file}
-- ---------------------------------------------------------------------------
drop policy if exists "status_media_read" on storage.objects;
create policy "status_media_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'status-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.statuses s
        where s.media_bucket = 'status-media'
          and s.media_path = name
          and public.can_view_status(s, auth.uid())
      )
    )
  );

drop policy if exists "status_media_insert_own" on storage.objects;
create policy "status_media_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'status-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "status_media_delete_own" on storage.objects;
create policy "status_media_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'status-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 3) تنظيف دوري للحالات المنتهية (اختياري عبر pg_cron)
-- ============================================================================
-- create extension if not exists pg_cron;
-- select cron.schedule('wasel-delete-expired-statuses', '0 * * * *',
--   $$select public.delete_expired_statuses();$$);
