import { useEffect, useState } from 'react'
import { cn, colorFromId, initials } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  name?: string | null
  id?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  online?: boolean
  showPresence?: boolean
  className?: string
  rounded?: 'full' | 'xl'
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
  '2xl': 'h-28 w-28 text-3xl',
}

const DOT_SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
  xl: 'h-4 w-4',
  '2xl': 'h-5 w-5',
}

export function Avatar({
  src,
  name,
  id,
  size = 'md',
  online,
  showPresence = false,
  className,
  rounded = 'full',
}: AvatarProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const showImage = src && !failed

  return (
    <div className={cn('relative shrink-0', className)}>
      {showImage ? (
        <img
          src={src}
          alt={name ?? 'avatar'}
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn(
            'h-full w-full object-cover ring-1 ring-black/5 dark:ring-white/10',
            rounded === 'full' ? 'rounded-full' : 'rounded-2xl',
            SIZES[size],
          )}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center font-bold text-white',
            rounded === 'full' ? 'rounded-full' : 'rounded-2xl',
            SIZES[size],
          )}
          style={{ backgroundColor: colorFromId(id ?? name) }}
        >
          <span className="select-none leading-none">{initials(name)}</span>
        </div>
      )}

      {showPresence && (
        <span
          className={cn(
            'absolute bottom-0 end-0 rounded-full border-2 border-white dark:border-ink-900',
            DOT_SIZES[size],
            online ? 'bg-emerald-500' : 'bg-ink-400',
          )}
          title={online ? 'online' : 'offline'}
        />
      )}
    </div>
  )
}
