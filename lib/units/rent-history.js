export const RENT_HISTORY_MIN_YEAR = 1000
export const RENT_HISTORY_MAX_YEAR = 9999
export const RENT_HISTORY_MAX_RENT = 9_999_999_999.99
export const RENT_HISTORY_PAGE_SIZE = 2

export function rentChange(currentRent, previousRent) {
  if (currentRent == null || previousRent == null || previousRent <= 0) return null
  return (currentRent - previousRent) / previousRent
}

export function previousRentEntry(entries, year) {
  let previous = null
  for (const entry of entries) {
    if (entry.year < year && entry.monthlyRent != null && (!previous || entry.year > previous.year)) {
      previous = entry
    }
  }
  return previous
}

export function rentHistoryYearPage(years, anchorYear, pageSize = RENT_HISTORY_PAGE_SIZE) {
  const newestFirst = [...new Set(years)].sort((left, right) => right - left)
  const anchor = newestFirst.findIndex(year => year <= anchorYear)
  const index = anchor === -1 ? Math.max(0, newestFirst.length - 1) : anchor
  const start = index - index % pageSize

  return {
    years: newestFirst.slice(start, start + pageSize),
    earlierYear: newestFirst[start + pageSize] ?? null,
    newerYear: newestFirst[start - pageSize] ?? null,
  }
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
