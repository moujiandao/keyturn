export const RENT_HISTORY_MIN_YEAR = 1000
export const RENT_HISTORY_MAX_YEAR = 9999
export const RENT_HISTORY_MAX_RENT = 9_999_999_999.99

export function rentChange(currentRent, previousRent) {
  if (currentRent == null || previousRent == null || previousRent <= 0) return null
  return (currentRent - previousRent) / previousRent
}

export async function saveUnitRentHistory(adapter, { unitId, year, monthlyRent, increaseStartDate }) {
  const rent = Number(monthlyRent)
  if (!unitId || !Number.isInteger(year) || year < RENT_HISTORY_MIN_YEAR || year > RENT_HISTORY_MAX_YEAR) {
    throw new Error('A unit and valid year are required')
  }
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(monthlyRent) || rent > RENT_HISTORY_MAX_RENT) {
    throw new Error('A valid monthly rent is required')
  }
  if (increaseStartDate && !increaseStartDate.startsWith(`${year}-`)) {
    throw new Error('Increase start date must be in the entry year')
  }

  return adapter.upsert({
    unit_id: unitId,
    year,
    monthly_rent: rent,
    increase_start_date: increaseStartDate || null,
  })
}
