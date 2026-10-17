import { useEffect, useMemo, useState } from 'react'
import { Ban, Flag, Info, LogOut, Search, ShieldAlert, Trash2, UserMinus, UserPlus, X, Check } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Misc'
import { UserPickerList } from './UserPicker'
import * as api from '@/lib/api'
import { cn, formatDateTime, formatLastSeen } from '@/lib/utils'
import type { ChatConversation, ChatMessage, PublicProfile } from '@/types'

// ============================================================================
// عارض الوسائط
// ============================================================================
export function MediaLightbox({
  url,
  name,
  onClose,
}: {
  url: string | null
  name?: string
  onClose: () => void
}) {
  if (!url) return null
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 end-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        aria-label="close"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={url}
        alt={name}
        className="max-h-[90dvh] max-w-full rounded-2xl object-contain animate-fade-in"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}

// ============================================================================
// إعادة التوجيه
// ============================================================================
export function ForwardModal({
  message,
  open,
  onClose,
}: {
  message: ChatMessage | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useApp()
  const { conversations, forwardMessage } = useChat()
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setSelected([])
  }, [open])

  if (!open || !message) return null

  const submit = async () => {
    if (!selected.length) return
    setBusy(true)
    await forwardMessage(message, selected)
    setBusy(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('forward')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!selected.length}>
            {t('send')} ({selected.length})
          </Button>
        </>
      }
    >
      <div className="max-h-[50dvh] overflow-y-auto">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() =>
              setSelected((prev) =>
                prev.includes(conversation.id)
                  ? prev.filter((id) => id !== conversation.id)
                  : [...prev, conversation.id],
              )
            }
            className="flex w-full items-center gap-3 px-2 py-2.5 text-start transition hover:bg-ink-100/70 dark:hover:bg-ink-800/60"
          >
            <Avatar
              src={conversation.displayAvatar}
              name={conversation.displayTitle}
              id={conversation.id}
              size="md"
              rounded={conversation.type === 'group' ? 'xl' : 'full'}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
              {conversation.displayTitle}
            </span>
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border-2 transition',
                selected.includes(conversation.id)
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-ink-300 dark:border-ink-600',
              )}
            >
              {selected.includes(conversation.id) && <Check className="h-3.5 w-3.5" />}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ============================================================================
