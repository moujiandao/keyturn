'use client'
import { Fragment, useState } from 'react'
import { Btn, Icon } from './property-management-app'
import { fmt, fmtDate } from '@/lib/format'
import { isPaidRent } from '@/lib/payments/status'
import { createZelleAdapter } from '@/lib/zelle/adapter'
import {
  undoZelleEvent,
  resolveZelleEventClient,
  deleteZelleAliasClient,
  confirmPartialGroupClient,
  findPartialRentGroups,
} from '@/lib/zelle/core'
import { expectedMonthlyRent } from '@/lib/zelle/matcher'
import { isZellePending, isZelleAutoPosted, isZelleResolved, ZELLE_CATEGORIES } from '@/lib/zelle/status'
import {
  buildLedgerRows,
  filterLedgerRows,
  summarizeLedger,
  ledgerMonthOptions,
  ledgerPropertyOptions,
  formatMonthLabel,
} from '@/lib/zelle/ledger'

const money2 = (n) => fmt(n, { minimumFractionDigits: 2 })

const ledgerFilterBar = {
  background: '#fff',
  border: '1px solid #eaeaea',
  borderRadius: 12,
  padding: 12,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  gap: 10,
  marginBottom: 12,
}
const ledgerStatGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
  marginBottom: 12,
}
const ledgerStatCard = {
  background: '#fff',
  border: '1px solid #eaeaea',
  borderRadius: 12,
  padding: '10px 14px',
}
const ledgerStatLabel = { fontSize: '0.75rem', color: '#6b7280' }
const ledgerStatValue = { fontSize: '1.125rem', fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums' }
const ledgerTableWrap = {
  background: '#fff',
  border: '1px solid #eaeaea',
  borderRadius: 12,
  overflowX: 'auto',
}
const ledgerTable = { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }
const ledgerTh = {
  padding: '10px 14px',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#6b7280',
  borderBottom: '1px solid #eaeaea',
  whiteSpace: 'nowrap',
}
const ledgerTd = { padding: '10px 14px', verticalAlign: 'top', borderTop: '1px solid #f3f4f6' }
const ledgerPrimary = { fontWeight: 600, color: '#111827' }
const ledgerMuted = { fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }
const ledgerAmountCell = { ...ledgerTd, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }
const linkButton = {
  background: 'none',
  border: 0,
  padding: 0,
  color: '#2563eb',
  fontSize: '0.8125rem',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const MATCH_COLOR = { exact: '#047857', short: '#dc2626', over: '#b45309' }

const card = {
  background: '#fff',
  borderRadius: 14,
  padding: 20,
  border: '1px solid #eaeaea',
  marginBottom: 14,
}
const groupCard = {
  background: '#f8fafc',
  borderRadius: 14,
  padding: 18,
  border: '1px solid #cbd5e1',
  marginBottom: 16,
}
const emptyBox = {
  background: '#fff',
  borderRadius: 14,
  padding: '44px 24px',
  border: '1px solid #eaeaea',
  textAlign: 'center',
  color: '#6b7280',
  fontSize: "0.875rem",
}
const subTabRow = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 18,
}
const pillBase = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  padding: '3px 9px',
  borderRadius: 20,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}
