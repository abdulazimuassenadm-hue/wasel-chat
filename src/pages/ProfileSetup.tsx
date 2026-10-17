import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, User as UserIcon } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { TextArea, TextField } from '@/components/ui/Field'
import { isAllowedFile, UPLOAD_LIMITS } from '@/lib/supabase'
import { errorKey, isValidUsername } from '@/lib/utils'
import { NotConfigured } from './NotConfigured'
import { AuthShell } from './AuthShell'

export function ProfileSetup() {
  const { t } = useApp()
  const { publicProfile, configured, updatePublicPatch, updateProfilePatch, saveAvatar, refreshProfile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [about, setAbout] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (publicProfile) {
      setDisplayName((prev) => prev || publicProfile.display_name || '')
      setUsername((prev) => prev || publicProfile.username || '')
      setAbout((prev) => prev || publicProfile.about || '')
    }
  }, [publicProfile])

  if (!configured) return <NotConfigured />

  const pickAvatar = (file: File | null) => {
    if (!file) return
    const check = isAllowedFile(file.type, file.size)
    if (!check.ok) {
      toast.error(check.reason === 'FILE_TYPE_NOT_ALLOWED' ? t('file_type_not_allowed') : t('file_too_large', { n: UPLOAD_LIMITS.avatar }))
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!displayName.trim()) return setError(t('name_required'))
    if (username.trim() && !isValidUsername(username.trim())) return setError(t('username_invalid'))

    setBusy(true)
    try {
      if (avatarFile) {
        try {
          await saveAvatar(avatarFile)
        } catch {
          toast.warning(t('upload_failed'))
        }
      }
      await updatePublicPatch({
        display_name: displayName.trim(),
        username: username.trim() || null,
        about: about.trim(),
      })
      await updateProfilePatch({ onboarded: true })
      await refreshProfile()
      toast.success(t('profile_saved'))
      navigate('/app/chats', { replace: true })
    } catch (err) {
      const key = errorKey(err)
      setError(key === 'username_taken' ? t('username_taken') : t(key))
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    setBusy(true)
    try {
      await updateProfilePatch({ onboarded: true })
      navigate('/app/chats', { replace: true })
    } catch {
      navigate('/app/chats', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title={t('setup_title')} subtitle={t('setup_subtitle')}>
      <form onSubmit={submit} noValidate>
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="relative">
            <Avatar src={avatarPreview} name={displayName || 'U'} id={publicProfile?.id} size="2xl" />
            <label className="absolute -bottom-1 -end-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition hover:bg-brand-700">
              <Camera className="h-4 w-4" />
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => pickAvatar(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <span className="text-xs font-semibold text-ink-500 dark:text-ink-400">{t('setup_choose_avatar')}</span>
        </div>

        <TextField
          label={t('display_name')}
          icon={<UserIcon className="h-4 w-4" />}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={50}
        />
        <TextField
          label={`${t('username')} (${t('optional')})`}
          value={username}
          onChange={(event) => setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          hint={t('setup_username_hint')}
          maxLength={24}
        />
        <TextArea
          label={`${t('about')} (${t('optional')})`}
          value={about}
          onChange={(event) => setAbout(event.target.value)}
          maxLength={160}
        />

        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <Button type="submit" full size="lg" loading={busy}>
          {t('setup_finish')}
        </Button>
        <button
          type="button"
          onClick={() => void skip()}
          disabled={busy}
          className="mt-3 w-full text-center text-xs font-semibold text-ink-400 hover:text-ink-600 disabled:opacity-60 dark:hover:text-ink-200"
        >
          {t('done')}
        </button>
      </form>
    </AuthShell>
  )
}
