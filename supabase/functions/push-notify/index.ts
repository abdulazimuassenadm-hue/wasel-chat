// ============================================================================
// Wasel Chat | Edge Function: push-notify
// ----------------------------------------------------------------------------
// تُستدعى من Supabase Database Webhooks عند:
//   1) إدخال صف في public.messages  → إشعارات الرسائل
//   2) إدخال صف في public.calls     → إشعارات المكالمات الواردة
//
// الأمان:
//   - المفتاح الخاص VAPID وكلمة سر الـwebhook ومفتاح service_role تبقى في
//     متغيرات بيئة Supabase فقط، ولا تُرسل إلى المتصفح.
//   - تتحقق الدالة من ترويسة X-Webhook-Secret (أو Bearer service_role) قبل أي عمل.
//
// الإعداد (مرة واحدة):
//   supabase functions deploy push-notify --no-verify-jwt
//   supabase secrets set \
//     VAPID_SUBJECT="mailto:admin@example.com" \
//     VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." \
//     PUSH_WEBHOOK_SECRET="<سلسلة عشوائية طويلة>"
//   ثم أنشئ Database Webhook من لوحة Supabase:
//     - messages / INSERT → .../functions/v1/push-notify
//     - calls    / INSERT → .../functions/v1/push-notify
//     مع ترويسة: x-webhook-secret: <نفس القيمة>
//
// جدول push_deliveries (في migration الإشعارات) يمنع تكرار الإرسال.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') || ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || ''
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface ProfileRow {
  id: string
  language: string | null
  is_suspended: boolean
  notification_settings: Record<string, unknown> | null
}

interface SubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function enabled(settings: Record<string, unknown> | null, key: string): boolean {
  if (!settings) return true
  return settings[key] !== false
}

function previewOf(message: Record<string, unknown>, language: 'ar' | 'en'): string {
  const type = String(message.type || 'text')
  if (type === 'image') return language === 'en' ? 'Photo' : 'صورة'
  if (type === 'video') return language === 'en' ? 'Video' : 'فيديو'
  if (type === 'audio') return language === 'en' ? 'Voice message' : 'رسالة صوتية'
  if (type === 'file') return language === 'en' ? 'Document' : 'ملف'
  const metadata = (message.metadata || {}) as Record<string, unknown>
  if (typeof metadata.sticker === 'string') return language === 'en' ? 'Sticker' : 'ملصق'
  return String(message.body || '').slice(0, 140)
}

async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data } = await admin
    .from('profiles')
    .select('id, language, is_suspended, notification_settings')
    .eq('id', userId)
    .maybeSingle()
  return (data as ProfileRow | null) ?? null
}

async function getPublicProfile(userId: string): Promise<{ display_name?: string; avatar_url?: string | null } | null> {
  // نستخدم دالة الخصوصية نفسها التي تستخدمها الواجهة؛ service_role لا يملك جلسة
  // لذلك تُطبَّق أشد قيود الخصوصية على الصورة (ولن تتسرب صورة مخفية).
  const { data } = await admin.rpc('get_user_public_profile', { p_user: userId })
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}

/** حجز إرسال واحد فقط لكل (مستخدم، رسالة/مكالمة). */
async function claimDelivery(userId: string, dedupeKey: string): Promise<boolean> {
  const { error } = await admin.from('push_deliveries').insert({ user_id: userId, dedupe_key: dedupeKey })
  if (!error) return true
  if (error.code === '23505') return false
  throw error
}

async function sendToUser(
  userId: string,
  payload: Record<string, unknown>,
  options: { ttl: number; urgency: 'high' | 'normal' },
): Promise<{ sent: number; removed: number }> {
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
  if (error) throw error
  const subscriptions = (data as SubscriptionRow[] | null) ?? []

  let sent = 0
  let removed = 0
  const body = JSON.stringify(payload)
  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: options.ttl, urgency: options.urgency },
        )
        sent += 1
      } catch (sendError) {
        const statusCode = (sendError as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
          removed += 1
        } else {
          console.error('[push-notify] send failed', statusCode ?? 'unknown')
        }
      }
    }),
  )
  return { sent, removed }
}

