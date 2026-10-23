import * as api from './api'
import { VAPID_PUBLIC_KEY } from './supabase'

/**
 * إدارة اشتراك Web Push لهذا المتصفح/الجهاز.
 *
 * - الاشتراك يُخزَّن في push_subscriptions (كل جهاز صف مستقل).
 * - الإرسال الفعلي يتم من Edge Function تملك المفتاح الخاص (VAPID) ولا يعتمد
 *   على بقاء الصفحة مفتوحة.
 * - المفتاح العام VAPID ليس سراً، ويمكن تضمينه في الحزمة.
 */

export type PushEnableResult =
  | 'ok'
  | 'denied'
  | 'unsupported'
  | 'not_configured'
  | 'error'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) return null
  return navigator.serviceWorker.ready
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  try {
    const registration = await getRegistration()
    if (!registration) return null
    return await registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** يُفعّل الاشتراك بعد موافقة المستخدم، ويسجّله في Supabase. */
export async function enablePush(userId: string): Promise<PushEnableResult> {
  if (!pushSupported()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not_configured'

  try {
    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }
    if (permission !== 'granted') return 'denied'

    const registration = await getRegistration()
    if (!registration) return 'unsupported'

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }

    const json = subscription.toJSON()
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!p256dh || !auth) return 'error'

    await api.savePushSubscription({
      userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent,
    })
    return 'ok'
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[wasel] enablePush failed', error)
    return 'error'
  }
}

/** يُلغي اشتراك هذا الجهاز (إعداد الحساب يوقف الإرسال لكل الأجهزة). */
export async function disablePush(): Promise<void> {
  try {
    const registration = await getRegistration()
    if (!registration) return
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return
    await api.removePushSubscription(subscription.endpoint)
    await subscription.unsubscribe()
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[wasel] disablePush failed', error)
  }
}

/** يغلق إشعار مكالمة معيّنة بعد الرد/الرفض/الانتهاء (إن كان التطبيق مفتوحاً). */
export async function closeCallNotification(callId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    navigator.serviceWorker.controller?.postMessage({ type: 'close-call-notification', callId })
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return
    const notifications = await registration.getNotifications({ tag: `wasel-call-${callId}` })
    for (const notification of notifications) notification.close()
  } catch {
    /* لا شيء */
  }
}
