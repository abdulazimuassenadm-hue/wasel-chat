import { useState } from 'react'
import { BadgeCheck, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'
import { SectionCard } from '@/components/ui/Misc'
import { MAX_SAVED_ACCOUNTS, accountLabel, type SavedAccount } from '@/lib/accounts'
import { cn } from '@/lib/utils'

/**
 * قائمة الحسابات المحفوظة على هذا الجهاز.
 *
 * تُستخدم في مكانين: نافذة «تبديل الحساب» على الحاسوب (NavRail)، وقسم «الحسابات»
 * في الإعدادات (وهو الطريق الوحيد على الجوال لأن شريط التنقّل السفلي لا يحمل قائمة حساب).
 */

function formatLastUsed(timestamp: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' }).format(
      new Date(timestamp),
    )
  } catch {
    return new Date(timestamp).toLocaleDateString()
  }
}

interface AccountListProps {
  /** يُطلب بعد نجاح عملية لا تُعيد تحميل الصفحة (إزالة حساب) */
  onChanged?: () => void
}

export function AccountList({ onChanged }: AccountListProps) {
  const { t, lang } = useApp()
  const { user, accounts, switchAccount, addAccount, forgetAccount } = useAuth()
  const toast = useToast()
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [toRemove, setToRemove] = useState<SavedAccount | null>(null)
  const [removing, setRemoving] = useState(false)

  const atMax = accounts.length >= MAX_SAVED_ACCOUNTS

  const handleSwitch = async (account: SavedAccount) => {
    setPendingSwitchId(account.id)
    try {
      await switchAccount(account.id)
      // نُبقي الحالة «جارٍ التبديل…» — الصفحة ستُعاد تحميلها بالحساب الجديد
    } catch (error) {
      setPendingSwitchId(null)
      toast.error(error instanceof Error ? error.message : t('accounts_switch_failed'))
    }
  }

  const handleAdd = async () => {
    setAdding(true)
    try {
      await addAccount()
    } catch (error) {
      setAdding(false)
      toast.error(error instanceof Error ? error.message : t('accounts_switch_failed'))
    }
  }

  const handleRemove = async () => {
    if (!toRemove) return
    setRemoving(true)
    try {
      await forgetAccount(toRemove.id)
      toast.info(t('account_removed'))
      setToRemove(null)
      onChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('accounts_switch_failed'))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-4">
      {accounts.length === 0 && (
        <p className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-500 dark:bg-ink-800/60 dark:text-ink-400">
          {t('accounts_empty')}
        </p>
      )}

      {accounts.length > 0 && (
        <ul className="space-y-2">
          {accounts.map((account) => {
            const isCurrent = account.id === user?.id
            const isSwitching = pendingSwitchId === account.id
            return (
              <li
                key={account.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition',
                  isCurrent
                    ? 'border-brand-300 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-950/40'
                    : 'border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900',
                )}
              >
                <Avatar src={account.avatarUrl} name={accountLabel(account)} id={account.id} size="sm" />

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                    <span className="truncate">{accountLabel(account)}</span>
                    {isCurrent && (
                      <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
                    )}
                  </p>
                  {account.email && account.email !== account.displayName && (
                    <p className="truncate text-xs text-ink-500 dark:text-ink-400">{account.email}</p>
                  )}
                  <p className="mt-0.5 truncate text-[11px] text-ink-400 dark:text-ink-500">
                    {isCurrent
                      ? t('accounts_current')
                      : t('accounts_last_used', { date: formatLastUsed(account.lastUsedAt, lang) })}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant={pendingSwitchId ? 'outline' : 'primary'}
                      loading={isSwitching}
                      disabled={Boolean(pendingSwitchId) || adding}
                      icon={!isSwitching ? <RefreshCw className="h-3.5 w-3.5" /> : undefined}
                      onClick={() => void handleSwitch(account)}
                    >
                      {isSwitching ? t('accounts_switching') : t('accounts_switch')}
                    </Button>
                  )}
                  <button
                    type="button"
                    title={isCurrent ? t('accounts_signout_current') : t('accounts_remove')}
                    aria-label={isCurrent ? t('accounts_signout_current') : t('accounts_remove')}
                    disabled={Boolean(pendingSwitchId)}
                    onClick={() => setToRemove(account)}
                    className="rounded-xl p-2 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Button
        variant="outline"
        full
        disabled={atMax || adding || Boolean(pendingSwitchId)}
        loading={adding}
        icon={!adding ? <Plus className="h-4 w-4" /> : undefined}
        onClick={() => void handleAdd()}
      >
        {adding ? t('accounts_adding') : t('accounts_add')}
      </Button>

      <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">
        {accounts.length > 0 ? t('accounts_add_hint') : t('accounts_section_desc')}
      </p>

      {atMax && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          {t('accounts_max_note', { n: MAX_SAVED_ACCOUNTS })}
        </p>
      )}

      <ConfirmDialog
        open={Boolean(toRemove)}
        title={t('account_remove_title')}
        message={
          toRemove?.id === user?.id ? t('account_remove_self_desc') : t('account_remove_desc')
        }
        confirmLabel={t('accounts_remove')}
        cancelLabel={t('cancel')}
        danger
        loading={removing}
        onConfirm={() => void handleRemove()}
        onCancel={() => setToRemove(null)}
      />
    </div>
  )
}

/** قسم «الحسابات» في صفحة الإعدادات — يعمل على الجوال والحاسوب */
export function AccountsSection() {
  const { t } = useApp()

  return (
    <SectionCard title={t('accounts_section_title')} description={t('accounts_section_desc')}>
      <AccountList />
      <p className="mt-4 border-t border-ink-100 pt-3 text-[11px] leading-relaxed text-ink-500 dark:border-ink-800 dark:text-ink-400">
        {t('accounts_device_note')}
      </p>
    </SectionCard>
  )
}

/**
 * نافذة تبديل الحساب — تُفتح من شريط التنقّل الجانبي (تظهر على الحاسوب فقط،
 * أما على الجوال فالطريق هو قسم «الحسابات» في الإعدادات).
 */
export function AccountSwitcherModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp()
  const { accounts } = useAuth()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('accounts_title')}
      subtitle={t('accounts_saved_on_device')}
      size="sm"
    >
      <AccountList onChanged={accounts.length <= 1 ? onClose : undefined} />
    </Modal>
  )
}

/** الزر العائم الذي يفتح نافذة تبديل الحساب (يُستخدم في شريط التنقّل) */
export function AccountSwitcherButton() {
  const { t } = useApp()
  const { accounts } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('accounts_title')}
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-ink-500 transition hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
      >
        <UserPlus className="h-5 w-5" />
        {accounts.length > 1 && (
          <span className="absolute bottom-2 end-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
            {accounts.length}
          </span>
        )}
      </button>
      <AccountSwitcherModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
