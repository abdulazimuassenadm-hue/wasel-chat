import { supabase, BUCKETS, UPLOAD_LIMITS, mediaKindFromMime, SUPABASE_URL } from './supabase'
import { compressImageFile } from './media'
import { errorKey, sanitizeFileName } from './utils'
import type {
  AdminStats,
  AppNotification,
  AppSettingsRow,
  Attachment,
  CallRecord,
  ChatConversation,
  ChatMessage,
  Contact,
  Conversation,
  ConversationMember,
  GroupInfo,
  MessageReaction,
  MessageReceipt,
  Profile,
  PublicProfile,
  Report,
  ReportStatus,
  Status,
  StatusView,
  UserBlock,
  UserSticker,
} from '@/types'

/** فك تغليف نتيجة Supabase مع رفع الخطأ */
function unwrap<T>(result: { data: T | null; error: unknown }, context: string): T {
  if (result.error) {
    const err = result.error as { message?: string }
    const wrapped = new Error(err?.message || 'SUPABASE_ERROR')
    ;(wrapped as Error & { context?: string; key?: string }).context = context
    ;(wrapped as Error & { context?: string; key?: string }).key = errorKey(result.error)
    throw wrapped
  }
  return result.data as T
}

// ============================================================================
// 1) الملفات الشخصية
// ============================================================================

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const result = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return unwrap<Profile | null>(result, 'getMyProfile')
}

export async function createProfileIfMissing(userId: string, email?: string | null): Promise<void> {
  const existing = await getMyProfile(userId)
  if (existing) return
  await supabase.from('profiles').insert({ id: userId, email: email ?? null })
  const publicExisting = await supabase
    .from('profiles_public')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (!publicExisting.data) {
    const fallbackName = email ? email.split('@')[0] : 'مستخدم'
    await supabase.from('profiles_public').insert({ id: userId, display_name: fallbackName })
  }
}

export async function updateMyProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
  const result = await supabase.from('profiles').update(patch).eq('id', userId).select('*').single()
  return unwrap<Profile>(result, 'updateMyProfile')
}

export async function updatePublicProfile(
  userId: string,
  patch: Partial<PublicProfile>,
): Promise<PublicProfile> {
  const result = await supabase
    .from('profiles_public')
    .update(patch)
    .eq('id', userId)
    .select('*')
    .single()
  return unwrap<PublicProfile>(result, 'updatePublicProfile')
}

export async function getMyPublicProfile(userId: string): Promise<PublicProfile | null> {
  const result = await supabase.from('profiles_public').select('*').eq('id', userId).maybeSingle()
  return unwrap<PublicProfile | null>(result, 'getMyPublicProfile')
}

export async function getPublicProfiles(ids: string[]): Promise<PublicProfile[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return []
  const result = await supabase.from('profiles_public').select('*').in('id', unique)
  return unwrap<PublicProfile[]>(result, 'getPublicProfiles') ?? []
}

/** يطبّق سياسات الخصوصية في الخادم */
export async function fetchUserProfile(userId: string): Promise<PublicProfile | null> {
  const result = await supabase.rpc('get_user_public_profile', { p_user: userId })
  const rows = unwrap<PublicProfile[]>(result, 'fetchUserProfile')
  return rows && rows.length ? rows[0] : null
}

export async function searchUsers(term: string, currentUserId: string, limit = 25): Promise<PublicProfile[]> {
  const clean = term.trim()
  if (clean.length < 2) return []
  const pattern = `%${clean.replace(/[%_]/g, '')}%`
  const result = await supabase
    .from('profiles_public')
    .select('*')
    .neq('id', currentUserId)
    .or(`display_name.ilike.${pattern},username.ilike.${pattern}`)
    .limit(limit)
  return unwrap<PublicProfile[]>(result, 'searchUsers') ?? []
}

export async function findByEmail(email: string): Promise<PublicProfile | null> {
  const result = await supabase.rpc('find_user_by_email', { p_email: email })
  const rows = unwrap<Array<Partial<PublicProfile>>>(result, 'findByEmail')
  if (!rows || !rows.length) return null
  return { ...(rows[0] as PublicProfile) }
}

/**
 * البحث عن مستخدم برقم الهاتف.
 * يعمل عبر دالة خادم آمنة (security definer) تطبّق سياسات الخصوصية،
 * ولا تعيد أرقام الهواتف نفسها — فقط الملف العام المطابق.
 */
