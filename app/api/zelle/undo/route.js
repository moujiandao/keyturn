import { createClient } from '@/lib/supabase/server'
import { requireLandlord, rejectMismatchedLandlord } from '@/lib/auth/authorize'
import { undoZelleAutoPost } from '@/lib/zelle/core'
import { mapZelleEvent } from '@/lib/zelle/mappers'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const auth = await requireLandlord()
  if (auth.response) return auth.response
  const mismatch = rejectMismatchedLandlord(body?.landlordId, auth.landlordId)
  if (mismatch) return mismatch

  const eventId = body?.eventId
  if (!eventId) {
    return Response.json({ error: 'eventId is required.' }, { status: 400 })
  }

  const supabase = await createClient()

  try {
    const result = await undoZelleAutoPost(
      {
        async getEvent(id) {
          const { data, error } = await supabase
            .from('zelle_events')
            .select('*')
            .eq('id', id)
            .maybeSingle()
          if (error) throw new Error(error.message)
          return data || null
        },
        async deleteLinkedPayments({ landlordId, eventId: evId, paymentIds }) {
          const { data, error } = await supabase
            .from('payments')
            .delete()
            .in('id', paymentIds)
            .eq('landlord_id', landlordId)
            .eq('zelle_event_id', evId)
            .select('id')
          if (error) throw new Error(error.message)
          return (data || []).map((r) => r.id)
        },
        async updateEvent(id, patch) {
          const { data, error } = await supabase
            .from('zelle_events')
            .update(patch)
            .eq('id', id)
            .eq('landlord_id', auth.landlordId)
            .select('*')
            .single()
          if (error) throw new Error(error.message)
          return data
        },
      },
      { landlordId: auth.landlordId, eventId }
    )

    return Response.json({
      event: mapZelleEvent(result.event),
      removedPaymentIds: result.removedPaymentIds,
      alreadyUndone: result.alreadyUndone,
    })
  } catch (err) {
    return Response.json({ error: err.message || 'Undo failed.' }, { status: err.status || 400 })
  }
}
