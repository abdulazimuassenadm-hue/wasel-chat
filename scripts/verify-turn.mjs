// يتحقق من صيغة بيانات coturn REST التي ستولّدها Edge Function turn-credentials.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

const secret = 'test-secret-do-not-use-in-production'
const userId = '11111111-2222-3333-4444-555555555555'
const expiry = Math.floor(Date.now() / 1000) + 3600
const username = `${expiry}:${userId}`

const expected = createHmac('sha1', secret).update(username).digest('base64')

const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-1' },
  false,
  ['sign'],
)
const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username))
const actual = Buffer.from(signature).toString('base64')

assert.equal(actual, expected, 'WebCrypto HMAC-SHA1 must match coturn/OpenSSL')
assert.match(username, /^\d+:[0-9a-f-]{36}$/)
assert.match(actual, /^[A-Za-z0-9+/]{27}=$/)
assert.ok(Number(username.split(':')[0]) * 1000 > Date.now(), 'expiry must be in the future')

console.log('TURN credential checks passed: coturn REST format + WebCrypto HMAC-SHA1 match')
