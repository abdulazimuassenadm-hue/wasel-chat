import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Ban,
  Bell,
  Camera,
  Check,
  Languages,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
  User as UserIcon,
  UserCog,
  UsersRound,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { SelectField, Switch, TextArea, TextField } from '@/components/ui/Field'
import { EmptyState, FullPageLoader, SectionCard, Spinner } from '@/components/ui/Misc'
import { PageHeader } from '@/components/layout/AppLayout'
import { SecuritySection } from '@/components/settings/SecuritySection'
import { AccountsSection } from '@/components/account/AccountSwitcher'
import {
  clearHiddenIdentity,
  getHiddenIdentity,
  isNameHidden,
  setHiddenIdentity,
} from '@/lib/namePrivacy'
import * as api from '@/lib/api'
import { isAllowedFile, UPLOAD_LIMITS, VAPID_PUBLIC_KEY } from '@/lib/supabase'
import { cn, errorKey, isValidUsername } from '@/lib/utils'
import type { PrivacySettings, PublicProfile, ThemeMode, Visibility } from '@/types'

type TabKey = 'profile' | 'accounts' | 'appearance' | 'privacy' | 'security' | 'notifications' | 'blocked' | 'sessions' | 'danger'

const TABS: Array<{ key: TabKey; icon: typeof UserIcon; labelKey: string }> = [
  { key: 'profile', icon: UserIcon, labelKey: 'profile_title' },
  { key: 'accounts', icon: UsersRound, labelKey: 'accounts_section_title' },
  { key: 'appearance', icon: Palette, labelKey: 'appearance' },
  { key: 'privacy', icon: ShieldCheck, labelKey: 'privacy_settings' },
  { key: 'security', icon: Lock, labelKey: 'privacy_security' },
  { key: 'notifications', icon: Bell, labelKey: 'notifications_settings' },
  { key: 'blocked', icon: Ban, labelKey: 'blocked_users' },
  { key: 'sessions', icon: UserCog, labelKey: 'sessions' },
  { key: 'danger', icon: Trash2, labelKey: 'danger_zone' },
]

