-- ============================================================================
-- Wasel Chat | ترقية الحالات (أكتوبر 2026)
-- ----------------------------------------------------------------------------
-- نفّذ هذا الملف مرة واحدة في Supabase → SQL Editor بعد schema.sql و
-- policies.sql و storage.sql. لا يحذف أي حالة أو وسائط، ويكتفي بتشديد
-- الخصوصية والتحقق من الحاوية.
--
-- ما يضيفه:
--   1) منع ظهور حالة «الجميع ما عدا...» قبل حفظ قائمة الاستثناءات.
--   2) التحقق من أن حالات الصور/الفيديو لها ملف خاص داخل مجلد صاحبها.
--   3) منع تمديد صلاحية الحالة لأكثر من 24 ساعة عبر API.
--   4) فهرس لعرض الحالات التي شاهدها المستخدم.
--   5) تأكيد أن حاوية status-media خاصة وإعادة سياساتها الآمنة.
--
-- كل الأوامر داخل معاملة واحدة. أي خطأ يوقف كل التغييرات.
-- ============================================================================

begin;

-- ============================================================================
-- 1) حاوية الحالات: ننشئها خاصة إن لم تكن موجودة، ولا نغيّر إعداداتها إن
--    كانت موجودة. إذا كانت عامة نتوقف لأن ذلك يكشف وسائط الحالات.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'status-media',
  'status-media',
  false,
  26214400,
  array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do nothing;

do $$
declare
  v_bucket record;
begin
  select b.id, b.public as is_public, b.file_size_limit, b.allowed_mime_types
    into v_bucket
  from storage.buckets b
  where b.id = 'status-media';

  if v_bucket.id is null then
    raise exception 'status-media bucket was not created';
  end if;

  if v_bucket.is_public is distinct from false then
    raise exception 'status-media bucket must be private before applying status upgrade';
  end if;

  if v_bucket.file_size_limit is distinct from 26214400 then
    raise warning 'status-media file_size_limit is %, expected 26214400', v_bucket.file_size_limit;
  end if;

  if v_bucket.allowed_mime_types is null or not (
    'image/jpeg' = any(v_bucket.allowed_mime_types)
    and 'image/png' = any(v_bucket.allowed_mime_types)
    and 'image/webp' = any(v_bucket.allowed_mime_types)
    and 'video/mp4' = any(v_bucket.allowed_mime_types)
    and 'video/webm' = any(v_bucket.allowed_mime_types)
  ) then
    raise warning 'status-media allowed_mime_types (%) may reject some status media', v_bucket.allowed_mime_types;
  end if;
end;
$$;

-- سياسات الملفات: المسار {user_id}/{file}، والقراءة فقط لمن يستطيع رؤية الحالة.
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
-- 2) دالة الرؤية: «except» لا تظهر إلا بعد وجود استثناءات محفوظة
-- ============================================================================
create or replace function public.can_view_status(p_status public.statuses, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_privacy jsonb;
  v_is_contact boolean;
  v_selected boolean;
begin
  if p_viewer is null then
    return false;
  end if;
  if p_status.user_id = p_viewer or public.is_admin() then
    return true;
  end if;
  if p_status.expires_at < now() then
    return false;
  end if;
  if public.is_blocked_between(p_status.user_id, p_viewer) then
    return false;
  end if;

  select p.privacy into v_privacy from public.profiles p where p.id = p_status.user_id;
  v_privacy := coalesce(v_privacy, jsonb_build_object('status','everyone'));

  if coalesce(v_privacy->>'status', 'everyone') = 'nobody' then
    return false;
  end if;

  v_is_contact := public.is_contact_of(p_status.user_id, p_viewer);
  v_selected := exists (
    select 1 from public.status_audience a
    where a.status_id = p_status.id and a.user_id = p_viewer
  );

  case p_status.audience
    when 'everyone' then
      return coalesce(v_privacy->>'status','everyone') = 'everyone' or v_is_contact;
    when 'contacts' then
      return v_is_contact;
    when 'selected' then
      return v_selected;
    when 'except' then
      -- لا نعتبر «الجميع ما عدا...» صالحة قبل حفظ قائمة الاستثناءات،
      -- وإلا ظهرت الحالة لجهات الاتصال في الفترة بين إنشائها وحفظ القائمة.
      return v_is_contact
        and not v_selected
        and exists (
          select 1 from public.status_audience a
          where a.status_id = p_status.id
        );
    else
      return false;
  end case;
end;
$$;

grant execute on function public.can_view_status(public.statuses, uuid) to authenticated, service_role;

-- ============================================================================
-- 3) سياسات الإدراج والتعديل: تحقق من النوع والمدة والمسار
-- ============================================================================
drop policy if exists statuses_select on public.statuses;
create policy statuses_select on public.statuses
  for select to authenticated
  using (public.can_view_status(statuses, auth.uid()));

drop policy if exists statuses_insert on public.statuses;
create policy statuses_insert on public.statuses
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and expires_at > now()
    and expires_at <= now() + interval '24 hours'
    and (
      (
        type = 'text'
        and content is not null
        and length(btrim(content)) between 1 and 300
        and media_path is null
        and media_bucket is null
      )
      or
      (
        type in ('image','video')
        and content is null
        and media_path is not null
        and media_bucket = 'status-media'
        and media_path like (auth.uid()::text || '/%')
        and (caption is null or length(caption) <= 200)
      )
    )
  );

drop policy if exists statuses_update on public.statuses;
create policy statuses_update on public.statuses
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and expires_at > now()
    and expires_at <= now() + interval '24 hours'
    and (
      (
        type = 'text'
        and content is not null
        and length(btrim(content)) between 1 and 300
        and media_path is null
        and media_bucket is null
      )
      or
      (
        type in ('image','video')
        and content is null
        and media_path is not null
        and media_bucket = 'status-media'
        and media_path like (auth.uid()::text || '/%')
        and (caption is null or length(caption) <= 200)
      )
    )
  );

drop policy if exists statuses_delete on public.statuses;
create policy statuses_delete on public.statuses
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create index if not exists status_views_viewer_idx on public.status_views (viewer_id, status_id);

notify pgrst, 'reload schema';

commit;
