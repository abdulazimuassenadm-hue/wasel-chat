import { useCallback, useEffect, useState } from 'react'
import { Flag } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SelectField, TextArea } from '@/components/ui/Field'
import { Badge, EmptyState, Spinner } from '@/components/ui/Misc'
import * as api from '@/lib/api'
import { errorKey, formatDateTime } from '@/lib/utils'
import type { Report, ReportStatus } from '@/types'

const STATUS_TONE: Record<ReportStatus, 'amber' | 'sky' | 'emerald' | 'ink'> = {
  open: 'amber',
  reviewing: 'sky',
  resolved: 'emerald',
  dismissed: 'ink',
}

const STATUS_KEYS: Record<ReportStatus, string> = {
  open: 'report_status_open',
  reviewing: 'report_status_reviewing',
  resolved: 'report_status_resolved',
  dismissed: 'report_status_dismissed',
}

export function AdminReports() {
  const { t, lang } = useApp()
  const { user } = useAuth()
  const toast = useToast()

  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Report | null>(null)
  const [status, setStatus] = useState<ReportStatus>('open')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setReports(await api.adminListReports())
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    void load()
  }, [load])

  const openEditor = (report: Report) => {
    setEditing(report)
    setStatus(report.status)
    setNote(report.admin_note ?? '')
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await api.adminUpdateReport(editing.id, {
        status,
        admin_note: note.trim() || undefined,
        reviewed_by: user?.id,
      })
      setReports((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...r, status, admin_note: note.trim() || null, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }
            : r,
        ),
      )
      toast.success(t('report_updated'))
      setEditing(null)
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink-900 dark:text-ink-50">{t('admin_reports')}</h1>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          {t('refresh')}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState icon={<Flag className="h-7 w-7" />} title={t('no_reports')} />
      ) : (
        <div className="space-y-2.5">
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => openEditor(report)}
              className="wasel-card flex w-full flex-wrap items-start gap-3 p-3.5 text-start transition hover:border-brand-300 dark:hover:border-brand-800 sm:flex-nowrap"
            >
              <Avatar src={report.reported?.avatar_url} name={report.reported?.display_name ?? '?'} id={report.reported?.id} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={STATUS_TONE[report.status]}>{t(STATUS_KEYS[report.status])}</Badge>
                  <span className="text-xs font-semibold text-ink-500 dark:text-ink-400">{report.reason}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-ink-900 dark:text-ink-50">
                  {t('report_against')}: {report.reported?.display_name ?? '—'}
                </p>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  {t('report_from')}: {report.reporter?.display_name ?? '—'} · {formatDateTime(report.created_at, lang)}
                </p>
                {report.details && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{report.details}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t('report_title')}
        subtitle={editing ? `${t('report_against')}: ${editing.reported?.display_name ?? '—'}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('cancel')}
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              {t('save')}
            </Button>
          </>
        }
      >
        {editing && (
          <div>
            <div className="mb-4 rounded-2xl bg-ink-50 px-4 py-3 dark:bg-ink-800/60">
              <p className="text-xs font-bold uppercase text-ink-400">{t('report_reason')}</p>
              <p className="mt-1 text-sm font-semibold text-ink-800 dark:text-ink-100">{editing.reason}</p>
              {editing.details && <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{editing.details}</p>}
              <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                {t('report_from')}: {editing.reporter?.display_name ?? '—'} · {formatDateTime(editing.created_at, lang)}
              </p>
            </div>

            <SelectField label={t('change_status')} value={status} onChange={(event) => setStatus(event.target.value as ReportStatus)}>
              <option value="open">{t('report_status_open')}</option>
              <option value="reviewing">{t('report_status_reviewing')}</option>
              <option value="resolved">{t('report_status_resolved')}</option>
              <option value="dismissed">{t('report_status_dismissed')}</option>
            </SelectField>

            <TextArea
              label={t('admin_note')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('report_placeholder')}
              maxLength={500}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
