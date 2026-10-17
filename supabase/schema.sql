-- ============================================================================
-- Wasel Chat | واصل شات
-- ملف تجهيز قاعدة البيانات (Schema)
-- شغّل هذا الملف أولاً في: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1) الجداول
-- ============================================================================

-- 1.1 الملفات الشخصية (البيانات الخاصة — لا يقرأها إلا صاحبها أو المدير)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  role text not null default 'user' check (role in ('user','admin')),
  language text not null default 'ar' check (language in ('ar','en')),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  privacy jsonb not null default jsonb_build_object(
    'last_seen', 'everyone',
    'profile_photo', 'everyone',
    'status', 'everyone',
    'read_receipts', true,
    'who_can_message', 'everyone'
  ),
  notification_settings jsonb not null default jsonb_build_object(
    'sounds', true,
    'browser', true,
    'preview', true,
    'reactions', true
  ),
  onboarded boolean not null default false,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.2 البيانات العامة (اسم العرض والصورة وآخر ظهور) — يُفلتر ظهور الصورة/آخر ظهور حسب الخصوصية
create table if not exists public.profiles_public (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'مستخدم',
  username text,
  about text not null default '',
  avatar_url text,
  presence text not null default 'offline' check (presence in ('online','away','offline')),
  last_seen timestamptz,
  status_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_public_username_key
  on public.profiles_public (lower(username))
  where username is not null;

create index if not exists profiles_public_display_name_idx
  on public.profiles_public (lower(display_name));

-- 1.3 المحادثات
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','group')),
  title text,
  avatar_url text,
  created_by uuid references auth.users(id) on delete set null,
  direct_key text unique,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_message_sender uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc);

-- 1.4 أعضاء المحادثات (مصدر الحقيقة الوحيد للعضوية: الفردية والجماعية)
create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  muted boolean not null default false,
  pinned boolean not null default false,
  archived boolean not null default false,
  can_send boolean not null default true,
  can_add_members boolean not null default true,
  last_read_at timestamptz not null default now(),
  cleared_at timestamptz,
  unread_count integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id, archived, pinned);
create index if not exists conversation_members_conversation_idx
  on public.conversation_members (conversation_id);

-- 1.5 الرسائل
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  type text not null default 'text' check (type in ('text','image','video','audio','file','system')),
  body text,
  reply_to uuid references public.messages(id) on delete set null,
  forwarded_from uuid references public.messages(id) on delete set null,
  status text not null default 'sent' check (status in ('sent','delivered','read')),
  metadata jsonb not null default '{}'::jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists messages_body_search_idx
  on public.messages using gin (to_tsvector('simple', coalesce(body, '')));

-- 1.6 إيصالات التسليم والقراءة
create table if not exists public.message_receipts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'delivered' check (status in ('delivered','read')),
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  unique (message_id, user_id)
);

create index if not exists message_receipts_message_idx on public.message_receipts (message_id);
create index if not exists message_receipts_user_idx on public.message_receipts (user_id, status);

-- 1.7 التفاعلات على الرسائل (الردود التفاعلية)
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

-- 1.8 المرفقات
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null default 'chat-media',
  path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

create index if not exists attachments_message_idx on public.attachments (message_id);
create index if not exists attachments_conversation_idx on public.attachments (conversation_id);

-- 1.9 جهات الاتصال
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now(),
  unique (owner_id, contact_user_id),
  check (owner_id <> contact_user_id)
);

