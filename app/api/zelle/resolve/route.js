import { createClient } from '@/lib/supabase/server'
import { requireLandlord, rejectMismatchedLandlord } from '@/lib/auth/authorize'
import { resolveZelleEvent } from '@/lib/zelle/core'
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
    const result = await resolveZelleEvent(
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
        async getTenant(id) {
          const { data, error } = await supabase
            .from('tenant_profiles')
            .select('id, landlord_id')
            .eq('id', id)
            .maybeSingle()
          if (error) throw new Error(error.message)
          return data || null
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
        async getPayment(id) {
          const { data, error } = await supabase
            .from('payments')
            .select('*')
            .eq('id', id)
            .maybeSingle()
          if (error) throw new Error(error.message)
          return data || null
        },
        async updatePayment(id, patch) {
          const { error } = await supabase
            .from('payments')
            .update(patch)
            .eq('id', id)
            .eq('landlord_id', auth.landlordId)
          if (error) throw new Error(error.message)
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
        eventId: body?.eventId,
        action: body?.action,
        tenantId: body?.tenantId || null,
        contractId: body?.contractId || null,
        targetMonth: body?.targetMonth || null,
        amount: body?.amount ?? null,
        category: body?.category || null,
        paymentId: body?.paymentId || null,
      }
    )

    return Response.json({
      event: mapZelleEvent(result.event),
      createdPayments: (result.createdPayments || []).map(mapPayment),
      linkedPaymentId: result.linkedPaymentId || null,
    })
  } catch (err) {
    return Response.json({ error: err.message || 'Resolution failed.' }, { status: err.status || 400 })
  }
}