export async function searchUserByPhone(query: string): Promise<PublicProfile[]> {
  const result = await supabase.rpc('search_user_by_phone', { p_query: query })
  return unwrap<PublicProfile[]>(result, 'searchUserByPhone') ?? []
}

export async function setPresence(
  userId: string,
  presence: 'online' | 'away' | 'offline',
): Promise<void> {
  await supabase
    .from('profiles_public')
    .update({ presence, last_seen: new Date().toISOString() })
    .eq('id', userId)
}

// ============================================================================
// 2) التخزين (Avatars / Group avatars)
// ============================================================================

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = sanitizeFileName(file.name).split('.').pop() || 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKETS.avatars).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKETS.avatars).getPublicUrl(path)
  return data.publicUrl
}

export async function uploadGroupAvatar(conversationId: string, file: File): Promise<string> {
  const ext = sanitizeFileName(file.name).split('.').pop() || 'jpg'
  const path = `${conversationId}/group-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from(BUCKETS.groupAvatars).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKETS.groupAvatars).getPublicUrl(path)
  return data.publicUrl
}

/** رابط موقّع مؤقت لملف خاص (chat-media / status-media) */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function getSignedUrls(
  bucket: string,
  paths: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)))
  if (!unique.length) return {}
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, 3600)
  if (error || !data) return {}
  const map: Record<string, string> = {}
  for (const item of data) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl
  }
  return map
}

// ============================================================================
// 2.5) ملصقات المستخدم («ملصقاتي»)
// ============================================================================

function randomStickerId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export async function listUserStickers(userId: string): Promise<UserSticker[]> {
  const result = await supabase
    .from('user_stickers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  const rows = unwrap<UserSticker[]>(result, 'listUserStickers') ?? []
  if (!rows.length) return []
  const urls = await getSignedUrls(BUCKETS.stickers, rows.map((row) => row.path))
  return rows.map((row) => ({ ...row, url: urls[row.path] ?? null }))
}

export async function createUserSticker(userId: string, blob: Blob, name: string): Promise<UserSticker> {
  const type = blob.type || 'image/png'
  const ext = type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg' : 'png'
  const path = `${userId}/${randomStickerId()}.${ext}`
  const { error } = await supabase.storage.from(BUCKETS.stickers).upload(path, blob, {
    cacheControl: '31536000',
    upsert: false,
    contentType: type,
  })
  if (error) throw error

  const label = name.trim().slice(0, 60) || 'ملصق'
  const result = await supabase
    .from('user_stickers')
    .insert({ user_id: userId, name: label, bucket: BUCKETS.stickers, path })
    .select('*')
    .single()
  if (result.error) {
    await supabase.storage.from(BUCKETS.stickers).remove([path]).catch(() => undefined)
    throw result.error
  }
  const row = result.data as UserSticker
  const url = await getSignedUrl(BUCKETS.stickers, path, 3600)
  return { ...row, url }
}

export async function deleteUserSticker(sticker: UserSticker): Promise<void> {
  const result = await supabase.from('user_stickers').delete().eq('id', sticker.id)
  if (result.error) throw result.error
  if (sticker.path) {
    await supabase.storage.from(sticker.bucket || BUCKETS.stickers).remove([sticker.path])
  }
}

// ============================================================================
// 3) المحادثات
// ============================================================================

interface ConversationBundle {
  conversations: Conversation[]
  members: ConversationMember[]
  profiles: Record<string, PublicProfile>
}

export async function listConversations(userId: string): Promise<ChatConversation[]> {
  const memberships = unwrap<ConversationMember[]>(
    await supabase.from('conversation_members').select('*').eq('user_id', userId),
    'listConversations.memberships',
  )
  if (!memberships.length) return []

  const conversationIds = memberships.map((m) => m.conversation_id)
  const conversations = unwrap<Conversation[]>(
    await supabase
      .from('conversations')
      .select('*')
      .in('id', conversationIds)
      .order('last_message_at', { ascending: false }),
    'listConversations.conversations',
  )

  const allMembers = unwrap<ConversationMember[]>(
    await supabase.from('conversation_members').select('*').in('conversation_id', conversationIds),
    'listConversations.members',
  )

  const profileIds = Array.from(new Set(allMembers.map((m) => m.user_id)))
  const profilesList = await getPublicProfiles(profileIds)
  const profiles: Record<string, PublicProfile> = {}
  for (const p of profilesList) profiles[p.id] = p

  const byConversation: Record<string, ConversationMember[]> = {}
  for (const m of allMembers) {
    ;(byConversation[m.conversation_id] ||= []).push(m)
  }

  const bundle: ConversationBundle = { conversations, members: allMembers, profiles }

  return bundle.conversations.map((conversation) => {
    const membership = memberships.find((m) => m.conversation_id === conversation.id) as ConversationMember
    const members = byConversation[conversation.id] || []
    const partnerMember = members.find((m) => m.user_id !== userId)
    const partner = partnerMember ? profiles[partnerMember.user_id] ?? null : null
    const displayTitle =
      conversation.type === 'group'
        ? conversation.title || 'مجموعة'
        : partner?.display_name || 'مستخدم'
    return {
      ...conversation,
      membership,
      members,
      partner,
      profiles,
      displayTitle,
      displayAvatar: conversation.type === 'group' ? conversation.avatar_url : partner?.avatar_url ?? null,
    }
  })
}

export async function startDirectConversation(otherUserId: string): Promise<string> {
  const result = await supabase.rpc('start_direct_conversation', { p_other: otherUserId })
  return unwrap<string>(result, 'startDirectConversation')
}

export async function createGroupConversation(
  name: string,
  memberIds: string[],
  description = '',
  avatarUrl: string | null = null,
): Promise<string> {
  const result = await supabase.rpc('create_group_conversation', {
    p_name: name,
    p_members: memberIds,
    p_description: description,
    p_avatar_url: avatarUrl,
  })
  return unwrap<string>(result, 'createGroupConversation')
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const result = await supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle()
  return unwrap<Conversation | null>(result, 'getConversation')
}

export async function getConversationMembers(conversationId: string): Promise<ConversationMember[]> {
  const result = await supabase
    .from('conversation_members')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('joined_at', { ascending: true })
  return unwrap<ConversationMember[]>(result, 'getConversationMembers') ?? []
}

export async function updateMembership(
  conversationId: string,
  userId: string,
  patch: Partial<Pick<ConversationMember, 'muted' | 'pinned' | 'archived' | 'cleared_at' | 'unread_count'>>,
): Promise<void> {
  const result = await supabase
    .from('conversation_members')
    .update(patch)
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (result.error) throw result.error
}

export async function updateGroupInfo(
  conversationId: string,
  patch: { title?: string; avatar_url?: string | null; description?: string; settings?: GroupInfo['settings'] },
): Promise<void> {
  if (patch.title !== undefined || patch.avatar_url !== undefined) {
    const convPatch: Partial<Conversation> = {}
    if (patch.title !== undefined) convPatch.title = patch.title
    if (patch.avatar_url !== undefined) convPatch.avatar_url = patch.avatar_url
    const res = await supabase.from('conversations').update(convPatch).eq('id', conversationId)
    if (res.error) throw res.error
  }
  const groupPatch: Partial<GroupInfo> = {}
  if (patch.title !== undefined) groupPatch.name = patch.title
  if (patch.avatar_url !== undefined) groupPatch.avatar_url = patch.avatar_url
  if (patch.description !== undefined) groupPatch.description = patch.description
  if (patch.settings !== undefined) groupPatch.settings = patch.settings
  if (Object.keys(groupPatch).length) {
    const res = await supabase.from('groups').update(groupPatch).eq('conversation_id', conversationId)
    if (res.error) throw res.error
  }
}

export async function getGroupInfo(conversationId: string): Promise<GroupInfo | null> {
  const result = await supabase
    .from('groups')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle()
  return unwrap<GroupInfo | null>(result, 'getGroupInfo')
}

export async function addGroupMember(conversationId: string, userId: string): Promise<void> {
  const result = await supabase.rpc('add_group_member', { p_conversation: conversationId, p_user: userId })
  if (result.error) throw result.error
}

export async function removeGroupMember(conversationId: string, userId: string): Promise<void> {
  const result = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (result.error) throw result.error
}

export async function updateMemberRole(
  conversationId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
): Promise<void> {
  const result = await supabase
    .from('conversation_members')
    .update({ role })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (result.error) throw result.error
}

export async function updateMemberPermissions(
  conversationId: string,
  userId: string,
  patch: { can_send?: boolean; can_add_members?: boolean },
): Promise<void> {
  const result = await supabase
    .from('conversation_members')
    .update(patch)
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
  if (result.error) throw result.error
}

export async function leaveGroup(conversationId: string): Promise<void> {
  const result = await supabase.rpc('leave_group', { p_conversation: conversationId })
  if (result.error) throw result.error
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const result = await supabase.from('conversations').delete().eq('id', conversationId)
  if (result.error) throw result.error
}

/** مسح المحادثة لديّ فقط (تحديث cleared_at) */
export async function clearChatForMe(conversationId: string, userId: string): Promise<void> {
  await updateMembership(conversationId, userId, { cleared_at: new Date().toISOString(), unread_count: 0 })
}

// ============================================================================
// 4) الرسائل
// ============================================================================

const MESSAGE_PAGE_SIZE = 50

export interface MessagePage {
  messages: ChatMessage[]
  attachments: Attachment[]
  reactions: MessageReaction[]
  receipts: MessageReceipt[]
}

export async function listMessages(
  conversationId: string,
  options: { limit?: number; before?: string | null; clearedAt?: string | null } = {},
): Promise<MessagePage> {
  const limit = options.limit ?? MESSAGE_PAGE_SIZE
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (options.before) query = query.lt('created_at', options.before)
  if (options.clearedAt) query = query.gt('created_at', options.clearedAt)

  const messages = unwrap<ChatMessage[]>(await query, 'listMessages') ?? []
  if (!messages.length) {
    return { messages: [], attachments: [], reactions: [], receipts: [] }
  }

  const ids = messages.map((m) => m.id)
  const [attachments, reactions, receipts] = await Promise.all([
    supabase.from('attachments').select('*').in('message_id', ids),
    supabase.from('message_reactions').select('*').in('message_id', ids),
    supabase.from('message_receipts').select('*').in('message_id', ids),
  ])

  return {
    messages: messages.slice().reverse(),
    attachments: (attachments.data as Attachment[]) ?? [],
    reactions: (reactions.data as MessageReaction[]) ?? [],
    receipts: (receipts.data as MessageReceipt[]) ?? [],
  }
}

export async function fetchMessageIdsForSearch(
  conversationIds: string[],
  term: string,
): Promise<ChatMessage[]> {
  if (!conversationIds.length || term.trim().length < 2) return []
  const result = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', conversationIds)
    .is('deleted_at', null)
    .ilike('body', `%${term.trim().replace(/[%_]/g, '')}%`)
    .order('created_at', { ascending: false })
    .limit(40)
  return unwrap<ChatMessage[]>(result, 'searchMessages') ?? []
}

export interface SendMessageInput {
  conversationId: string
  senderId: string
  type: ChatMessage['type']
  body?: string | null
  replyTo?: string | null
  forwardedFrom?: string | null
  metadata?: Record<string, unknown>
  files?: File[]
  onProgress?: (percent: number) => void
}

/** رفع مرفق إلى التخزين ثم إرجاع صف المرفق */
async function uploadAndCreateAttachment(
  conversationId: string,
  messageId: string,
  uploaderId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Attachment> {
  const safeName = sanitizeFileName(file.name)
  const path = `${conversationId}/${messageId}/${Date.now()}-${safeName}`

  onProgress?.(10)
  const { error: uploadError } = await supabase.storage
    .from(BUCKETS.chatMedia)
    .upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type || undefined })
  if (uploadError) throw uploadError
  onProgress?.(85)

  const attachment: Partial<Attachment> = {
    message_id: messageId,
    conversation_id: conversationId,
    uploader_id: uploaderId,
    bucket: BUCKETS.chatMedia,
    path,
    file_name: safeName,
    mime_type: file.type || null,
    size_bytes: file.size,
  }

  const result = await supabase.from('attachments').insert(attachment).select('*').single()
  onProgress?.(100)
  return unwrap<Attachment>(result, 'createAttachment')
}

export async function sendMessage(input: SendMessageInput): Promise<ChatMessage> {
  const payload = {
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    type: input.type,
    body: input.body ?? null,
    reply_to: input.replyTo ?? null,
    forwarded_from: input.forwardedFrom ?? null,
    metadata: input.metadata ?? {},
    status: 'sent' as const,
  }

  const inserted = unwrap<ChatMessage>(
    await supabase.from('messages').insert(payload).select('*').single(),
    'sendMessage',
  )

  const attachments: Attachment[] = []
  if (input.files?.length) {
    for (const file of input.files) {
      attachments.push(
        await uploadAndCreateAttachment(
          input.conversationId,
          inserted.id,
          input.senderId,
          file,
          input.onProgress,
        ),
      )
    }
  }

  return { ...inserted, attachments, reactions: [], receipts: [] }
}

export async function editMessage(messageId: string, body: string): Promise<void> {
  const result = await supabase
    .from('messages')
    .update({ body, edited_at: new Date().toISOString() })
    .eq('id', messageId)
  if (result.error) throw result.error
}

export async function deleteMessage(messageId: string, forEveryone: boolean): Promise<void> {
  if (forEveryone) {
    const result = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString(), body: null, metadata: {} })
      .eq('id', messageId)
    if (result.error) throw result.error
  } else {
    const result = await supabase.from('messages').delete().eq('id', messageId)
    if (result.error) throw result.error
  }
}

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const existing = await supabase
    .from('message_reactions')
    .select('id, emoji')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing.data?.emoji === emoji) {
    await supabase.from('message_reactions').delete().eq('id', existing.data.id)
    return
  }
  if (existing.data) {
    await supabase.from('message_reactions').update({ emoji }).eq('id', existing.data.id)
    return
  }
  await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji })
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const result = await supabase.rpc('mark_conversation_read', { p_conversation: conversationId })
  if (result.error) throw result.error
}

/** تعليم الرسائل الواردة كمستلمة (يستدعيه المستقبل عند وصولها) */
export async function markMessagesDelivered(messageIds: string[], userId: string): Promise<void> {
  if (!messageIds.length) return
  const rows = messageIds.map((id) => ({ message_id: id, user_id: userId, status: 'delivered' as const }))
  await supabase.from('message_receipts').upsert(rows, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
}

export async function fetchMessageById(messageId: string): Promise<ChatMessage | null> {
  const result = await supabase.from('messages').select('*').eq('id', messageId).maybeSingle()
  return unwrap<ChatMessage | null>(result, 'fetchMessageById')
}

export async function getAttachmentsFor(messages: ChatMessage[]): Promise<Attachment[]> {
  const ids = messages.map((m) => m.id)
  if (!ids.length) return []
  const result = await supabase.from('attachments').select('*').in('message_id', ids)
  return unwrap<Attachment[]>(result, 'getAttachmentsFor') ?? []
}

// ============================================================================
// 5) جهات الاتصال
// ============================================================================

export async function listContacts(userId: string): Promise<Contact[]> {
  const result = await supabase
    .from('contacts')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
  const contacts = unwrap<Contact[]>(result, 'listContacts') ?? []
  if (!contacts.length) return []
  const profiles = await getPublicProfiles(contacts.map((c) => c.contact_user_id))
  const map: Record<string, PublicProfile> = {}
  for (const p of profiles) map[p.id] = p
  return contacts.map((c) => ({ ...c, profile: map[c.contact_user_id] ?? null }))
}

export async function addContact(userId: string, contactUserId: string): Promise<void> {
  const result = await supabase
    .from('contacts')
    .upsert({ owner_id: userId, contact_user_id: contactUserId }, { onConflict: 'owner_id,contact_user_id' })
  if (result.error) throw result.error
}

export async function removeContact(userId: string, contactUserId: string): Promise<void> {
  const result = await supabase
    .from('contacts')
    .delete()
    .eq('owner_id', userId)
    .eq('contact_user_id', contactUserId)
  if (result.error) throw result.error
}

// ============================================================================
// 6) الحظر والإبلاغ
// ============================================================================

export async function listBlocks(userId: string): Promise<UserBlock[]> {
  const result = await supabase.from('user_blocks').select('*').eq('blocker_id', userId)
  return unwrap<UserBlock[]>(result, 'listBlocks') ?? []
}

export async function blockUser(userId: string, blockedId: string): Promise<void> {
  const result = await supabase
    .from('user_blocks')
    .upsert({ blocker_id: userId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' })
  if (result.error) throw result.error
}

export async function unblockUser(userId: string, blockedId: string): Promise<void> {
  const result = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', blockedId)
  if (result.error) throw result.error
}

export async function createReport(input: {
  reporterId: string
  reportedUserId: string
  reason: string
  details?: string
  conversationId?: string | null
  messageId?: string | null
}): Promise<void> {
  const result = await supabase.from('reports').insert({
    reporter_id: input.reporterId,
    reported_user_id: input.reportedUserId,
    reason: input.reason,
    details: input.details ?? null,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
  })
  if (result.error) throw result.error
}

// ============================================================================
// 7) الحالات
// ============================================================================

export async function listStatuses(userIds: string[], currentUserId: string): Promise<Status[]> {
  let query = supabase
    .from('statuses')
    .select('*')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(200)

  if (userIds.length) {
    query = query.in('user_id', Array.from(new Set([...userIds, currentUserId])))
  } else {
    query = query.eq('user_id', currentUserId)
  }

  const statuses = unwrap<Status[]>(await query, 'listStatuses') ?? []
  if (!statuses.length) return []

  const profiles = await getPublicProfiles(statuses.map((s) => s.user_id))
  const map: Record<string, PublicProfile> = {}
  for (const p of profiles) map[p.id] = p

  const [views, myViews] = await Promise.all([
    supabase.from('status_views').select('status_id, viewer_id').in('status_id', statuses.map((s) => s.id)),
    supabase.from('status_views').select('status_id').eq('viewer_id', currentUserId),
  ])

  const viewCounts: Record<string, number> = {}
  for (const row of (views.data as Array<{ status_id: string }>) ?? []) {
    viewCounts[row.status_id] = (viewCounts[row.status_id] || 0) + 1
  }
  const seenByMe = new Set(((myViews.data as Array<{ status_id: string }>) ?? []).map((r) => r.status_id))

  const mediaPaths = statuses.filter((s) => s.media_path).map((s) => s.media_path as string)
  const signed = mediaPaths.length
    ? await getSignedUrls(BUCKETS.statusMedia, mediaPaths)
    : {}

  return statuses.map((s) => ({
    ...s,
    author: map[s.user_id] ?? null,
    viewerCount: viewCounts[s.id] || 0,
    viewedByMe: seenByMe.has(s.id),
    mediaUrl: s.media_path ? signed[s.media_path] ?? null : null,
  }))
}

export async function createStatus(input: {
  userId: string
  type: Status['type']
  content?: string | null
  background?: string | null
  caption?: string | null
  audience: Status['audience']
  audienceIds?: string[]
  file?: File | null
  onProgress?: (percent: number) => void
}): Promise<Status> {
  const content = input.type === 'text' ? (input.content ?? '').trim().slice(0, 300) : null
  if (input.type === 'text' && !content) throw new Error('STATUS_CONTENT_REQUIRED')
  if (input.type !== 'text' && !input.file) throw new Error('STATUS_MEDIA_REQUIRED')

  let source = input.type === 'text' ? null : input.file ?? null
  if (source) {
    if (input.type === 'image' && !source.type.startsWith('image/')) {
      throw new Error('STATUS_MEDIA_TYPE_MISMATCH')
    }
    if (input.type === 'video' && !source.type.startsWith('video/')) {
      throw new Error('STATUS_MEDIA_TYPE_MISMATCH')
    }
    if (source.size > UPLOAD_LIMITS.statusMedia * 1024 * 1024) {
      throw new Error('FILE_TOO_LARGE')
    }
    if (input.type === 'image') {
      input.onProgress?.(5)
      source = await compressImageFile(source, {
        maxDimension: 1600,
        maxBytes: 8 * 1024 * 1024,
        quality: 0.84,
      })
      input.onProgress?.(25)
    }
  }

  let mediaPath: string | null = null
  let mediaBucket: string | null = null
  let uploaded = false

  if (source) {
    // اسم عشوائي بدل اسم الملف الأصلي: يمنع تسريب أسماء الصور ويمنع التعارض.
    const safeName = sanitizeFileName(source.name)
    const ext =
      (safeName.split('.').pop() || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 8) || 'bin'
    mediaPath = `${input.userId}/${randomStickerId()}.${ext}`
    mediaBucket = BUCKETS.statusMedia
    const { error } = await supabase.storage
      .from(BUCKETS.statusMedia)
      .upload(mediaPath, source, { contentType: source.type || undefined, upsert: false })
    if (error) throw error
    uploaded = true
    input.onProgress?.(70)
  }

  const result = await supabase
    .from('statuses')
    .insert({
      user_id: input.userId,
      type: input.type,
      content,
      background: input.type === 'text' ? input.background ?? null : null,
      caption: input.type === 'text' ? null : (input.caption ?? '').trim().slice(0, 200) || null,
      audience: input.audience,
      media_path: mediaPath,
      media_bucket: mediaBucket,
    })
    .select('*')
    .single()

  if (result.error) {
    if (uploaded && mediaPath) {
      await supabase.storage.from(BUCKETS.statusMedia).remove([mediaPath]).catch(() => undefined)
    }
    throw result.error
  }

  const status = result.data as Status
  const ids = Array.from(new Set(input.audienceIds ?? [])).filter(Boolean)

  if ((input.audience === 'selected' || input.audience === 'except') && ids.length) {
    const audienceResult = await supabase
      .from('status_audience')
      .insert(ids.map((userId) => ({ status_id: status.id, user_id: userId })))
    if (audienceResult.error) {
      // لا نترك حالة بخصوصية ناقصة إذا فشل حفظ قائمة الجمهور.
      try {
        await supabase.from('statuses').delete().eq('id', status.id)
      } catch {
        // تجاهل فشل التنظيف؛ الخطأ الأصلي هو المهم.
      }
      if (uploaded && mediaPath) {
        await supabase.storage.from(BUCKETS.statusMedia).remove([mediaPath]).catch(() => undefined)
      }
      throw audienceResult.error
    }
  }

  input.onProgress?.(100)
  return status
}

export async function deleteStatus(status: string | Pick<Status, 'id'>): Promise<void> {
  const statusId = typeof status === 'string' ? status : status.id
  const lookup = await supabase
    .from('statuses')
    .select('media_bucket, media_path')
    .eq('id', statusId)
    .maybeSingle()

  if (lookup.error) throw lookup.error

  const result = await supabase.from('statuses').delete().eq('id', statusId)
  if (result.error) throw result.error

  const mediaPath = (lookup.data as { media_path?: string | null } | null)?.media_path
  const mediaBucket = (lookup.data as { media_bucket?: string | null } | null)?.media_bucket
  if (mediaPath) {
    await supabase.storage
      .from(mediaBucket || BUCKETS.statusMedia)
      .remove([mediaPath])
      .catch(() => undefined)
  }
}

export async function viewStatus(statusId: string, viewerId: string): Promise<void> {
  await supabase
    .from('status_views')
    .upsert({ status_id: statusId, viewer_id: viewerId }, { onConflict: 'status_id,viewer_id', ignoreDuplicates: true })
}

export async function listStatusViews(statusId: string): Promise<StatusView[]> {
  const result = await supabase
    .from('status_views')
    .select('*')
    .eq('status_id', statusId)
    .order('viewed_at', { ascending: false })
  const views = unwrap<StatusView[]>(result, 'listStatusViews') ?? []
  if (!views.length) return []
  const profiles = await getPublicProfiles(views.map((v) => v.viewer_id))
  const map: Record<string, PublicProfile> = {}
  for (const p of profiles) map[p.id] = p
  return views.map((v) => ({ ...v, viewer: map[v.viewer_id] ?? null }))
}

// ============================================================================
// 8) المكالمات
// ============================================================================

export async function createCall(input: {
  callerId: string
  calleeId: string
  type: 'audio' | 'video'
  conversationId?: string | null
}): Promise<CallRecord> {
  const result = await supabase
    .from('calls')
    .insert({
      caller_id: input.callerId,
      callee_id: input.calleeId,
      type: input.type,
      conversation_id: input.conversationId ?? null,
      status: 'ringing',
    })
    .select('*')
    .single()
  return unwrap<CallRecord>(result, 'createCall')
}

export async function updateCall(
  callId: string,
  patch: Partial<Pick<CallRecord, 'status' | 'answered_at' | 'ended_at' | 'duration_seconds'>>,
): Promise<void> {
  const result = await supabase.from('calls').update(patch).eq('id', callId)
  if (result.error) throw result.error
}

export async function listCalls(userId: string): Promise<CallRecord[]> {
  const result = await supabase
    .from('calls')
    .select('*')
    .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
    .order('started_at', { ascending: false })
    .limit(100)
  const calls = unwrap<CallRecord[]>(result, 'listCalls') ?? []
  if (!calls.length) return []
  const partnerIds = calls.map((c) => (c.caller_id === userId ? c.callee_id : c.caller_id))
  const profiles = await getPublicProfiles(partnerIds)
  const map: Record<string, PublicProfile> = {}
  for (const p of profiles) map[p.id] = p
  return calls.map((c) => {
    const partnerId = c.caller_id === userId ? c.callee_id : c.caller_id
    return {
      ...c,
      direction: (c.caller_id === userId ? 'outgoing' : 'incoming') as 'outgoing' | 'incoming',
      partner: map[partnerId] ?? null,
    }
  })
}

// ============================================================================
// 9) الإشعارات
// ============================================================================

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const result = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return unwrap<AppNotification[]>(result, 'listNotifications') ?? []
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', id)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
}

export async function savePushSubscription(input: {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? navigator.userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

// ============================================================================
// 10) الإدارة
// ============================================================================

export async function fetchAdminStats(): Promise<AdminStats> {
  const result = await supabase.rpc('admin_stats')
  return unwrap<AdminStats>(result, 'fetchAdminStats')
}

export async function adminListUsers(
  term: string,
  limit = 50,
): Promise<Array<PublicProfile & { email: string | null; role: string; is_suspended: boolean }>> {
  let query = supabase
    .from('profiles_public')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (term.trim()) {
    query = query.or(`display_name.ilike.%${term.trim()}%,username.ilike.%${term.trim()}%`)
  }

  const people = unwrap<PublicProfile[]>(await query, 'adminListUsers') ?? []
  if (!people.length) return []

  // بيانات الحساب (البريد والصلاحية) متاحة للمدير عبر سياسة profiles
  const privateRows = unwrap<Array<Pick<Profile, 'id' | 'email' | 'role' | 'is_suspended'>>>(
    await supabase
      .from('profiles')
      .select('id, email, role, is_suspended')
      .in('id', people.map((p) => p.id)),
    'adminListUsers.private',
  ) ?? []

  const map: Record<string, { email: string | null; role: string; is_suspended: boolean }> = {}
  for (const row of privateRows) {
    map[row.id] = { email: row.email, role: row.role, is_suspended: row.is_suspended }
  }

  return people.map((p) => ({
    ...p,
    email: map[p.id]?.email ?? null,
    role: map[p.id]?.role ?? 'user',
    is_suspended: map[p.id]?.is_suspended ?? false,
  }))
}

export async function adminSetSuspended(userId: string, suspended: boolean): Promise<void> {
  const result = await supabase.from('profiles').update({ is_suspended: suspended }).eq('id', userId)
  if (result.error) throw result.error
}

export async function adminSetRole(userId: string, role: 'user' | 'admin'): Promise<void> {
  const result = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (result.error) throw result.error
}

export async function adminListReports(): Promise<Report[]> {
  const result = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  const reports = unwrap<Report[]>(result, 'adminListReports') ?? []
  if (!reports.length) return []
  const ids = new Set<string>()
  for (const r of reports) {
    ids.add(r.reporter_id)
    if (r.reported_user_id) ids.add(r.reported_user_id)
  }
  const profiles = await getPublicProfiles(Array.from(ids))
  const map: Record<string, PublicProfile> = {}
  for (const p of profiles) map[p.id] = p
  return reports.map((r) => ({
    ...r,
    reporter: map[r.reporter_id] ?? null,
    reported: r.reported_user_id ? map[r.reported_user_id] ?? null : null,
  }))
}

export async function adminUpdateReport(
  reportId: string,
  patch: { status: ReportStatus; admin_note?: string; reviewed_by?: string },
): Promise<void> {
  const result = await supabase
    .from('reports')
    .update({ ...patch, reviewed_at: new Date().toISOString() })
    .eq('id', reportId)
  if (result.error) throw result.error
}

export async function adminListGroups(): Promise<
  Array<{
    conversation_id: string
    name: string
    description: string
    avatar_url: string | null
    owner_id: string
    created_at: string
    members: number
  }>
> {
  const result = await supabase.from('groups').select('*').order('created_at', { ascending: false }).limit(100)
  const groups = unwrap<GroupInfo[]>(result, 'adminListGroups') ?? []
  if (!groups.length) return []
  const membersRes = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .in('conversation_id', groups.map((g) => g.conversation_id))
  const counts: Record<string, number> = {}
  for (const row of (membersRes.data as Array<{ conversation_id: string }>) ?? []) {
    counts[row.conversation_id] = (counts[row.conversation_id] || 0) + 1
  }
  return groups.map((g) => ({
    conversation_id: g.conversation_id,
    name: g.name,
    description: g.description,
    avatar_url: g.avatar_url,
    owner_id: g.owner_id,
    created_at: g.created_at,
    members: counts[g.conversation_id] || 0,
  }))
}

export async function getAppSettings(): Promise<AppSettingsRow[]> {
  const result = await supabase.from('app_settings').select('*')
  return unwrap<AppSettingsRow[]>(result, 'getAppSettings') ?? []
}

export async function updateAppSetting(
  key: string,
  value: Record<string, unknown>,
  updatedBy: string,
): Promise<void> {
  const result = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (result.error) throw result.error
}

export async function deleteUserData(userId: string): Promise<void> {
  // تفويض الحذف النهائي إلى دالة Edge (service_role) — لا تُستخدم المفاتيح السرية في المتصفح
  const { error } = await supabase.functions.invoke('delete-account', { body: { userId } })
  if (error) throw error
}

export async function assertConfigured(): Promise<void> {
  if (!SUPABASE_URL) throw new Error('SUPABASE_NOT_CONFIGURED')
}