export function SettingsPage() {
  const { t } = useApp()
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const requested = (params.get('tab') as TabKey | null) ?? 'profile'
  const active: TabKey = TABS.some((tab) => tab.key === requested) ? requested : 'profile'

  if (!profile) return <FullPageLoader label={t('loading')} />

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-ink-900">
      <PageHeader title={t('settings')} />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* تبويبات */}
        <nav className="shrink-0 border-b border-ink-100 px-2 py-2 dark:border-ink-800 lg:w-64 lg:border-b-0 lg:border-e lg:py-4">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar lg:flex-col lg:overflow-visible">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = tab.key === active
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setParams({ tab: tab.key }, { replace: true })}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition lg:w-full',
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200'
                      : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{t(tab.labelKey)}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* المحتوى */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-8">
          <div className="mx-auto max-w-2xl space-y-5">
            {active === 'profile' && <ProfileSection />}
            {active === 'accounts' && <AccountsSection />}
            {active === 'appearance' && <AppearanceSection />}
            {active === 'privacy' && (
              <>
                <PrivacySection />
                <NamePrivacySection />
              </>
            )}
            {active === 'security' && <SecuritySection />}
            {active === 'notifications' && <NotificationsSection />}
            {active === 'blocked' && <BlockedSection />}
            {active === 'sessions' && <SessionsSection />}
            {active === 'danger' && <DangerSection />}

            <p className="pt-2 text-center text-xs font-semibold text-brand-700 dark:text-brand-300">
              {t('footer_supervisor')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// الملف الشخصي
// ============================================================================

function ProfileSection() {
  const { t } = useApp()
  const { user, publicProfile, updatePublicPatch, saveAvatar, clearAvatar } = useAuth()
  const toast = useToast()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [about, setAbout] = useState('')
  const [statusText, setStatusText] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    if (!publicProfile) return
    setDisplayName(publicProfile.display_name ?? '')
    setUsername(publicProfile.username ?? '')
    setAbout(publicProfile.about ?? '')
    setStatusText(publicProfile.status_text ?? '')
  }, [publicProfile])

  const onAvatar = async (file: File | null) => {
    if (!file) return
    const check = isAllowedFile(file.type, file.size)
    if (!check.ok) {
      toast.error(
        check.reason === 'FILE_TYPE_NOT_ALLOWED'
          ? t('file_type_not_allowed')
          : t('file_too_large', { n: UPLOAD_LIMITS.avatar }),
      )
      return
    }
    setAvatarPreview(URL.createObjectURL(file))
    setBusy(true)
    try {
      await saveAvatar(file)
      toast.success(t('avatar_saved'))
    } catch (error) {
      toast.error(t(errorKey(error)))
      setAvatarPreview(null)
    } finally {
      setBusy(false)
    }
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!displayName.trim()) {
      toast.error(t('name_required'))
      return
    }
    if (username.trim() && !isValidUsername(username.trim())) {
      toast.error(t('username_invalid'))
      return
    }
    setBusy(true)
    try {
      const patch: Partial<PublicProfile> = {
        display_name: displayName.trim(),
        username: username.trim() || null,
        about: about.trim(),
        status_text: statusText.trim() || null,
      }
      await updatePublicPatch(patch)
      toast.success(t('profile_updated'))
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SectionCard title={t('edit_profile')}>
        <form onSubmit={save} noValidate>
          <div className="mb-6 flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar
                src={avatarPreview ?? publicProfile?.avatar_url}
                name={displayName || publicProfile?.display_name}
                id={user?.id}
                size="2xl"
              />
              <label className="absolute -bottom-1 -end-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition hover:bg-brand-700">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => void onAvatar(event.target.files?.[0] ?? null)}
                />
              </label>
              {busy && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                  <Spinner className="text-white" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-ink-500 dark:text-ink-400">{t('change_avatar')}</span>
              {publicProfile?.avatar_url && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                >
                  {t('remove_avatar')}
                </button>
              )}
            </div>
          </div>

          <TextField
            label={t('display_name')}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={50}
          />
          <TextField
            label={t('username')}
            value={username}
            onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            hint={t('setup_username_hint')}
            maxLength={24}
          />
          <TextArea
            label={t('about')}
            value={about}
            onChange={(event) => setAbout(event.target.value)}
            maxLength={160}
          />
          <TextField
            label={t('status_text_label')}
            placeholder={t('status_text_placeholder')}
            value={statusText}
            onChange={(event) => setStatusText(event.target.value)}
            maxLength={80}
          />

          <Button type="submit" loading={busy}>
            {t('save')}
          </Button>
        </form>
      </SectionCard>

      <ConfirmDialog
        open={confirmClear}
        title={t('remove_avatar')}
        message={t('remove_avatar')}
        danger
        confirmLabel={t('remove')}
        cancelLabel={t('cancel')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          setConfirmClear(false)
          try {
            await clearAvatar()
            setAvatarPreview(null)
            toast.success(t('profile_updated'))
          } catch (error) {
            toast.error(t(errorKey(error)))
          }
        }}
      />
    </>
  )
}

// ============================================================================
// المظهر
// ============================================================================

