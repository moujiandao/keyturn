import { mapUnitRentHistory } from './mappers.js'

const columns = 'unit_id, year, monthly_rent, increase_start_date'
const pageSize = 500

export function createRentHistoryAdapter(supabase) {
  return {
    async list(propertyId, signal) {
      const entries = []
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('unit_rent_history')
          .select(`${columns}, units!inner()`)
          .eq('units.property_id', propertyId)
          .order('unit_id')
          .order('year')
          .range(offset, offset + pageSize - 1)
          .abortSignal(signal)
        if (error) throw error
        entries.push(...data.map(mapUnitRentHistory))
        if (data.length < pageSize) return entries
      }
    },

    async upsert(row) {
      const { data, error } = await supabase
        .from('unit_rent_history')
        .upsert(row, { onConflict: 'unit_id,year' })
        .select(columns)
        .single()
      if (error) throw error
      return mapUnitRentHistory(data)
    },
  }
}
