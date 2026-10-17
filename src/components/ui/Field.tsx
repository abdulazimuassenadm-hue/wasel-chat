import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FieldWrapperProps {
  label?: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}

export function FieldWrapper({ label, hint, error, children, className }: FieldWrapperProps) {
  return (
    <div className={cn('mb-4', className)}>
      {label && <label className="wasel-label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  icon?: ReactNode
  wrapperClassName?: string
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, icon, className, wrapperClassName, type = 'text', ...rest },
  ref,
) {
  const [revealed, setRevealed] = useState(false)
  const isPassword = type === 'password'

  return (
    <FieldWrapper label={label} hint={hint} error={error} className={wrapperClassName}>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-400">{icon}</span>
        )}
        <input
          ref={ref}
          type={isPassword && revealed ? 'text' : type}
          className={cn(
            'wasel-input',
            icon ? 'ps-10' : undefined,
            isPassword && 'pe-11',
            error && 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/10',
            className,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            className="absolute inset-y-0 end-2 my-auto flex h-8 w-8 items-center justify-center rounded-full text-ink-400 transition hover:bg-ink-100 dark:hover:bg-ink-800"
            aria-label={revealed ? 'hide password' : 'show password'}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </FieldWrapper>
  )
})

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, className, ...rest },
  ref,
) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        className={cn('wasel-input min-h-[96px] resize-none leading-relaxed', className)}
        {...rest}
      />
    </FieldWrapper>
  )
})

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
}

export function SelectField({ label, hint, error, className, children, ...rest }: SelectFieldProps) {
  return (
    <FieldWrapper label={label} hint={hint} error={error}>
      <select className={cn('wasel-input appearance-none pe-10', className)} {...rest}>
        {children}
      </select>
    </FieldWrapper>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4 py-2.5', disabled && 'opacity-60')}>
      <span>
        {label && <span className="block text-sm font-semibold text-ink-800 dark:text-ink-100">{label}</span>}
        {hint && <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
          checked ? 'bg-brand-600' : 'bg-ink-300 dark:bg-ink-700',
        )}
      >
        <span
          className={cn(
            'absolute h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'start-[22px]' : 'start-0.5',
          )}
        />
      </button>
    </label>
  )
}
