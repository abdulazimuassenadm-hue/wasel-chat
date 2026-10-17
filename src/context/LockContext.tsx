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
import {
  assertBiometric,
  biometricAvailable,
  createPinRecord,
  DEFAULT_LOCK_STATE,
  isLockSupported,
  readLockState,
  registerBiometric,
  verifyPinValue,
  writeLockState,
  type LockState,
} from '@/lib/lock'

/** أقل طول مقبول لرمز القفل */
export const MIN_PIN_LENGTH = 4

interface LockContextValue {
  /** هل المنصة تدعم القفل (سياق آمن + WebCrypto)؟ */
  supported: boolean
  enabled: boolean
  /** التطبيق مقفل حالياً وينتظر المصادقة */
  locked: boolean
  lockOnOpen: boolean
  lockedChats: string[]
  biometricEnabled: boolean
  biometricSupported: boolean
  ready: boolean
  /** تعيين/تغيير الرمز وتفعيل القفل */
  setPin: (pin: string) => Promise<void>
  /** التحقق من الرمز دون تغيير حالة القفل */
  verify: (pin: string) => Promise<boolean>
  /** إلغاء تفعيل القفل (يتطلب الرمز الحالي) */
  disable: (pin: string) => Promise<boolean>
  /** فتح قفل التطبيق */
  unlock: (pin: string) => Promise<boolean>
  unlockWithBiometric: () => Promise<boolean>
  lockNow: () => void
  setLockOnOpen: (value: boolean) => void
  enableBiometric: () => Promise<boolean>
  disableBiometric: () => void
  isChatLocked: (conversationId: string) => boolean
  toggleChatLock: (conversationId: string) => void
  /** محادثات فُتحت مؤقتاً في هذه الجلسة بعد التحقق */
  isChatUnlocked: (conversationId: string) => boolean
  markChatUnlocked: (conversationId: string) => void
}

const LockContext = createContext<LockContextValue | null>(null)

export function LockProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LockState>(() => ({ ...DEFAULT_LOCK_STATE }))
  const [ready, setReady] = useState(false)
  const [locked, setLocked] = useState(false)
  const [biometricSupported, setBiometricSupported] = useState(false)
  const [sessionUnlocked, setSessionUnlocked] = useState<string[]>([])
  const hiddenAt = useRef<number | null>(null)
  const initialised = useRef(false)

  const supported = isLockSupported()

  // تحميل الحالة مرة واحدة عند الإقلاع + قفل التطبيق فوراً إن كان مفعّلاً
  useEffect(() => {
    const stored = readLockState()
    setState(stored)
    if (stored.enabled && stored.lockOnOpen && stored.hash) setLocked(true)
    setReady(true)
    void biometricAvailable().then(setBiometricSupported)
  }, [])

  const persist = useCallback((next: LockState) => {
    setState(next)
    writeLockState(next)
  }, [])

  // القفل عند العودة للتطبيق بعد غياب (لا يقفل عند مجرد تبديل سريع)
  useEffect(() => {
    if (!state.enabled || !state.lockOnOpen) return
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now()
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > 30_000) {
        setLocked(true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [state.enabled, state.lockOnOpen])

  const setPin = useCallback(
    async (pin: string) => {
      if (!supported) throw new Error('LOCK_UNSUPPORTED')
      const record = await createPinRecord(pin)
      const next: LockState = {
        ...state,
        enabled: true,
        salt: record.salt,
        hash: record.hash,
        iterations: record.iterations,
        createdAt: state.createdAt ?? Date.now(),
      }
      persist(next)
      // بعد التعيين يقفل فوراً مرة واحدة ليتأكد المستخدم من عمله، ثم يُفك تلقائياً
      initialised.current = true
      setLocked(false)
    },
    [persist, state, supported],
  )

  const verify = useCallback((pin: string) => verifyPinValue(pin, state), [state])

  const disable = useCallback(
    async (pin: string) => {
      if (!(await verifyPinValue(pin, state))) return false
      persist({
        ...DEFAULT_LOCK_STATE,
        lockedChats: [],
        lockOnOpen: state.lockOnOpen,
        createdAt: null,
      })
      setLocked(false)
      setSessionUnlocked([])
      return true
    },
    [persist, state],
  )

  const unlock = useCallback(
    async (pin: string) => {
      if (!state.enabled) return true
      if (await verifyPinValue(pin, state)) {
        setLocked(false)
        return true
      }
      return false
    },
    [state],
  )

  const unlockWithBiometric = useCallback(async () => {
    if (!state.biometric || !state.credentialId) return false
    const ok = await assertBiometric(state.credentialId)
    if (ok) setLocked(false)
    return ok
  }, [state.biometric, state.credentialId])

  const lockNow = useCallback(() => {
    if (state.enabled) {
      setSessionUnlocked([])
      setLocked(true)
    }
  }, [state.enabled])

  const setLockOnOpen = useCallback(
    (value: boolean) => {
      persist({ ...state, lockOnOpen: value })
    },
    [persist, state],
  )

  const enableBiometric = useCallback(async () => {
    try {
      const credentialId = await registerBiometric('wasel-user')
      persist({ ...state, biometric: true, credentialId })
      return true
    } catch {
      return false
    }
  }, [persist, state])

  const disableBiometric = useCallback(() => {
    persist({ ...state, biometric: false, credentialId: null })
  }, [persist, state])

  const isChatLocked = useCallback(
    (conversationId: string) => state.lockedChats.includes(conversationId),
    [state.lockedChats],
  )

  const toggleChatLock = useCallback(
    (conversationId: string) => {
      const exists = state.lockedChats.includes(conversationId)
      const lockedChats = exists
        ? state.lockedChats.filter((id) => id !== conversationId)
        : [...state.lockedChats, conversationId]
      persist({ ...state, lockedChats })
      if (!exists) setSessionUnlocked((prev) => prev.filter((id) => id !== conversationId))
    },
    [persist, state],
  )

  const isChatUnlocked = useCallback(
    (conversationId: string) => sessionUnlocked.includes(conversationId),
    [sessionUnlocked],
  )

  const markChatUnlocked = useCallback((conversationId: string) => {
    setSessionUnlocked((prev) => (prev.includes(conversationId) ? prev : [...prev, conversationId]))
  }, [])

  const value = useMemo<LockContextValue>(
    () => ({
      supported,
      enabled: state.enabled,
      locked: state.enabled && locked,
      lockOnOpen: state.lockOnOpen,
      lockedChats: state.lockedChats,
      biometricEnabled: state.biometric,
      biometricSupported,
      ready,
      setPin,
      verify,
      disable,
      unlock,
      unlockWithBiometric,
      lockNow,
      setLockOnOpen,
      enableBiometric,
      disableBiometric,
      isChatLocked,
      toggleChatLock,
      isChatUnlocked,
      markChatUnlocked,
    }),
    [
      supported,
      state.enabled,
      state.lockOnOpen,
      state.lockedChats,
      state.biometric,
      biometricSupported,
      ready,
      locked,
      setPin,
      verify,
      disable,
      unlock,
      unlockWithBiometric,
      lockNow,
      setLockOnOpen,
      enableBiometric,
      disableBiometric,
      isChatLocked,
      toggleChatLock,
      isChatUnlocked,
      markChatUnlocked,
    ],
  )

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>
}

export function useLock(): LockContextValue {
  const ctx = useContext(LockContext)
  if (!ctx) throw new Error('useLock must be used inside LockProvider')
  return ctx
}