function AppearanceSection() {
  const { t, theme, setTheme, lang, setLang } = useApp()

  const themes: Array<{ key: ThemeMode; icon: typeof Sun; labelKey: string }> = [
    { key: 'light', icon: Sun, labelKey: 'theme_light' },
    { key: 'dark', icon: Moon, labelKey: 'theme_dark' },
    { key: 'system', icon: Monitor, labelKey: 'theme_system' },
  ]

  return (
    <>
      <SectionCard title={t('theme')}>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((item) => {
            const Icon = item.icon
            const isActive = theme === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTheme(item.key)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl border p-4 text-xs font-bold transition',
                  isActive
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
                )}
              >
                <Icon className="h-5 w-5" />
                {t(item.labelKey)}
                {isActive && <Check className="h-4 w-4" />}
              </button>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title={t('language')}>
        <div className="grid grid-cols-2 gap-3">
          {(['ar', 'en'] as const).map((code) => {
            const isActive = lang === code
            return (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-2xl border p-4 text-sm font-bold transition',
                  isActive
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800',
                )}
              >
                <Languages className="h-4 w-4" />
                {code === 'ar' ? t('arabic') : t('english')}
                {isActive && <Check className="h-4 w-4" />}
              </button>
            )
          })}
        </div>
      </SectionCard>
    </>
  )
}

// ============================================================================
// الخصوصية
// ============================================================================

function VisibilitySelect({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: Visibility
  onChange: (value: Visibility) => void
}) {
  const { t } = useApp()
  return (
    <SelectField label={label} hint={hint} value={value} onChange={(event) => onChange(event.target.value as Visibility)}>
      <option value="everyone">{t('visibility_everyone')}</option>
      <option value="contacts">{t('visibility_contacts')}</option>
      <option value="nobody">{t('visibility_nobody')}</option>
    </SelectField>
  )
}

