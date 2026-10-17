import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, X } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TextArea, TextField } from '@/components/ui/Field'
import * as api from '@/lib/api'
import { errorKey } from '@/lib/utils'
import type { PublicProfile } from '@/types'
import { UserPickerList } from './UserPicker'

interface NewGroupModalProps {
  open: boolean
  onClose: () => void
}

export function NewGroupModal({ open, onClose }: NewGroupModalProps) {
  const { t } = useApp()
  const { user } = useAuth()
  const { createGroup, onlineUsers } = useChat()
  const toast = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState<'members' | 'details'>('members')
  const [selected, setSelected] = useState<PublicProfile[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setStep('members')
    setSelected([])
    setName('')
    setDescription('')
    setAvatarFile(null)
    setAvatarPreview(null)
    setBusy(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const toggle = (profile: PublicProfile) => {
    setSelected((prev) =>
      prev.some((p) => p.id === profile.id) ? prev.filter((p) => p.id !== profile.id) : [...prev, profile],
    )
  }

  const pickAvatar = (file: File | null) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('file_too_large', { n: 5 }))
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t('group_name_required'))
      return
    }
    setBusy(true)
    try {
      const conversationId = await createGroup(
        name.trim(),
        selected.map((p) => p.id),
        description.trim(),
        null,
      )
      if (avatarFile) {
        try {
          const url = await api.uploadGroupAvatar(conversationId, avatarFile)
          await api.updateGroupInfo(conversationId, { avatar_url: url })
        } catch {
          toast.warning(t('upload_failed'))
        }
      }
      close()
      navigate(`/app/chats/${conversationId}`)
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('new_group')}
      size="md"
      footer={
        step === 'members' ? (
          <>
            <Button variant="ghost" onClick={close}>
              {t('cancel')}
            </Button>
            <Button disabled={!selected.length} onClick={() => setStep('details')}>
              {t('next')} ({selected.length})
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('members')}>
              {t('back')}
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              {t('create_group')}
            </Button>
          </>
        )
      }
    >
      {step === 'members' ? (
        <div className="flex h-[60dvh] flex-col">
          {selected.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selected.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => toggle(profile)}
                  className="flex items-center gap-2 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-100"
                >
                  <Avatar src={profile.avatar_url} name={profile.display_name} id={profile.id} size="xs" />
                  <span className="max-w-[120px] truncate">{profile.display_name}</span>
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
          <UserPickerList
            multi
            selectedIds={selected.map((p) => p.id)}
            excludedIds={user ? [user.id] : []}
            onToggle={toggle}
            onlineUsers={onlineUsers}
          />
        </div>
      ) : (
        <div>
          <div className="mb-4 flex flex-col items-center gap-2">
            <div className="relative">
              <Avatar src={avatarPreview} name={name || 'G'} id="group" size="xl" rounded="xl" />
              <label className="absolute -bottom-1 -end-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition hover:bg-brand-700">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => pickAvatar(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {avatarPreview && (
              <button
                type="button"
                onClick={() => {
                  setAvatarFile(null)
                  setAvatarPreview(null)
                }}
                className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
              >
                {t('remove_avatar')}
              </button>
            )}
          </div>
          <TextField
            label={t('group_name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoFocus
          />
          <TextArea
            label={`${t('group_description')} (${t('optional')})`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
          />
          <p className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
            <Check className="h-3.5 w-3.5 text-brand-600" />
            {t('members_count', { n: selected.length })}
          </p>
        </div>
      )}
    </Modal>
  )
}