const rawEmailBox = {
  marginTop: 12,
  padding: 14,
  borderRadius: 10,
  background: '#fafafa',
  border: '1px solid #eaeaea',
  fontSize: "0.75rem",
  lineHeight: 1.55,
  color: '#374151',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
const triageBox = {
  marginTop: 14,
  paddingTop: 14,
  borderTop: '1px solid #f3f4f6',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const triageRow = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
}
const fieldWrap = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}
const fieldLabel = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '.4px',
}
const controlStyle = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: "0.8125rem",
  color: '#111827',
  background: '#fff',
  fontFamily: 'inherit',
  width: '100%',
}
const errBanner = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 14,
  fontSize: "0.8125rem",
  color: '#dc2626',
}
const okBanner = {
  background: '#ecfdf5',
  border: '1px solid #a7f3d0',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 14,
  fontSize: "0.8125rem",
  color: '#047857',
}
const warnNote = {
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: 8,
  padding: '7px 11px',
  fontSize: "0.75rem",
  color: '#92400e',
}
const splitBox = {
  background: '#fafafa',
  border: '1px solid #eaeaea',
  borderRadius: 10,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const STATUS_STYLE = {
  auto_posted: { bg: '#ecfdf5', text: '#047857' },
  needs_review: { bg: '#fffbeb', text: '#b45309' },
  confirmed: { bg: '#eff6ff', text: '#1d4ed8' },
  linked: { bg: '#f3e8ff', text: '#7e22ce' },
  acknowledged: { bg: '#f0fdf4', text: '#15803d' },
  ignored: { bg: '#f3f4f6', text: '#6b7280' },
}

const CATEGORY_STYLE = {
  rent: { bg: '#f3f4f6', text: '#111827' },
  deposit: { bg: '#fef3c7', text: '#92400e' },
  parking: { bg: '#e0f2fe', text: '#0369a1' },
  other: { bg: '#f3f4f6', text: '#4b5563' },
  ignore: { bg: '#fee2e2', text: '#991b1b' },
}

export function useZelleMutations() {
  const adapter = createZelleAdapter()
  return {
    undoEvent: (eventId) => undoZelleEvent(adapter, eventId),
    resolveEvent: (payload) => resolveZelleEventClient(adapter, payload),
    deleteAlias: (aliasId) => deleteZelleAliasClient(adapter, aliasId),
    confirmPartialGroup: (payload) => confirmPartialGroupClient(adapter, payload),
  }
}

function tenantDisplayName(tenant) {
  if (!tenant) return ''
  return [tenant.name, tenant.lastName].filter(Boolean).join(' ').trim()
}

function formatMonth(ymDate) {
  if (!ymDate) return '-'
  return String(ymDate).slice(0, 7)
}

function RawEmail({ ev, t }) {
  return (
    <div style={rawEmailBox}>
      {ev.emailFrom && (
        <div>
          <strong>{t.zelleEmailFrom}:</strong> {ev.emailFrom}
        </div>
      )}
      {ev.emailSubject && (
        <div style={{ marginBottom: 8 }}>
          <strong>{t.zelleEmailSubject}:</strong> {ev.emailSubject}
        </div>
      )}
      {ev.rawBody || '-'}
    </div>
  )
}

// Bookkeeper ledger for Auto-Posted and History: one compact row per Zelle
// transfer, amounts right-aligned against the tenant's expected rent.
function ZelleLedgerTable({ rows, t, lang, filters, setFilters, expandedIds, toggleExpand, busyId, onUndo, showStatus }) {
  const monthOptions = ledgerMonthOptions(rows)
  const propertyOptions = ledgerPropertyOptions(rows)
  const activeMonth = filters.month !== 'all' && monthOptions.includes(filters.month) ? filters.month : 'all'
  const activeProperty =
    filters.propertyId !== 'all' && propertyOptions.some((p) => p.id === filters.propertyId)
      ? filters.propertyId
      : 'all'
  const activeFilters = { ...filters, month: activeMonth, propertyId: activeProperty }
  const visible = filterLedgerRows(rows, activeFilters)
  const stats = summarizeLedger(visible)
  const setFilter = (patch) => setFilters({ ...activeFilters, ...patch })
  const varianceColor = stats.variance === 0 ? '#047857' : stats.variance < 0 ? '#dc2626' : '#b45309'
  const signedMoney = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${money2(Math.abs(n))}`

  const matchLabel = (r) => {
    if (r.match === 'exact') return t.zelleMatchExact
    if (r.match === 'short') return t.zelleMatchShort(money2(Math.abs(r.diff)))
    if (r.match === 'over') return t.zelleMatchOver(money2(r.diff))
    return null
  }

  return (
    <div>
      <div style={ledgerFilterBar}>
        <label className="ld-zelle-field" style={fieldWrap}>
          <span style={fieldLabel}>{t.zelleFilterMonth}</span>
          <select className="ld-zelle-control" style={controlStyle} value={activeFilters.month} onChange={(e) => setFilter({ month: e.target.value })}>
            <option value="all">{t.zelleFilterAllMonths}</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>{formatMonthLabel(m, lang)}</option>
            ))}
          </select>
        </label>
        <label className="ld-zelle-field" style={{ ...fieldWrap, '--ld-zelle-field-min-w': '180px' }}>
          <span style={fieldLabel}>{t.zelleFilterProperty}</span>
          <select className="ld-zelle-control" style={controlStyle} value={activeFilters.propertyId} onChange={(e) => setFilter({ propertyId: e.target.value })}>
            <option value="all">{t.zelleFilterAllProperties}</option>
            {propertyOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="ld-zelle-field" style={fieldWrap}>
          <span style={fieldLabel}>{t.zelleFilterMatch}</span>
          <select className="ld-zelle-control" style={controlStyle} value={activeFilters.match} onChange={(e) => setFilter({ match: e.target.value })}>
            <option value="all">{t.zelleFilterAllMatches}</option>
            <option value="exact">{t.zelleFilterExact}</option>
            <option value="variance">{t.zelleFilterVariance}</option>
          </select>
        </label>
        <label className="ld-zelle-field" style={{ ...fieldWrap, flex: 1, '--ld-zelle-field-min-w': '220px' }}>
          <span style={fieldLabel}>&nbsp;</span>
          <input
            type="search"
            aria-label={t.zelleSearchPlaceholder}
            className="ld-zelle-control"
            style={controlStyle}
            value={activeFilters.query}
            placeholder={t.zelleSearchPlaceholder}
            onChange={(e) => setFilter({ query: e.target.value })}
          />
        </label>
      </div>

      <div style={ledgerStatGrid}>
        <div style={ledgerStatCard}>
          <div style={ledgerStatLabel}>{t.zelleStatReceived}</div>
          <div style={ledgerStatValue}>{money2(stats.received)}</div>
        </div>
        <div style={ledgerStatCard}>
          <div style={ledgerStatLabel}>{t.zelleStatExpected}</div>
          <div style={ledgerStatValue}>{money2(stats.expected)}</div>
        </div>
        <div style={ledgerStatCard}>
          <div style={ledgerStatLabel}>{t.zelleStatVariance}</div>
          <div style={{ ...ledgerStatValue, color: varianceColor }}>{signedMoney(stats.variance)}</div>
        </div>
        <div style={ledgerStatCard}>
          <div style={ledgerStatLabel}>{t.zelleStatRows}</div>
          <div style={ledgerStatValue}>{stats.count}</div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={emptyBox}>{t.zelleNoFilteredRows}</div>
      ) : (
        <div style={ledgerTableWrap}>
          <table style={ledgerTable}>
            <thead>
              <tr>
                <th style={ledgerTh}>{t.zelleColUnit}</th>
                <th style={ledgerTh}>{t.zelleColTenant}</th>
                <th style={ledgerTh}>{t.zelleColDate}</th>
                <th style={ledgerTh}>{t.zelleColMemo}</th>
                <th style={{ ...ledgerTh, textAlign: 'right' }}>{t.zelleColPaidExpected}</th>
                <th style={ledgerTh}>{t.zelleColMatch}</th>
                <th style={{ ...ledgerTh, textAlign: 'right' }}>{t.zelleColActions}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const ev = r.event
                const isOpen = Boolean(expandedIds[r.id])
                const isBusy = busyId === r.id
                const label = matchLabel(r)
                const reasonLabel = ev.matchReason ? t[`zelleReason_${ev.matchReason}`] || ev.matchReason : null
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td style={{ ...ledgerTd, whiteSpace: 'nowrap' }}>
                        <div style={ledgerPrimary}>{r.unitLabel || '-'}</div>
                        {r.propertyLabel && <div style={ledgerMuted}>{r.propertyLabel}</div>}
                      </td>
                      <td style={ledgerTd}>
                        {r.tenantNames.length > 0 ? (
                          <>
                            <div style={ledgerPrimary}>{r.tenantNames.join(', ')}</div>
                            {r.payerDiffers && <div style={ledgerMuted}>{t.zelleVia(r.payerName)}</div>}
                          </>
                        ) : (
                          <>
                            <div style={ledgerPrimary}>{r.payerName || t.zelleUnknownPayer}</div>
                            <div style={ledgerMuted}>{t.zelleNotPosted}</div>
                          </>
                        )}
                      </td>
                      <td style={{ ...ledgerTd, whiteSpace: 'nowrap' }}>
                        {r.sentDate ? (
                          <>
                            <div>{t.zelleSentPrefix} {fmtDate(r.sentDate)}</div>
                            {r.receivedDate && r.receivedDate !== r.sentDate && (
                              <div style={ledgerMuted}>{t.zelleEmailPrefix} {fmtDate(r.receivedDate)}</div>
                            )}
                          </>
                        ) : r.receivedDate ? (
                          <div>{t.zelleEmailPrefix} {fmtDate(r.receivedDate)}</div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={{ ...ledgerTd, maxWidth: 200, overflowWrap: 'anywhere' }}>
                        {r.memo ? r.memo : <span style={{ color: '#9ca3af' }}>{t.zelleNoMemo}</span>}
                      </td>
                      <td style={ledgerAmountCell}>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{money2(r.amount)}</div>
                        {r.groupSize > 1 && <div style={ledgerMuted}>{t.zelleGroupTotal(money2(r.groupPaid), r.groupSize)}</div>}
                        {r.expected != null && <div style={ledgerMuted}>{t.zelleOfExpected(money2(r.expected))}</div>}
                      </td>
                      <td style={ledgerTd}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {label && (
                            <span style={{ ...pillBase, background: '#fff', border: '1px solid #e5e7eb', color: MATCH_COLOR[r.match] }}>
                              {label}
                            </span>
                          )}
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{t[`zelleCat_${r.category}`] || r.category}</span>
                        </div>
                        {showStatus && <div style={ledgerMuted}>{t[`zelleStatus_${r.status}`] || r.status}</div>}
                      </td>
                      <td style={{ ...ledgerTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                          <button type="button" aria-expanded={isOpen} style={linkButton} onClick={() => toggleExpand(r.id)}>
                            {isOpen ? t.zelleHideEmail : t.zelleViewEmail}
                          </button>
                          {ev.status === 'auto_posted' && (
                            <Btn size="sm" variant="secondary" disabled={isBusy} onClick={() => onUndo(ev)}>
                              {isBusy ? t.zelleUndoing : t.zelleUndo}
                            </Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ ...ledgerTd, background: '#fafafa' }}>
                          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.75rem', color: '#6b7280' }}>
                            {r.txnId && (
                              <span>
                                {t.zelleTxnLabel}: <code>{r.txnId}</code>
                              </span>
                            )}
                            {reasonLabel && (
                              <span>
                                {t.zelleMatchRuleLabel}: <strong style={{ color: '#111827' }}>{reasonLabel}</strong>
                              </span>
                            )}
                          </div>
                          <RawEmail ev={ev} t={t} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ZelleInboxPanel({ data, t, lang, refresh }) {
  const [subTab, setSubTab] = useState('needs_review')
  const [expandedIds, setExpandedIds] = useState({})
  const [drafts, setDrafts] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [ledgerFilters, setLedgerFilters] = useState({ month: 'all', propertyId: 'all', match: 'all', query: '' })

  const mx = useZelleMutations()
  const events = data.zelleEvents || []
  const aliases = data.zellePayerAliases || []
  const tenants = data.tenants || []
  const contracts = data.contracts || []
  const payments = data.payments || []
  const properties = data.properties || []
  const parkingLeases = data.parkingLeases || []

  const savedAliasNormalizedSet = new Set(aliases.map((a) => a.payerNameNormalized))
  const nonProdPropIds = new Set(properties.filter((p) => p.inProduction === false).map((p) => p.id))
  const currentTenants = tenants.filter(
    (ten) => ten.status === 'current tenant' && (!ten.propertyId || !nonProdPropIds.has(ten.propertyId))
  )
  const otherTenants = tenants.filter((ten) => !currentTenants.includes(ten))
  const tenantsById = new Map(tenants.map((ten) => [ten.id, ten]))
  const contractsById = new Map(contracts.map((c) => [c.id, c]))
  const paymentsById = new Map(payments.map((p) => [p.id, p]))

  // Multi-tenant contracts eligible for 1-to-N lump-sum splitting.
  const sharedContracts = contracts.filter((c) => (c.tenantIds || []).length >= 2)

  const pendingEvents = events.filter(isZellePending)
  const autoPostedEvents = events.filter(isZelleAutoPosted)
  const historyEvents = events.filter(isZelleResolved)

  const partialGroups = findPartialRentGroups({
    events: pendingEvents,
    tenants,
    parkingLeases,
  })

  const visibleEvents =
    subTab === 'needs_review'
      ? pendingEvents
      : subTab === 'auto_posted'
        ? autoPostedEvents
        : historyEvents

  const buildSplitMapForContract = (contractId) => {
    const contract = contractsById.get(contractId)
    if (!contract) return {}
    const map = {}
    for (const tid of contract.tenantIds || []) {
      const ten = tenantsById.get(tid)
      if (!ten) continue
      const expected = expectedMonthlyRent(ten, parkingLeases)
      map[tid] = expected > 0 ? String(expected) : ''
    }
    return map
  }

  const getDraft = (ev) => {
    const existing = drafts[ev.id]
    if (existing) return existing
    const alreadySaved = Boolean(ev.payerNameNormalized && savedAliasNormalizedSet.has(ev.payerNameNormalized))
    const defaultContractId =
      ev.suggestedContractId && sharedContracts.some((c) => c.id === ev.suggestedContractId)
        ? ev.suggestedContractId
        : ''
    const defaultSplit = Boolean(defaultContractId && (ev.suggestedTenantIds || []).length >= 2)
    return {
      category: ev.category || 'rent',
      mode: defaultSplit ? 'split' : 'single',
      tenantId: ev.suggestedTenantIds?.[0] || '',
      contractId: defaultContractId,
      splitAmounts: defaultContractId ? buildSplitMapForContract(defaultContractId) : {},
      targetMonth: ev.targetMonth ? String(ev.targetMonth).slice(0, 7) : '',
      amount: ev.amount != null ? String(ev.amount) : '',
      rememberAlias: Boolean(ev.payerName && !alreadySaved && ev.matchReason === 'unknown_payer'),
    }
  }

  const updateDraft = (eventId, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [eventId]: { ...(prev[eventId] || {}), ...patch },
    }))
  }

  const toggleExpand = (id) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleUndo = async (ev) => {
    setBusyId(ev.id)
    setError(null)
    setNotice(null)
    try {
      await mx.undoEvent(ev.id)
      await refresh()
      setNotice(t.zelleUndoSuccess)
      setSubTab('needs_review')
    } catch (e) {
      setError(e.message || t.zelleUndoFailed)
    }
    setBusyId(null)
  }

  const handleResolve = async (ev, payload, successMsg) => {
    setBusyId(ev.id)
    setError(null)
    setNotice(null)
    try {
      await mx.resolveEvent({ eventId: ev.id, ...payload })
      await refresh()
      setNotice(successMsg)
    } catch (e) {
      setError(e.message || t.zelleResolveFailed)
    }
    setBusyId(null)
  }

  const handleConfirmGroup = async (group) => {
    setBusyId(group.key)
    setError(null)
    setNotice(null)
    try {
      const contract = contracts.find((c) => (c.tenantIds || []).includes(group.tenantId))
      await mx.confirmPartialGroup({
        eventIds: group.events.map((e) => e.id),
        tenantId: group.tenantId,
        contractId: contract?.id || null,
        targetMonth: group.targetMonth,
      })
      await refresh()
      setNotice(t.zelleGroupConfirmed)
    } catch (e) {
      setError(e.message || t.zelleGroupConfirmFailed)
    }
    setBusyId(null)
  }

  const handleDeleteAlias = async (aliasId) => {
    setBusyId(aliasId)
    setError(null)
    setNotice(null)
    try {
      await mx.deleteAlias(aliasId)
      await refresh()
      setNotice(t.zelleAliasRemoved)
    } catch (e) {
      setError(e.message || t.zelleAliasRemoveFailed)
    }
    setBusyId(null)
  }

  const subTabs = [
    { key: 'needs_review', label: t.zelleSubNeedsReview, count: pendingEvents.length },
    { key: 'auto_posted', label: t.zelleSubAutoPosted, count: autoPostedEvents.length },
    { key: 'history', label: t.zelleSubHistory, count: historyEvents.length },
    { key: 'aliases', label: t.zelleSubAliases, count: aliases.length },
  ]

  const emptyMessage =
    subTab === 'needs_review'
      ? t.zelleNoNeedsReview
      : subTab === 'auto_posted'
        ? t.zelleNoAutoPosted
        : t.zelleNoHistory

  const contractLabel = (c) => {
    const names = (c.tenantIds || [])
      .map((tid) => tenantDisplayName(tenantsById.get(tid)))
      .filter(Boolean)
    return names.join(' + ') || c.id
  }

  return (
    <div>
      {error && <div style={errBanner}>{error}</div>}
      {notice && <div style={okBanner}>{notice}</div>}

      <div style={subTabRow}>
        {subTabs.map((tab) => {
          const active = subTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              className="ld-zelle-tab"
              onClick={() => setSubTab(tab.key)}
              style={{
                padding: '8px 14px',
                borderRadius: 9,
                border: active ? '1px solid #111111' : '1px solid #e5e7eb',
                background: active ? '#111111' : '#fff',
                color: active ? '#fff' : '#374151',
                fontSize: "0.8125rem",
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontFamily: 'inherit',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  padding: '1px 7px',
                  borderRadius: 12,
                  background: active ? 'rgba(255,255,255,0.2)' : '#f3f4f6',
                  color: active ? '#fff' : '#4b5563',
                }}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {subTab === 'needs_review' && partialGroups.length > 0 && (
        <div>
          {partialGroups.map((group) => {
            const who = tenantDisplayName(group.tenant) || group.tenantId
            const groupBusy = busyId === group.key
            return (
              <div key={group.key} style={groupCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: '#111111' }}>
                      {t.zellePartialGroupTitle(who, group.monthKey)}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: group.meetsExpected ? '#047857' : '#92400e', fontWeight: 600, marginTop: 4 }}>
                      {t.zellePartialGroupProgress(fmt(group.runningTotal), fmt(group.expectedTotal), group.events.length)}
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6, fontSize: "0.75rem", color: '#4b5563' }}>
                      {group.events.map((e) => (
                        <span key={e.id} style={{ ...pillBase, background: '#fff', border: '1px solid #d1d5db', color: '#111827' }}>
                          {fmt(e.amount)} ({e.sentOn ? fmtDate(e.sentOn) : '-'})
                        </span>
                      ))}
                    </div>
                  </div>
                  <Btn
                    size="sm"
                    disabled={groupBusy}
                    onClick={() => handleConfirmGroup(group)}
                  >
                    {groupBusy ? t.zelleConfirmingGroup : t.zelleConfirmGroup}
                  </Btn>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {subTab === 'aliases' ? (
        aliases.length === 0 ? (
          <div style={emptyBox}>{t.zelleNoAliases}</div>
        ) : (
          aliases.map((alias) => {
            const targetTenant = alias.tenantId ? tenantsById.get(alias.tenantId) : null
            const targetContract = alias.contractId ? contractsById.get(alias.contractId) : null
            const contractNames = targetContract
              ? (targetContract.tenantIds || [])
                  .map((tid) => tenantDisplayName(tenantsById.get(tid)))
                  .filter(Boolean)
                  .join(', ')
              : ''
            return (
              <div key={alias.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: '#111111' }}>
                      {alias.payerNameDisplay}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: '#6b7280', marginTop: 4 }}>
                      {alias.tenantId ? (
                        <span>
                          {t.zelleAliasMappedToTenant}:{' '}
                          <strong style={{ color: '#111827' }}>{tenantDisplayName(targetTenant) || alias.tenantId}</strong>
                        </span>
                      ) : (
                        <span>
                          {t.zelleAliasMappedToContract}:{' '}
                          <strong style={{ color: '#111827' }}>{contractNames || alias.contractId}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                  <Btn
                    size="sm"
                    variant="secondary"
                    disabled={busyId === alias.id}
                    onClick={() => handleDeleteAlias(alias.id)}
                  >
                    {busyId === alias.id ? t.zelleRemovingAlias : t.zelleRemoveAlias}
                  </Btn>
                </div>
              </div>
            )
          })
        )
      ) : visibleEvents.length === 0 ? (
        <div style={emptyBox}>{emptyMessage}</div>
      ) : subTab === 'auto_posted' || subTab === 'history' ? (
        <ZelleLedgerTable
          rows={buildLedgerRows({
            events: visibleEvents,
            payments,
            tenants,
            units: data.units || [],
            properties,
            parkingLeases,
          })}
          t={t}
          lang={lang}
          filters={ledgerFilters}
          setFilters={setLedgerFilters}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          busyId={busyId}
          onUndo={handleUndo}
          showStatus={subTab === 'history'}
        />
      ) : (
        visibleEvents.map((ev) => {
          const statusStyle = STATUS_STYLE[ev.status] || STATUS_STYLE.needs_review
          const catStyle = CATEGORY_STYLE[ev.category] || CATEGORY_STYLE.other
          const reasonLabel = ev.matchReason ? t[`zelleReason_${ev.matchReason}`] || ev.matchReason : null
          const isExpanded = Boolean(expandedIds[ev.id])
          const isBusy = busyId === ev.id

          const postedTenants = (ev.postedPaymentIds || [])
            .map((pid) => paymentsById.get(pid))
            .filter(Boolean)
            .map((p) => tenantDisplayName(tenantsById.get(p.tenantId)))
            .filter(Boolean)

          const suggestedTenants = (ev.suggestedTenantIds || [])
            .map((tid) => tenantDisplayName(tenantsById.get(tid)))
            .filter(Boolean)

          const draft = getDraft(ev)
          const isSplitMode = draft.category === 'rent' && draft.mode === 'split'
          const selectedContract = draft.tenantId
            ? contracts.find((c) => (c.tenantIds || []).includes(draft.tenantId))
            : null
          const splitContract = draft.contractId ? contractsById.get(draft.contractId) : null
          const splitTenants = splitContract
            ? (splitContract.tenantIds || []).map((tid) => tenantsById.get(tid)).filter(Boolean)
            : []
          const splitEntries = splitTenants.map((ten) => ({
            tenantId: ten.id,
            amount: Number(draft.splitAmounts?.[ten.id] || 0),
          }))
          const splitSum = Math.round(splitEntries.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0) * 100) / 100
          const targetAmt = Number(draft.amount || ev.amount || 0)
          const splitBalanced =
            splitEntries.length >= 2 &&
            splitEntries.every((r) => r.amount > 0) &&
            targetAmt > 0 &&
            Math.abs(splitSum - targetAmt) < 0.01

          const existingPaidRent =
            ev.status === 'needs_review' &&
            draft.category === 'rent' &&
            !isSplitMode &&
            draft.tenantId &&
            draft.targetMonth
              ? payments.find(
                  (p) =>
                    p.tenantId === draft.tenantId &&
                    isPaidRent(p) &&
                    String(p.dueDate || '').slice(0, 7) === draft.targetMonth
                )
              : null

          return (
            <div key={ev.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: '#111111' }}>
                      {ev.payerName || t.zelleUnknownPayer}
                    </span>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: '#111111' }}>
                      {ev.amount != null ? fmt(ev.amount) : '-'}
                    </span>
                    <span style={{ ...pillBase, background: statusStyle.bg, color: statusStyle.text }}>
                      {t[`zelleStatus_${ev.status}`] || ev.status}
                    </span>
                    <span style={{ ...pillBase, background: catStyle.bg, color: catStyle.text }}>
                      {t[`zelleCat_${ev.category}`] || ev.category}
                    </span>
                    {reasonLabel && (
                      <span style={{ ...pillBase, background: '#f9fafb', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                        {reasonLabel}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: "0.8125rem", color: '#6b7280' }}>
                    <span>{ev.sentOn ? fmtDate(ev.sentOn) : ev.receivedAt ? fmtDate(ev.receivedAt) : '-'}</span>
                    <span>
                      {t.zelleMonthLabel}: <strong style={{ color: '#111827' }}>{formatMonth(ev.targetMonth)}</strong>
                    </span>
                    <span>
                      {t.zelleMemoLabel}:{' '}
                      <strong style={{ color: '#111827' }}>{ev.memo || t.zelleNoMemo}</strong>
                    </span>
                    {ev.zelleTxnId && (
                      <span>
                        {t.zelleTxnLabel}: <code style={{ fontSize: "0.75rem" }}>{ev.zelleTxnId}</code>
                      </span>
                    )}
                  </div>

                  {postedTenants.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: "0.8125rem", color: '#047857' }}>
                      {t.zellePostedTo}: <strong>{postedTenants.join(', ')}</strong>
                    </div>
                  )}

                  {postedTenants.length === 0 && suggestedTenants.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: "0.8125rem", color: '#4b5563' }}>
                      {t.zelleSuggestedFor}: <strong>{suggestedTenants.join(', ')}</strong>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Btn size="sm" variant="ghost" onClick={() => toggleExpand(ev.id)}>
                    <Icon name="mail" size={14} />
                    <span>{isExpanded ? t.zelleHideEmail : t.zelleViewEmail}</span>
                  </Btn>
                  {ev.status === 'auto_posted' && (
                    <Btn
                      size="sm"
                      variant="secondary"
                      disabled={isBusy}
                      onClick={() => handleUndo(ev)}
                    >
                      {isBusy ? t.zelleUndoing : t.zelleUndo}
                    </Btn>
                  )}
                </div>
              </div>

              {ev.status === 'needs_review' && (
                <div style={triageBox}>
                  {draft.category === 'rent' && sharedContracts.length > 0 && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['single', 'split'].map((m) => {
                        const active = (draft.mode || 'single') === m
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updateDraft(ev.id, { ...draft, mode: m })}
                            style={{
                              padding: '5px 11px',
                              borderRadius: 7,
                              border: active ? '1px solid #111111' : '1px solid #d1d5db',
                              background: active ? '#111111' : '#fff',
                              color: active ? '#fff' : '#4b5563',
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            {m === 'single' ? t.zelleModeSingle : t.zelleModeSplit}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="ld-zelle-triage-row" style={triageRow}>
                    <label className="ld-zelle-field" style={fieldWrap}>
                      <span style={fieldLabel}>{t.zelleCategoryLabel}</span>
                      <select
                        className="ld-zelle-control"
                        style={controlStyle}
                        value={draft.category}
                        onChange={(e) => updateDraft(ev.id, { ...draft, category: e.target.value })}
                      >
                        {ZELLE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {t[`zelleCat_${c}`] || c}
                          </option>
                        ))}
                      </select>
                    </label>

                    {isSplitMode ? (
                      <>
                        <label className="ld-zelle-field" style={{ ...fieldWrap, '--ld-zelle-field-min-w': '220px' }}>
                          <span style={fieldLabel}>{t.zelleContractLabel}</span>
                          <select
                            className="ld-zelle-control"
                            style={controlStyle}
                            value={draft.contractId || ''}
                            onChange={(e) => {
                              const cid = e.target.value
                              updateDraft(ev.id, {
                                ...draft,
                                contractId: cid,
                                splitAmounts: buildSplitMapForContract(cid),
                              })
                            }}
                          >
                            <option value="">{t.zelleSelectContract}</option>
                            {sharedContracts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {contractLabel(c)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="ld-zelle-field" style={fieldWrap}>
                          <span style={fieldLabel}>{t.zelleMonthLabel}</span>
                          <input
                            type="month"
                            className="ld-zelle-control"
                            style={controlStyle}
                            value={draft.targetMonth}
                            onChange={(e) => updateDraft(ev.id, { ...draft, targetMonth: e.target.value })}
                          />
                        </label>
                        <label className="ld-zelle-field" style={{ ...fieldWrap, '--ld-zelle-field-min-w': '110px' }}>
                          <span style={fieldLabel}>{t.zelleAmountLabel}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="ld-zelle-control"
                            style={controlStyle}
                            value={draft.amount}
                            onChange={(e) => updateDraft(ev.id, { ...draft, amount: e.target.value })}
                          />
                        </label>
                      </>
                    ) : (draft.category === 'rent' || draft.category === 'deposit' || draft.category === 'other') && (
                      <>
                        <label className="ld-zelle-field" style={{ ...fieldWrap, '--ld-zelle-field-min-w': '200px' }}>
                          <span style={fieldLabel}>{t.zelleTenantLabel}</span>
                          <select
                            className="ld-zelle-control"
                            style={controlStyle}
                            value={draft.tenantId}
                            onChange={(e) => updateDraft(ev.id, { ...draft, tenantId: e.target.value })}
                          >
                            <option value="">{t.zelleSelectTenant}</option>
                            {(() => {
                              const sugSet = new Set(ev.suggestedTenantIds || [])
                              const sugList = currentTenants.filter((ten) => sugSet.has(ten.id))
                              const restCurrent = currentTenants.filter((ten) => !sugSet.has(ten.id))
                              return (
                                <>
                                  {sugList.length > 0 && (
                                    <optgroup label={t.zelleSuggestedTenantsGroup}>
                                      {sugList.map((ten) => (
                                        <option key={ten.id} value={ten.id}>
                                          {tenantDisplayName(ten)}
                                          {ten.monthlyRent ? ` (${fmt(ten.monthlyRent)})` : ''}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {restCurrent.length > 0 && (
                                    <optgroup label={t.zelleCurrentTenantsGroup}>
                                      {restCurrent.map((ten) => (
                                        <option key={ten.id} value={ten.id}>
                                          {tenantDisplayName(ten)}
                                          {ten.monthlyRent ? ` (${fmt(ten.monthlyRent)})` : ''}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </>
                              )
                            })()}
                            {otherTenants.length > 0 && (
                              <optgroup label={t.zelleOtherTenantsGroup}>
                                {otherTenants.map((ten) => (
                                  <option key={ten.id} value={ten.id}>
                                    {tenantDisplayName(ten)}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </label>

                        <label className="ld-zelle-field" style={fieldWrap}>
                          <span style={fieldLabel}>{t.zelleMonthLabel}</span>
                          <input
                            type="month"
                            className="ld-zelle-control"
                            style={controlStyle}
                            value={draft.targetMonth}
                            onChange={(e) => updateDraft(ev.id, { ...draft, targetMonth: e.target.value })}
                          />
                        </label>

                        <label className="ld-zelle-field" style={{ ...fieldWrap, '--ld-zelle-field-min-w': '110px' }}>
                          <span style={fieldLabel}>{t.zelleAmountLabel}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="ld-zelle-control"
                            style={controlStyle}
                            value={draft.amount}
                            onChange={(e) => updateDraft(ev.id, { ...draft, amount: e.target.value })}
                          />
                        </label>
                      </>
                    )}
                  </div>

                  {isSplitMode && splitTenants.length > 0 && (
                    <div style={splitBox}>
                      {splitTenants.map((ten) => (
                        <div key={ten.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: '#111827' }}>
                            {tenantDisplayName(ten)}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="ld-zelle-control"
                            style={{ ...controlStyle, width: 120, textAlign: 'right' }}
                            value={draft.splitAmounts?.[ten.id] ?? ''}
                            onChange={(e) =>
                              updateDraft(ev.id, {
                                ...draft,
                                splitAmounts: { ...(draft.splitAmounts || {}), [ten.id]: e.target.value },
                              })
                            }
                          />
                        </div>
                      ))}
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: splitBalanced ? '#047857' : '#b45309', textAlign: 'right' }}>
                        {t.zelleSplitTotalLabel(fmt(splitSum), fmt(targetAmt))}
                      </div>
                    </div>
                  )}

                  {existingPaidRent && (
                    <div style={warnNote}>
                      {t.zelleExistingPaidHint(fmt(existingPaidRent.amount), fmtDate(existingPaidRent.paidDate || existingPaidRent.dueDate))}
                    </div>
                  )}

                  {draft.category === 'rent' && ev.payerName && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 40, fontSize: "0.8125rem", color: '#374151', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.rememberAlias)}
                        onChange={(e) => updateDraft(ev.id, { ...draft, rememberAlias: e.target.checked })}
                        style={{ width: 20, height: 20, accentColor: '#111111', cursor: 'pointer' }}
                      />
                      <span>{isSplitMode ? t.zelleRememberContractPayer : t.zelleRememberPayer}</span>
                    </label>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {isSplitMode && (
                      <Btn
                        size="sm"
                        disabled={isBusy || !draft.contractId || !draft.targetMonth || !splitBalanced}
                        onClick={() =>
                          handleResolve(
                            ev,
                            {
                              action: 'confirm_split',
                              contractId: draft.contractId,
                              targetMonth: draft.targetMonth,
                              amount: targetAmt,
                              splits: splitEntries,
                              rememberAlias: Boolean(draft.rememberAlias),
                            },
                            t.zelleResolvedConfirmed
                          )
                        }
                      >
                        {isBusy ? t.zelleConfirming : t.zelleConfirmSplit}
                      </Btn>
                    )}

                    {draft.category === 'rent' && !isSplitMode && existingPaidRent && (
                      <Btn
                        size="sm"
                        disabled={isBusy}
                        onClick={() =>
                          handleResolve(
                            ev,
                            {
                              action: 'link_existing',
                              paymentId: existingPaidRent.id,
                              targetMonth: draft.targetMonth,
                              category: 'rent',
                              rememberAlias: Boolean(draft.rememberAlias),
                            },
                            t.zelleResolvedLinked
                          )
                        }
                      >
                        {isBusy ? t.zelleConfirming : t.zelleLinkExisting}
                      </Btn>
                    )}

                    {draft.category === 'rent' && !isSplitMode && !existingPaidRent && (
                      <Btn
                        size="sm"
                        disabled={isBusy || !draft.tenantId || !draft.targetMonth || !(Number(draft.amount) > 0)}
                        onClick={() =>
                          handleResolve(
                            ev,
                            {
                              action: 'confirm_rent',
                              tenantId: draft.tenantId,
                              contractId: selectedContract?.id || null,
                              targetMonth: draft.targetMonth,
                              amount: Number(draft.amount),
                              rememberAlias: Boolean(draft.rememberAlias),
                            },
                            t.zelleResolvedConfirmed
                          )
                        }
                      >
                        {isBusy ? t.zelleConfirming : t.zelleConfirmRent}
                      </Btn>
                    )}

                    {(draft.category === 'deposit' || draft.category === 'other') && (
                      <Btn
                        size="sm"
                        disabled={isBusy || !draft.tenantId || !(Number(draft.amount) > 0)}
                        onClick={() =>
                          handleResolve(
                            ev,
                            {
                              action: 'confirm_other',
                              category: draft.category,
                              tenantId: draft.tenantId,
                              contractId: selectedContract?.id || null,
                              targetMonth: draft.targetMonth || null,
                              amount: Number(draft.amount),
                            },
                            t.zelleResolvedConfirmed
                          )
                        }
                      >
                        {isBusy ? t.zelleConfirming : t.zelleConfirmOther}
                      </Btn>
                    )}

                    {draft.category === 'parking' && (
                      <Btn
                        size="sm"
                        disabled={isBusy}
                        onClick={() =>
                          handleResolve(ev, { action: 'acknowledge_parking' }, t.zelleResolvedAcknowledged)
                        }
                      >
                        {isBusy ? t.zelleConfirming : t.zelleAckParking}
                      </Btn>
                    )}

                    <Btn
                      size="sm"
                      variant={draft.category === 'ignore' ? 'primary' : 'secondary'}
                      disabled={isBusy}
                      onClick={() => handleResolve(ev, { action: 'ignore' }, t.zelleResolvedIgnored)}
                    >
                      {t.zelleIgnore}
                    </Btn>
                  </div>
                </div>
              )}

              {isExpanded && <RawEmail ev={ev} t={t} />}
            </div>
          )
        })
      )}
    </div>
  )
}
