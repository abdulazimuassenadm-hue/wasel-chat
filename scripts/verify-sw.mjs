// اختبار منطق Service Worker دون متصفح (يعمل عبر node scripts/verify-sw.mjs)
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const listeners = new Map()
const scope = 'https://example.test/wasel-chat/'

function createWorker() {
  const shown = []
  const navigations = []
  const opened = []
  const closed = []
  let clientsList = []

  const self = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    skipWaiting: () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => clientsList,
      openWindow: async (url) => {
        opened.push(url)
        return null
      },
    },
    registration: {
      scope,
      showNotification: async (title, options) => shown.push({ title, options }),
      getNotifications: async ({ tag }) => {
        const list = [{ tag, close: () => closed.push(tag) }, { tag: 'other', close: () => closed.push('other') }]
        return list.filter((item) => item.tag === tag)
      },
    },
  }

  const context = vm.createContext({ self, console, URL, TextEncoder, setTimeout })
  vm.runInContext(source, context)

  return {
    shown,
    navigations,
    opened,
    closed,
    setClients: (value) => {
      clientsList = value
    },
  }
}

async function dispatch(type, event) {
  const waits = []
  const handler = listeners.get(type)
  assert.ok(handler, `missing listener ${type}`)
  handler({ ...event, waitUntil: (promise) => waits.push(promise) })
  await Promise.all(waits)
}

// 1) رسالة في الخلفية → إشعار واحد مع رابط المحادثة
{
  const worker = createWorker()
  worker.setClients([])
  await dispatch('push', {
    data: {
      json: () => ({
        type: 'message',
        title: 'أحمد',
        body: 'مرحباً',
        conversationId: 'conv-1',
        tag: 'wasel-msg-conv-1',
        lang: 'ar',
      }),
    },
  })
  assert.equal(worker.shown.length, 1)
  assert.equal(worker.shown[0].options.tag, 'wasel-msg-conv-1')
  assert.match(worker.shown[0].options.data.url, /#\/app\/chats\/conv-1$/)
  assert.equal(worker.shown[0].options.requireInteraction, false)
}

// 2) التطبيق ظاهر → لا إشعار نظام مكرر
{
  const worker = createWorker()
  worker.setClients([{ focused: true, visibilityState: 'visible', url: scope }])
  await dispatch('push', { data: { json: () => ({ type: 'message', conversationId: 'conv-1' }) } })
  assert.equal(worker.shown.length, 0)
}

// 3) مكالمة → إشعار تفاعلي مع زرّي رد/رفض
{
  const worker = createWorker()
  worker.setClients([])
  await dispatch('push', {
    data: {
      json: () => ({
        type: 'call',
        title: 'مكالمة صوتية واردة',
        body: 'سارة',
        callId: 'call-9',
        conversationId: 'conv-2',
        lang: 'ar',
      }),
    },
  })
  assert.equal(worker.shown.length, 1)
  assert.equal(worker.shown[0].options.requireInteraction, true)
  assert.equal(worker.shown[0].options.tag, 'wasel-call-call-9')
  assert.deepEqual(
    Array.from(worker.shown[0].options.actions, (action) => action.action),
    ['answer', 'decline'],
  )
}

// 4) الضغط على إشعار رسالة → فتح المحادثة الصحيحة
{
  const worker = createWorker()
  const client = {
    url: `${scope}#/app/chats/old`,
    focus: async () => {},
    navigate: async (url) => {
      worker.navigations.push(url)
      return { focus: async () => {} }
    },
  }
  worker.setClients([client])
  await dispatch('notificationclick', {
    action: '',
    notification: {
      close: () => {},
      data: { type: 'message', conversationId: 'conv-3', url: `${scope}#/app/chats/conv-3` },
    },
  })
  assert.equal(worker.navigations.length, 1)
  assert.match(worker.navigations[0], /#\/app\/chats\/conv-3$/)
}

// 5) رفض المكالمة من الإشعار → يفتح التطبيق مع action=decline
{
  const worker = createWorker()
  worker.setClients([])
  await dispatch('notificationclick', {
    action: 'decline',
    notification: {
      close: () => {},
      data: {
        type: 'call',
        callId: 'call-9',
        conversationId: 'conv-2',
        url: `${scope}#/app/chats/conv-2?call=call-9`,
      },
    },
  })
  assert.equal(worker.opened.length, 1)
  assert.match(worker.opened[0], /call=call-9&action=decline$/)
}

// 6) إغلاق إشعار مكالمة انتهت من التطبيق
{
  const worker = createWorker()
  await dispatch('message', { data: { type: 'close-call-notification', callId: 'call-9' } })
  assert.deepEqual(worker.closed, ['wasel-call-call-9'])
}

console.log('Service Worker checks passed: 6/6')
