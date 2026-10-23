-- ============================================================================
-- Wasel Chat | واصل شات
-- سياسات الوصول (Row Level Security)
-- شغّل هذا الملف بعد schema.sql
-- ============================================================================

-- ============================================================================
-- 1) تفعيل RLS على جميع الجداول الحساسة
-- ============================================================================
alter table public.profiles              enable row level security;
alter table public.profiles_public       enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;
alter table public.message_receipts      enable row level security;
alter table public.message_reactions     enable row level security;
alter table public.attachments           enable row level security;
alter table public.contacts              enable row level security;
alter table public.groups                enable row level security;
alter table public.statuses              enable row level security;
alter table public.status_views          enable row level security;
alter table public.status_audience       enable row level security;
alter table public.calls                 enable row level security;
alter table public.notifications         enable row level security;
alter table public.reports               enable row level security;
alter table public.user_blocks           enable row level security;
alter table public.push_subscriptions    enable row level security;
alter table public.push_deliveries      enable row level security;
alter table public.app_settings          enable row level security;

-- ============================================================================
-- 2) profiles — البيانات الخاصة: صاحب الحساب أو مدير المنصة فقط
-- ============================================================================
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- منع المستخدم من ترقية نفسه إلى مدير: يُفرض ذلك عبر trigger
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  if new.is_suspended is distinct from old.is_suspended and not public.is_admin() then
    new.is_suspended := old.is_suspended;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- ============================================================================
-- 3) profiles_public — مقروء للمستخدمين المسجّلين (ما عدا المحظورين)، والتعديل للمالك
-- ============================================================================
drop policy if exists profiles_public_select on public.profiles_public;
create policy profiles_public_select on public.profiles_public
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or not public.is_blocked_between(auth.uid(), id)
  );

drop policy if exists profiles_public_insert on public.profiles_public;
create policy profiles_public_insert on public.profiles_public
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_public_update on public.profiles_public;
create policy profiles_public_update on public.profiles_public
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================================
-- 4) conversations
-- ============================================================================
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id) or public.is_admin());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using (public.is_conversation_admin(id))
  with check (public.is_conversation_admin(id));

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete to authenticated
  using (public.is_conversation_admin(id) or public.is_admin());

-- ============================================================================
-- 5) conversation_members
-- ============================================================================
drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or user_id = auth.uid() or public.is_admin());

-- إضافة عضو: لا يسمح بها إلا مشرف المحادثة.
-- ملاحظة أمنية: كان الشرط سابقاً يسمح لأي مستخدم بإضافة نفسه (user_id = auth.uid())
-- لتفادي هذا الثقب (انضمام عضو مُزال إلى مجموعة خاصة وإعادة قراءة رسائله) أُزيل،
-- ودوال start_direct_conversation / create_group_conversation / add_group_member
-- تعمل عبر security definer فلا تحتاج هذه السياسة.
drop policy if exists conversation_members_insert on public.conversation_members;
create policy conversation_members_insert on public.conversation_members
  for insert to authenticated
  with check (
    public.is_conversation_admin(conversation_id)
  );

drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members
  for update to authenticated
  using (user_id = auth.uid() or public.is_conversation_admin(conversation_id))
  with check (user_id = auth.uid() or public.is_conversation_admin(conversation_id));

drop policy if exists conversation_members_delete on public.conversation_members;
create policy conversation_members_delete on public.conversation_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_conversation_admin(conversation_id));

-- منع العضو العادي من تعديل دور نفسه أو صلاحياته
create or replace function public.restrict_membership_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.user_id and not public.is_conversation_admin(old.conversation_id) then
    new.role := old.role;
    new.can_send := old.can_send;
    new.can_add_members := old.can_add_members;
    new.conversation_id := old.conversation_id;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_membership_changes on public.conversation_members;
create trigger trg_restrict_membership_changes before update on public.conversation_members
  for each row execute function public.restrict_membership_changes();

-- ============================================================================
-- 6) messages
-- ============================================================================
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or public.is_admin());

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_send_in_conversation(conversation_id)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (
    (sender_id = auth.uid() and deleted_at is null)
    or public.is_conversation_admin(conversation_id)
    or public.is_admin()
  )
  with check (
    (sender_id = auth.uid() and deleted_at is null)
    or public.is_conversation_admin(conversation_id)
    or public.is_admin()
  );

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (sender_id = auth.uid() or public.is_conversation_admin(conversation_id) or public.is_admin());

-- منع تغيير مالك الرسالة أو محادثتها أو تاريخ إنشائها.
-- استثناء واحد: يُسمح بإفراغ المالك (sender_id ← null) لأجل إخفاء الهوية عند حذف
-- الحساب (delete_my_account_data). هذا المسار محمي: سياسة messages_update تمنع أي
-- مستخدم عادي من إفراغ sender_id لأن شرط with check هو (sender_id = auth.uid())،
-- ولا تنفّذه إلا الدوال ذات security definer.
create or replace function public.restrict_message_changes()
returns trigger
language plpgsql
as $$
begin
  if new.sender_id is not null then
    new.sender_id := old.sender_id;
  end if;
  new.conversation_id := old.conversation_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_restrict_message_changes on public.messages;
