import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, Check, Mail, Phone, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Misc'
import * as api from '@/lib/api'
import { cn, isValidEmail } from '@/lib/utils'
import { isMissingPhoneSearchRpc, isPhoneLike } from '@/lib/phone'
import type { PublicProfile } from '@/types'

interface UserPickerListProps {
  excludedIds?: string[]
  selectedIds?: string[]
  multi?: boolean
  onSelect?: (profile: PublicProfile) => void
  onToggle?: (profile: PublicProfile) => void
  onlineUsers?: Record<string, boolean>
  emptyHint?: string
  /** نص ابتدائي (يُستخدم عند فتح البحث من شاشة المحادثات) */
  initialTerm?: string
  autoFocus?: boolean
}

export function UserPickerList({
  excludedIds = [],
  selectedIds = [],
  multi,
  onSelect,
  onToggle,
  onlineUsers = {},
  emptyHint,
  initialTerm,
  autoFocus,
}: UserPickerListProps) {
  const { t } = useApp()
  const { user } = useAuth()
  const [term, setTerm] = useState(initialTerm ?? '')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [contacts, setContacts] = useState<PublicProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [phoneUnavailable, setPhoneUnavailable] = useState(false)

  // نثبّت المفتاح حتى لا تتغيّر هوية الدالة مع كل رسم (ويمنع تكرار البحث)
  const excludedKey = excludedIds.join('|')
  const excludedSet = useMemo(
    () => new Set(excludedKey ? excludedKey.split('|') : []),
    [excludedKey],
  )

  useEffect(() => {
    if (initialTerm === undefined) return
    setTerm((current) => (current === initialTerm ? current : initialTerm))
  }, [initialTerm])

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
        setPhoneUnavailable(false)
        return
      }
      setSearching(true)
      setPhoneUnavailable(false)
      try {
        const phoneQuery = isPhoneLike(clean)
        const [byName, byPhone] = await Promise.all([
          api.searchUsers(clean, user.id).catch(() => [] as PublicProfile[]),
          phoneQuery
            ? api.searchUserByPhone(clean).catch((error) => {
                if (isMissingPhoneSearchRpc(error)) setPhoneUnavailable(true)
                return [] as PublicProfile[]
              })
            : Promise.resolve([] as PublicProfile[]),
        ])

        const merged: PublicProfile[] = []
        const seen = new Set<string>()
        // نتائج الهاتف أولاً لأنها الأدق عند كتابة رقم
        for (const profile of [...byPhone, ...byName]) {
          if (!profile?.id || seen.has(profile.id)) continue
          seen.add(profile.id)
          merged.push(profile)
        }

        if (isValidEmail(clean)) {
          const byEmail = await api.findByEmail(clean).catch(() => null)
          if (byEmail && !seen.has(byEmail.id)) merged.unshift(byEmail)
        }

        setResults(merged.filter((profile) => !excludedSet.has(profile.id)))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    },
    [user, excludedSet],
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
            className="wasel-input ps-10 pe-10"
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode={isPhoneLike(term) ? 'tel' : 'text'}
            aria-label={t('search_users')}
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              className="absolute inset-y-0 end-2 my-auto flex h-7 w-7 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              aria-label={t('clear')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {phoneUnavailable && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {t('phone_search_unavailable')}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {searching && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {!searching && term.trim().length >= 2 && results.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-semibold text-ink-600 dark:text-ink-300">{t('no_results')}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">{t('search_no_results_hint')}</p>
          </div>
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
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
              <Phone className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-ink-600 dark:text-ink-300">{t('search_users')}</p>
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
