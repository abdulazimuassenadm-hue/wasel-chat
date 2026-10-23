import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useChat } from '@/context/ChatContext'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { errorKey } from '@/lib/utils'
import { UserPickerList } from './UserPicker'
import { NewGroupModal } from './NewGroupModal'

interface NewChatModalProps {
  open: boolean
  onClose: () => void
  initialTerm?: string
}

export function NewChatModal({ open, onClose, initialTerm }: NewChatModalProps) {
  const { t } = useApp()
  const { startDirect, onlineUsers } = useChat()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [showGroup, setShowGroup] = useState(false)

  const openUser = async (userId: string) => {
    if (busy) return
    setBusy(true)
    try {
      const conversationId = await startDirect(userId)
      onClose()
      navigate(`/app/chats/${conversationId}`)
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={open && !showGroup}
        onClose={onClose}
        title={t('new_chat')}
        size="md"
        footer={
          <Button
            variant="subtle"
            icon={<Users className="h-4 w-4" />}
            onClick={() => setShowGroup(true)}
            full
          >
            {t('new_group')}
          </Button>
        }
      >
        <div className="flex h-[60dvh] flex-col">
          <UserPickerList
            onSelect={(profile) => void openUser(profile.id)}
            onlineUsers={onlineUsers}
            emptyHint={t('no_contacts_hint')}
            initialTerm={initialTerm}
            autoFocus
          />
        </div>
      </Modal>

      <NewGroupModal
        open={open && showGroup}
        onClose={() => {
          setShowGroup(false)
          onClose()
        }}
      />
    </>
  )
}
