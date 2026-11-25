import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { withPersistentCookieOptions } from '@/lib/auth/session-cookies'

// Server-side sign-out clears Supabase cookies via Set-Cookie headers cleanly.
export async function POST(request) {
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

  await supabase.auth.signOut()

  const res = NextResponse.json({ ok: true })
  for (const { name, value, options } of pendingCookies) {
    res.cookies.set(name, value, withPersistentCookieOptions(options))
  }
  return res
}
