import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// قوائم رموز تعبيرية مختارة (بدون مكتبات خارجية لتقليل حجم الحزمة)
const CATEGORIES: Array<{ key: string; label: string; emojis: string[] }> = [
  {
    key: 'smileys',
    label: '🙂',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
      '🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬',
      '😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','😵','🤯','🤠','🥳','😎','🤓',
      '🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞',
      '😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👻','👽','🤖',
    ],
  },
  {
    key: 'gestures',
    label: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍',
      '👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🖕🏻','✍️','💅','🦵','🦶','👂','👃',
    ],
  },
  {
    key: 'hearts',
    label: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️',
      '💋','💌','🔥','✨','⭐','🌟','💫','💥','💯','🎉','🎊','🎈','🎁','🏆','🥇','🎯',
    ],
  },
  {
    key: 'animals',
    label: '🐶',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧',
      '🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🕷️','🦂','🐢','🐍',
      '🦎','🦖','🐙','🦑','🦐','🦞','🦀','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🐘','🦏',
    ],
  },
  {
    key: 'food',
    label: '🍔',
    emojis: [
      '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🥦',
      '🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🧀','🥚','🍳','🧇','🥞','🥓','🥩','🍗',
      '🍖','🌭','🍔','🍟','🍕','🥪','🥙','🌮','🌯','🥗','🍝','🍜','🍲','🍛','🍣','🍤','🍚','🍱','🥟','🍦',
      '🍰','🎂','🧁','🍫','🍬','🍭','🍮','🍯','☕','🍵','🧋','🥤','🧃','🍺','🍻','🥂','🍷','🥃','🍹',
    ],
  },
  {
    key: 'activity',
    label: '⚽',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🥊','🥋','⛳','⛸️','🎿','🛷','🏂',
      '🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🚴','🚵','🎮','🕹️','🎲','♟️','🎭','🎨','🎬',
      '🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻','🎯','🎳','🛹','🛼','🚗','🚕','🚙','🚌','🚎','🏎️',
    ],
  },
  {
    key: 'objects',
    label: '💡',
    emojis: [
      '📱','💻','⌨️','🖥️','🖨️','🖱️','💽','💾','💿','📀','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻',
      '⏰','⌚','📚','📖','📝','✏️','🖊️','🖋️','📌','📍','📎','🖇️','📐','📏','🗂️','📁','📂','🗒️','🗓️','📅',
      '📊','📈','📉','📋','🔒','🔓','🔐','🔑','🗝️','🔨','🪓','⛏️','🔧','🔩','⚙️','🧱','🧲','💊','💉','🩹',
      '🎁','🎀','🛒','💰','💳','💎','⚖️','🧰','🧪','🔬','🔭','📡','🚀','✈️','🛰️','🗺️','🧭','🔔','📢','💡',
    ],
  },
  {
    key: 'symbols',
    label: '✅',
    emojis: [
      '✅','❌','❓','❗','💤','♻️','🔰','⭕','✔️','☑️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺',
      '🔻','🔸','🔹','🔶','🔷','▶️','⏸️','⏹️','⏭️','⏮️','🔀','🔁','🔃','🔄','🔙','🔚','🔛','🔜','🔝','⏳',
      '⌛','📶','📳','📴','🕐','🕑','🕒','🇸🇦','🇦🇪','🇪🇬','🇯🇴','🇲🇦','🇩🇿','🇹🇳','🇰🇼','🇶🇦','🇧🇭','🇴🇲','🇮🇶',
    ],
  },
]

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

interface EmojiPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (emoji: string) => void
  className?: string
}

export function EmojiPicker({ open, onClose, onSelect, className }: EmojiPickerProps) {
  const [category, setCategory] = useState(CATEGORIES[0].key)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onClose()
    }
    const timeout = window.setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, onClose])

  const emojis = useMemo(
    () => CATEGORIES.find((c) => c.key === category)?.emojis ?? CATEGORIES[0].emojis,
    [category],
  )

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute bottom-full z-40 mb-2 w-[300px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft animate-pop-in dark:border-ink-700 dark:bg-ink-900 sm:w-[340px]',
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b border-ink-100 px-2 py-1.5 dark:border-ink-800">
        {CATEGORIES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setCategory(item.key)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl text-lg transition',
              category === item.key ? 'bg-brand-100 dark:bg-brand-950/70' : 'hover:bg-ink-100 dark:hover:bg-ink-800',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji)
              onClose()
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