// البحث داخل المحادثة
// ============================================================================
export function ChatSearchPanel({
  open,
  onClose,
  messages,
}: {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
}) {
  const { t } = useApp()
  const [term, setTerm] = useState('')

  const matches = useMemo(() => {
    const clean = term.trim().toLowerCase()
    if (clean.length < 2) return []
    return messages
      .filter((message) => message.body?.toLowerCase().includes(clean))
      .slice(-30)
      .reverse()
  }, [term, messages])

  useEffect(() => {
    if (!open) setTerm('')
  }, [open])

  if (!open) return null

  return (
    <div className="border-b border-ink-200/80 bg-white px-3 py-2 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-400" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('search_chats')}
            className="wasel-input py-2 ps-10"
          />
        </div>
        <IconButton label={t('close')} onClick={onClose}>
          <X className="h-5 w-5" />
        </IconButton>
      </div>
      {term.trim().length >= 2 && (
        <div className="mt-2 max-h-48 overflow-y-auto">
          {matches.length === 0 && <p className="py-3 text-center text-xs text-ink-400">{t('no_results')}</p>}
          {matches.map((message) => (
            <div key={message.id} className="rounded-xl px-3 py-2 hover:bg-ink-100/70 dark:hover:bg-ink-800/60">
              <p className="truncate text-xs text-ink-700 dark:text-ink-200">{message.body}</p>
              <p className="text-[10px] text-ink-400">{formatDateTime(message.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// معلومات جهة الاتصال / المجموعة
// ============================================================================
export function ChatInfoModal({
  conversation,
  open,
  onClose,
  onCall,
  onStartChat,
}: {
  conversation: ChatConversation
  open: boolean
  onClose: () => void
  onCall: (mode: 'audio' | 'video') => void
  onStartChat: (userId: string) => void
}) {
  const { t, lang } = useApp()
  const { user, isAdmin } = useAuth()
  const {
    onlineUsers,
    addGroupMember,
    removeGroupMember,
    updateGroupRole,
    updateGroupMemberPermissions,
    leaveGroupChat,
    hideConversation,
  } = useChat()
  const toast = useToast()

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState('spam')
  const [reportDetails, setReportDetails] = useState('')

  const isGroup = conversation.type === 'group'
  const myMembership = conversation.membership
  const isAdminOfGroup = myMembership.role === 'owner' || myMembership.role === 'admin'

  useEffect(() => {
    if (!open) return
    if (!isGroup && conversation.partner) {
      void api
        .fetchUserProfile(conversation.partner.id)
        .then((fetched) => setProfile(fetched ?? conversation.partner))
        .catch(() => setProfile(conversation.partner))
    }
    if (user) {
      void api
        .listBlocks(user.id)
        .then((blocks) => setBlocked(blocks.some((b) => b.blocked_id === conversation.partner?.id)))
        .catch(() => undefined)
    }
  }, [open, isGroup, conversation, user])

  const memberProfiles = conversation.members
    .map((member) => conversation.profiles[member.user_id])
    .filter(Boolean) as PublicProfile[]

  const toggleBlock = async () => {
    if (!user || !conversation.partner) return
    try {
      if (blocked) {
        await api.unblockUser(user.id, conversation.partner.id)
        setBlocked(false)
      } else {
        await api.blockUser(user.id, conversation.partner.id)
        setBlocked(true)
        toast.info(t('confirm_block'))
      }
    } catch {
      toast.error(t('generic_error'))
    }
  }

  const submitReport = async () => {
    if (!user || !conversation.partner) return
    try {
      await api.createReport({
        reporterId: user.id,
        reportedUserId: conversation.partner.id,
        reason: reportReason,
        details: reportDetails,
        conversationId: conversation.id,
      })
      toast.success(t('report_submitted'))
      setShowReport(false)
      setReportDetails('')
    } catch {
      toast.error(t('generic_error'))
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={isGroup ? t('group_info') : t('contact_info')} size="md">
        <div className="flex flex-col items-center gap-3 pb-5 text-center">
          <Avatar
            src={isGroup ? conversation.displayAvatar : profile?.avatar_url}
            name={conversation.displayTitle}
            id={conversation.id}
            size="2xl"
            rounded={isGroup ? 'xl' : 'full'}
            showPresence={!isGroup}
            online={Boolean(profile && (onlineUsers[profile.id] || profile.presence === 'online'))}
          />
          <div>
            <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">{conversation.displayTitle}</h3>
            {!isGroup && profile && (
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                {onlineUsers[profile.id] || profile.presence === 'online'
                  ? t('online')
                  : formatLastSeen(profile.last_seen, lang)}
              </p>
            )}
            {isGroup && (
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                {t('members_count', { n: conversation.members.length })}
              </p>
            )}
          </div>

          {!isGroup && profile?.about && (
            <p className="max-w-sm text-sm text-ink-600 dark:text-ink-300">{profile.about}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onCall('audio')}>
              {t('call')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onCall('video')}>
              {t('video_call')}
            </Button>
          </div>
        </div>

        {isGroup && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('members')}</h4>
              {isAdminOfGroup && (
                <Button size="sm" variant="subtle" onClick={() => setShowAdd(true)} icon={<UserPlus className="h-4 w-4" />}>
                  {t('add_members')}
                </Button>
              )}
            </div>

            {isAdminOfGroup && (
              <div className="rounded-2xl border border-ink-200 p-3 dark:border-ink-700">
                <p className="mb-1 text-xs font-bold text-ink-600 dark:text-ink-300">{t('member_permissions')}</p>
                <Switch
                  label={t('can_send_messages')}
                  checked={myMembership.can_send}
                  onChange={(value) =>
                    void updateGroupMemberPermissions(conversation.id, myMembership.user_id, { can_send: value })
                  }
                />
                <Switch
                  label={t('can_add_members')}
                  checked={myMembership.can_add_members}
                  onChange={(value) =>
                    void updateGroupMemberPermissions(conversation.id, myMembership.user_id, {
                      can_add_members: value,
                    })
                  }
                />
                <p className="mt-1 text-[11px] text-ink-400">{t('only_admins_can_edit')}</p>
              </div>
            )}

            <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 dark:divide-ink-800 dark:border-ink-700">
              {memberProfiles.map((member) => {
                const membership = conversation.members.find((m) => m.user_id === member.id)
                const isMe = member.id === user?.id
                return (
                  <div key={member.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar
                      src={member.avatar_url}
                      name={member.display_name}
                      id={member.id}
                      size="sm"
                      showPresence
                      online={onlineUsers[member.id] || member.presence === 'online'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
                        {member.display_name} {isMe && `(${t('you')})`}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        {membership?.role === 'owner' ? t('owner') : membership?.role === 'admin' ? t('admin') : t('member')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isMe && (
                        <button
                          type="button"
                          onClick={() => void onStartChat(member.id)}
                          className="rounded-full p-2 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
                          title={t('message')}
                        >
                          <Info className="h-4 w-4" />
                        </button>
                      )}
                      {isAdminOfGroup && !isMe && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void updateGroupRole(
                                conversation.id,
                                member.id,
                                membership?.role === 'member' ? 'admin' : 'member',
                              )
                            }
                            className="rounded-full p-2 text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
                            title={membership?.role === 'member' ? t('promote_to_admin') : t('demote_to_member')}
                          >
                            <ShieldAlert className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeGroupMember(conversation.id, member.id)}
                            className="rounded-full p-2 text-rose-500 transition hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title={t('remove_member')}
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-ink-100 pt-4 dark:border-ink-800">
          {!isGroup && (
            <>
              <Button
                full
                variant="outline"
                icon={<Ban className="h-4 w-4" />}
                onClick={() => void toggleBlock()}
              >
                {blocked ? t('unblock_user') : t('block_user')}
              </Button>
              <Button
                full
                variant="outline"
                icon={<Flag className="h-4 w-4" />}
                onClick={() => setShowReport(true)}
                className="text-rose-600 dark:text-rose-400"
              >
                {t('report_user')}
              </Button>
            </>
          )}

          {isGroup && (
            <Button full variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={() => setConfirmLeave(true)}>
              {t('leave_group')}
            </Button>
          )}

          <Button
            full
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => (isGroup ? setConfirmDelete(true) : void hideConversation(conversation.id).then(onClose))}
          >
            {isGroup ? t('delete_group') : t('delete_chat')}
          </Button>
          {isAdmin && (
            <p className="pt-1 text-center text-[11px] text-ink-400">
              <Badge color="ink">Admin</Badge>
            </p>
          )}
        </div>
      </Modal>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('add_members')} size="md">
        <div className="flex h-[60dvh] flex-col">
          <UserPickerList
            excludedIds={conversation.members.map((m) => m.user_id)}
            onlineUsers={onlineUsers}
            onSelect={(profile) => {
              void addGroupMember(conversation.id, profile.id)
              toast.success(t('member_added'))
            }}
          />
        </div>
      </Modal>

      <Modal
        open={showReport}
        onClose={() => setShowReport(false)}
        title={t('report_title')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReport(false)}>
              {t('cancel')}
            </Button>
            <Button variant="danger" onClick={() => void submitReport()}>
              {t('report_title')}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {[
            { value: 'spam', label: t('report_reason_spam') },
            { value: 'abuse', label: t('report_reason_abuse') },
            { value: 'fake', label: t('report_reason_fake') },
            { value: 'scam', label: t('report_reason_scam') },
            { value: 'inappropriate', label: t('report_reason_inappropriate') },
            { value: 'other', label: t('report_reason_other') },
          ].map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition',
                reportReason === option.value
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40'
                  : 'border-ink-200 hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800',
              )}
            >
              <input
                type="radio"
                name="report-reason"
                className="accent-brand-600"
                checked={reportReason === option.value}
                onChange={() => setReportReason(option.value)}
              />
              {option.label}
            </label>
          ))}
          <textarea
            value={reportDetails}
            onChange={(event) => setReportDetails(event.target.value)}
            placeholder={t('report_placeholder')}
            className="wasel-input min-h-[90px]"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmLeave}
        title={t('leave_group')}
        message={t('confirm_leave_group')}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          void leaveGroupChat(conversation.id)
          setConfirmLeave(false)
          onClose()
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={t('delete_group')}
        message={t('confirm_delete_group')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void api
            .deleteConversation(conversation.id)
            .then(() => {
              toast.success(t('deleted_message'))
              onClose()
            })
            .catch(() => toast.error(t('permission_denied')))
          setConfirmDelete(false)
        }}
      />
    </>
  )
}
