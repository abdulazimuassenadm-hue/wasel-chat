-- ============================================================================
-- Wasel Chat | واصل شات
-- تحديث ترقية: الملصقات الشخصية + البحث برقم الهاتف
-- ----------------------------------------------------------------------------
-- طريقة التطبيق:
--   1) راجع استعلامات «التحقق قبل التنفيذ» في نهاية الملف (قراءة فقط).
--   2) افتح لوحة Supabase → SQL Editor.
--   3) الصق محتوى هذا الملف كاملاً واضغط Run.
--   4) الملف آمن للتشغيل أكثر من مرة (idempotent) ولا يحذف أي بيانات موجودة.
--
-- المعاملة والأخطاء:
--   كل الأوامر داخل BEGIN ... COMMIT واحدة. أي خطأ في أي أمر يوقف المعاملة
--   ويلغي كل التغييرات (لا يوجد تنفيذ جزئي). عند ظهور خطأ:
--     - راجع رسالة الخطأ وأصلح السبب.
--     - نفّذ ROLLBACK; إن كان المحرر ما زال داخل معاملة.
--     - أعد تشغيل الملف كاملاً بعد الإصلاح.
--   لا نستخدم EXCEPTION يتجاهل الأخطاء؛ الفحص المسبق فقط يرفع تحذيراً/خطأً
--   واضحاً قبل أي تعديل، ثم تبقى بقية الأوامر محمية بالمعاملة.
-- ============================================================================

begin;

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

-- لا يسمح الإدخال إلا بمسار داخل مجلد المستخدم نفسه وفي حاوية stickers.
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
revoke update on public.user_stickers from authenticated;
grant select, insert, delete on public.user_stickers to authenticated;
grant update (name) on public.user_stickers to authenticated;

-- ============================================================================
-- 2) حاوية التخزين الخاصة بملصقات المستخدمين
--    خاصة (public = false): لا يقرأها إلا صاحبها عبر روابط موقّعة.
--    عند إرسال ملصق في محادثة تُنسخ الصورة إلى chat-media ليصل إليها الطرف الآخر.
--
--    مهم: لا نغيّر إعدادات حاوية موجودة. إذا كانت موجودة نفحصها فقط:
--      - public=true → خطأ يوقف المعاملة (تسريب أمني يجب مراجعته يدوياً).
--      - اختلاف الحجم/الأنواع → تحذير فقط، دون تعديل.
--    الحاوية الجديدة فقط تُنشأ بالإعدادات الآمنة أدناه.
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
       or v_bucket.allowed_mime_types is distinct from
          array['image/png', 'image/jpeg', 'image/webp']::text[] then
      raise warning
        'STICKERS_BUCKET_SETTINGS_DIFFER: الحاوية موجودة بإعدادات مختلفة (public=%, size=%, mime=%) ولم تُعدّل. راجعها قبل الاعتماد على قيود الأنواع/الحجم.',
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
-- 3) البحث عن مستخدم برقم الهاتف
--    - يتطلب تسجيل الدخول، ولا تُمنح الصلاحية لـ anon.
--    - يطبّق سياسات الخصوصية نفسها المستخدمة في get_user_public_profile
--      (لا يعرض صورة/آخر ظهور/حالة إلا وفق إعدادات صاحب الحساب).
--    - لا يعيد إلا البيانات العامة، ولا يعيد أرقام الهواتف نفسها.
--    - يقبل: +249 91 234 5678 / 0912345678 / 912345678 / 00249912345678
--      والأرقام العربية-الهندية (٠١٢٣...) والفارسية (۰۱۲...).
--    - الإدخال الكامل (9 أرقام أو أكثر) يطابق الصيغة الكاملة/الوطنية فقط.
--    - الإدخال الجزئي (7-8 أرقام) يطابق آخر الأرقام فقط، بحد أقصى 10 نتائج.
--    - يستبعد الحساب نفسه، والحسابات الموقوفة، والمحظورة في أي اتجاه.
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
  v_national text;
  v_canonical text;
  v_forms text[];
  v_partial boolean := false;
  v_suffix text := '';
