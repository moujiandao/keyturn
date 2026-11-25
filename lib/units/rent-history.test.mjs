import assert from 'node:assert/strict'
import test from 'node:test'
import { rentChange, saveUnitRentHistory } from './rent-history.js'

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
