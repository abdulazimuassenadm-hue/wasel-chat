import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Ban } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { FullPageLoader } from '@/components/ui/Misc'
import { AppLayout } from '@/components/layout/AppLayout'
import { CallOverlay } from '@/components/call/CallOverlay'
import { InstallPrompt } from '@/components/InstallPrompt'

import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { Signup } from '@/pages/Signup'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { ProfileSetup } from '@/pages/ProfileSetup'
import { NotFound } from '@/pages/NotFound'

import { ChatsPage } from '@/pages/ChatsPage'
import { StatusPage } from '@/pages/StatusPage'
import { CallsPage } from '@/pages/CallsPage'
import { ContactsPage } from '@/pages/ContactsPage'
import { SettingsPage } from '@/pages/SettingsPage'

import { AdminLayout } from '@/pages/admin/AdminLayout'
import { AdminDashboard } from '@/pages/admin/AdminDashboard'
import { AdminUsers } from '@/pages/admin/AdminUsers'
import { AdminReports } from '@/pages/admin/AdminReports'
import { AdminGroups } from '@/pages/admin/AdminGroups'
import { AdminSettings } from '@/pages/admin/AdminSettings'

/** شاشة تظهر للحسابات الموقوفة بدلاً من منحها الوصول */
function SuspendedScreen() {
  const { t } = useApp()
  const { signOut } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink-50 px-4 text-center dark:bg-ink-950">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
        <Ban className="h-9 w-9" />
      </span>
      <h1 className="text-xl font-extrabold text-ink-900 dark:text-ink-50">{t('account_suspended')}</h1>
      <p className="max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">{t('permission_denied')}</p>
      <Button variant="outline" onClick={() => void signOut()}>
        {t('logout')}
      </Button>
    </div>
  )
}

/**
 * يحمي الصفحات التي تتطلب تسجيل الدخول.
 * allowOnboarding: للسماح بالوصول إلى صفحة إكمال الملف الشخصي قبل إتمام التهيئة.
 */
function RequireAuth({ allowOnboarding = false }: { allowOnboarding?: boolean }) {
  const { t } = useApp()
  const { initializing, session, profile, isSuspended, needsOnboarding } = useAuth()

  if (initializing) return <FullPageLoader label={t('loading')} />
  if (!session) return <Navigate to="/login" replace />
  if (isSuspended) return <SuspendedScreen />
  // ننتظر تحميل الملف الشخصي قبل اتخاذ أي قرار (تهيئة/صلاحيات) لتفادي القفزات
  if (!profile) return <FullPageLoader label={t('loading')} />
  if (needsOnboarding && !allowOnboarding) return <Navigate to="/setup" replace />

  return <Outlet />
}

/** يحمي لوحة الإدارة: للمديرين المخوّلين فقط */
function RequireAdmin() {
  const { t } = useApp()
  const { initializing, session, profile, isSuspended } = useAuth()

  if (initializing) return <FullPageLoader label={t('loading')} />
  if (!session) return <Navigate to="/login" replace />
  if (isSuspended) return <SuspendedScreen />
  if (!profile) return <FullPageLoader label={t('loading')} />
  if (profile.role !== 'admin') return <Navigate to="/app/chats" replace />

  return <Outlet />
}

/** يمنع المستخدم المسجّل من رؤية صفحات الدخول/التسجيل */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { t } = useApp()
  const { initializing, session, needsOnboarding } = useAuth()

  if (initializing) return <FullPageLoader label={t('loading')} />
  if (session) return <Navigate to={needsOnboarding ? '/setup' : '/app/chats'} replace />

  return <>{children}</>
}

export default function App() {
  return (
    <>
      <Routes>
        {/* الصفحات العامة */}
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnly>
              <Signup />
            </PublicOnly>
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* إكمال الملف الشخصي — يتطلب جلسة لكن لا يتطلب إتمام التهيئة */}
        <Route element={<RequireAuth allowOnboarding />}>
          <Route path="/setup" element={<ProfileSetup />} />
        </Route>

        {/* التطبيق */}
        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Navigate to="/app/chats" replace />} />
            <Route path="chats" element={<ChatsPage />} />
            <Route path="chats/:conversationId" element={<ChatsPage />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        {/* لوحة الإدارة */}
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="groups" element={<AdminGroups />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* واجهة المكالمات (تظهر فقط عند وجود مكالمة نشطة) */}
      <CallOverlay />

      {/* شريط تثبيت التطبيق — يظهر فوراً في المتصفح (ويُخفى داخل التطبيق الأصلي) */}
      <InstallPrompt />
    </>
  )
}
