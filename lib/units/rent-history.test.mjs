import assert from 'node:assert/strict'
import test from 'node:test'
import { previousRentEntry, rentChange, rentHistoryYearPage, saveUnitRentHistory } from './rent-history.js'

test('yearly rent change supports increases, decreases, and no change', () => {
  assert.equal(rentChange(2100, 2000), 0.05)
  assert.equal(rentChange(1900, 2000), -0.05)
  assert.equal(rentChange(2000, 2000), 0)
  assert.equal(rentChange(0, 2000), -1)
})

test('yearly rent change is unavailable without a comparable prior rent', () => {
  assert.equal(rentChange(2100, null), null)
  assert.equal(rentChange(null, 2000), null)
  assert.equal(rentChange(2100, 0), null)
})

test('save writes just the unit-year record and accepts an optional effective date', async () => {
  const adapter = { upsert: async row => row }
  const entry = { unitId: 'unit-1', year: 2026, monthlyRent: '2100.50', increaseStartDate: '2026-08-01' }

  assert.deepEqual(await saveUnitRentHistory(adapter, entry), {
    unit_id: 'unit-1', year: 2026, monthly_rent: 2100.50, increase_start_date: '2026-08-01',
  })
  assert.equal((await saveUnitRentHistory(adapter, { ...entry, increaseStartDate: '' })).increase_start_date, null)
})

test('save rejects missing and over-precise rent and dates from another year', async () => {
  const adapter = { upsert: () => assert.fail('Invalid entries must not be written') }
  const entry = { unitId: 'unit-1', year: 2026, monthlyRent: '2100', increaseStartDate: '' }

  await assert.rejects(saveUnitRentHistory(adapter, { ...entry, monthlyRent: '' }), /valid monthly rent/)
  await assert.rejects(saveUnitRentHistory(adapter, { ...entry, monthlyRent: '2100.123' }), /valid monthly rent/)
  await assert.rejects(saveUnitRentHistory(adapter, { ...entry, increaseStartDate: '2025-08-01' }), /entry year/)
})

test('rent history uses the most recent filled earlier entry across calendar gaps', () => {
  const entries = [
    { year: 2026, monthlyRent: 2800 },
    { year: 2019, monthlyRent: 2000 },
    { year: 2025, monthlyRent: null },
    { year: 2023, monthlyRent: 2500 },
    { year: 2027, monthlyRent: 3000 },
  ]

  assert.deepEqual(previousRentEntry(entries, 2026), { year: 2023, monthlyRent: 2500 })
  assert.equal(rentChange(2800, previousRentEntry(entries, 2026).monthlyRent), 0.12)
  assert.equal(previousRentEntry(entries, 2019), null)
})

test('a recorded zero is a filled entry but has no percentage baseline', () => {
  const previous = previousRentEntry([{ year: 2021, monthlyRent: 2000 }, { year: 2023, monthlyRent: 0 }], 2026)
  assert.equal(previous.year, 2023)
  assert.equal(rentChange(2200, previous.monthlyRent), null)
})

test('rent history pages show two years newest-first and navigate by pairs', () => {
  const years = [2024, 2027, 2026, 2026, 2023, 2025, 2022]

  assert.deepEqual(rentHistoryYearPage(years, 2027), { years: [2027, 2026], earlierYear: 2025, newerYear: null })
  assert.deepEqual(rentHistoryYearPage(years, 2025), { years: [2025, 2024], earlierYear: 2023, newerYear: 2027 })
  assert.deepEqual(rentHistoryYearPage(years, 2023), { years: [2023, 2022], earlierYear: null, newerYear: 2025 })
})

test('default anchor shows next and current year even when an odd number of future years exist', () => {
  const years = [2028, 2027, 2026, 2025]

  assert.deepEqual(rentHistoryYearPage(years, 2027), { years: [2027, 2026], earlierYear: 2025, newerYear: 2028 })
  assert.deepEqual(rentHistoryYearPage(years, 2028), { years: [2028, 2027], earlierYear: 2026, newerYear: null })
  assert.deepEqual(rentHistoryYearPage(years, 2025), { years: [2025], earlierYear: null, newerYear: 2027 })
})

test('the year anchor survives a hidden column, removed future year, trailing odd page, or empty history', () => {
  assert.deepEqual(rentHistoryYearPage([2028, 2027, 2024, 2023, 2021], 2026), {
    years: [2024, 2023], earlierYear: 2021, newerYear: 2028,
  })
  assert.deepEqual(rentHistoryYearPage([2027, 2026], 2028), {
    years: [2027, 2026], earlierYear: null, newerYear: null,
  })
  assert.deepEqual(rentHistoryYearPage([2028, 2027, 2024, 2023, 2021], 2019), {
    years: [2021], earlierYear: null, newerYear: 2024,
  })
  assert.deepEqual(rentHistoryYearPage([], 2027), { years: [], earlierYear: null, newerYear: null })
})