function PrivacySection() {
  const { t } = useApp()
  const { profile, updateProfilePatch } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  if (!profile) return null
  const privacy = profile.privacy

  const patch = async (change: Partial<PrivacySettings>) => {
    setSaving(true)
    try {
      await updateProfilePatch({ privacy: { ...privacy, ...change } })
      toast.success(t('settings_saved'))
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard title={t('privacy_settings')} description={t('read_receipts_hint')}>
      <div className={cn('space-y-1', saving && 'opacity-70')}>
        <VisibilitySelect label={t('last_seen_privacy')} value={privacy.last_seen} onChange={(value) => void patch({ last_seen: value })} />
        <VisibilitySelect
          label={t('photo_privacy')}
          value={privacy.profile_photo}
          onChange={(value) => void patch({ profile_photo: value })}
        />
        <VisibilitySelect label={t('status_privacy')} value={privacy.status} onChange={(value) => void patch({ status: value })} />
        <VisibilitySelect
          label={t('who_can_message')}
          value={privacy.who_can_message}
          onChange={(value) => void patch({ who_can_message: value })}
        />
        <div className="mt-2 border-t border-ink-100 pt-2 dark:border-ink-800">
          <Switch
            label={t('read_receipts')}
            hint={t('read_receipts_hint')}
            checked={privacy.read_receipts}
            onChange={(value) => void patch({ read_receipts: value })}
          />
          <p className="mt-2 text-xs leading-relaxed text-ink-400 dark:text-ink-500">{t('read_receipts_note')}</p>
        </div>
      </div>
    </SectionCard>
  )
}

// ============================================================================
// إخفاء الاسم / اسم المستخدم
// ============================================================================

function NamePrivacySection() {
  const { t } = useApp()
  const { user, publicProfile, updatePublicPatch } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  const hidden = isNameHidden(user?.id)
  const alias = t('hide_name_alias')

  const toggle = async (value: boolean) => {
    if (!user) return
    if (!value) {
      // إظهار الاسم من جديد من النسخة المحفوظة محلياً
      const saved = getHiddenIdentity(user.id)
      if (!saved?.displayName) {
        toast.error(t('hide_name_restore_missing'))
        return
      }
      setSaving(true)
      try {
        await updatePublicPatch({
          display_name: saved.displayName,
          username: saved.username ?? null,
        })
        clearHiddenIdentity(user.id)
        toast.success(t('hide_name_off'))
      } catch (error) {
        toast.error(t(errorKey(error)) || t('hide_name_failed'))
      } finally {
        setSaving(false)
      }
      return
    }

    if (!publicProfile) return
    setSaving(true)
    try {
      // نحفظ الاسم الحالي محلياً قبل تغييره
      setHiddenIdentity(user.id, {
        displayName: publicProfile.display_name,
        username: publicProfile.username,
      })
      await updatePublicPatch({ display_name: alias, username: null })
      toast.success(t('hide_name_on'))
    } catch (error) {
      clearHiddenIdentity(user.id)
      toast.error(t(errorKey(error)) || t('hide_name_failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard title={t('name_privacy_title')} description={t('name_privacy_desc')}>
      <div className={cn(saving && 'opacity-70')}>
        <Switch
          label={t('hide_name_toggle')}
          hint={t('hide_name_hint', { alias })}
          checked={hidden}
          onChange={(value) => void toggle(value)}
        />
      </div>
      <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500 dark:border-ink-800 dark:text-ink-400">
        {t('hide_name_note', { alias })}
      </p>
      {hidden && (
        <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-brand-700 dark:text-brand-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('hide_name_active_note')}
        </p>
      )}
    </SectionCard>
  )
}

// ============================================================================
// الإشعارات
// ============================================================================

function NotificationsSection() {
  const { t } = useApp()
  const { profile, updateProfilePatch } = useAuth()
  const toast = useToast()
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [saving, setSaving] = useState(false)

  if (!profile) return null
  const settings = profile.notification_settings

  const patch = async (change: Partial<typeof settings>) => {
    setSaving(true)
    try {
      await updateProfilePatch({ notification_settings: { ...settings, ...change } })
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast.error(t('push_not_supported'))
      return
    }
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') {
        await patch({ browser: true })
        toast.success(t('enable_browser_notifications'))
      } else {
        toast.error(t('browser_notifications_denied'))
      }
    } catch {
      toast.error(t('browser_notifications_denied'))
    }
  }

  return (
    <SectionCard title={t('notifications_settings')}>
      <div className={cn('space-y-0.5', saving && 'opacity-70')}>
        <Switch
          label={t('notification_message')}
          checked={settings.browser}
          onChange={(value) => void patch({ browser: value })}
        />
        <Switch label={t('notification_sounds')} checked={settings.sounds} onChange={(value) => void patch({ sounds: value })} />
        <Switch label={t('notification_preview')} checked={settings.preview} onChange={(value) => void patch({ preview: value })} />
        <Switch
          label={t('notification_reactions')}
          checked={settings.reactions}
          onChange={(value) => void patch({ reactions: value })}
        />
      </div>

      {permission !== 'granted' && (
        <div className="mt-4 rounded-2xl bg-ink-50 p-4 dark:bg-ink-800/60">
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {permission === 'denied'
              ? t('browser_notifications_denied')
              : permission === 'unsupported'
                ? t('push_not_supported')
                : t('enable_browser_notifications')}
          </p>
          <Button size="sm" variant="subtle" onClick={() => void requestPermission()} disabled={permission === 'unsupported'}>
            {t('enable_browser_notifications')}
          </Button>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-400">
        {VAPID_PUBLIC_KEY ? t('enable_browser_notifications') : t('push_requires_setup')}
      </p>
    </SectionCard>
  )
}

// ============================================================================
// المستخدمون المحظورون
// ============================================================================

function BlockedSection() {
  const { t } = useApp()
  const { user } = useAuth()
  const toast = useToast()
  const [blocks, setBlocks] = useState<Array<{ id: string; blocked_id: string; profile: PublicProfile | null }>>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const list = await api.listBlocks(user.id)
      if (!list.length) {
        setBlocks([])
        return
      }
      const profiles = await api.getPublicProfiles(list.map((b) => b.blocked_id))
      const map: Record<string, PublicProfile> = {}
      for (const p of profiles) map[p.id] = p
      setBlocks(list.map((b) => ({ id: b.id, blocked_id: b.blocked_id, profile: map[b.blocked_id] ?? null })))
    } catch {
      setBlocks([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <SectionCard title={t('blocked_users')}>
        {loading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!loading && blocks.length === 0 && (
          <EmptyState icon={<Ban className="h-7 w-7" />} title={t('no_blocked')} />
        )}
        {!loading &&
          blocks.map((block) => (
            <div key={block.id} className="flex items-center gap-3 border-b border-ink-50 py-3 last:border-0 dark:border-ink-800/70">
              <Avatar
                src={block.profile?.avatar_url}
                name={block.profile?.display_name}
                id={block.blocked_id}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
                  {block.profile?.display_name ?? t('user')}
                </p>
                {block.profile?.username && (
                  <p className="truncate text-xs text-ink-500 dark:text-ink-400">@{block.profile.username}</p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm({ id: block.blocked_id, name: block.profile?.display_name ?? t('user') })}
              >
                {t('unblock_user')}
              </Button>
            </div>
          ))}
      </SectionCard>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={t('unblock_user')}
        message={confirm?.name ?? ''}
        confirmLabel={t('unblock_user')}
        cancelLabel={t('cancel')}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm || !user) return
          const target = confirm
          setConfirm(null)
          try {
            await api.unblockUser(user.id, target.id)
            toast.success(t('done'))
            void load()
          } catch (error) {
            toast.error(t(errorKey(error)))
          }
        }}
      />
    </>
  )
}

// ============================================================================
// الجلسات
// ============================================================================

function SessionsSection() {
  const { t } = useApp()
  const { session, signOutEverywhere } = useAuth()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <SectionCard title={t('active_sessions')}>
        <div className="flex items-center gap-3 rounded-2xl bg-ink-50 p-4 dark:bg-ink-800/60">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
            <Monitor className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
              {session?.user?.email ?? t('user')}
            </p>
            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{t('sessions_hint', { n: 1 })}</p>
          </div>
        </div>

        <Button variant="outline" className="mt-4" icon={<LogOut className="h-4 w-4" />} onClick={() => setConfirm(true)}>
          {t('logout_all_devices')}
        </Button>
      </SectionCard>

      <ConfirmDialog
        open={confirm}
        title={t('logout_all_devices')}
        message={t('sessions_hint', { n: 1 })}
        confirmLabel={t('logout_all_devices')}
        cancelLabel={t('cancel')}
        loading={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true)
          try {
            await signOutEverywhere()
            toast.success(t('sign_out_everywhere_done'))
          } catch (error) {
            toast.error(t(errorKey(error)))
          } finally {
            setBusy(false)
            setConfirm(false)
          }
        }}
      />
    </>
  )
}

