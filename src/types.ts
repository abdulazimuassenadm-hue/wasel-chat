// ============================================================================
// أنواع البيانات — مطابقة لمخطط قاعدة البيانات في supabase/schema.sql
// ============================================================================

export type Lang = 'ar' | 'en'
export type ThemeMode = 'light' | 'dark' | 'system'
export type Visibility = 'everyone' | 'contacts' | 'nobody'
export type Presence = 'online' | 'away' | 'offline'
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'system'
export type MessageStatus = 'sent' | 'delivered' | 'read'
export type MemberRole = 'owner' | 'admin' | 'member'
export type CallMode = 'audio' | 'video'
export type CallStatus = 'ringing' | 'answered' | 'declined' | 'missed' | 'ended' | 'failed'
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'
export type StatusAudience = 'everyone' | 'contacts' | 'selected' | 'except'

export interface PrivacySettings {
  last_seen: Visibility
  profile_photo: Visibility
  status: Visibility
  read_receipts: boolean
  who_can_message: Visibility
}

export interface NotificationSettings {
  sounds: boolean
  browser: boolean
  preview: boolean
  reactions: boolean
  /** إشعارات المكالمات الواردة (اختياري للتوافق مع الحسابات القديمة) */
  calls?: boolean
}

/** بيانات خاصة — لا يراها إلا صاحب الحساب (أو مدير المنصة) */
export interface Profile {
  id: string
  email: string | null
  phone: string | null
  role: 'user' | 'admin'
  language: Lang
  theme: ThemeMode
  privacy: PrivacySettings
  notification_settings: NotificationSettings
  onboarded: boolean
  is_suspended: boolean
  created_at: string
  updated_at: string
}

/** بيانات عامة يراها بقية المستخدمين (مع تطبيق سياسات الخصوصية) */
export interface PublicProfile {
  id: string
  display_name: string
  username: string | null
  about: string
  avatar_url: string | null
  presence: Presence
  last_seen: string | null
  status_text: string | null
  created_at?: string
  updated_at?: string
}

export interface Conversation {
  id: string
  type: 'direct' | 'group'
  title: string | null
  avatar_url: string | null
  created_by: string | null
  direct_key: string | null
  last_message_at: string
  last_message_preview: string | null
  last_message_sender: string | null
  created_at: string
  updated_at: string
}

export interface ConversationMember {
  id: string
  conversation_id: string
  user_id: string
  role: MemberRole
  muted: boolean
  pinned: boolean
  archived: boolean
  can_send: boolean
  can_add_members: boolean
  last_read_at: string
  cleared_at: string | null
  unread_count: number
  joined_at: string
}

/** محادثة مع بيانات العضوية والطرف الآخر — كما تُستخدم في الواجهة */
export interface ChatConversation extends Conversation {
  membership: ConversationMember
  members: ConversationMember[]
  partner: PublicProfile | null
  profiles: Record<string, PublicProfile>
  displayTitle: string
  displayAvatar: string | null
}

export interface Attachment {
  id: string
  message_id: string
  conversation_id: string
  uploader_id: string
  bucket: string
  path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  width: number | null
  height: number | null
  duration_seconds: number | null
  created_at: string
  /** رابط موقّع مؤقت للعرض */
  url?: string | null
  /** نسبة الرفع أثناء الإرسال */
  uploading?: boolean
  progress?: number
}

export interface MessageReaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface MessageReceipt {
  id: string
  message_id: string
  user_id: string
  status: 'delivered' | 'read'
  delivered_at: string
  read_at: string | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  type: MessageType
  body: string | null
  reply_to: string | null
  forwarded_from: string | null
  status: MessageStatus
  metadata: Record<string, unknown>
  edited_at: string | null
  deleted_at: string | null
  created_at: string
  attachments: Attachment[]
  reactions: MessageReaction[]
  receipts?: MessageReceipt[]
  replyPreview?: ChatMessage | null
  /** حالات محلية أثناء الإرسال */
  pending?: boolean
  failed?: boolean
  localFilePreview?: string | null
  /** ملفات أصلية محفوظة محلياً فقط — تُستخدم لإعادة المحاولة دون فقدان المحتوى */
  localFiles?: File[]
  clientId?: string
}

/** ملصق محفوظ في مكتبة المستخدم (جدول user_stickers) */
export interface UserSticker {
  id: string
  user_id: string
  name: string
  bucket: string
  path: string
  created_at: string
  /** رابط موقّع مؤقت للعرض */
  url?: string | null
}

export interface Contact {
  id: string
  owner_id: string
  contact_user_id: string
  nickname: string | null
  created_at: string
  profile?: PublicProfile | null
}

export interface GroupInfo {
  id: string
  conversation_id: string
  name: string
  description: string
  avatar_url: string | null
  owner_id: string
  settings: {
    members_can_send: boolean
    members_can_add: boolean
    approval_required: boolean
  }
  created_at: string
  updated_at: string
}

export interface Status {
  id: string
  user_id: string
  type: 'text' | 'image' | 'video'
  content: string | null
  background: string | null
  media_path: string | null
  media_bucket: string | null
  caption: string | null
  audience: StatusAudience
  expires_at: string
  created_at: string
  author?: PublicProfile | null
  viewerCount?: number
  viewedByMe?: boolean
  mediaUrl?: string | null
}

export interface StatusView {
  id: string
  status_id: string
  viewer_id: string
  viewed_at: string
  viewer?: PublicProfile | null
}

export interface CallRecord {
  id: string
  conversation_id: string | null
  caller_id: string
  callee_id: string
  type: CallMode
  status: CallStatus
  started_at: string
  answered_at: string | null
  ended_at: string | null
  duration_seconds: number
  direction?: 'incoming' | 'outgoing'
  partner?: PublicProfile | null
}

export interface AppNotification {
  id: string
  user_id: string
  actor_id: string | null
  type: 'message' | 'call' | 'status' | 'group' | 'system' | 'report'
  title: string | null
  body: string | null
  conversation_id: string | null
  message_id: string | null
  is_read: boolean
  created_at: string
}

export interface Report {
  id: string
  reporter_id: string
  reported_user_id: string | null
  conversation_id: string | null
  message_id: string | null
  reason: string
  details: string | null
  status: ReportStatus
  reviewed_by: string | null
  reviewed_at: string | null
  admin_note: string | null
  created_at: string
  reporter?: PublicProfile | null
  reported?: PublicProfile | null
}

export interface UserBlock {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string
}

export interface AppSettingsRow {
  key: string
  value: Record<string, unknown>
  updated_at: string
  updated_by: string | null
}

export interface AdminStats {
  users_total: number
  users_online: number
  users_suspended: number
  admins: number
  conversations_total: number
  groups_total: number
  messages_total: number
  messages_24h: number
  statuses_active: number
  calls_total: number
  calls_24h: number
  reports_open: number
  attachments_total: number
  storage_bytes: number
  new_users_7d: number
}

export interface TypingState {
  [conversationId: string]: { userId: string; at: number }[]
}
