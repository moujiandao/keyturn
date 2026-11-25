import { createClient } from '@/lib/supabase/server'
import { requireLandlord, rejectMismatchedLandlord } from '@/lib/auth/authorize'
import { confirmPartialZelleGroup } from '@/lib/zelle/core'
import { mapZelleEvent } from '@/lib/zelle/mappers'
import { mapPayment } from '@/lib/payments/mappers'

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

  const supabase = await createClient()

  try {
    const result = await confirmPartialZelleGroup(
      {
        async getTenant(id) {
          const { data, error } = await supabase
            .from('tenant_profiles')
            .select('id, landlord_id')
            .eq('id', id)
            .maybeSingle()
          if (error) throw new Error(error.message)
          return data || null
        },
        async getEventsByIds(landlordId, ids) {
          const { data, error } = await supabase
            .from('zelle_events')
            .select('*')
            .eq('landlord_id', landlordId)
            .in('id', ids)
          if (error) throw new Error(error.message)
          return data || []
        },
        async getTenantPayments(landlordId, tenantId) {
          const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('landlord_id', landlordId)
            .eq('tenant_id', tenantId)
          if (error) throw new Error(error.message)
          return data || []
        },
        async insertPayments(rows) {
          const { data, error } = await supabase
            .from('payments')
            .insert(rows)
            .select('*')
          if (error) throw new Error(error.message)
          return data || []
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
      {
        landlordId: auth.landlordId,
        authId: auth.authId,
        eventIds: body?.eventIds || [],
        tenantId: body?.tenantId || null,
        contractId: body?.contractId || null,
        targetMonth: body?.targetMonth || null,
      }
    )

    return Response.json({
      payment: mapPayment(result.payment),
      events: result.events.map(mapZelleEvent),
      totalAmount: result.totalAmount,
    })
  } catch (err) {
    return Response.json({ error: err.message || 'Failed to confirm partial group.' }, { status: err.status || 400 })
  }
}