create trigger trg_restrict_message_changes before update on public.messages
  for each row execute function public.restrict_message_changes();

-- ============================================================================
-- 7) message_receipts — كل مستخدم يتحكم بإيصالاته فقط
-- ============================================================================
drop policy if exists message_receipts_select on public.message_receipts;
create policy message_receipts_select on public.message_receipts
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_conversation_member(m.conversation_id)
    )
    or public.is_admin()
  );

drop policy if exists message_receipts_insert on public.message_receipts;
create policy message_receipts_insert on public.message_receipts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists message_receipts_update on public.message_receipts;
create policy message_receipts_update on public.message_receipts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- 8) message_reactions
-- ============================================================================
drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists message_reactions_update on public.message_reactions;
create policy message_reactions_update on public.message_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- 9) attachments — مرتبطة بعضوية المحادثة
-- ============================================================================
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or public.is_admin());

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (uploader_id = auth.uid() or public.is_conversation_admin(conversation_id));

-- ============================================================================
-- 10) contacts — خاصة بمالكها
-- ============================================================================
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete to authenticated
  using (owner_id = auth.uid());

-- ============================================================================
-- 11) groups
-- ============================================================================
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (public.is_conversation_member(conversation_id) or public.is_admin());

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_conversation_member(conversation_id));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update to authenticated
  using (public.is_conversation_admin(conversation_id))
  with check (public.is_conversation_admin(conversation_id));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- ============================================================================
-- 12) statuses — ظهور الحالة وفق الجمهور المحدد والخصوصية
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

-- ============================================================================
-- 13) status_views
-- ============================================================================
drop policy if exists status_views_select on public.status_views;
create policy status_views_select on public.status_views
  for select to authenticated
  using (
    viewer_id = auth.uid()
    or exists (select 1 from public.statuses s where s.id = status_id and s.user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists status_views_insert on public.status_views;
create policy status_views_insert on public.status_views
  for insert to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.statuses s
      where s.id = status_id and public.can_view_status(s, auth.uid())
    )
  );

-- ============================================================================
-- 14) status_audience — المالك فقط
-- ============================================================================
drop policy if exists status_audience_select on public.status_audience;
create policy status_audience_select on public.status_audience
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.statuses s where s.id = status_id and s.user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists status_audience_insert on public.status_audience;
create policy status_audience_insert on public.status_audience
  for insert to authenticated
  with check (
    exists (select 1 from public.statuses s where s.id = status_id and s.user_id = auth.uid())
  );

drop policy if exists status_audience_delete on public.status_audience;
create policy status_audience_delete on public.status_audience
  for delete to authenticated
  using (
    exists (select 1 from public.statuses s where s.id = status_id and s.user_id = auth.uid())
  );

-- ============================================================================
-- 15) calls
-- ============================================================================
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls
  for select to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid() or public.is_admin());

drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls
  for insert to authenticated
  with check (caller_id = auth.uid() and not public.is_blocked_between(caller_id, callee_id));

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls
  for update to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid())
  with check (caller_id = auth.uid() or callee_id = auth.uid());

-- ============================================================================
-- 16) notifications — يشاهد المستخدم إشعاراته فقط
-- ============================================================================
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (user_id = auth.uid() or actor_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- 17) reports
-- ============================================================================
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- 18) user_blocks
-- ============================================================================
drop policy if exists user_blocks_select on public.user_blocks;
create policy user_blocks_select on public.user_blocks
  for select to authenticated
  using (blocker_id = auth.uid() or public.is_admin());

drop policy if exists user_blocks_insert on public.user_blocks;
create policy user_blocks_insert on public.user_blocks
  for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists user_blocks_delete on public.user_blocks;
create policy user_blocks_delete on public.user_blocks
  for delete to authenticated
  using (blocker_id = auth.uid());

-- ============================================================================
-- 19) push_subscriptions
-- ============================================================================
drop policy if exists push_subscriptions_all on public.push_subscriptions;
create policy push_subscriptions_all on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- 20) app_settings — القراءة للمسجّلين، والكتابة للمدير فقط
-- ============================================================================
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- 21) صلاحيات التنفيذ للدوال
-- ============================================================================
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[], text, text) to authenticated;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_user_public_profile(uuid) to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.delete_expired_statuses() to authenticated;
grant execute on function public.find_user_by_email(text) to authenticated;
grant execute on function public.delete_my_account_data() to authenticated;

-- profiles: الصفوف مقيّدة بـ RLS (صاحب الحساب أو المدير فقط)، لذا لا خطر من منح الجدول
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles_public to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update on public.message_receipts to authenticated;
grant select, insert, update, delete on public.message_reactions to authenticated;
grant select, insert, delete on public.attachments to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select on public.group_members to authenticated;
grant select, insert, update, delete on public.statuses to authenticated;
grant select, insert on public.status_views to authenticated;
grant select, insert, delete on public.status_audience to authenticated;
grant select, insert, update on public.calls to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;
-- push_deliveries خادم فقط: لا منح لأي دور عام (service_role يتجاوز RLS)
revoke all on public.push_deliveries from anon, authenticated;
grant select, update, insert on public.app_settings to authenticated;