-- 1.10 المجموعات (بيانات إضافية للمحادثات الجماعية)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations(id) on delete cascade,
  name text not null,
  description text not null default '',
  avatar_url text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  settings jsonb not null default jsonb_build_object(
    'members_can_send', true,
    'members_can_add', true,
    'approval_required', false
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- عرض group_members: أسماء الأعضاء والأدوار (مصدره conversation_members لتفادي تكرار البيانات)
drop view if exists public.group_members;
create view public.group_members
with (security_invoker = true)
as
select
  m.id,
  g.id            as group_id,
  g.conversation_id,
  m.user_id,
  m.role,
  m.can_send,
  m.can_add_members,
  m.joined_at
from public.conversation_members m
join public.groups g on g.conversation_id = m.conversation_id;

-- 1.11 الحالات
create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'text' check (type in ('text','image','video')),
  content text,
  background text,
  media_path text,
  media_bucket text,
  caption text,
  audience text not null default 'contacts' check (audience in ('everyone','contacts','selected','except')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create index if not exists statuses_user_created_idx on public.statuses (user_id, created_at desc);
create index if not exists statuses_expires_idx on public.statuses (expires_at);

create table if not exists public.status_views (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.statuses(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (status_id, viewer_id)
);

create table if not exists public.status_audience (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.statuses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unique (status_id, user_id)
);

-- 1.12 المكالمات
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'audio' check (type in ('audio','video')),
  status text not null default 'ringing' check (status in ('ringing','answered','declined','missed','ended','failed')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  check (caller_id <> callee_id)
);

create index if not exists calls_caller_idx on public.calls (caller_id, started_at desc);
create index if not exists calls_callee_idx on public.calls (callee_id, started_at desc);

-- 1.13 الإشعارات
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null default 'message' check (type in ('message','call','status','group','system','report')),
  title text,
  body text,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- 1.14 البلاغات
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

-- 1.15 الحظر
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- 1.16 اشتراكات Web Push
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 1.17 إعدادات الخدمة (لوحة الإدارة)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.app_settings (key, value)
values
  ('platform', jsonb_build_object(
    'registration_open', true,
    'max_upload_mb', 25,
    'calls_enabled', true,
    'statuses_enabled', true,
    'maintenance_mode', false
  ))
on conflict (key) do nothing;

-- ============================================================================
-- 2) الدوال المساعدة (تُستخدم في سياسات الأمان RLS)
-- ============================================================================

-- هل المستخدم الحالي مدير عام للمنصة؟
create or replace function public.is_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.role = 'admin'
  );
$$;

-- هل المستخدم عضو في المحادثة؟
create or replace function public.is_conversation_member(p_conversation uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id = p_user
  );
$$;

-- هل المستخدم مشرف/مالك المحادثة؟
create or replace function public.is_conversation_admin(p_conversation uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation
      and m.user_id = p_user
      and m.role in ('owner','admin')
  );
$$;

-- هل يمكن للمستخدم الإرسال في المحادثة؟ (يحترم صلاحيات المجموعة + الحظر)
create or replace function public.can_send_in_conversation(p_conversation uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conversation
      and m.user_id = p_user
      and (c.type = 'direct' or m.can_send = true)
  );
$$;

-- هل المستخدم محظور من قِبل الطرف الآخر؟ (يُستخدم لمنع المحادثة والاتصال)
create or replace function public.is_blocked_between(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_user_a and b.blocked_id = p_user_b)
       or (b.blocker_id = p_user_b and b.blocked_id = p_user_a)
  );
$$;

-- هل المستخدم من جهات الاتصال؟
create or replace function public.is_contact_of(p_owner uuid, p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.contacts c
    where c.owner_id = p_owner and c.contact_user_id = p_contact
  );
$$;

-- ============================================================================
-- 3) الدوال المنطقية (Triggers / RPC)
-- ============================================================================

-- 3.1 تحديث updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_public_touch on public.profiles_public;
create trigger trg_profiles_public_touch before update on public.profiles_public
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_conversations_touch on public.conversations;
create trigger trg_conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_groups_touch on public.groups;
create trigger trg_groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();

