'use client'
import { useState } from 'react'
import { Btn, Icon } from './property-management-app'
import { fmt, fmtDate } from '@/lib/format'
import { createZelleAdapter } from '@/lib/zelle/adapter'
import { undoZelleEvent } from '@/lib/zelle/core'
import { isZellePending, isZelleAutoPosted, isZelleResolved } from '@/lib/zelle/status'

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
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const mx = useZelleMutations()
  const events = data.zelleEvents || []
  const tenantsById = new Map((data.tenants || []).map((ten) => [ten.id, ten]))
  const paymentsById = new Map((data.payments || []).map((p) => [p.id, p]))

  const pendingEvents = events.filter(isZellePending)
  const autoPostedEvents = events.filter(isZelleAutoPosted)
  const historyEvents = events.filter(isZelleResolved)

  const visibleEvents =
    subTab === 'needs_review'
      ? pendingEvents
      : subTab === 'auto_posted'
        ? autoPostedEvents
        : historyEvents

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

  const subTabs = [
    { key: 'needs_review', label: t.zelleSubNeedsReview, count: pendingEvents.length },
    { key: 'auto_posted', label: t.zelleSubAutoPosted, count: autoPostedEvents.length },
    { key: 'history', label: t.zelleSubHistory, count: historyEvents.length },
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

      {visibleEvents.length === 0 ? (
        <div style={emptyBox}>{emptyMessage}</div>
      ) : (
        visibleEvents.map((ev) => {
          const statusStyle = STATUS_STYLE[ev.status] || STATUS_STYLE.needs_review
          const catStyle = CATEGORY_STYLE[ev.category] || CATEGORY_STYLE.other
          const reasonLabel = ev.matchReason ? t[`zelleReason_${ev.matchReason}`] || ev.matchReason : null
          const isExpanded = Boolean(expandedIds[ev.id])

          const postedTenants = (ev.postedPaymentIds || [])
            .map((pid) => paymentsById.get(pid))
            .filter(Boolean)
            .map((p) => tenantDisplayName(tenantsById.get(p.tenantId)))
            .filter(Boolean)

          const suggestedTenants = (ev.suggestedTenantIds || [])
            .map((tid) => tenantDisplayName(tenantsById.get(tid)))
            .filter(Boolean)

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
                      disabled={busyId === ev.id}
                      onClick={() => handleUndo(ev)}
                    >
                      {busyId === ev.id ? t.zelleUndoing : t.zelleUndo}
                    </Btn>
                  )}
                </div>
              </div>

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
