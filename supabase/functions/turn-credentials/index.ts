// ============================================================================
// Wasel Chat | Edge Function: turn-credentials
// ----------------------------------------------------------------------------
// تُصدر بيانات دخول TURN مؤقتة للمستخدم المسجّل فقط، حتى لا تُحزم كلمة مرور
// TURN داخل ملفات JavaScript المنشورة على GitHub Pages.
//
// الوضع المفضّل: coturn مع use-auth-secret
//   TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp
//   TURN_SECRET=<السر المشترك مع coturn>
//   TURN_TTL_SECONDS=3600
//
// بديل اضطراري لمزوّد يعطي بيانات ثابتة (أقل أماناً):
//   TURN_USERNAME=...
//   TURN_CREDENTIAL=...
//
// النشر:
//   supabase functions deploy turn-credentials
//   supabase secrets set TURN_URLS="..." TURN_SECRET="..." TURN_TTL_SECONDS=3600
//
// ملاحظة: التحقق من JWT يتم افتراضياً في منصة Supabase، ونعيد التحقق هنا أيضاً.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ||
  'https://abdulazimuassenadm-hue.github.io,http://localhost:5173,http://localhost:4173,http://localhost:4174,http://localhost:4175')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || '*'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function turnUrls(): string[] {
  return (Deno.env.get('TURN_URLS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.startsWith('turn:') || value.startsWith('turns:'))
}

async function hmacSha1Base64(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  const bytes = new Uint8Array(signature)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) return json({ error: 'SERVER_NOT_CONFIGURED' }, 500, origin)

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'NOT_AUTHENTICATED' }, 401, origin)

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) return json({ error: 'NOT_AUTHENTICATED' }, 401, origin)

  const urls = turnUrls()
  if (!urls.length) return json({ error: 'TURN_NOT_CONFIGURED' }, 503, origin)

  const secret = Deno.env.get('TURN_SECRET') || ''
  const ttl = Math.min(86400, Math.max(60, Number(Deno.env.get('TURN_TTL_SECONDS')) || 3600))

  if (secret) {
    const expiry = Math.floor(Date.now() / 1000) + ttl
    // صيغة coturn REST: username = <expiry>:<user>، credential = base64(HMAC-SHA1(secret, username))
    const username = `${expiry}:${userData.user.id}`
    const credential = await hmacSha1Base64(secret, username)
    return json({ urls, username, credential, ttl, provider: 'coturn-rest' }, 200, origin)
  }

  const username = Deno.env.get('TURN_USERNAME') || ''
  const credential = Deno.env.get('TURN_CREDENTIAL') || ''
  if (username && credential) {
    return json({ urls, username, credential, ttl: Math.min(ttl, 3600), provider: 'static' }, 200, origin)
  }

  return json({ error: 'TURN_NOT_CONFIGURED' }, 503, origin)
})
