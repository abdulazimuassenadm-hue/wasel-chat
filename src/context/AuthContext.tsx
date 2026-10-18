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
  forgetAccount as forgetStoredAccount,
  getAccount,
  listAccounts,
  markAddingAccount,
  rememberSession,
  setAccountNotice,
  setActiveAccountId,
  updateAccountProfile,
  type SavedAccount,
} from '@/lib/accounts'
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
  /** الحسابات المحفوظة على هذا الجهاز (لتبديل الحساب) */
  accounts: SavedAccount[]
  /** هل الحساب الحالي محفوظ للتبديل السريع؟ */
  currentAccountSaved: boolean
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<{ needsEmailConfirm: boolean }>
  signIn: (input: { email: string; password: string }) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  signOutEverywhere: () => Promise<void>
  /** ينتقل إلى حساب محفوظ آخر بنقرة واحدة */
  switchAccount: (userId: string) => Promise<void>
  /** يبدأ إضافة حساب جديد: يحفظ الحالي ثم يفتح نموذج الدخول */
  addAccount: () => Promise<void>
  /** يحذف حساباً محفوظاً من القائمة */
  forgetAccount: (userId: string) => Promise<void>
  /** يحفظ الحساب الحالي في قائمة التبديل */
  saveCurrentAccount: () => Promise<void>
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
  const [accounts, setAccounts] = useState<SavedAccount[]>(() => listAccounts())
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

  // ---------------------------------------------------------------------------
  // تعدّد الحسابات — نحفظ الجلسة الحالية (ورموزها المُجدَّدة) في قائمة الحسابات
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!session?.user || !session.refresh_token) return
    setAccounts(rememberSession(session))
    setActiveAccountId(session.user.id)
  }, [session])

  // تحديث الاسم/الصورة المحفوظين بعد تحميل الملف العام
  useEffect(() => {
    if (!user || !publicProfile) return
    setAccounts(
      updateAccountProfile(user.id, {
        displayName: publicProfile.display_name,
        avatarUrl: publicProfile.avatar_url,
      }),
    )
  }, [user, publicProfile])

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
    const currentId = user?.id ?? null
    if (user) await setPresence(user.id, 'offline').catch(() => undefined)
    await supabase.auth.signOut()
    // الخروج يعني إزالة الحساب من هذا الجهاز (لا نُبقي جلسة صالحة على جهاز مشترك)
    if (currentId) setAccounts(forgetStoredAccount(currentId))
  }, [user])

  const signOutEverywhere = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'global' })
  }, [])

  /** يحفظ الحساب الحالي في قائمة التبديل (يُستخدم قبل إضافة/تبديل حساب) */
  const saveCurrentAccount = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const current = data.session
    if (!current?.user || !current.refresh_token) return
    setAccounts(
      rememberSession(current, {
        displayName: publicProfile?.display_name ?? null,
        avatarUrl: publicProfile?.avatar_url ?? null,
      }),
    )
    setActiveAccountId(current.user.id)
  }, [publicProfile])

  /**
   * إضافة حساب آخر: نحفظ الحساب الحالي ثم نُنهي جلسته **محلياً فقط**
   * (`scope: 'local'` لا يُلغي رمز التجديد على الخادم) — فيبقى قابلاً للتبديل
   * من القائمة، ثم نفتح نموذج الدخول للحساب الجديد.
   */
  const addAccount = useCallback(async () => {
    setLoading(true)
    try {
      await saveCurrentAccount()
      markAddingAccount()
      if (user) await setPresence(user.id, 'offline').catch(() => undefined)
      await supabase.auth.signOut({ scope: 'local' })
      // إعادة تحميل: تضمن عدم بقاء قنوات Realtime أو بيانات حساب قديم في الذاكرة
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }, [saveCurrentAccount, user])

  /**
   * التبديل إلى حساب محفوظ بنقرة واحدة.
   * الخطوات: نحفظ جلسة الحساب الحالي ← نُبدّل الجلسة ← نتحقق أن رمز التجديد صالح
   * ← نُعيد التحميل لحالة نظيفة تماماً.
   */
  const switchAccount = useCallback(
    async (userId: string) => {
      if (user?.id === userId) return
      const target = getAccount(userId)
      if (!target) throw new Error(t('account_not_saved'))

      setLoading(true)
      const previousId = user?.id ?? null
      try {
        if (user) await setPresence(user.id, 'offline').catch(() => undefined)
        await saveCurrentAccount()

        const { error } = await supabase.auth.setSession({
          access_token: target.accessToken,
          refresh_token: target.refreshToken,
        })
        if (error) throw error

        // تحقّق مبكر: قد يكون رمز التجديد المحفوظ منتهياً أو أُلغي
        const { data, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !data.session) throw refreshError ?? new Error('SESSION_EXPIRED')

        setAccounts(rememberSession(data.session))
        setActiveAccountId(userId)
        setAccountNotice(
          t('account_switch_success', {
            name: target.displayName?.trim() || target.email || '',
          }),
        )
        window.location.reload()
      } catch {
        // فشل التبديل: نُزيل الرموز غير الصالحة ونحاول إعادة الحساب السابق
        setAccounts(forgetStoredAccount(userId))
        const previous = previousId ? getAccount(previousId) : null
        if (previous) {
          await supabase.auth
            .setSession({ access_token: previous.accessToken, refresh_token: previous.refreshToken })
            .catch(() => undefined)
        }
        const { data: stillIn } = await supabase.auth.getSession()
        if (!stillIn.session) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
        throw new Error(t('saved_account_expired'))
      } finally {
        setLoading(false)
      }
    },
    [t, user, saveCurrentAccount],
  )

  /** حذف حساب محفوظ من القائمة (وإن كان الحالي نُنهي جلسته) */
  const forgetAccount = useCallback(
    async (userId: string) => {
      setAccounts(forgetStoredAccount(userId))
      if (user?.id !== userId) return
      if (user) await setPresence(user.id, 'offline').catch(() => undefined)
      await supabase.auth.signOut()
    },
    [user],
  )

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
      accounts,
      currentAccountSaved: Boolean(user && accounts.some((account) => account.id === user.id)),
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      signOutEverywhere,
      switchAccount,
      addAccount,
      forgetAccount,
      saveCurrentAccount,
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
      accounts,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      signOutEverywhere,
      switchAccount,
      addAccount,
      forgetAccount,
      saveCurrentAccount,
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
