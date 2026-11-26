// Browser localStorage key definitions and one-time legacy key migration.
// Existing users keep saved language, filters, and caches across the
// PropManager -> Keyturn key rename.

export const STORAGE_KEYS = {
  lang: { key: 'keyturn_lang', legacy: 'propmanager_lang' },
  dismissedNewTenants: {
    key: 'keyturn_dismissed_new_tenants',
    legacy: 'propmanager_dismissed_new_tenants',
  },
  tenantHiddenProps: {
    key: 'keyturn_tenant_hidden_props',
    legacy: 'propmanager_tenant_hidden_props',
  },
  tenantStatusFilter: {
    key: 'keyturn_tenant_status_filter',
    legacy: 'propmanager_tenant_status_filter',
  },
  paymentHiddenProps: {
    key: 'keyturn_payment_hidden_props',
    legacy: 'propmanager_payment_hidden_props',
  },
  summaryCache: (teamId) => ({
    key: `keyturn_summary_${teamId}`,
    legacy: `propmanager_summary_${teamId}`,
  }),
  rentHistoryYears: (propertyId) => ({
    key: `keyturn_rent_history_years_${propertyId}`,
    legacy: `propmanager_rent_history_years_${propertyId}`,
  }),
}

function defaultStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

// Read the new key first; if absent, fall back to the legacy key and migrate
// it in place on best effort.
export function readMigratedStorage(entry, storage = defaultStorage()) {
  if (!storage || !entry?.key) return null
  try {
    const current = storage.getItem(entry.key)
    if (current !== null && current !== undefined) return current
    if (!entry.legacy) return null
    const legacy = storage.getItem(entry.legacy)
    if (legacy === null || legacy === undefined) return null
    try {
      storage.setItem(entry.key, legacy)
      storage.removeItem(entry.legacy)
    } catch {
      // Ignore quota or private-mode errors; still return the legacy value.
    }
    return legacy
  } catch {
    return null
  }
}

export function writeStorage(entry, value, storage = defaultStorage()) {
  if (!storage || !entry?.key) return false
  try {
    storage.setItem(entry.key, value)
    return true
  } catch {
    return false
  }
}
