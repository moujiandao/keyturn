import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import {
  isPublicPath,
  isSupabaseAuthCookieName,
  shouldCheckSessionOnPublicPath,
  publicRedirectTarget,
  resolveUser,
  gateDecision,
} from './lib/auth/session-gate.js'
import { withPersistentCookieOptions } from './lib/auth/session-cookies.js'

function copyCookies(fromResponse, toResponse) {
  for (const cookie of fromResponse.cookies.getAll()) {
    toResponse.cookies.set(cookie)
  }
  return toResponse
}

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request })

  const { pathname, search, searchParams } = request.nextUrl
  const onPublicPath = isPublicPath(pathname)

  if (onPublicPath && !shouldCheckSessionOnPublicPath(pathname, searchParams, request.cookies.getAll())) {
    return supabaseResponse
  }

  let authCookiesWrittenByRefresh = false
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          authCookiesWrittenByRefresh = true
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, withPersistentCookieOptions(options))
          )
        },
      },
    }
  )

  // Refreshes the session and writes updated cookies to the response.
  // Do not add any logic between createServerClient and this call.
  const session = await resolveUser(() => supabase.auth.getUser())

  // Re-promote browser-refreshed Supabase cookies back to first-party HTTP
  // Set-Cookie headers. Otherwise @supabase/ssr's browser autoRefreshToken
  // writes via document.cookie after ~1 hour and re-triggers Safari ITP's
  // 7-day JS cookie cap even when initial sign-in used Set-Cookie.
  if (session.user && !authCookiesWrittenByRefresh) {
    for (const { name, value } of request.cookies.getAll()) {
      if (isSupabaseAuthCookieName(name)) {
        supabaseResponse.cookies.set(name, value, withPersistentCookieOptions())
      }
    }
  }

  if (onPublicPath) {
    const target = publicRedirectTarget(pathname, searchParams, session)
    if (target) {
      const redirectUrl = new URL(target, request.url)
      return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl))
    }
    return supabaseResponse
  }

  const decision = gateDecision(pathname, session)

  if (decision === 'unavailable') {
    return new NextResponse('The sign-in service is not responding. Please try again in a minute.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30', 'cache-control': 'no-store' },
    })
  }

  if (decision === 'login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', pathname + search)
    // Preserve any cookie deletions emitted when getUser() rejected a stale session.
    return copyCookies(supabaseResponse, NextResponse.redirect(url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|(?:icon|apple-icon)(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
