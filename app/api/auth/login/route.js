import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { homeFor } from '@/lib/routes'
import { isAuthOutage, isSupabaseAuthCookieName } from '@/lib/auth/session-gate'
import { withPersistentCookieOptions } from '@/lib/auth/session-cookies'

// Server-side password sign-in so Supabase auth cookies are issued via
// first-party HTTP `Set-Cookie` headers rather than browser `document.cookie`
// (which Apple Safari ITP caps to 7 days).
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const email = String(body?.email || '').trim()
  const password = String(body?.password || '')
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  const requestCookies = request.cookies.getAll()
  // Track the live cookie jar (request cookies + staged writes) so subsequent
  // calls like supabase.auth.signOut() can see any cookies staged in this request.
  const jar = new Map(requestCookies.map((c) => [c.name, { name: c.name, value: c.value }]))
  const stagedWrites = new Map()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return [...jar.values()]
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            if (options?.maxAge === 0 || !value) {
              jar.delete(name)
            } else {
              jar.set(name, { name, value })
            }
            stagedWrites.set(name, { name, value, options })
          }
        },
      },
    }
  )

  const applyStagedCookies = (res) => {
    for (const { name, value, options } of stagedWrites.values()) {
      res.cookies.set(name, value, withPersistentCookieOptions(options))
    }
    return res
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError || !authData?.user) {
    if (isAuthOutage(authError)) {
      return NextResponse.json(
        { error: 'The sign-in service is temporarily unavailable. Please try again.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('landlord_members')
    .select('landlord_id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()

  if (membership) {
    return applyStagedCookies(NextResponse.json({ role: 'landlord', home: homeFor('landlord') }))
  }

  const { data: tenant } = await supabase
    .from('tenant_profiles')
    .select('id')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (tenant) {
    return applyStagedCookies(NextResponse.json({ role: 'tenant', home: homeFor('tenant') }))
  }

  // No app profile for this account: revoke the session and never send staged
  // sign-in cookies on the 403 response (only clear any pre-existing auth cookies).
  await supabase.auth.signOut()
  const errRes = NextResponse.json({ error: 'No profile found for this account.' }, { status: 403 })
  for (const { name } of requestCookies) {
    if (isSupabaseAuthCookieName(name)) {
      errRes.cookies.set(name, '', withPersistentCookieOptions({ maxAge: 0 }))
    }
  }
  return errRes
}
