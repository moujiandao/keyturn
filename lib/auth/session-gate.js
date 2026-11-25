// The middleware's routing decisions, kept free of Next and Supabase so they
// can be unit-tested. middleware.js owns the client and the responses; this
// owns which paths need a session and what to do when Auth does not answer.

// Top-level segments owned by the authenticated surface. Route groups don't
// appear in URLs, so this cannot be derived from the directory layout — adding
// an app route means adding its first segment here.
export const APP_PREFIXES = [
  '/dashboard', '/properties', '/tenants', '/payments', '/maintenance',
  '/parking', '/leases', '/renewals', '/documents', '/email', '/settings',
  '/portal',
]

// Pages that render without a session.
export const PUBLIC_PATHS = ['/', '/pricing', '/login', '/signup', '/reset-password']

// Far above a healthy getUser() (a few hundred ms) and far below the platform's
// 25s middleware limit. Without a bound, an unreachable Auth server costs the
// full limit: the client retries a token refresh with backoff for up to 30s.
export const AUTH_TIMEOUT_MS = 5000

export const isAppPath = (pathname) =>
  APP_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))

export const isPublicPath = (pathname) => PUBLIC_PATHS.includes(pathname)

export function isSupabaseAuthCookieName(name) {
  return Boolean(name && /^sb-[^/]+-auth-token(?:\.\d+)?$/.test(name))
}

// True when the request carries a Supabase SSR auth cookie (`sb-*-auth-token`
// or chunked `sb-*-auth-token.0`). Lets `/` and `/login` skip Supabase Auth
// completely for logged-out visitors.
export function hasSupabaseAuthCookie(cookies = []) {
  return (cookies || []).some((c) => {
    const name = typeof c === 'string' ? c : c?.name
    return isSupabaseAuthCookieName(name)
  })
}

function getParam(searchParams, key) {
  if (!searchParams) return null
  return typeof searchParams.get === 'function' ? searchParams.get(key) : searchParams[key] ?? null
}

// Public paths that should auto-redirect already signed-in users into the app.
// Requires an existing Supabase auth cookie so anonymous visitors never pay an
// Auth round-trip, honors `/?marketing=1`, and skips `/login?reason=...` (e.g.
// `no_profile`) so a profile-less signed-in user never enters a redirect loop.
export function shouldCheckSessionOnPublicPath(pathname, searchParams, cookies) {
  if (!hasSupabaseAuthCookie(cookies)) return false
  if (pathname === '/login') {
    return !getParam(searchParams, 'reason')
  }
  if (pathname === '/') {
    return getParam(searchParams, 'marketing') !== '1'
  }
  return false
}

// Restrict `next` redirect targets to normalized same-origin authenticated app
// paths so open redirects, backslash tricks, or `/dashboard/../login` traversals
// cannot bypass the app-path restriction.
export function resolveSafeNextPath(nextParam, fallback = '/dashboard') {
  if (!nextParam || typeof nextParam !== 'string') return fallback
  if (!nextParam.startsWith('/') || nextParam.startsWith('//') || nextParam.includes('\\')) {
    return fallback
  }
  try {
    const parsed = new URL(nextParam, 'https://keyturn.local')
    if (parsed.origin !== 'https://keyturn.local') return fallback
    if (!isAppPath(parsed.pathname)) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

// Where a signed-in user hitting `/` or `/login` should be sent, or null to
// render the public page normally (signed out, Auth outage, `marketing=1`, or
// an explicit login reason like `no_profile`).
export function publicRedirectTarget(pathname, searchParams, { user, unavailable } = {}) {
  if (unavailable || !user) return null
  if (pathname === '/login') {
    if (getParam(searchParams, 'reason')) return null
    return resolveSafeNextPath(getParam(searchParams, 'next'), '/dashboard')
  }
  if (pathname === '/') {
    return getParam(searchParams, 'marketing') === '1' ? null : '/dashboard'
  }
  return null
}

// Auth did not give a usable answer: unreachable (the client's retryable fetch
// error), a 5xx, or a reply it could not parse. A 4xx is Auth answering "no",
// which is signed out, not an outage.
export const isAuthOutage = (error) =>
  Boolean(error) && (
    error.name === 'AuthRetryableFetchError' ||
    error.name === 'AuthUnknownError' ||
    error.status >= 500
  )

// Resolves to `{ user }` (null when signed out) or `{ unavailable: true }`.
// Never rejects and never outlives `ms`. "Signed out" and "Auth did not answer"
// are kept apart on purpose: only the first may send someone to the login page.
export async function resolveUser(getUser, ms = AUTH_TIMEOUT_MS) {
  let timer
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve({ unavailable: true }), ms)
  })
  const lookup = async () => {
    const { data, error } = await getUser()
    if (isAuthOutage(error)) return { unavailable: true }
    return { user: data?.user ?? null }
  }
  try {
    return await Promise.race([lookup(), timeout])
  } catch {
    return { unavailable: true }
  } finally {
    clearTimeout(timer)
  }
}

// 'login' | 'unavailable' | 'pass'. An outage fails closed on app paths rather
// than passing through: the (app) layout would only ask Auth again and hang one
// layer later. Other paths (API routes, the auth callback) run their own checks.
export function gateDecision(pathname, { user, unavailable }) {
  if (!isAppPath(pathname)) return 'pass'
  if (unavailable) return 'unavailable'
  return user ? 'pass' : 'login'
}