async function notifyMessage(record: Record<string, unknown>): Promise<Record<string, number>> {
  if (!record.id || !record.conversation_id) return { sent: 0, skipped: 0 }
  if (record.deleted_at) return { sent: 0, skipped: 0 }
  const messageType = String(record.type || 'text')
  if (messageType === 'system') return { sent: 0, skipped: 0 }

  const senderId = record.sender_id ? String(record.sender_id) : ''
  const conversationId = String(record.conversation_id)
  if (!senderId) return { sent: 0, skipped: 0 }

  const [{ data: members }, senderPublic, { data: conversation }] = await Promise.all([
    admin.from('conversation_members').select('user_id, muted').eq('conversation_id', conversationId),
    senderId ? getPublicProfile(senderId) : Promise.resolve(null),
    admin.from('conversations').select('title, is_group').eq('id', conversationId).maybeSingle(),
  ])

  const recipients = ((members as Array<{ user_id: string; muted: boolean }> | null) ?? []).filter(
    (member) => member.user_id !== senderId && !member.muted,
  )
  if (!recipients.length) return { sent: 0, skipped: 0 }

  const profiles = await Promise.all(recipients.map((member) => getProfile(member.user_id)))
  const senderName = senderPublic?.display_name || ''
  const groupTitle = conversation?.is_group ? String(conversation.title || '') : ''

  let sent = 0
  let skipped = 0
  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index]
    const profile = profiles[index]
    if (!profile || profile.is_suspended) {
      skipped += 1
      continue
    }
    const settings = profile.notification_settings || {}
    if (!enabled(settings, 'browser')) {
      skipped += 1
      continue
    }
    if (!(await claimDelivery(recipient.user_id, `message:${record.id}:${recipient.user_id}`))) {
      skipped += 1
      continue
    }

    const language = profile.language === 'en' ? 'en' : 'ar'
    const preview = enabled(settings, 'preview')
      ? previewOf(record, language)
      : language === 'en'
        ? 'You have a new message'
        : 'لديك رسالة جديدة'
    const body = groupTitle
      ? `${senderName || (language === 'en' ? 'Member' : 'عضو')}: ${preview}`
      : preview

    const result = await sendToUser(
      recipient.user_id,
      {
        type: 'message',
        title: groupTitle || senderName || (language === 'en' ? 'Wasel Chat' : 'واصل شات'),
        body,
        conversationId,
        messageId: String(record.id),
        tag: `wasel-msg-${conversationId}`,
        lang: language,
        icon: senderPublic?.avatar_url || undefined,
        silent: !enabled(settings, 'sounds'),
        url: '',
      },
      { ttl: 3600, urgency: 'normal' },
    )
    sent += result.sent
  }
  return { sent, skipped }
}

async function notifyCall(record: Record<string, unknown>): Promise<Record<string, number>> {
  if (!record.id || String(record.status) !== 'ringing') return { sent: 0, skipped: 0 }
  const callerId = record.caller_id ? String(record.caller_id) : ''
  const calleeId = record.callee_id ? String(record.callee_id) : ''
  if (!callerId || !calleeId) return { sent: 0, skipped: 0 }

  const [callee, callerPublic] = await Promise.all([getProfile(calleeId), getPublicProfile(callerId)])
  if (!callee || callee.is_suspended) return { sent: 0, skipped: 1 }
  const settings = callee.notification_settings || {}
  if (!enabled(settings, 'calls')) return { sent: 0, skipped: 1 }

  if (!(await claimDelivery(calleeId, `call:${record.id}:${calleeId}`))) return { sent: 0, skipped: 1 }

  const language = callee.language === 'en' ? 'en' : 'ar'
  const isVideo = String(record.type) === 'video'
  const callerName = callerPublic?.display_name || (language === 'en' ? 'Someone' : 'مستخدم')
  const result = await sendToUser(
    calleeId,
    {
      type: 'call',
      title:
        language === 'en'
          ? `Incoming ${isVideo ? 'video' : 'audio'} call`
          : `مكالمة ${isVideo ? 'مرئية' : 'صوتية'} واردة`,
      body: callerName,
      callId: String(record.id),
      conversationId: record.conversation_id ? String(record.conversation_id) : '',
      tag: `wasel-call-${record.id}`,
      lang: language,
      icon: callerPublic?.avatar_url || undefined,
      silent: !enabled(settings, 'sounds'),
      url: '',
    },
    { ttl: 45, urgency: 'high' },
  )
  return { sent: result.sent, skipped: 0 }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'SERVER_NOT_CONFIGURED' }, 500)
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return json({ error: 'PUSH_NOT_CONFIGURED' }, 503)
  }
  if (!webhookSecret) return json({ error: 'WEBHOOK_NOT_CONFIGURED' }, 503)

  const providedSecret = req.headers.get('x-webhook-secret') || ''
  const providedAuth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (providedSecret !== webhookSecret && providedAuth !== serviceRoleKey) {
    return json({ error: 'UNAUTHORIZED' }, 401)
  }

  let payload: { type?: string; table?: string; record?: Record<string, unknown> } = {}
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'INVALID_JSON' }, 400)
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  } catch {
    return json({ error: 'INVALID_VAPID_CONFIGURATION' }, 500)
  }

  try {
    const table = payload.table || ''
    const record = payload.record
    if (!record) return json({ error: 'MISSING_RECORD' }, 400)
    if (payload.type && payload.type !== 'INSERT') {
      return json({ ok: true, skipped: 1, reason: 'IGNORED_EVENT' })
    }
    if (table === 'messages') return json({ ok: true, ...(await notifyMessage(record)) })
    if (table === 'calls') return json({ ok: true, ...(await notifyCall(record)) })
    return json({ ok: true, skipped: 1, reason: 'UNSUPPORTED_TABLE' })
  } catch (error) {
    console.error('[push-notify] failed', (error as Error).message)
    return json({ error: 'PUSH_DELIVERY_FAILED' }, 500)
  }
})
