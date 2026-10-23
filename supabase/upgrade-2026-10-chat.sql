-- ============================================================================
-- Wasel Chat | واصل شات
-- تحديث ترقية: الملصقات الشخصية + البحث برقم الهاتف
-- ----------------------------------------------------------------------------
-- طريقة التطبيق:
--   1) افتح لوحة Supabase → SQL Editor.
--   2) الصق محتوى هذا الملف كاملاً واضغط Run.
--   3) الملف آمن للتشغيل أكثر من مرة (idempotent) ولا يحذف أي بيانات موجودة.
--
-- ملاحظة: لم نعدّل أي جدول قائم ولا أي سياسة قائمة؛ كل ما هنا إضافات جديدة.
-- ============================================================================

-- ============================================================================
-- 1) جدول ملصقات المستخدم (مكتبة «ملصقاتي»)
--    الصور تُرفع إلى حاوية خاصة باسم stickers، والمسار يبدأ بمعرّف المستخدم.
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

drop policy if exists user_stickers_select_own on public.user_stickers;
create policy user_stickers_select_own on public.user_stickers
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_stickers_insert_own on public.user_stickers;
create policy user_stickers_insert_own on public.user_stickers
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_stickers_update_own on public.user_stickers;
create policy user_stickers_update_own on public.user_stickers
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_stickers_delete_own on public.user_stickers;
create policy user_stickers_delete_own on public.user_stickers
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_stickers to authenticated;

-- ============================================================================
-- 2) حاوية التخزين الخاصة بملصقات المستخدمين
--    خاصة (public = false): لا يقرأها إلا صاحبها عبر روابط موقّعة.
--    عند إرسال ملصق في محادثة تُنسخ الصورة إلى chat-media ليصل إليها الطرف الآخر.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stickers',
  'stickers',
  false,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "stickers_read_own" on storage.objects;
create policy "stickers_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "stickers_insert_own" on storage.objects;
create policy "stickers_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "stickers_update_own" on storage.objects;
create policy "stickers_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "stickers_delete_own" on storage.objects;
create policy "stickers_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'stickers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 3) البحث عن مستخدم برقم الهاتف
--    - يتطلب تسجيل الدخول.
--    - يطبّق سياسات الخصوصية نفسها المستخدمة في get_user_public_profile
--      (لا يعرض صورة/آخر ظهور/حالة إلا وفق إعدادات صاحب الحساب).
--    - لا يعيد إلا البيانات العامة، ولا يعيد أرقام الهواتف نفسها.
--    - يقبل: +249 91 234 5678 / 0912345678 / 912345678 / 00249912345678
--    - يدعم البحث الجزئي الآمن عندما يكتب المستخدم 7 أرقام أو أكثر.
-- ============================================================================
create or replace function public.search_user_by_phone(p_query text)
returns table (
  id uuid,
  display_name text,
  username text,
  about text,
  avatar_url text,
  presence text,
  last_seen timestamptz,
  status_text text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_digits text;
  v_forms text[];
  v_tail text;
begin
  if v_me is null then
    return;
  end if;

  -- أرقام فقط (يزيل + والمسافات والشرطات والأقواس)
  v_digits := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
  if length(v_digits) < 7 then
    return;
  end if;

  -- الصيغ الممكنة لرقم سوداني أو دولي
  v_forms := array[v_digits];
  if v_digits like '249%' then
    v_forms := v_forms || substr(v_digits, 4);
  elsif v_digits like '0%' then
    v_forms := v_forms || ('249' || ltrim(v_digits, '0'));
  else
    v_forms := v_forms || ('249' || v_digits);
  end if;

  -- آخر 7 إلى 9 أرقام (لمطابقة الأرقام المحلية دون رمز الدولة)
  v_tail := right(v_digits, 9);
  if length(v_tail) < 7 then
    v_tail := v_digits;
  end if;

  return query
  select g.id, g.display_name, g.username, g.about, g.avatar_url, g.presence, g.last_seen, g.status_text
  from (
    select p.id
    from public.profiles p
    where p.id <> v_me
      and p.phone is not null
      and length(regexp_replace(p.phone, '\D', '', 'g')) >= 7
      and (
        regexp_replace(p.phone, '\D', '', 'g') = any(v_forms)
        or right(regexp_replace(p.phone, '\D', '', 'g'), 9) = v_tail
      )
      and not public.is_blocked_between(v_me, p.id)
    order by
      case
        when regexp_replace(p.phone, '\D', '', 'g') = any(v_forms) then 0
        else 1
      end,
      p.updated_at desc
    limit 10
  ) matched
  cross join lateral public.get_user_public_profile(matched.id) g;
end;
$$;

grant execute on function public.search_user_by_phone(text) to authenticated;

-- ============================================================================
-- 4) (اختياري) معاينة أفضل للرسائل التي تحمل ملصقاً في قائمة المحادثات
--    يستبدل دالة موجودة بنفس المنطق + سطر واحد للملصقات. آمن ولا يغيّر أي بيانات.
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
    when new.metadata->>'sticker' = 'true' then '🎨 ملصق'
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

-- ============================================================================
-- تحقق سريع بعد التطبيق (اختياري): يجب أن يعيد صفاً واحداً لكل عنصر
-- ============================================================================
-- select to_regclass('public.user_stickers') as stickers_table;
-- select id, public from storage.buckets where id = 'stickers';
-- select proname from pg_proc where proname = 'search_user_by_phone';
