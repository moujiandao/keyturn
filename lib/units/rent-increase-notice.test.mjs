import assert from 'node:assert/strict'
import test from 'node:test'
import { hasUnfilledNoticeFields, renderRentIncreaseNotice } from './rent-increase-notice.js'

const property = { id: 'property-1', address: '10 Test Avenue', city: 'Oakland', state: 'CA', zip: '94601' }
const unit = { id: 'unit-101', unitNumber: '101' }
const today = new Date(2026, 10, 25)
const tenant = { propertyId: property.id, unitId: unit.id, name: 'Jordan T', lastName: 'Rivera' }

test('notice merges current residents, rental address, a long-form date, and yearly rent into the requested letter', () => {
  const text = renderRentIncreaseNotice({
    property, unit, multipleUnits: true, today,
    tenants: [
      tenant,
      { propertyId: property.id, unit: ' 101 ', name: 'Avery', lastName: 'Wilson', homeAddress: 'A different address' },
      { ...tenant, name: 'Former', moveOutDate: '2026-11-24' },
      { ...tenant, name: 'Future', moveInDate: '2026-11-26' },
      { ...tenant, name: 'Wrong property', propertyId: 'other-property' },
      { ...tenant, name: 'Wrong unit', unitId: 'other-unit', unit: '101' },
    ],
    rent: { increaseStartDate: '2027-01-01', monthlyRent: 2800 },
  })

  assert.equal(text, `November 25, 2026\tLEASE RENEWAL

Jordan T Rivera & Avery Wilson

10 Test Avenue, Unit 101

Oakland, CA 94601

Dear Jordan and Avery,

I wish to inform you that your lease has been renewed starting from January 1, 2027 and that your rent will be increased to $2,800.00 per month. In all other respects, the terms and conditions of your original lease remain in full force. All leases are month to month. Please sign and return this form to me so that I may keep your file current. Please keep one copy with your original lease document.


Thank you for your residency,

Wayne Mar

Management




_______________________\t_______________________

Resident’s Signature\tDate`)
  assert.equal(hasUnfilledNoticeFields(text), false)
})

test('a notice with missing recipients or current-year data presents editable merge fields instead of example data', () => {
  const text = renderRentIncreaseNotice({ property, unit, tenants: [], multipleUnits: false, rent: {}, today })

  assert.match(text, /\[Tenant name\]\n\n10 Test Avenue\n/)
  assert.match(text, /Dear \[First name\],/)
  assert.match(text, /starting from \[Renewed start date\].*increased to \[New monthly rent\]/)
  assert.equal(hasUnfilledNoticeFields(text), true)
  assert.equal(hasUnfilledNoticeFields(text
    .replace('[Tenant name]', 'Jamie Santos')
    .replace('[First name]', 'Jamie')
    .replace('[Renewed start date]', 'January 1, 2027')
    .replace('[New monthly rent]', '$2,000.50')), false)
})
