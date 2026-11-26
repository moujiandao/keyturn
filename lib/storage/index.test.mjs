import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STORAGE_KEYS, readMigratedStorage, writeStorage } from './index.js'

function createFakeStorage(initial = {}, { failWrite = false, failRead = false, failRemove = false } = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem(k) {
      if (failRead) throw new Error('storage read blocked')
      return map.has(k) ? map.get(k) : null
    },
    setItem(k, v) {
      if (failWrite) throw new Error('QuotaExceededError')
      map.set(k, String(v))
    },
    removeItem(k) {
      if (failWrite || failRemove) throw new Error('QuotaExceededError')
      map.delete(k)
    },
  }
}

test('readMigratedStorage prefers the keyturn_* key without touching legacy when present', () => {
  const store = createFakeStorage({
    keyturn_lang: 'en',
    propmanager_lang: 'zh',
  })
  assert.equal(readMigratedStorage(STORAGE_KEYS.lang, store), 'en')
  assert.equal(store.map.get('keyturn_lang'), 'en')
  assert.equal(store.map.get('propmanager_lang'), 'zh')
})

test('readMigratedStorage migrates legacy propmanager_* value to keyturn_* and removes legacy key', () => {
  const store = createFakeStorage({
    propmanager_tenant_hidden_props: '["p1"]',
  })
  const val = readMigratedStorage(STORAGE_KEYS.tenantHiddenProps, store)
  assert.equal(val, '["p1"]')
  assert.equal(store.map.get('keyturn_tenant_hidden_props'), '["p1"]')
  assert.equal(store.map.has('propmanager_tenant_hidden_props'), false)
})

test('readMigratedStorage preserves legacy value and returns it when write fails (private mode/quota)', () => {
  const store = createFakeStorage({ propmanager_lang: 'en' }, { failWrite: true })
  assert.equal(readMigratedStorage(STORAGE_KEYS.lang, store), 'en')
  assert.equal(store.map.get('propmanager_lang'), 'en')
  assert.equal(store.map.has('keyturn_lang'), false)
})

test('readMigratedStorage and writeStorage tolerate null storage, null entry, and read/write errors', () => {
  assert.equal(readMigratedStorage(STORAGE_KEYS.lang, null), null)
  assert.equal(readMigratedStorage(null, createFakeStorage()), null)
  assert.equal(readMigratedStorage(STORAGE_KEYS.lang, createFakeStorage({}, { failRead: true })), null)
  assert.equal(writeStorage(STORAGE_KEYS.lang, 'en', null), false)
  assert.equal(writeStorage(null, 'en', createFakeStorage()), false)
  assert.equal(writeStorage(STORAGE_KEYS.lang, 'en', createFakeStorage({}, { failWrite: true })), false)
})

test('dynamic storage key builders pair keyturn_* and propmanager_* keys', () => {
  const summary = STORAGE_KEYS.summaryCache('team-42')
  assert.deepEqual(summary, {
    key: 'keyturn_summary_team-42',
    legacy: 'propmanager_summary_team-42',
  })

  const rentYears = STORAGE_KEYS.rentHistoryYears('prop-9')
  assert.deepEqual(rentYears, {
    key: 'keyturn_rent_history_years_prop-9',
    legacy: 'propmanager_rent_history_years_prop-9',
  })

  const store = createFakeStorage({ propmanager_rent_history_years_prop_1: 'ignored', 'propmanager_rent_history_years_prop-9': '{"added":[2026],"hidden":[]}' })
  assert.equal(readMigratedStorage(rentYears, store), '{"added":[2026],"hidden":[]}')
  assert.equal(store.map.get('keyturn_rent_history_years_prop-9'), '{"added":[2026],"hidden":[]}')
  assert.equal(store.map.has('propmanager_rent_history_years_prop-9'), false)
  assert.equal(writeStorage(rentYears, '{"added":[2027],"hidden":[]}', store), true)
  assert.equal(readMigratedStorage(rentYears, store), '{"added":[2027],"hidden":[]}')
})

test('readMigratedStorage preserves empty string on new key and handles removeItem failures', () => {
  const emptyStore = createFakeStorage({ keyturn_lang: '', propmanager_lang: 'en' })
  assert.equal(readMigratedStorage(STORAGE_KEYS.lang, emptyStore), '')

  const failRemoveStore = createFakeStorage({ propmanager_lang: 'en' }, { failRemove: true })
  assert.equal(readMigratedStorage(STORAGE_KEYS.lang, failRemoveStore), 'en')
  assert.equal(failRemoveStore.map.get('keyturn_lang'), 'en')
})

test('defaultStorage catches SecurityError when window.localStorage getter throws', () => {
  const prevWindow = globalThis.window
  const fakeWindow = {}
  Object.defineProperty(fakeWindow, 'localStorage', {
    get() {
      throw new DOMException('Storage access denied', 'SecurityError')
    },
  })
  globalThis.window = fakeWindow
  try {
    assert.equal(readMigratedStorage(STORAGE_KEYS.lang), null)
    assert.equal(writeStorage(STORAGE_KEYS.lang, 'en'), false)
  } finally {
    if (prevWindow === undefined) delete globalThis.window
    else globalThis.window = prevWindow
  }
})
