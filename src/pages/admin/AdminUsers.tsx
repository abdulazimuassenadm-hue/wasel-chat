import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Ban, CheckCircle2, Search, ShieldCheck, Trash2, UserCog } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Badge, EmptyState, Spinner } from '@/components/ui/Misc'
import * as api from '@/lib/api'
import { cn, errorKey, formatDateTime } from '@/lib/utils'
import type { PublicProfile } from '@/types'

type AdminUser = PublicProfile & { email: string | null; role: string; is_suspended: boolean }

export function AdminUsers() {
  const { t, lang } = useApp()
  const toast = useToast()

  const [term, setTerm] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null)

  const load = useCallback(
    async (search: string) => {
      setLoading(true)
      try {
        setUsers(await api.adminListUsers(search))
      } catch (error) {
        toast.error(t(errorKey(error)))
      } finally {
        setLoading(false)
      }
    },
    [t, toast],
  )

  useEffect(() => {
    void load('')
  }, [load])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    void load(term)
  }

  const toggleSuspend = async (user: AdminUser) => {
    setBusyId(user.id)
    try {
      const next = !user.is_suspended
      await api.adminSetSuspended(user.id, next)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_suspended: next } : u)))
      toast.success(next ? t('user_suspended_toast') : t('user_activated_toast'))
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setBusyId(null)
    }
  }

  const toggleRole = async (user: AdminUser) => {
    setBusyId(user.id)
    try {
      const nextRole: 'user' | 'admin' = user.role === 'admin' ? 'user' : 'admin'
      await api.adminSetRole(user.id, nextRole)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: nextRole } : u)))
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setBusyId(pendingDelete.id)
    try {
      await api.deleteUserData(pendingDelete.id)
      setUsers((prev) => prev.filter((u) => u.id !== pendingDelete.id))
      toast.success(t('account_deleted'))
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setBusyId(null)
      setPendingDelete(null)
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-ink-900 dark:text-ink-50">{t('admin_users')}</h1>
        <form onSubmit={submitSearch} className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-400" />
          <input
            className="wasel-input ps-10"
            placeholder={t('search_users_admin')}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={<UserCog className="h-7 w-7" />} title={t('no_results')} />
      ) : (
        <div className="space-y-2.5">
          {users.map((user) => (
            <div key={user.id} className="wasel-card flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap">
              <Avatar src={user.avatar_url} name={user.display_name} id={user.id} size="md" showPresence online={user.presence === 'online'} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{user.display_name}</p>
                  {user.role === 'admin' && (
                    <Badge color="brand">
                      <ShieldCheck className="me-1 h-3 w-3" />
                      {t('admin')}
                    </Badge>
                  )}
                  {user.is_suspended && <Badge color="rose">{t('suspend_user')}</Badge>}
                </div>
                <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                  {user.email || user.username || '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-400">
                  {t('joined_at')}: {formatDateTime(user.created_at, lang)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  variant={user.is_suspended ? 'subtle' : 'outline'}
                  loading={busyId === user.id}
                  disabled={busyId === user.id}
                  icon={user.is_suspended ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                  onClick={() => void toggleSuspend(user)}
                >
                  {user.is_suspended ? t('activate_user') : t('suspend_user')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === user.id}
                  title={user.role === 'admin' ? t('demote_to_member') : t('promote_to_admin')}
                  onClick={() => void toggleRole(user)}
                  className={cn('px-2')}
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === user.id}
                  title={t('delete_user_data')}
                  onClick={() => setPendingDelete(user)}
                  className="px-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('delete_user_data')}
        message={`${pendingDelete?.display_name ?? ''} — ${t('confirm_delete_account')}`}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        loading={busyId === pendingDelete?.id}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
