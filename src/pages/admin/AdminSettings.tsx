import { useCallback, useEffect, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { Button } from '@/components/ui/Button'
import { Switch, TextField } from '@/components/ui/Field'
import { SectionCard, Spinner } from '@/components/ui/Misc'
import * as api from '@/lib/api'
import { errorKey } from '@/lib/utils'

interface PlatformSettings {
  registration_open: boolean
  calls_enabled: boolean
  statuses_enabled: boolean
  maintenance_mode: boolean
  max_upload_mb: number
}

const DEFAULTS: PlatformSettings = {
  registration_open: true,
  calls_enabled: true,
  statuses_enabled: true,
  maintenance_mode: false,
  max_upload_mb: 25,
}

export function AdminSettings() {
  const { t } = useApp()
  const { user } = useAuth()
  const toast = useToast()

  const [settings, setSettings] = useState<PlatformSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await api.getAppSettings()
      const platform = rows.find((row) => row.key === 'platform')
      if (platform) {
        const value = platform.value as Partial<PlatformSettings>
        setSettings({ ...DEFAULTS, ...value })
      }
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    void load()
  }, [load])

  const patch = (next: Partial<PlatformSettings>) => setSettings((prev) => ({ ...prev, ...next }))

  const save = async () => {
    if (!user) return
    setSaving(true)
    try {
      const maxUpload = Number.isFinite(settings.max_upload_mb) && settings.max_upload_mb > 0 ? Math.round(settings.max_upload_mb) : DEFAULTS.max_upload_mb
      await api.updateAppSetting(
        'platform',
        {
          registration_open: settings.registration_open,
          calls_enabled: settings.calls_enabled,
          statuses_enabled: settings.statuses_enabled,
          maintenance_mode: settings.maintenance_mode,
          max_upload_mb: maxUpload,
        },
        user.id,
      )
      patch({ max_upload_mb: maxUpload })
      toast.success(t('settings_saved'))
    } catch (error) {
      toast.error(t(errorKey(error)))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-ink-900 dark:text-ink-50">{t('admin_settings')}</h1>
        <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={() => void save()}>
          {t('save')}
        </Button>
      </div>

      <div className="space-y-4">
        <SectionCard title={t('admin_settings')} description={t('app_name')}>
          <Switch
            label={t('registration_open')}
            checked={settings.registration_open}
            onChange={(value) => patch({ registration_open: value })}
          />
          <Switch
            label={t('calls_enabled')}
            checked={settings.calls_enabled}
            onChange={(value) => patch({ calls_enabled: value })}
          />
          <Switch
            label={t('statuses_enabled')}
            checked={settings.statuses_enabled}
            onChange={(value) => patch({ statuses_enabled: value })}
          />
          <Switch
            label={t('maintenance_mode')}
            checked={settings.maintenance_mode}
            onChange={(value) => patch({ maintenance_mode: value })}
          />
        </SectionCard>

        <SectionCard title={t('upload')}>
          <div className="flex items-center gap-3">
            <Settings2 className="h-5 w-5 shrink-0 text-ink-400" />
            <TextField
              wrapperClassName="mb-0 flex-1"
              label={t('max_upload_mb')}
              type="number"
              min={1}
              max={100}
              value={String(settings.max_upload_mb)}
              onChange={(event) => patch({ max_upload_mb: Number(event.target.value) })}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
