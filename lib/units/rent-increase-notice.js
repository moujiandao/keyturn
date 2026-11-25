import { fmt, fmtDate } from '../format/index.js'
import { CURRENT, statusFor } from '../tenant/status.js'

const fields = {
  tenant: '[Tenant name]',
  greeting: '[First name]',
  start: '[Renewed start date]',
  rent: '[New monthly rent]',
}

const unitLabel = value => String(value ?? '').trim().toLowerCase()

export function renderRentIncreaseNotice({ property, unit, tenants, multipleUnits, rent, today = new Date() }) {
  const residents = tenants.filter(tenant =>
    tenant.propertyId === property.id && statusFor(tenant, today) === CURRENT &&
    (tenant.unitId ? tenant.unitId === unit.id : unitLabel(tenant.unit) === unitLabel(unit.unitNumber))
  )
  const names = residents.map(tenant => [tenant.name, tenant.lastName].filter(Boolean).join(' ').trim()).filter(Boolean)
  const firstNames = residents.map(tenant => (tenant.name || tenant.lastName || '').trim().split(/\s+/)[0]).filter(Boolean)
  const greeting = new Intl.ListFormat('en-US').format(firstNames)
  const street = multipleUnits ? `${property.address}, Unit ${unit.unitNumber}` : property.address
  const region = [property.state, property.zip].filter(Boolean).join(' ')
  const cityLine = [property.city, region].filter(Boolean).join(', ')
  const date = fmtDate(today, { month: 'long' })
  const startDate = rent.increaseStartDate ? fmtDate(rent.increaseStartDate, { month: 'long' }) : fields.start
  const rentAmount = rent.monthlyRent == null ? fields.rent : fmt(rent.monthlyRent, { minimumFractionDigits: 2 })

  return `${date}\tLEASE RENEWAL

${names.join(' & ') || fields.tenant}

${street}

${cityLine}

Dear ${greeting || fields.greeting},

I wish to inform you that your lease has been renewed starting from ${startDate} and that your rent will be increased to ${rentAmount} per month. In all other respects, the terms and conditions of your original lease remain in full force. All leases are month to month. Please sign and return this form to me so that I may keep your file current. Please keep one copy with your original lease document.


Thank you for your residency,

Wayne Mar

Management




_______________________\t_______________________

Resident’s Signature\tDate`
}

export const hasUnfilledNoticeFields = text => Object.values(fields).some(field => text.includes(field))