-- 3.2 إنشاء الملف الشخصي تلقائياً عند تسجيل مستخدم جديد
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_username text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  v_username := nullif(trim(lower(new.raw_user_meta_data->>'username')), '');

  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.profiles_public (id, display_name, username)
  values (new.id, v_name, v_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3.3 بعد إرسال رسالة: تحديث آخر رسالة + عدّاد غير المقروء
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

drop trigger if exists trg_new_message on public.messages;
create trigger trg_new_message after insert on public.messages
  for each row execute function public.handle_new_message();

-- 3.4 بعد تعديل/حذف رسالة: تحديث معاينة آخر رسالة
create or replace function public.handle_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.conversations
       set last_message_preview = case
             when id = new.conversation_id and last_message_sender = new.sender_id then '🚫 رسالة محذوفة'
             else last_message_preview
           end
     where id = new.conversation_id
       and last_message_at <= new.created_at + interval '1 second';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_message_update on public.messages;
create trigger trg_message_update after update on public.messages
  for each row execute function public.handle_message_update();

-- 3.5 إشعار تلقائي عند وصول رسالة جديدة (يُنشأ داخل الخادم)
create or replace function public.handle_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select coalesce(p.display_name, 'مستخدم') into v_name
  from public.profiles_public p where p.id = new.sender_id;

  insert into public.notifications (user_id, actor_id, type, title, body, conversation_id, message_id)
  select m.user_id,
         new.sender_id,
         'message',
         coalesce(v_name, 'رسالة جديدة'),
         case
           when new.type = 'text' then left(coalesce(new.body, ''), 120)
           when new.type = 'image' then '📷 صورة'
           when new.type = 'video' then '🎬 فيديو'
           when new.type = 'audio' then '🎤 رسالة صوتية'
           when new.type = 'file' then '📎 ملف'
           else 'رسالة جديدة'
         end,
         new.conversation_id,
         new.id
  from public.conversation_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> coalesce(new.sender_id, m.user_id);

  return new;
end;
$$;

drop trigger if exists trg_message_notification on public.messages;
create trigger trg_message_notification after insert on public.messages
  for each row execute function public.handle_message_notification();

-- 3.6 حذف الحالات المنتهية (يمكن جدولتها عبر pg_cron، وتُفلتر أيضاً عند القراءة)
create or replace function public.delete_expired_statuses()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.statuses where expires_at < now();
$$;

-- 3.7 بدء محادثة فردية (تتحقق من الحظر وتعيد المحادثة القائمة إن وُجدت)
create or replace function public.start_direct_conversation(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_other is null or p_other = v_me then
    raise exception 'INVALID_PARTICIPANT';
  end if;
  if public.is_blocked_between(v_me, p_other) then
    raise exception 'BLOCKED';
  end if;

  v_key := least(v_me::text, p_other::text) || ':' || greatest(v_me::text, p_other::text);

  select id into v_id from public.conversations where direct_key = v_key;

  if v_id is null then
    insert into public.conversations (type, created_by, direct_key)
    values ('direct', v_me, v_key)
    returning id into v_id;

    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_id, v_me, 'member'), (v_id, p_other, 'member')
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;

-- 3.8 إنشاء مجموعة
create or replace function public.create_group_conversation(
  p_name text,
  p_members uuid[],
  p_description text default '',
  p_avatar_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conv uuid;
  v_member uuid;
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'GROUP_NAME_REQUIRED';
  end if;

  insert into public.conversations (type, title, avatar_url, created_by)
  values ('group', trim(p_name), p_avatar_url, v_me)
  returning id into v_conv;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conv, v_me, 'owner')
  on conflict do nothing;

  foreach v_member in array coalesce(p_members, array[]::uuid[])
  loop
    if v_member <> v_me and not public.is_blocked_between(v_me, v_member) then
      insert into public.conversation_members (conversation_id, user_id, role)
      values (v_conv, v_member, 'member')
      on conflict do nothing;
    end if;
  end loop;

  insert into public.groups (conversation_id, name, description, avatar_url, owner_id)
  values (v_conv, trim(p_name), coalesce(p_description, ''), p_avatar_url, v_me);

  return v_conv;
end;
$$;

-- 3.9 إضافة عضو إلى مجموعة (يحترم الصلاحيات والحظر)
create or replace function public.add_group_member(p_conversation uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where conversation_id = p_conversation;
  if v_group.id is null then
    raise exception 'NOT_A_GROUP';
  end if;

  if not public.is_conversation_admin(p_conversation, v_me) then
    if not (v_group.settings->>'members_can_add')::boolean then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;

  if public.is_blocked_between(v_me, p_user) then
    raise exception 'BLOCKED';
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (p_conversation, p_user, 'member')
  on conflict do nothing;

  insert into public.notifications (user_id, actor_id, type, title, body, conversation_id)
  values (p_user, v_me, 'group', 'مجموعة جديدة', 'تمت إضافتك إلى مجموعة: ' || v_group.name, p_conversation);
end;
$$;

-- 3.10 مغادرة مجموعة (مع نقل الملكية إن لزم)
create or replace function public.leave_group(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_next uuid;
  v_left integer;
begin
  if not public.is_conversation_member(p_conversation, v_me) then
    raise exception 'NOT_A_MEMBER';
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation and user_id = v_me;

  select count(*) into v_left from public.conversation_members where conversation_id = p_conversation;

  if v_left = 0 then
    delete from public.conversations where id = p_conversation;
  else
    if not exists (
      select 1 from public.conversation_members
      where conversation_id = p_conversation and role in ('owner','admin')
    ) then
      select user_id into v_next
      from public.conversation_members
      where conversation_id = p_conversation
      order by joined_at
      limit 1;

      update public.conversation_members set role = 'owner'
      where conversation_id = p_conversation and user_id = v_next;
    end if;
  end if;
end;
$$;

-- دالة مساعدة: هل بين المستخدمين محادثة قائمة؟ (لأجل خصوصية الصورة)
create or replace function public.is_conversation_member_any(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members a
    join public.conversation_members b on b.conversation_id = a.conversation_id
    where a.user_id = p_user_a and b.user_id = p_user_b
  );
$$;

-- 3.11 جلب الملف العام مع تطبيق سياسات الخصوصية في الخادم
create or replace function public.get_user_public_profile(p_user uuid)
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
  v_privacy jsonb;
  v_is_self boolean;
  v_is_contact boolean;
begin
  v_is_self := (v_me = p_user);

  select p.privacy into v_privacy from public.profiles p where p.id = p_user;
  v_privacy := coalesce(v_privacy, jsonb_build_object('last_seen','everyone','profile_photo','everyone','status','everyone'));

  v_is_contact := case when v_me is null then false else public.is_contact_of(p_user, v_me) end;

  return query
  select
    pp.id,
    pp.display_name,
    pp.username,
    pp.about,
    case
      when v_is_self then pp.avatar_url
      when coalesce(v_privacy->>'profile_photo', 'everyone') = 'everyone' then pp.avatar_url
      when coalesce(v_privacy->>'profile_photo', 'everyone') = 'contacts' and v_is_contact then pp.avatar_url
      when public.is_conversation_member_any(p_user, v_me) then pp.avatar_url
      else null
    end as avatar_url,
    pp.presence,
    case
      when v_is_self then pp.last_seen
      when coalesce(v_privacy->>'last_seen', 'everyone') = 'everyone' then pp.last_seen
      when coalesce(v_privacy->>'last_seen', 'everyone') = 'contacts' and v_is_contact then pp.last_seen
      else null
    end as last_seen,
    case
      when v_is_self then pp.status_text
      when coalesce(v_privacy->>'status', 'everyone') = 'everyone' then pp.status_text
      when coalesce(v_privacy->>'status', 'everyone') = 'contacts' and v_is_contact then pp.status_text
      else null
    end as status_text
  from public.profiles_public pp
  where pp.id = p_user;
end;
$$;

-- 3.12 تعليم الرسائل كمقروءة (تحديث جماعي + إعادة تعيين العدّاد)
create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.conversation_members
     set last_read_at = now(), unread_count = 0
   where conversation_id = p_conversation and user_id = v_me;

  insert into public.message_receipts (message_id, user_id, status, read_at)
  select m.id, v_me, 'read', now()
  from public.messages m
  where m.conversation_id = p_conversation
    and m.sender_id <> v_me
    and m.created_at <= now()
  on conflict (message_id, user_id)
    do update set status = 'read', read_at = coalesce(public.message_receipts.read_at, now());

  update public.messages
     set status = 'read'
   where conversation_id = p_conversation
     and sender_id <> v_me
     and status <> 'read';
end;
$$;

-- 3.13 إحصاءات لوحة الإدارة
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_online', (select count(*) from public.profiles_public where presence = 'online'),
    'users_suspended', (select count(*) from public.profiles where is_suspended),
    'admins', (select count(*) from public.profiles where role = 'admin'),
    'conversations_total', (select count(*) from public.conversations),
    'groups_total', (select count(*) from public.conversations where type = 'group'),
    'messages_total', (select count(*) from public.messages where deleted_at is null),
    'messages_24h', (select count(*) from public.messages where created_at > now() - interval '24 hours'),
    'statuses_active', (select count(*) from public.statuses where expires_at > now()),
    'calls_total', (select count(*) from public.calls),
    'calls_24h', (select count(*) from public.calls where started_at > now() - interval '24 hours'),
    'reports_open', (select count(*) from public.reports where status in ('open','reviewing')),
    'attachments_total', (select count(*) from public.attachments),
    'storage_bytes', (select coalesce(sum(size_bytes), 0) from public.attachments),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days')
  ) into v_result;

  return v_result;
end;
$$;

-- 3.14 البحث عن مستخدم بالبريد الإلكتروني (مطابقة تامة فقط، لبدء محادثة)
create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, display_name text, username text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select pp.id, pp.display_name, pp.username, pp.avatar_url
  from auth.users u
  join public.profiles_public pp on pp.id = u.id
  where lower(u.email) = lower(trim(p_email))
    and u.id <> auth.uid()
    and not public.is_blocked_between(auth.uid(), u.id)
  limit 1;
$$;

-- 3.15 حذف بيانات حسابي (يُستخدم مع دالة Edge Function لحذف مستخدم المصادقة نهائياً)
create or replace function public.delete_my_account_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  delete from public.statuses where user_id = v_me;
  delete from public.message_receipts where user_id = v_me;
  delete from public.message_reactions where user_id = v_me;
  delete from public.push_subscriptions where user_id = v_me;
  delete from public.notifications where user_id = v_me or actor_id = v_me;
  delete from public.contacts where owner_id = v_me or contact_user_id = v_me;
  delete from public.user_blocks where blocker_id = v_me or blocked_id = v_me;
  delete from public.attachments where uploader_id = v_me;
  delete from public.conversation_members where user_id = v_me;

  -- إخفاء هوية الرسائل للحفاظ على تاريخ المحادثات الأخرى دون كشف بيانات الحساب المحذوف
  update public.messages
     set sender_id = null,
         body = case when type = 'text' then null else body end
   where sender_id = v_me;

  delete from public.profiles_public where id = v_me;
  update public.profiles
     set email = null, phone = null, is_suspended = true, onboarded = false
   where id = v_me;
end;
$$;

-- ============================================================================
-- 4) تفعيل Realtime للجداول المطلوبة
-- ============================================================================
do $$
declare
  t text;
  tables text[] := array[
    'public.conversations',
    'public.conversation_members',
    'public.messages',
    'public.message_receipts',
    'public.message_reactions',
    'public.profiles_public',
    'public.statuses',
    'public.status_views',
    'public.calls',
    'public.notifications',
    'public.groups'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table %s', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

-- تحسين: إرسال القيم القديمة في تحديثات Realtime (لازم لبعض الواجهات)
alter table public.messages replica identity full;
alter table public.conversation_members replica identity full;
alter table public.calls replica identity full;