// ============================================================================
// منطقة الخطر
// ============================================================================

function DangerSection() {
  const { t } = useApp()
  const { deleteAccount } = useAuth()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const canDelete = text.trim().toUpperCase() === 'DELETE'

  return (
    <>
      <SectionCard className="border-rose-200 dark:border-rose-900/60">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-700 dark:text-rose-300">{t('delete_account')}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{t('delete_account_hint')}</p>
            <Button variant="danger" className="mt-4" onClick={() => setConfirm(true)}>
              {t('delete_account')}
            </Button>
          </div>
        </div>
      </SectionCard>

      <Modal
        open={confirm}
        onClose={() => {
          setConfirm(false)
          setText('')
        }}
        title={t('delete_account')}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirm(false)
                setText('')
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!canDelete}
              onClick={async () => {
                if (!canDelete) {
                  toast.error(t('confirm_delete_account'))
                  return
                }
                setBusy(true)
                try {
                  await deleteAccount()
                  toast.success(t('account_deleted'))
                } catch (error) {
                  toast.error(t(errorKey(error)))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('delete_account_button')}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{t('delete_account_hint')}</p>
        <label className="wasel-label mt-4 block">{t('confirm_delete_account')}</label>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="DELETE"
          className="wasel-input"
        />
      </Modal>
    </>
  )
}
