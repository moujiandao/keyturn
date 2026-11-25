import { createClient } from '@/lib/supabase/server'
import { requireLandlord, rejectMismatchedLandlord } from '@/lib/auth/authorize'
import { saveZellePayerAlias, deleteZellePayerAlias } from '@/lib/zelle/core'
import { mapZellePayerAlias } from '@/lib/zelle/mappers'

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
    const alias = await saveZellePayerAlias(
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
        async getContract(id) {
          const { data, error } = await supabase
            .from('contracts')
            .select('id, landlord_id')
            .eq('id', id)
            .maybeSingle()
          if (error) throw new Error(error.message)
          return data || null
        },
        async upsertAlias(row) {
          const { data, error } = await supabase
            .from('zelle_payer_aliases')
            .upsert(row, { onConflict: 'landlord_id,payer_name_normalized' })
            .select('*')
            .single()
          if (error) throw new Error(error.message)
          return data
        },
      },
      {
        landlordId: auth.landlordId,
        payerName: body?.payerName,
        tenantId: body?.tenantId || null,
        contractId: body?.contractId || null,
      }
    )
    return Response.json({ alias: mapZellePayerAlias(alias) })
  } catch (err) {
    return Response.json({ error: err.message || 'Failed to save payer alias.' }, { status: err.status || 400 })
  }
}

export async function DELETE(request) {
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
    const result = await deleteZellePayerAlias(
      {
        async deleteAlias(landlordId, aliasId) {
          const { data, error } = await supabase
            .from('zelle_payer_aliases')
            .delete()
            .eq('id', aliasId)
            .eq('landlord_id', landlordId)
            .select('id')
          if (error) throw new Error(error.message)
          return (data || []).length
        },
      },
      { landlordId: auth.landlordId, aliasId: body?.aliasId }
    )
    return Response.json(result)
  } catch (err) {
    return Response.json({ error: err.message || 'Failed to remove payer alias.' }, { status: err.status || 400 })
  }
}
