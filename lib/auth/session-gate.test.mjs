import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isAppPath,
  isPublicPath,
  hasSupabaseAuthCookie,
  shouldCheckSessionOnPublicPath,
  resolveSafeNextPath,
  publicRedirectTarget,
  resolveUser,
  gateDecision,
} from './session-gate.js'
import { withPersistentCookieOptions, PERSISTENT_COOKIE_MAX_AGE } from './session-cookies.js'

const retryable = Object.assign(new Error('fetch failed'), { name: 'AuthRetryableFetchError' })
const sessionMissing = Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError' })

test('isAppPath matches a prefix and its children, not a lookalike', () => {
  assert.equal(isAppPath('/dashboard'), true)
  assert.equal(isAppPath('/tenants/abc'), true)
  assert.equal(isAppPath('/portal/payments/history'), true)
  assert.equal(isAppPath('/dashboards'), false)
  assert.equal(isAppPath('/api/contracts/create'), false)
  assert.equal(isAppPath('/'), false)
})

test('isPublicPath is exact: only the pages that render without a session', () => {
  for (const p of ['/', '/pricing', '/login', '/signup', '/reset-password']) assert.equal(isPublicPath(p), true)
  assert.equal(isPublicPath('/dashboard'), false)
  assert.equal(isPublicPath('/login/extra'), false)
  assert.equal(isPublicPath('/auth/callback'), false)
})

test('no public path is also an app path', () => {
  for (const p of ['/', '/pricing', '/login', '/signup', '/reset-password']) assert.equal(isAppPath(p), false)
})

test('resolveUser returns the user when Auth answers', async () => {
  const user = { id: 'u1' }
  assert.deepEqual(await resolveUser(async () => ({ data: { user }, error: null })), { user })
})

test('resolveUser treats a missing session as signed out, not as an outage', async () => {
  assert.deepEqual(await resolveUser(async () => ({ data: { user: null }, error: sessionMissing })), { user: null })
})

test('resolveUser gives up when Auth never answers, instead of hanging', async () => {
  const started = Date.now()
  const result = await resolveUser(() => new Promise(() => {}), 20)
  assert.deepEqual(result, { unavailable: true })
  assert.ok(Date.now() - started < 1000)
})

test('resolveUser reports an unreachable Auth server as unavailable', async () => {
  assert.deepEqual(await resolveUser(async () => ({ data: { user: null }, error: retryable })), { unavailable: true })
})

test('resolveUser reports a failing Auth server (5xx, unparseable reply) as unavailable', async () => {
  const serverError = Object.assign(new Error('Internal Server Error'), { name: 'AuthApiError', status: 500 })
  const unknown = Object.assign(new Error('Unexpected token <'), { name: 'AuthUnknownError' })
  assert.deepEqual(await resolveUser(async () => ({ data: { user: null }, error: serverError })), { unavailable: true })
  assert.deepEqual(await resolveUser(async () => ({ data: { user: null }, error: unknown })), { unavailable: true })
})

test('resolveUser treats a rejected token (4xx) as signed out', async () => {
  const rejected = Object.assign(new Error('invalid JWT'), { name: 'AuthApiError', status: 403 })
  assert.deepEqual(await resolveUser(async () => ({ data: { user: null }, error: rejected })), { user: null })
})

test('resolveUser reports a thrown error as unavailable', async () => {
  assert.deepEqual(await resolveUser(async () => { throw new Error('boom') }), { unavailable: true })
})

test('gateDecision: signed-out app request goes to login, everything else passes', () => {
  assert.equal(gateDecision('/dashboard', { user: null }), 'login')
  assert.equal(gateDecision('/dashboard', { user: { id: 'u1' } }), 'pass')
  assert.equal(gateDecision('/api/payments/delete', { user: null }), 'pass')
})

test('gateDecision: an Auth outage fails closed on app paths and never redirects to login', () => {
  assert.equal(gateDecision('/dashboard', { unavailable: true }), 'unavailable')
  assert.equal(gateDecision('/portal/profile', { unavailable: true }), 'unavailable')
  assert.equal(gateDecision('/api/payments/delete', { unavailable: true }), 'pass')
})

test('hasSupabaseAuthCookie detects standard and chunked sb-*-auth-token cookies only', () => {
  assert.equal(hasSupabaseAuthCookie([{ name: 'sb-abc123-auth-token' }]), true)
  assert.equal(hasSupabaseAuthCookie([{ name: 'sb-abc123-auth-token.0' }]), true)
  assert.equal(hasSupabaseAuthCookie([{ name: 'other_cookie' }]), false)
  assert.equal(hasSupabaseAuthCookie([]), false)
})

test('shouldCheckSessionOnPublicPath skips anonymous visitors and honors /?marketing=1', () => {
  const withCookie = [{ name: 'sb-proj-auth-token.0' }]
  const noCookie = []

  assert.equal(shouldCheckSessionOnPublicPath('/', new URLSearchParams(), noCookie), false)
  assert.equal(shouldCheckSessionOnPublicPath('/login', new URLSearchParams(), noCookie), false)
  assert.equal(shouldCheckSessionOnPublicPath('/', new URLSearchParams(), withCookie), true)
  assert.equal(shouldCheckSessionOnPublicPath('/', new URLSearchParams('marketing=1'), withCookie), false)
  assert.equal(shouldCheckSessionOnPublicPath('/login', new URLSearchParams(), withCookie), true)
  assert.equal(shouldCheckSessionOnPublicPath('/pricing', new URLSearchParams(), withCookie), false)
})

test('resolveSafeNextPath allows same-origin app paths and rejects external or non-app targets', () => {
  assert.equal(resolveSafeNextPath('/payments?tab=zelle'), '/payments?tab=zelle')
  assert.equal(resolveSafeNextPath('/properties/123'), '/properties/123')
  assert.equal(resolveSafeNextPath('//evil.com/dashboard'), '/dashboard')
  assert.equal(resolveSafeNextPath('https://evil.com'), '/dashboard')
  assert.equal(resolveSafeNextPath('/login'), '/dashboard')
  assert.equal(resolveSafeNextPath(''), '/dashboard')
})

test('publicRedirectTarget sends signed-in users from / and /login into the app, but never during outages', () => {
  const signedIn = { user: { id: 'u1' } }
  assert.equal(publicRedirectTarget('/', new URLSearchParams(), signedIn), '/dashboard')
  assert.equal(publicRedirectTarget('/', new URLSearchParams('marketing=1'), signedIn), null)
  assert.equal(publicRedirectTarget('/login', new URLSearchParams('next=/payments'), signedIn), '/payments')
  assert.equal(publicRedirectTarget('/login', new URLSearchParams('next=//evil.com'), signedIn), '/dashboard')
  assert.equal(publicRedirectTarget('/', new URLSearchParams(), { user: null }), null)
  assert.equal(publicRedirectTarget('/', new URLSearchParams(), { unavailable: true }), null)
})

test('withPersistentCookieOptions enforces 400-day first-party cookies while preserving logout deletions', () => {
  const prodOpts = withPersistentCookieOptions({ path: '/' }, { isProduction: true })
  assert.equal(prodOpts.maxAge, PERSISTENT_COOKIE_MAX_AGE)
  assert.equal(prodOpts.sameSite, 'lax')
  assert.equal(prodOpts.secure, true)
  assert.equal(prodOpts.httpOnly, false)

  const deleteOpts = withPersistentCookieOptions({ maxAge: 0 }, { isProduction: true })
  assert.equal(deleteOpts.maxAge, 0)
  assert.equal(deleteOpts.httpOnly, false)
})
