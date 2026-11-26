import { createClient } from '@supabase/supabase-js'
import { requireLandlord, rejectMismatchedLandlord } from '@/lib/auth/authorize'
import { addTeamAdmin } from '@/lib/auth/team'

export async function POST(request) {
  const auth = await requireLandlord()
  if (auth.response) return auth.response

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 })
  }

  const mismatch = rejectMismatchedLandlord(body?.landlordId, auth.landlordId)
  if (mismatch) return mismatch

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const result = await addTeamAdmin({
    supabaseAdmin,
    landlordId: auth.landlordId,
    name: body?.name,
    email: body?.email,
    password: body?.password,
  })

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }

  return Response.json({ success: true, user: result.user })
}
