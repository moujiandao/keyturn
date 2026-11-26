import { createClient } from '@supabase/supabase-js'
import { requireLandlord, rejectMismatchedLandlord } from '@/lib/auth/authorize'
import { advanceLeaseRenewal, RenewalAdvanceError } from '../../../../lib/docuseal/advance'
import { createRenewalAdvanceAdapter } from '../../../../lib/docuseal/adapter'

// POST /api/renewals/advance
// Body: { landlordId, renewalId }
// Explicit manual landlord confirmation (Phase 4B) to advance `contracts.end_date`
// to the countersigned renewal's `new_term_end` and mark `applied_to_contract = true`
// atomically and idempotently. Never called from a webhook.
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { landlordId, renewalId } = body || {}
  const auth = await requireLandlord()
  if (auth.response) return auth.response
  const teamMismatch = rejectMismatchedLandlord(landlordId, auth.landlordId)
  if (teamMismatch) return teamMismatch
  if (!renewalId) {
    return Response.json({ error: 'renewalId is required.' }, { status: 400 })
  }

  // Plain service-role client (no cookie session) so PostgREST executes the
  // service_role-only `advance_lease_renewal` RPC under service_role rather
  // than the caller's authenticated JWT.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const adapter = createRenewalAdvanceAdapter(supabase)

  try {
    const result = await advanceLeaseRenewal(adapter, {
      landlordId: auth.landlordId,
      renewalId,
    })
    return Response.json(result)
  } catch (err) {
    if (err instanceof RenewalAdvanceError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status })
    }
    return Response.json({ error: err?.message || 'Failed to advance lease term.' }, { status: 500 })
  }
}
