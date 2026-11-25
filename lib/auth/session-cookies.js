// Shared cookie-option helper for first-party Supabase auth cookies.
//
// Why this exists: Safari ITP caps cookies created via `document.cookie` to 7
// days. Setting Supabase session cookies via HTTP `Set-Cookie` headers from
// server routes (/api/auth/login and middleware refreshes) avoids that cap.
// `httpOnly` stays false so @supabase/ssr's browser client can continue making
// RLS-protected queries in client components.

export const PERSISTENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 400 // 400 days (browser cap)

function isCookieDeletion(options) {
  if (!options) return false
  if (options.maxAge === 0) return true
  if (options.expires instanceof Date && options.expires.getTime() <= 0) return true
  return false
}

export function withPersistentCookieOptions(
  options = {},
  { isProduction = process.env.NODE_ENV === 'production' } = {}
) {
  if (isCookieDeletion(options)) {
    return {
      path: '/',
      sameSite: 'lax',
      secure: isProduction,
      ...options,
      httpOnly: false,
      maxAge: 0,
    }
  }

  const currentMaxAge = typeof options?.maxAge === 'number' ? options.maxAge : 0
  return {
    ...options,
    path: options?.path || '/',
    sameSite: options?.sameSite || 'lax',
    secure: options?.secure ?? isProduction,
    httpOnly: false,
    maxAge: Math.max(currentMaxAge, PERSISTENT_COOKIE_MAX_AGE),
  }
}
