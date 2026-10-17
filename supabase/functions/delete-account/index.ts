// ============================================================================
// Wasel Chat | Edge Function: delete-account
// ----------------------------------------------------------------------------
// تحذف مستخدم المصادقة نهائياً باستخدام مفتاح service_role (لا يُوضع أبداً في
// الواجهة الأمامية). تُستخدم حالتان:
//   1) المستخدم يحذف حسابه بنفسه      → Body: {}            (يتطلب جلسة صالحة)
//   2) المدير يحذف بيانات مستخدم      → Body: { userId }    (يتطلب دور admin)
//
// النشر:
//   supabase functions deploy delete-account
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...   (يوفّره Supabase تلقائياً داخل Functions)
//
// ملاحظة: SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY و SUPABASE_ANON_KEY متوفرة
// تلقائياً كمتغيرات بيئة داخل Edge Functions على Supabase.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'SERVER_NOT_CONFIGURED' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ error: 'NOT_AUTHENTICATED' }, 401)

  // عميل باسم المستدعي للتحقق من هويته وصلاحياته
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !callerData.user) return json({ error: 'NOT_AUTHENTICATED' }, 401)
  const callerId = callerData.user.id

  let body: { userId?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const targetId = body.userId ?? callerId

  // عميل بمفتاح الخدمة لتنفيذ الحذف الفعلي
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // إن كان الحذف لمستخدم آخر، يجب أن يكون المستدعي مديراً
  if (targetId !== callerId) {
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .maybeSingle()

    if (profileError) return json({ error: 'PROFILE_LOOKUP_FAILED' }, 500)
    if (profile?.role !== 'admin') return json({ error: 'PERMISSION_DENIED' }, 403)
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId)
  if (deleteError) return json({ error: deleteError.message }, 400)

  return json({ ok: true, deleted: targetId })
})
