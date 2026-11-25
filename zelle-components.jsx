'use client'
import { useState } from 'react'
import { Btn, Icon } from './property-management-app'
import { fmt, fmtDate } from '@/lib/format'
import { isPaidRent } from '@/lib/payments/status'
import { createZelleAdapter } from '@/lib/zelle/adapter'
import { undoZelleEvent, resolveZelleEventClient, deleteZelleAliasClient } from '@/lib/zelle/core'
import { isZellePending, isZelleAutoPosted, isZelleResolved, ZELLE_CATEGORIES } from '@/lib/zelle/status'

const card = {
  background: '#fff',
  borderRadius: 14,
  padding: 20,
  border: '1px solid #eaeaea',
  marginBottom: 14,
}
const emptyBox = {
  background: '#fff',
  borderRadius: 14,
  padding: '44px 24px',
  border: '1px solid #eaeaea',
  textAlign: 'center',
  color: '#6b7280',
  fontSize: 14,
}
const subTabRow = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 18,
}
const pillBase = {
  fontSize: 11,
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
  fontSize: 12,
  lineHeight: 1.55,
  color: '#374151',
  whiteSpace: 'pre-wrap',
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
  minWidth: 130,
}
const fieldLabel = {
  fontSize: 11,
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '.4px',
}
const controlStyle = {
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 13,
  color: '#111827',
  background: '#fff',
  fontFamily: 'inherit',
}
const errBanner = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 14,
  fontSize: 13,
  color: '#dc2626',
}
const okBanner = {
  background: '#ecfdf5',
  border: '1px solid #a7f3d0',
  borderRadius: 8,
  padding: '10px 14px',
  marginBottom: 14,
  fontSize: 13,
  color: '#047857',
}
const warnNote = {
  background: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: 8,
  padding: '7px 11px',
  fontSize: 12,
  color: '#92400e',
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

export function ZelleInboxPanel({ data, t, refresh }) {
  const [subTab, setSubTab] = useState('needs_review')
  const [expandedIds, setExpandedIds] = useState({})
  const [drafts, setDrafts] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const mx = useZelleMutations()
  const events = data.zelleEvents || []
  const aliases = data.zellePayerAliases || []
  const tenants = data.tenants || []
  const contracts = data.contracts || []
  const payments = data.payments || []
  const properties = data.properties || []

  const savedAliasNormalizedSet = new Set(aliases.map((a) => a.payerNameNormalized))
  const nonProdPropIds = new Set(properties.filter((p) => p.inProduction === false).map((p) => p.id))
  const currentTenants = tenants.filter(
    (ten) => ten.status === 'current tenant' && (!ten.propertyId || !nonProdPropIds.has(ten.propertyId))
  )
  const otherTenants = tenants.filter((ten) => !currentTenants.includes(ten))
  const tenantsById = new Map(tenants.map((ten) => [ten.id, ten]))
  const contractsById = new Map(contracts.map((c) => [c.id, c]))
  const paymentsById = new Map(payments.map((p) => [p.id, p]))

  const pendingEvents = events.filter(isZellePending)
  const autoPostedEvents = events.filter(isZelleAutoPosted)
  const historyEvents = events.filter(isZelleResolved)

  const visibleEvents =
    subTab === 'needs_review'
      ? pendingEvents
      : subTab === 'auto_posted'
        ? autoPostedEvents
        : historyEvents

  const getDraft = (ev) => {
    const existing = drafts[ev.id]
    if (existing) return existing
    const alreadySaved = Boolean(ev.payerNameNormalized && savedAliasNormalizedSet.has(ev.payerNameNormalized))
    return {
      category: ev.category || 'rent',
      tenantId: ev.suggestedTenantIds?.[0] || '',
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
              onClick={() => setSubTab(tab.key)}
              style={{
                padding: '8px 14px',
                borderRadius: 9,
                border: active ? '1px solid #111111' : '1px solid #e5e7eb',
                background: active ? '#111111' : '#fff',
                color: active ? '#fff' : '#374151',
                fontSize: 13,
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
                  fontSize: 11,
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
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111111' }}>
                      {alias.payerNameDisplay}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
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
                    variant="danger"
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
          const selectedContract = draft.tenantId
            ? contracts.find((c) => (c.tenantIds || []).includes(draft.tenantId))
            : null
          const existingPaidRent =
            ev.status === 'needs_review' &&
            draft.category === 'rent' &&
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
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#111111' }}>
                      {ev.payerName || t.zelleUnknownPayer}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#111111' }}>
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

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#6b7280' }}>
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
                        {t.zelleTxnLabel}: <code style={{ fontSize: 12 }}>{ev.zelleTxnId}</code>
                      </span>
                    )}
                  </div>

                  {postedTenants.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#047857' }}>
                      {t.zellePostedTo}: <strong>{postedTenants.join(', ')}</strong>
                    </div>
                  )}

                  {postedTenants.length === 0 && suggestedTenants.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#4b5563' }}>
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
                      variant="danger"
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
                  <div style={triageRow}>
                    <label style={fieldWrap}>
                      <span style={fieldLabel}>{t.zelleCategoryLabel}</span>
                      <select
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

                    {(draft.category === 'rent' || draft.category === 'deposit' || draft.category === 'other') && (
                      <>
                        <label style={{ ...fieldWrap, minWidth: 200 }}>
                          <span style={fieldLabel}>{t.zelleTenantLabel}</span>
                          <select
                            style={controlStyle}
                            value={draft.tenantId}
                            onChange={(e) => updateDraft(ev.id, { ...draft, tenantId: e.target.value })}
                          >
                            <option value="">{t.zelleSelectTenant}</option>
                            {currentTenants.length > 0 && (
                              <optgroup label={t.zelleCurrentTenantsGroup}>
                                {currentTenants.map((ten) => (
                                  <option key={ten.id} value={ten.id}>
                                    {tenantDisplayName(ten)}
                                    {ten.monthlyRent ? ` (${fmt(ten.monthlyRent)})` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            )}
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

                        <label style={fieldWrap}>
                          <span style={fieldLabel}>{t.zelleMonthLabel}</span>
                          <input
                            type="month"
                            style={controlStyle}
                            value={draft.targetMonth}
                            onChange={(e) => updateDraft(ev.id, { ...draft, targetMonth: e.target.value })}
                          />
                        </label>

                        <label style={{ ...fieldWrap, minWidth: 110 }}>
                          <span style={fieldLabel}>{t.zelleAmountLabel}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            style={controlStyle}
                            value={draft.amount}
                            onChange={(e) => updateDraft(ev.id, { ...draft, amount: e.target.value })}
                          />
                        </label>
                      </>
                    )}
                  </div>

                  {existingPaidRent && (
                    <div style={warnNote}>
                      {t.zelleExistingPaidHint(fmt(existingPaidRent.amount), fmtDate(existingPaidRent.paidDate || existingPaidRent.dueDate))}
                    </div>
                  )}

                  {draft.category === 'rent' && ev.payerName && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.rememberAlias)}
                        onChange={(e) => updateDraft(ev.id, { ...draft, rememberAlias: e.target.checked })}
                        style={{ width: 15, height: 15, accentColor: '#111111', cursor: 'pointer' }}
                      />
                      <span>{t.zelleRememberPayer}</span>
                    </label>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {draft.category === 'rent' && existingPaidRent && (
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

                    {draft.category === 'rent' && !existingPaidRent && (
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

              {isExpanded && (
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
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