begin
  if v_me is null then
    return;
  end if;

  -- حد بسيط لطول المدخل قبل أي معالجة نصية
  if length(coalesce(p_query, '')) > 64 then
    return;
  end if;

  -- تحويل الأرقام العربية-الهندية والفارسية إلى لاتينية، ثم إزالة كل ما ليس رقماً
  v_digits := regexp_replace(
    translate(
      coalesce(p_query, ''),
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
      '01234567890123456789'
    ),
    '[^0-9]',
    '',
    'g'
  );

  if length(v_digits) < 7 or length(v_digits) > 15 then
    return;
  end if;

  -- 00249... تعني 249...
  if left(v_digits, 2) = '00' then
    v_digits := substr(v_digits, 3);
  end if;

  if length(v_digits) < 7 or length(v_digits) > 15 then
    return;
  end if;

  if length(v_digits) < 9 then
    -- بحث جزئي: 7-8 أرقام فقط، بمطابقة نهاية الرقم.
    -- نزيل الصفر المحلي حتى يطابق «0912345» الرقم المخزّن «249912345678».
    v_suffix := ltrim(v_digits, '0');
    if length(v_suffix) < 7 then
      return;
    end if;
    v_partial := true;
  else
    if left(v_digits, 1) = '0' then
      v_national := ltrim(v_digits, '0');
      if v_national = '' then
        return;
      end if;

      if length(v_national) = 9 and left(v_national, 1) = '9' then
        v_canonical := '249' || v_national;
      elsif length(v_national) between 10 and 15 then
        v_canonical := v_national;
      else
        return;
      end if;
    elsif left(v_digits, 3) = '249' then
      if length(v_digits) < 12 or length(v_digits) > 15 then
        return;
      end if;
      v_national := ltrim(substr(v_digits, 4), '0');
      if length(v_national) = 9 and left(v_national, 1) = '9' then
        v_canonical := '249' || v_national;
      else
        v_canonical := v_digits;
      end if;
    elsif length(v_digits) = 9 and left(v_digits, 1) = '9' then
      v_national := v_digits;
      v_canonical := '249' || v_digits;
    else
      v_national := v_digits;
      v_canonical := v_digits;
    end if;

    -- الصيغ المقبولة للتخزين: الرقم الخام، الصيغة الكاملة، والوطنية،
    -- مع صيغة الصفر المحلي وصيغة 00 الدولية للتوافق مع بيانات قديمة.
    v_forms := array[v_digits, v_canonical];
    if v_national is not null and v_national <> '' then
      v_forms := v_forms || v_national;
      if length(v_national) = 9 and left(v_national, 1) = '9' then
        v_forms := v_forms || ('0' || v_national);
      end if;
    end if;
    v_forms := v_forms || ('00' || v_canonical);

    select array_agg(distinct f)
      into v_forms
      from unnest(v_forms) as u(f);
  end if;

  return query
  select
    g.id,
    g.display_name,
    g.username,
    g.about,
    g.avatar_url,
    g.presence,
    g.last_seen,
    g.status_text
  from (
    select
      p.id,
      p.updated_at,
      regexp_replace(
        translate(
          coalesce(p.phone, ''),
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          '01234567890123456789'
        ),
        '[^0-9]',
        '',
        'g'
      ) as phone_digits
    from public.profiles p
    where p.id <> v_me
      and p.phone is not null
      and not p.is_suspended
      and not public.is_blocked_between(v_me, p.id)
  ) p
  cross join lateral public.get_user_public_profile(p.id) g
  where length(p.phone_digits) between 7 and 15
    and (
      case
        when v_partial then right(p.phone_digits, length(v_suffix)) = v_suffix
        else p.phone_digits = any(v_forms)
      end
    )
  order by
    case
      when not v_partial and p.phone_digits = any(v_forms) then 0
      else 1
    end,
    p.updated_at desc
  limit 10;
end;
$$;

-- صلاحيات صريحة: لا anon ولا PUBLIC. الدالة تتحقق أيضاً من auth.uid() كخط دفاع ثانٍ.
revoke all on function public.search_user_by_phone(text) from public, anon;
grant execute on function public.search_user_by_phone(text) to authenticated;

-- ============================================================================
-- 4) صلاحيات دالة الملف العام get_user_public_profile
--    لا نغيّر تعريفها هنا. التعريف الحالي في schema.sql يعيد حقولاً عامة فقط
--    ويطبّق خصوصية الصورة/آخر ظهور/الحالة. نمنع anon وPUBLIC صراحةً، ونبقي
--    authenticated للواجهة وservice_role لخدمة الإشعارات.
-- ============================================================================
revoke all on function public.get_user_public_profile(uuid) from public, anon;
grant execute on function public.get_user_public_profile(uuid) to authenticated, service_role;

-- ============================================================================
-- 5) معاينة أفضل للرسائل التي تحمل ملصقاً في قائمة المحادثات
--    مقارنة مع التعريف الحالي في schema.sql:
--      - التعريف الحالي لا يحتوي فرع الملصق، ويعرض «📷 صورة» لرسائل الملصقات.
--      - النسخة أدناه مطابقة حرفياً للتعريف الحالي باستثناء إضافة فرع واحد
--        للملصق. لا تغيير في عدّاد غير المقروء أو أي منطق آخر.
--    هذا التغيير ضروري لأن الملصقات تُرسل كرسائل type='image' مع
--    metadata.sticker=true، وبدونه تظهر المعاينة كصورة عادية.
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

-- ============================================================================
-- 6) تحقق سريع بعد التطبيق (اختياري، قراءة فقط)
-- ============================================================================
-- select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'stickers';
--
-- select id, user_id, bucket, path
--   from public.user_stickers
--  where bucket <> 'stickers'
--     or path not like user_id::text || '/%'
--     or position('..' in path) > 0
--  limit 50;
--
-- select
--   has_function_privilege('anon', 'public.search_user_by_phone(text)', 'execute') as anon_can_search,
--   has_function_privilege('authenticated', 'public.search_user_by_phone(text)', 'execute') as auth_can_search,
--   has_function_privilege('anon', 'public.get_user_public_profile(uuid)', 'execute') as anon_can_profile,
--   has_function_privilege('service_role', 'public.get_user_public_profile(uuid)', 'execute') as service_can_profile;
--
-- select pg_get_functiondef('public.handle_new_message()'::regprocedure);

commit;
