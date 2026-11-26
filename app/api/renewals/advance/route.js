import { createClient } from '../../../../lib/supabase/server'
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

  const supabase = await createClient()
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
