import { useCallback, useEffect, useState } from 'react'
import { Search, UserPlus, Check, Mail } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Misc'
import * as api from '@/lib/api'
import { cn, isValidEmail } from '@/lib/utils'
import type { PublicProfile } from '@/types'

interface UserPickerListProps {
  excludedIds?: string[]
  selectedIds?: string[]
  multi?: boolean
  onSelect?: (profile: PublicProfile) => void
  onToggle?: (profile: PublicProfile) => void
  onlineUsers?: Record<string, boolean>
  emptyHint?: string
}

export function UserPickerList({
  excludedIds = [],
  selectedIds = [],
  multi,
  onSelect,
  onToggle,
  onlineUsers = {},
  emptyHint,
}: UserPickerListProps) {
  const { t } = useApp()
  const { user } = useAuth()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [contacts, setContacts] = useState<PublicProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  // جهات الاتصال كمصدر سريع
  useEffect(() => {
    if (!user) return
    void api
      .listContacts(user.id)
      .then((list) =>
        setContacts(list.map((c) => c.profile).filter(Boolean) as PublicProfile[]),
      )
      .catch(() => undefined)
  }, [user])

  const runSearch = useCallback(
    async (value: string) => {
      if (!user) return
      const clean = value.trim()
      if (clean.length < 2) {
        setResults([])
        return
      }
      setSearching(true)
      try {
        const found = await api.searchUsers(clean, user.id)
        if (isValidEmail(clean)) {
          const byEmail = await api.findByEmail(clean)
          if (byEmail && !found.some((p) => p.id === byEmail.id)) found.unshift(byEmail)
        }
        setResults(found.filter((p) => !excludedIds.includes(p.id)))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    [user, excludedIds],
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => void runSearch(term), 350)
    return () => window.clearTimeout(timeout)
  }, [term, runSearch])

  const contactProfiles = contacts.filter(
    (profile) => !excludedIds.includes(profile.id) && !results.some((r) => r.id === profile.id),
  )

  const isSelected = (id: string) => selectedIds.includes(id)

  const renderRow = (profile: PublicProfile, index: number) => (
    <button
      key={`${profile.id}-${index}`}
      type="button"
      onClick={() => (multi ? onToggle?.(profile) : onSelect?.(profile))}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-start transition hover:bg-ink-100/70 dark:hover:bg-ink-800/60"
    >
      <Avatar
        src={profile.avatar_url}
        name={profile.display_name}
        id={profile.id}
        size="md"
        showPresence
        online={onlineUsers[profile.id] || profile.presence === 'online'}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
          {profile.display_name}
        </span>
        <span className="block truncate text-xs text-ink-500 dark:text-ink-400">
          {profile.username ? `@${profile.username}` : profile.about || t('user')}
        </span>
      </span>
      {multi ? (
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full border-2 transition',
            isSelected(profile.id)
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-ink-300 dark:border-ink-600',
          )}
        >
          {isSelected(profile.id) && <Check className="h-3.5 w-3.5" />}
        </span>
      ) : (
        <span className="rounded-full bg-brand-50 p-2 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
          <UserPlus className="h-4 w-4" />
        </span>
      )}
    </button>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-1 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-400" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t('search_users')}
            className="wasel-input ps-10"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {searching && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {!searching && term.trim().length >= 2 && results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-500 dark:text-ink-400">{t('no_results')}</p>
        )}

        {results.length > 0 && (
          <>
            <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">{t('results')}</p>
            {results.map(renderRow)}
          </>
        )}

        {contactProfiles.length > 0 && (
          <>
            <p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-400">
              {t('contacts_title')}
            </p>
            {contactProfiles.map(renderRow)}
          </>
        )}

        {term.trim().length < 2 && contactProfiles.length === 0 && (
          <div className="px-4 py-8 text-center">
            <Mail className="mx-auto mb-3 h-8 w-8 text-ink-300" />
            <p className="text-sm text-ink-500 dark:text-ink-400">{t('search_users')}</p>
            {emptyHint && <p className="mt-1 text-xs text-ink-400">{emptyHint}</p>}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      )}
    </div>
  )
}
