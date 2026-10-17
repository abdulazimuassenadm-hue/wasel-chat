import { useParams } from 'react-router-dom'
import { ConversationList } from '@/components/chat/ConversationList'
import { ChatWindow } from '@/components/chat/ChatWindow'
import { cn } from '@/lib/utils'

export function ChatsPage() {
  const { conversationId } = useParams<{ conversationId: string }>()

  return (
    <div className="flex min-h-0 flex-1">
      <div
        className={cn(
          'h-full w-full shrink-0 sm:w-[340px] lg:w-[400px]',
          conversationId && 'hidden sm:block',
        )}
      >
        <ConversationList />
      </div>

      <div className={cn('min-h-0 flex-1', !conversationId && 'hidden sm:flex')}>
        <ChatWindow conversationId={conversationId ?? null} />
      </div>
    </div>
  )
}
