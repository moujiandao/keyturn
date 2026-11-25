import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { homeFor } from '@/lib/routes'
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

  const pendingCookies = []
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const item of cookiesToSet) {
            pendingCookies.push(item)
          }
        },
      },
    }
  )

  const applyCookies = (res) => {
    for (const { name, value, options } of pendingCookies) {
      res.cookies.set(name, value, withPersistentCookieOptions(options))
    }
    return res
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('landlord_members')
    .select('landlord_id')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()

  if (membership) {
    return applyCookies(NextResponse.json({ role: 'landlord', home: homeFor('landlord') }))
  }

  const { data: tenant } = await supabase
    .from('tenant_profiles')
    .select('id')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (tenant) {
    return applyCookies(NextResponse.json({ role: 'tenant', home: homeFor('tenant') }))
  }

  await supabase.auth.signOut()
  return applyCookies(NextResponse.json({ error: 'No profile found for this account.' }, { status: 403 }))
}
