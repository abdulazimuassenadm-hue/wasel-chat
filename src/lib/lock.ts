/**
 * قفل التطبيق والمحادثات — يعمل محلياً على الجهاز.
 *
 * - لا يُحفظ رمز PIN كنص صريح أبداً: يُشتق منه مفتاح عبر PBKDF2-SHA256 مع ملح عشوائي.
 * - لا تُرسل بيانات القفل إلى أي خادم، ولا تؤثر على الجلسة أو تسجيل الدخول التلقائي.
 * - البيانات مخزّنة في localStorage تحت مفتاح واحد، والقفل قرار اختياري للمستخدم.
 *
 * ملاحظة أمنية صريحة: هذا قفل واجهة على مستوى الجهاز. لا يحمي البيانات من شخص
 * يملك وصولاً كاملاً إلى تخزين المتصفح/الجهاز، وهو ليس بديلاً عن تشفير الخادم.
 */

const STORAGE_KEY = 'wasel.lock.v1'
const PBKDF2_ITERATIONS = 150_000

export interface LockState {
  enabled: boolean
  /** ملح مُرمّز base64 — لا يُحفظ الرمز نفسه */
  salt: string | null
  /** مشتق PBKDF2 مُرمّز base64 */
  hash: string | null
  iterations: number
  /** طلب الرمز عند فتح التطبيق أو العودة إليه */
  lockOnOpen: boolean
  /** معرّفات المحادثات المقفلة (محلية فقط) */
  lockedChats: string[]
  /** هل فُعّل الفتح عبر مُصادقة الجهاز (WebAuthn) */
  biometric: boolean
  /** معرّف اعتماد WebAuthn المحلي (base64) */
  credentialId: string | null
  createdAt: number | null
}

export const DEFAULT_LOCK_STATE: LockState = {
  enabled: false,
  salt: null,
  hash: null,
  iterations: PBKDF2_ITERATIONS,
  lockOnOpen: true,
  lockedChats: [],
  biometric: false,
  credentialId: null,
  createdAt: null,
}

/** هل تتوفّر أدوات التشفير اللازمة (سياق آمن)؟ */
export function isLockSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  )
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i])
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function randomBase64(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return toBase64(bytes)
}

/** اشتقاق مفتاح من الرمز — لا يعيد الرمز أبداً */
async function derive(pin: string, saltBase64: string, iterations: number): Promise<string> {
  const salt = fromBase64(saltBase64)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return toBase64(bits)
}

export async function createPinRecord(pin: string): Promise<{ salt: string; hash: string; iterations: number }> {
  const salt = randomBase64(16)
  const hash = await derive(pin, salt, PBKDF2_ITERATIONS)
  return { salt, hash, iterations: PBKDF2_ITERATIONS }
}

export async function verifyPinValue(pin: string, state: LockState): Promise<boolean> {
  if (!state.salt || !state.hash) return false
  if (!isLockSupported()) return false
  const candidate = await derive(pin, state.salt, state.iterations || PBKDF2_ITERATIONS)
  return timingSafeEqual(candidate, state.hash)
}

/** مقارنة ثابتة الزمن لتقليل هجمات التوقيت */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function readLockState(): LockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LOCK_STATE }
    const parsed = JSON.parse(raw) as Partial<LockState>
    return {
      ...DEFAULT_LOCK_STATE,
      ...parsed,
      lockedChats: Array.isArray(parsed.lockedChats) ? parsed.lockedChats.filter((id) => typeof id === 'string') : [],
      iterations: typeof parsed.iterations === 'number' && parsed.iterations > 0 ? parsed.iterations : PBKDF2_ITERATIONS,
    }
  } catch {
    return { ...DEFAULT_LOCK_STATE }
  }
}

export function writeLockState(state: LockState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* لا نُفشل التطبيق إن تعذّر الحفظ */
  }
}

/** هل تتوفّر مصادقة الجهاز (بصمة/وجه) على هذه المنصة؟ */
export async function biometricAvailable(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    const cred = (window as unknown as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential
    if (!cred) return false
    const fn = (cred as unknown as { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> })
      .isUserVerifyingPlatformAuthenticatorAvailable
    if (typeof fn !== 'function') return false
    return await fn.call(cred)
  } catch {
    return false
  }
}

/** إنشاء اعتماد محلي على الجهاز لفتح القفل (لا يُرسل لأي خادم). */
export async function registerBiometric(label: string): Promise<string> {
  if (!(await biometricAvailable())) throw new Error('BIOMETRIC_UNAVAILABLE')
  const challenge = new Uint8Array(32)
  crypto.getRandomValues(challenge)
  const userId = new Uint8Array(16)
  crypto.getRandomValues(userId)
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Wasel Chat' },
      user: { id: userId, name: label || 'wasel-user', displayName: label || 'Wasel Chat' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('BIOMETRIC_FAILED')
  return toBase64(credential.rawId)
}

/** التحقق من مصادقة الجهاز للاعتماد المسجّل. */
export async function assertBiometric(credentialIdBase64: string): Promise<boolean> {
  if (!credentialIdBase64) return false
  try {
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: fromBase64(credentialIdBase64), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return Boolean(assertion)
  } catch {
    return false
  }
}
