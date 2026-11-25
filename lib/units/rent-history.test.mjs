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

test('rent history pages show up to three years in ascending order and navigate by groups', () => {
  const years = [2024, 2020, 2026, 2026, 2023, 2016, 2025, 2017, 2018]

  assert.deepEqual(rentHistoryYearPage(years, 2026), { years: [2024, 2025, 2026], earlierYear: 2023, newerYear: null })
  assert.deepEqual(rentHistoryYearPage(years, 2023), { years: [2018, 2020, 2023], earlierYear: 2017, newerYear: 2026 })
  assert.deepEqual(rentHistoryYearPage(years, 2017), { years: [2016, 2017], earlierYear: null, newerYear: 2023 })
})

test('the year anchor survives a hidden column or an empty history', () => {
  assert.deepEqual(rentHistoryYearPage([2028, 2027, 2024, 2023], 2026), {
    years: [2024, 2027, 2028], earlierYear: 2023, newerYear: null,
  })
  assert.deepEqual(rentHistoryYearPage([2028, 2027, 2024, 2023], 2019), {
    years: [2023], earlierYear: null, newerYear: 2028,
  })
  assert.deepEqual(rentHistoryYearPage([], 2026), { years: [], earlierYear: null, newerYear: null })
})
