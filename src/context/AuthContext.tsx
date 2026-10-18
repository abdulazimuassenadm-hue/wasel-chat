import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
  supabase,
} from '@/lib/supabase'
import { authRedirectUrl } from '@/lib/authRedirect'
import { isNative } from '@/lib/platform'
import {
  createProfileIfMissing,
  getMyProfile,
  getMyPublicProfile,
  setPresence,
  updateMyProfile,
  updatePublicProfile,
  uploadAvatar,
} from '@/lib/api'
import { errorKey } from '@/lib/utils'
import { useApp } from './AppContext'
import type { Profile, PublicProfile } from '@/types'

/**
 * فحص توفّر مزوّد تسجيل دخول خارجي (Google) قبل إعادة توجيه المستخدم.
 *
 * السبب: عند تعطيل المزوّد من إعدادات Supabase، لا يُعيد `signInWithOAuth`
 * خطأً في المتصفح، بل **ينقل المتصفح** إلى واجهة Supabase التي ترد بجسم JSON
 * خام مثل:
 *   {"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}
 * فيبقى المستخدم أمام نص غير مفهوم. الفحص التالي يقرأ الحالة الفعلية من الخادم
 * (`/auth/v1/settings` وهي واجهة عامة آمنة) ويُظهر سبباً واضحاً بدل ذلك.
 *
 * القيمة المُعادة: `true` مُفعّل، `false` غير مُفعّل، `null` تعذّر الفحص
 * (في هذه الحالة نسمح بالمحاولة ولا نُعطّل شيئاً).
 */
let externalProvidersCache: Record<string, boolean> | null = null

