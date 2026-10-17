import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { translate } from '@/lib/i18n'
import { isSystemDark } from '@/lib/utils'
import type { Lang, ThemeMode } from '@/types'

interface AppContextValue {
  lang: Lang
  dir: 'rtl' | 'ltr'
  t: (key: string, vars?: Record<string, string | number>) => string
  setLang: (lang: Lang) => void
  theme: ThemeMode
  isDark: boolean
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  isOnline: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

const LANG_KEY = 'wasel.lang'
const THEME_KEY = 'wasel.theme'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null
    if (value && (allowed as readonly string[]).includes(value)) return value
  } catch {
    /* ignore */
  }
  return fallback
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStored<Lang>(LANG_KEY, ['ar', 'en'], 'ar'))
  const [theme, setThemeState] = useState<ThemeMode>(() =>
    readStored<ThemeMode>(THEME_KEY, ['light', 'dark', 'system'], 'system'),
  )
  const [systemDark, setSystemDark] = useState(() => isSystemDark())
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  const isDark = theme === 'dark' || (theme === 'system' && systemDark)

  // تتبّع تغيّر تفضيل النظام
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  // تطبيق الثيم والاتجاه على عنصر html
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', isDark)
    root.classList.toggle('light', !isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
  }, [isDark])

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  // حالة الاتصال بالشبكة
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark')
  }, [isDark, setTheme])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t,
      setLang,
      theme,
      isDark,
      setTheme,
      toggleTheme,
      isOnline,
    }),
    [lang, t, setLang, theme, isDark, setTheme, toggleTheme, isOnline],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
