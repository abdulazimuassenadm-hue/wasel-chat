/* ---------------------------------------------------------------------------
 * Wasel Chat Service Worker
 * ---------------------------------------------------------------------------
 * - لا يخزّن أي طلب في الكاش (حتى لا يظهر إصدار قديم أبداً).
 * - يستقبل Web Push للرسائل والمكالمات عندما تكون الصفحة في الخلفية أو مغلقة.
 * - يفتح المحادثة/المكالمة الصحيحة عند الضغط على الإشعار.
 *
 * الإشعارات لا تحتوي أسراراً: بيانات الاعتماد (VAPID الخاص وTURN) تبقى على
 * الخادم فقط. المفتاح العام VAPID لا يمرّ عبر هذا الملف.
 * ------------------------------------------------------------------------- */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// مستمع فارغ: لا اعتراض ولا تخزين — السلوك الافتراضي (الشبكة) تماماً
self.addEventListener('fetch', () => {})

function appUrl(hashPath) {
  const base = self.registration.scope
  return base + (hashPath.startsWith('#') ? hashPath : `#${hashPath}`)
}

function notificationUrl(data) {
  const conversationId = data.conversationId || ''
  const callId = data.callId || ''
  if (data.type === 'call' && callId) {
    if (conversationId) {
      return appUrl(`/app/chats/${encodeURIComponent(conversationId)}?call=${encodeURIComponent(callId)}`)
    }
    return appUrl(`/app/calls?call=${encodeURIComponent(callId)}`)
  }
  if (conversationId) return appUrl(`/app/chats/${encodeURIComponent(conversationId)}`)
  return self.registration.scope
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const type = payload.type === 'call' ? 'call' : 'message'
  const callId = payload.callId || ''
  const conversationId = payload.conversationId || ''
  const isCall = type === 'call'
  const title = payload.title || (isCall ? 'مكالمة واردة' : 'واصل شات')
  const body = payload.body || ''
  const tag = payload.tag || (isCall && callId ? `wasel-call-${callId}` : `wasel-msg-${conversationId || 'general'}`)
  const lang = payload.lang === 'en' ? 'en' : 'ar'
  const icon = payload.icon || `${self.registration.scope}icon-192.png`

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const appVisible = windows.some((client) => client.focused && client.visibilityState === 'visible')
      // التطبيق أمام المستخدم: واجهة React تتولى التنبيه (رنين/شارة) بدل إشعار مكرر.
      if (appVisible) return

      await self.registration.showNotification(title, {
        body,
        icon,
        badge: `${self.registration.scope}favicon.svg`,
        tag,
        renotify: isCall,
        requireInteraction: isCall,
        silent: payload.silent === true,
        timestamp: Date.now(),
        data: {
          type,
          conversationId,
          messageId: payload.messageId || '',
          callId,
          url: notificationUrl({ type, conversationId, callId }),
        },
        actions: isCall
          ? [
              { action: 'answer', title: lang === 'en' ? 'Answer' : 'رد' },
              { action: 'decline', title: lang === 'en' ? 'Decline' : 'رفض' },
            ]
          : [],
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {}
  event.notification.close()

  const action = event.action || ''
  let url = data.url || notificationUrl(data)
  if (data.type === 'call' && data.callId) {
    // زر الرفض يفتح التطبيق ويُكمل الرفض الموثّق عبر جلسة المستخدم.
    if (action === 'decline') {
      const separator = url.includes('?') ? '&' : '?'
      url = `${url}${separator}action=decline`
    }
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const sameApp = windows.find((client) => client.url.startsWith(self.registration.scope))
      if (sameApp) {
        try {
          const navigated = await sameApp.navigate(url)
          await (navigated || sameApp).focus()
          return
        } catch {
          /* المتابعة إلى فتح نافذة جديدة */
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})

// يسمح للتطبيق بإغلاق إشعار مكالمة انتهت/رُفضت وهو مفتوح.
self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type !== 'close-call-notification' || !data.callId) return
  event.waitUntil(
    self.registration
      .getNotifications({ tag: `wasel-call-${data.callId}` })
      .then((notifications) => notifications.forEach((notification) => notification.close()))
      .catch(() => undefined),
  )
})
