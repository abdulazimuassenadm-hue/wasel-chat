import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Search, UserPlus, Video, Users, X, Phone } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { useCall } from '@/context/CallContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, Spinner } from '@/components/ui/Misc'
import { PageHeader } from '@/components/layout/AppLayout'
import * as api from '@/lib/api'
import { errorKey, formatLastSeen, isValidEmail } from '@/lib/utils'
import type { Contact, PublicProfile } from '@/types'

export function ContactsPage() {
  const { t, lang } = useApp()
  const { user } = useAuth()
  const { startDirect, onlineUsers } = useChat()
  const call = useCall()
  const toast = useToast()
  const navigate = useNavigate()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [searching, setSearching] = useState(false)

  const loadContacts = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setContacts(await api.listContacts(user.id))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void loadContacts()
  }, [loadContacts])

  // البحث عن مستخدمين بالاسم أو اسم المستخدم أو البريد
  useEffect(() => {
    if (!user) return
    const clean = term.trim()
    if (clean.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    const timeout = window.setTimeout(() => {
      const run = async () => {
        try {
          const [byName, byEmail] = await Promise.all([
            api.searchUsers(clean, user.id).catch(() => [] as PublicProfile[]),
            api.findByEmail(clean).catch(() => null),
          ])

          if (cancelled) return

          const merged: PublicProfile[] = []
          const seen = new Set<string>()
          for (const profile of [...byName, byEmail]) {
            if (!profile?.id || seen.has(profile.id)) continue
            seen.add(profile.id)
            merged.push(profile)
          }

          if (!cancelled) setResults(merged)
        } finally {
          if (!cancelled) setSearching(false)
        }
      }
      void run()
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [term, user])

  const contactIds = new Set(contacts.map((c) => c.contact_user_id))

  const addContact = async (profile: PublicProfile) => {
    if (!user) return
    try {
      await api.addContact(user.id, profile.id)
      toast.success(t('contact_added'))
      await loadContacts()
    } catch (error) {
      toast.error(t(errorKey(error)))
    }
  }

  const removeContact = async (contactUserId: string) => {
    if (!user) return
    try {
      await api.removeContact(user.id, contactUserId)
      toast.success(t('contact_removed'))
      await loadContacts()
    } catch (error) {
      toast.error(t(errorKey(error)))
    }
  }

  const openChat = (userId: string) => {
    void startDirect(userId)
      .then((id) => navigate(`/app/chats/${id}`))
      .catch((error) => toast.error(t(errorKey(error))))
  }

  const placeCall = (profile: PublicProfile, mode: 'audio' | 'video') => {
    void call.startCall({ partner: profile, mode })
  }

  const invite = async () => {
    const link = `${window.location.origin}${window.location.pathname}`
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t('invite_copied'))
    } catch {
      toast.info(link)
    }
  }

  const renderRow = (profile: PublicProfile, contactIdsHas: boolean, contact?: Contact) => {
    const online = onlineUsers[profile.id] || profile.presence === 'online'
    const isContact = contactIdsHas
    return (
      <div key={profile.id} className="flex items-center gap-3 px-4 py-3">
        <Avatar src={profile.avatar_url} name={profile.display_name} id={profile.id} size="md" showPresence online={online} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
            {contact?.nickname || profile.display_name}
          </p>
          <p className="truncate text-xs text-ink-500 dark:text-ink-400">
            {online ? t('online') : formatLastSeen(profile.last_seen, lang)}
            {profile.username ? ` · @${profile.username}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label={t('message')} size="sm" onClick={() => openChat(profile.id)}>
            <MessageSquare className="h-4 w-4" />
          </IconButton>
          <IconButton label={t('call')} size="sm" onClick={() => placeCall(profile, 'audio')}>
            <Phone className="h-4 w-4" />
          </IconButton>
          <IconButton label={t('video_call')} size="sm" onClick={() => placeCall(profile, 'video')}>
            <Video className="h-4 w-4" />
          </IconButton>
          {isContact ? (
            <IconButton label={t('remove_contact')} size="sm" onClick={() => void removeContact(profile.id)}>
              <X className="h-4 w-4 text-rose-500" />
            </IconButton>
          ) : (
            <IconButton label={t('add_contact')} size="sm" onClick={() => void addContact(profile)}>
              <UserPlus className="h-4 w-4 text-brand-600" />
            </IconButton>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-ink-900">
      <PageHeader
        title={t('contacts_title')}
        action={
          <Button variant="subtle" size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => void invite()}>
            {t('invite_friend')}
          </Button>
        }
      />

      <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800">
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-400" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('search_users')}
            className="wasel-input ps-10"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={t('search_users')}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {searching && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {term.trim().length >= 2 && !searching && (
          <>
            <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-400">
              {t('users_on_platform')}
            </p>
            {results.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-500 dark:text-ink-400">{t('no_results')}</p>}
            {results.map((profile) => renderRow(profile, contactIds.has(profile.id)))}
          </>
        )}

        {term.trim().length < 2 && (
          <>
            {loading && (
              <div className="flex justify-center py-10">
                <Spinner size={26} />
              </div>
            )}
            {!loading && contacts.length === 0 && (
              <EmptyState
                icon={<Users className="h-7 w-7" />}
                title={t('no_contacts')}
                description={t('no_contacts_hint')}
              />
            )}
            {!loading && contacts.length > 0 && (
              <>
                <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                  {t('contacts_title')}
                </p>
                {contacts.map((contact) =>
                  contact.profile ? renderRow(contact.profile, true, contact) : null,
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}