async function isExternalProviderEnabled(provider: string): Promise<boolean | null> {
  if (!isSupabaseConfigured) return null
  try {
    if (!externalProvidersCache) {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_ANON_KEY },
      })
      if (!response.ok) return null
      const json = (await response.json()) as { external?: Record<string, boolean> }
      externalProvidersCache = json.external ?? {}
    }
    const value = externalProvidersCache[provider]
    // `undefined` تعني مزوّداً غير معروف في الاستجابة — لا نمنع المحاولة
    return typeof value === 'boolean' ? value : null
  } catch {
    return null
  }
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  publicProfile: PublicProfile | null
  loading: boolean
  initializing: boolean
  isAdmin: boolean
  isSuspended: boolean
  needsOnboarding: boolean
  configured: boolean
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<{ needsEmailConfirm: boolean }>
  signIn: (input: { email: string; password: string }) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  signOutEverywhere: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  resendConfirmation: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  updateProfilePatch: (patch: Partial<Profile>) => Promise<void>
  updatePublicPatch: (patch: Partial<PublicProfile>) => Promise<void>
  saveAvatar: (file: File) => Promise<string>
  clearAvatar: () => Promise<void>
  refreshProfile: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useApp()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [loading, setLoading] = useState(false)
  const loadedFor = useRef<string | null>(null)

  const user = session?.user ?? null

  const loadProfiles = useCallback(async (currentUser: User) => {
    try {
      await createProfileIfMissing(currentUser.id, currentUser.email)
      const [priv, pub] = await Promise.all([
        getMyProfile(currentUser.id),
        getMyPublicProfile(currentUser.id),
      ])
      setProfile(priv)
      setPublicProfile(pub)
      loadedFor.current = currentUser.id
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[wasel] profile load failed', error)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfiles(user)
  }, [user, loadProfiles])

  // الجلسة الأولية + متابعة التغييرات
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setInitializing(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) void loadProfiles(data.session.user)
      setInitializing(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        if (loadedFor.current !== nextSession.user.id) void loadProfiles(nextSession.user)
      } else {
        loadedFor.current = null
        setProfile(null)
        setPublicProfile(null)
      }
      if (event === 'PASSWORD_RECOVERY') {
        // المستخدم وصل عبر رابط استعادة كلمة المرور — نوجّهه إلى صفحة تعيين كلمة المرور
        if (window.location.hash !== '#/reset-password') {
          window.location.hash = '#/reset-password'
        }
      }
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [loadProfiles])

  // مؤشر الاتصال: online / offline مع تحديث دوري لآخر ظهور
  useEffect(() => {
    if (!user || !profile) return
    if (profile.is_suspended) return

    const goOnline = () => void setPresence(user.id, 'online')
    const goAway = () => void setPresence(user.id, 'away')
    const goOffline = () => void setPresence(user.id, 'offline')

    goOnline()
    const interval = window.setInterval(goOnline, 45000)
    const handleVisibility = () => (document.hidden ? goAway() : goOnline())
    const handleUnload = () => goOffline()

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
      goOffline()
    }
  }, [user, profile])

  const signUp = useCallback(
    async ({ email, password, displayName }: { email: string; password: string; displayName: string }) => {
      setLoading(true)
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: authRedirectUrl(),
          },
        })
        if (error) throw error
        // عند تفعيل تأكيد البريد لا توجد جلسة بعد التسجيل
        const needsEmailConfirm = !data.session
        return { needsEmailConfirm }
      } catch (error) {
        const err = new Error(t(errorKey(error)))
        throw err
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      setLoading(true)
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        if (data.user) {
          const priv = await getMyProfile(data.user.id)
          if (priv?.is_suspended) {
            await supabase.auth.signOut()
            throw new Error(t('account_suspended'))
          }
          await loadProfiles(data.user)
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message === t('account_suspended')
            ? error.message
            : t(errorKey(error))
        throw new Error(message)
      } finally {
        setLoading(false)
      }
    },
    [t, loadProfiles],
  )

  const signInWithGoogle = useCallback(async () => {
    setLoading(true)
    try {
      // لا نُرسل المستخدم إلى صفحة JSON خام إن كان المزوّد مُعطّلاً على الخادم
      const enabled = await isExternalProviderEnabled('google')
      if (enabled === false) throw new Error(t('auth_provider_not_enabled'))

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectUrl(),
          // الويب: يتولّى Supabase إعادة التوجيه بنفسه (السلوك السابق دون تغيير).
          // الأصلي: نمنع إعادة التوجيه داخل الـWebView ونفتح المتصفح الخارجي بأنفسنا.
          skipBrowserRedirect: isNative,
        },
      })
      if (error) throw error

      if (isNative && data?.url) {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url: data.url })
      }
    } catch (error) {
      // نُبقي الرسالة الواضحة كما هي بدل استبدالها برسالة عامة
      const message =
        error instanceof Error && error.message === t('auth_provider_not_enabled')
          ? error.message
          : t(errorKey(error))
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }, [t])

  const signOut = useCallback(async () => {
    if (user) await setPresence(user.id, 'offline').catch(() => undefined)
    await supabase.auth.signOut()
  }, [user])

  const signOutEverywhere = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'global' })
  }, [])

  const sendPasswordReset = useCallback(
    async (email: string) => {
      setLoading(true)
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: authRedirectUrl(),
        })
        if (error) throw error
      } catch (error) {
        throw new Error(t(errorKey(error)))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  /**
   * إعادة إرسال رابط تأكيد البريد.
   * يُستخدم عندما يرفض الخادم الدخول بسبب «البريد غير مؤكد» — بدل الاكتفاء بعرض الخطأ.
   */
  const resendConfirmation = useCallback(
    async (email: string) => {
      setLoading(true)
      try {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: { emailRedirectTo: authRedirectUrl() },
        })
        if (error) throw error
      } catch (error) {
        throw new Error(t(errorKey(error)))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  const updatePassword = useCallback(
    async (password: string) => {
      setLoading(true)
      try {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
      } catch (error) {
        throw new Error(t(errorKey(error)))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  const updateProfilePatch = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) return
      const updated = await updateMyProfile(user.id, patch)
      setProfile(updated)
    },
    [user],
  )

  const updatePublicPatch = useCallback(
    async (patch: Partial<PublicProfile>) => {
      if (!user) return
      const updated = await updatePublicProfile(user.id, patch)
      setPublicProfile(updated)
    },
    [user],
  )

  const saveAvatar = useCallback(
    async (file: File) => {
      if (!user) throw new Error('NOT_AUTHENTICATED')
      const url = await uploadAvatar(user.id, file)
      const updated = await updatePublicProfile(user.id, { avatar_url: url })
      setPublicProfile(updated)
      return url
    },
    [user],
  )

  const clearAvatar = useCallback(async () => {
    if (!user) return
    const updated = await updatePublicProfile(user.id, { avatar_url: null })
    setPublicProfile(updated)
  }, [user])

  const deleteAccount = useCallback(async () => {
    await supabase.rpc('delete_my_account_data')
    try {
      await supabase.functions.invoke('delete-account', { body: {} })
    } catch {
      // دالة الحذف النهائي لمستخدم المصادقة تحتاج نشر Edge Function (موثّق في README)
    }
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      publicProfile,
      loading,
      initializing,
      configured: isSupabaseConfigured,
      isAdmin: profile?.role === 'admin',
      isSuspended: Boolean(profile?.is_suspended),
      needsOnboarding: Boolean(profile && !profile.onboarded),
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      signOutEverywhere,
      sendPasswordReset,
      resendConfirmation,
      updatePassword,
      updateProfilePatch,
      updatePublicPatch,
      saveAvatar,
      clearAvatar,
      refreshProfile,
      deleteAccount,
    }),
    [
      session,
      user,
      profile,
      publicProfile,
      loading,
      initializing,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      signOutEverywhere,
      sendPasswordReset,
      resendConfirmation,
      updatePassword,
      updateProfilePatch,
      updatePublicPatch,
      saveAvatar,
      clearAvatar,
      refreshProfile,
      deleteAccount,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
