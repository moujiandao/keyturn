'use client'
import { useState } from 'react'
import { Modal, Btn, Icon, PageHeader } from './property-management-app'
import {
  deriveRenewalTerm,
  pickOriginalLeaseDate,
  pickEffectiveEndDate,
  isReadyToAdvance,
} from './lib/docuseal/renewal.js'
import { fmtDate } from '@/lib/format'

const card = { background: '#fff', borderRadius: 14, padding: 22, border: '1px solid var(--ld-border, #f5f5f5)' }
const emptyState = { ...card, textAlign: 'center', color: '#9ca3af', fontSize: "0.875rem", padding: 40 }
const sectionHeading = { fontSize: "1.0625rem", fontWeight: 700, color: '#111111', margin: '0 0 14px', fontFamily: "'Inter',system-ui,-apple-system,sans-serif" }
const redChip = { fontSize: "0.6875rem", fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#991b1b' }
const readyChip = { fontSize: "0.6875rem", fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e', letterSpacing: '.3px' }
const appliedChip = { fontSize: "0.6875rem", fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#ecfdf5', color: '#065f46', letterSpacing: '.3px' }
const detailRow = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid #fafafa', fontSize: "0.875rem" }
const errorBox = { fontSize: "0.75rem", color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }
const confirmNoteBox = { fontSize: "0.8125rem", color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }
const warnNoteBox = { fontSize: "0.75rem", color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }

const PLACEHOLDER_DOMAIN = '@placeholder.local'

// ─── Date helpers (date-only, no timezone drift) ──────────────────────────────
// fmtDate now comes from lib/format (shared). fmtMoney (returns "—" for null) and
// daysBetween (operates on Date objects via toDate) keep their renewal-specific
// contracts, so they stay local.
const fmtMoney = (n) =>
  n == null || n === '' ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(Number(n))

const toDate = (d) => (d ? new Date(`${d}T00:00:00`) : null)
const daysBetween = (a, b) => Math.round((b - a) / 86400000)

const isPlaceholderEmail = (email) =>
  !email || !email.trim() || email.trim().toLowerCase().endsWith(PLACEHOLDER_DOMAIN)

// ─── Local stat card (StatCard isn't exported by the monolith) ────────────────
const Stat = ({ label, value, sub, icon, color = '#111111' }) => (
  <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid var(--ld-border, #f5f5f5)', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: "0.8125rem", fontWeight: 500 }}>{label}</p>
        <p style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: '#111111', fontFamily: "'Inter',system-ui,-apple-system,sans-serif" }}>{value}</p>
        {sub && <p style={{ margin: '4px 0 0', fontSize: "0.75rem", color: '#9ca3af' }}>{sub}</p>}
      </div>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}><Icon name={icon} size={20} /></div>
    </div>
  </div>
)

// ─── Renewal status pill ──────────────────────────────────────────────────────
const RENEWAL_STATUS_STYLE = {
  draft:          { bg: '#f5f5f5', text: '#6b7280' },
  pending_review: { bg: '#fef3c7', text: '#92400e' },
  sent:           { bg: '#dbeafe', text: '#1e40af' },
  signed:         { bg: '#cffafe', text: '#155e75' },
  countersigned:  { bg: '#dcfce7', text: '#166534' },
  declined:       { bg: '#fee2e2', text: '#991b1b' },
  blocked:        { bg: '#fee2e2', text: '#991b1b' },
}
const RenewalStatusPill = ({ status, t }) => {
  const s = RENEWAL_STATUS_STYLE[status] || RENEWAL_STATUS_STYLE.draft
  const label = t[`renewalStatus_${status}`] || status
  return (
    <span style={{ fontSize: "0.6875rem", fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.text, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</span>
  )
}

// ─── Signer email flag chip ───────────────────────────────────────────────────
const SignerRow = ({ name, email, t }) => {
  const bad = isPlaceholderEmail(email)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: "0.8125rem", color: '#374151', padding: '3px 0' }}>
      <Icon name="users" size={14} />
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ color: bad ? '#991b1b' : '#6b7280' }}>{email || t.renewalNoEmail}</span>
      {bad && (
        <span style={redChip}>
          {t.renewalFixEmail}
        </span>
      )}
    </div>
  )
}

// ─── Prepare → review → confirm modal ─────────────────────────────────────────
const PrepareRenewalModal = ({ due, user, t, onClose, onDone }) => {
  // 'review' shows the prepared values + signer list returned by /create;
  // until then the modal shows the derived preview pulled from local data.
  const [phase, setPhase] = useState('preview') // preview | prepared
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [prepared, setPrepared] = useState(null) // { renewalId, submissionId, status, signers }

  const prepare = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/renewals/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlordId: user.id, contractId: due.contract.id }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || t.renewalPrepareFailed); setBusy(false); return }
      setPrepared(json)
      setPhase('prepared')
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const send = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/renewals/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlordId: user.id, renewalId: prepared.renewalId }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json?.error || t.renewalSendFailed); setBusy(false); return }
      onDone()
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const row = (label, value) => (
    <div style={detailRow}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: '#111111', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )

  return (
    <Modal title={phase === 'prepared' ? t.renewalReviewTitle : t.renewalPrepareTitle} onClose={onClose} wide>
      <div style={{ marginBottom: 18 }}>
        {row(t.renewalProperty, due.propertyAddress || '—')}
        {row(t.renewalOriginalLeaseDate, fmtDate(due.originalLeaseDate))}
        {row(t.renewalNewTermStart, fmtDate(due.term.newTermStart))}
        {row(t.renewalNewTermEnd, fmtDate(due.term.newTermEnd))}
        {row(t.renewalMonthlyRent, fmtMoney(due.contract.rentAmount))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>{t.renewalSigners}</div>
        {due.signers.map(s => <SignerRow key={s.tenantId} name={s.name} email={s.email} t={t} />)}
        <div style={{ fontSize: "0.75rem", color: '#9ca3af', marginTop: 8 }}>{t.renewalCountersignNote}</div>
      </div>

      {phase === 'prepared' && prepared && (
        <div style={{ ...card, marginBottom: 16, background: '#fafbfc' }}>
          <div style={{ fontSize: "0.8125rem", color: '#166534', fontWeight: 600, marginBottom: 10 }}>{t.renewalPreparedReady}</div>
          {(prepared.signers || []).map(s => (
            <div key={s.tenantId || s.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: "0.8125rem" }}>
              <span style={{ color: '#374151' }}>{s.email}</span>
              {s.embedSrc
                ? <a href={s.embedSrc} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: 600, textDecoration: 'none' }}>{t.renewalPreviewLink}</a>
                : <span style={{ color: '#9ca3af' }}>—</span>}
            </div>
          ))}
        </div>
      )}

      {err && <p style={{ color: '#ef4444', fontSize: "0.8125rem", margin: '8px 0 0' }}>{err}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <Btn variant="secondary" onClick={onClose}>{t.cancel}</Btn>
        {phase === 'preview'
          ? <Btn onClick={prepare} disabled={busy || due.blocked}>{busy ? t.renewalPreparing : t.renewalPrepare}</Btn>
          : <Btn onClick={send} disabled={busy}>{busy ? t.renewalSending : t.renewalConfirmSend}</Btn>}
      </div>
    </Modal>
  )
}

// ─── Phase 4B: Manual confirm to advance lease term modal ────────────────────
const AdvanceLeaseModal = ({ item, user, t, onClose, onDone }) => {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const { renewal, contract, propertyAddress, signerNames, signedDocUrl } = item

  const confirmAdvance = async () => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/renewals/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlordId: user.id, renewalId: renewal.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json?.error || t.renewalAdvanceFailed)
        setBusy(false)
        return
      }
      onDone()
    } catch (e) {
      setErr(e.message || t.renewalAdvanceFailed)
      setBusy(false)
    }
  }

  const row = (label, value) => (
    <div style={detailRow}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: '#111111', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )

  return (
    <Modal title={t.renewalAdvanceTitle} onClose={onClose} wide>
      <div style={{ marginBottom: 16 }}>
        {row(t.renewalProperty, propertyAddress || t.renewalUnknownProperty)}
        {row(t.renewalSigners, signerNames || '—')}
        {row(t.renewalOriginalLeaseDate, fmtDate(renewal.originalLeaseDate))}
        {row(t.renewalCurrentEndDate, fmtDate(contract?.endDate))}
        {row(t.renewalNewTermStart, fmtDate(renewal.newTermStart))}
        {row(t.renewalNewEndDate, fmtDate(renewal.newTermEnd))}
        {row(t.renewalMonthlyRent, fmtMoney(renewal.rentAmount))}
      </div>

      {signedDocUrl ? (
        <div style={{ marginBottom: 14 }}>
          <a
            href={signedDocUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "0.8125rem", fontWeight: 600, color: '#1e40af', textDecoration: 'none' }}
          >
            {t.renewalViewSignedPdf}
          </a>
        </div>
      ) : (
        <div style={warnNoteBox}>{t.renewalAdvanceNotFiledNote}</div>
      )}

      <div style={confirmNoteBox}>
        {t.renewalAdvanceConfirmNote.replace('{date}', fmtDate(renewal.newTermEnd))}
      </div>

      {err && <p style={{ color: '#ef4444', fontSize: "0.8125rem", margin: '8px 0 0' }}>{err}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>{t.cancel}</Btn>
        <Btn onClick={confirmAdvance} disabled={busy}>
          {busy ? t.renewalAdvancing : t.renewalConfirmAdvance}
        </Btn>
      </div>
    </Modal>
  )
}

// ─── Due-renewal card ─────────────────────────────────────────────────────────
const DueCard = ({ due, t, onPrepare }) => (
  <div style={{ ...card, borderColor: due.urgent ? '#fecaca' : 'var(--ld-border)', minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
      <div style={{ minWidth: 0, flex: '1 1 248px', overflowWrap: 'anywhere' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: '#111111' }}>{due.propertyAddress || t.renewalUnknownProperty}</div>
          {due.urgent && (
            <span style={{ ...redChip, textTransform: 'uppercase', letterSpacing: '.4px' }}>{t.renewalUrgent}</span>
          )}
        </div>
        <div style={{ fontSize: "0.8125rem", color: '#6b7280', marginBottom: 10 }}>
          {t.renewalEndsOn}: {fmtDate(due.contract.endDate)} · {t.renewalDaysLeft.replace('{n}', due.daysLeft)}
        </div>
        <div style={{ marginBottom: 10 }}>
          {due.signers.map(s => <SignerRow key={s.tenantId} name={s.name} email={s.email} t={t} />)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: "0.8125rem", color: '#374151' }}>
          <span>{t.renewalNewTerm}: <strong>{fmtDate(due.term.newTermStart)} – {fmtDate(due.term.newTermEnd)}</strong></span>
          <span>{t.renewalCarriedRent}: <strong>{fmtMoney(due.contract.rentAmount)}</strong></span>
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <Btn icon="file" onClick={() => onPrepare(due)} disabled={due.blocked}>{t.renewalPrepare}</Btn>
        {due.blocked && (
          <div style={{ fontSize: "0.75rem", color: '#991b1b', marginTop: 8, maxWidth: 180 }}>{t.renewalBlockedHint}</div>
        )}
      </div>
    </div>
  </div>
)

// ─── In-flight renewal row ────────────────────────────────────────────────────
const InFlightRow = ({
  item,
  filingBusy,
  fileError,
  onFileToDrive,
  onAdvance,
  t,
}) => {
  const { renewal, propertyAddress, signerNames, signedDocUrl } = item
  const effectiveFilingError = fileError || renewal.filingError || null
  const showFileAction = renewal.status === 'countersigned' && !signedDocUrl
  const readyToAdvance = isReadyToAdvance(renewal)

  return (
    <div style={{ ...card, borderColor: readyToAdvance ? '#fde68a' : 'var(--ld-border, #f5f5f5)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: '#111111' }}>{propertyAddress || t.renewalUnknownProperty}</div>
            {readyToAdvance && <span style={readyChip}>{t.renewalReadyToAdvanceBadge}</span>}
            {renewal.appliedToContract && (
              <span style={appliedChip}>
                {renewal.appliedAt
                  ? t.renewalAppliedOn.replace('{date}', fmtDate(renewal.appliedAt))
                  : t.renewalAppliedBadge}
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.8125rem", color: '#6b7280' }}>
            {signerNames || '—'} · {fmtDate(renewal.newTermStart)} – {fmtDate(renewal.newTermEnd)} · {fmtMoney(renewal.rentAmount)}
          </div>
          {signedDocUrl && (
            <div style={{ marginTop: 6 }}>
              <a
                href={signedDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.8125rem", fontWeight: 600, color: '#1e40af', textDecoration: 'none' }}
              >
                {t.renewalViewSignedPdf}
              </a>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <RenewalStatusPill status={renewal.status} t={t} />
          {showFileAction && (
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => onFileToDrive(renewal)}
              disabled={filingBusy}
            >
              {filingBusy
                ? t.renewalFiling
                : (effectiveFilingError ? t.renewalRetryFile : t.renewalFileToDrive)}
            </Btn>
          )}
          {readyToAdvance && (
            <Btn size="sm" onClick={() => onAdvance(item)}>
              {t.renewalAdvanceAction}
            </Btn>
          )}
        </div>
      </div>
      {showFileAction && effectiveFilingError && (
        <div style={errorBox}>
          <strong>{t.renewalFilingErrorLabel}:</strong> {effectiveFilingError}
        </div>
      )}
    </div>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────
export const RenewalsPage = ({ data, t, user, refresh }) => {
  const [preparing, setPreparing] = useState(null) // a "due" object
  const [advancing, setAdvancing] = useState(null) // an inFlight item ready to confirm
  const [filingIds, setFilingIds] = useState({})
  const [fileErrors, setFileErrors] = useState({})

  const contracts = data.contracts || []
  const tenants = data.tenants || []
  const properties = data.properties || []
  const contractTenants = data.contractTenants || []
  const leaseRenewals = data.leaseRenewals || []
  const documents = data.documents || []

  const tenantById = Object.fromEntries(tenants.map(tenant => [tenant.id, tenant]))
  const contractById = Object.fromEntries(contracts.map(contract => [contract.id, contract]))
  const docById = Object.fromEntries(documents.map(doc => [doc.id, doc]))

  const signedDocUrlFor = (renewal) => {
    if (renewal.signedDocumentUrl) return renewal.signedDocumentUrl
    if (renewal.documentId && docById[renewal.documentId]?.driveLink) {
      return docById[renewal.documentId].driveLink
    }
    const matching = documents.find(d =>
      d.contractId === renewal.contractId &&
      d.documentType === 'lease_renewal' &&
      d.driveLink &&
      (!renewal.newTermEnd || (d.fileName || '').includes(renewal.newTermEnd))
    )
    return matching?.driveLink || null
  }

  const handleFileToDrive = async (renewal) => {
    setFilingIds(prev => ({ ...prev, [renewal.id]: true }))
    setFileErrors(prev => ({ ...prev, [renewal.id]: null }))
    try {
      const res = await fetch('/api/renewals/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlordId: user.id, renewalId: renewal.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFileErrors(prev => ({ ...prev, [renewal.id]: json?.error || t.renewalFileFailed }))
        return
      }
      refresh()
    } catch (e) {
      setFileErrors(prev => ({ ...prev, [renewal.id]: e.message || t.renewalFileFailed }))
    } finally {
      setFilingIds(prev => {
        const next = { ...prev }
        delete next[renewal.id]
        return next
      })
    }
  }

  const propAddress = (id) => properties.find(p => p.id === id)?.address || ''
  const signerName = (ten) => ten ? [ten.name, ten.lastName].filter(Boolean).join(' ') : t.renewalUnknownTenant

  // Resolve a contract's tenant ids via the junction, falling back to the
  // contract's own tenantIds array (the monolith populates both).
  const tenantIdsFor = (contract) => {
    const fromJunction = contractTenants.filter(ct => ct.contractId === contract.id).map(ct => ct.tenantId)
    return fromJunction.length ? fromJunction : (contract.tenantIds || [])
  }

  // A renewal "covers the current term" if its new_term_start matches the term
  // we'd derive from this contract's effective chain end date (idempotency guard).
  const hasActiveRenewal = (contract, effectiveEndDate) => {
    const { newTermStart } = deriveRenewalTerm(effectiveEndDate)
    return leaseRenewals.some(r =>
      r.contractId === contract.id &&
      r.newTermStart === newTermStart &&
      !['declined', 'blocked'].includes(r.status))
  }

  const [today] = useState(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
  })

  // "Renewals due": effective end_date within ~150 days and no active renewal for the term.
  const due = contracts
    .filter(c => c.endDate && (c.status === 'active' || !c.status))
    .map(c => {
      const chain = leaseRenewals.filter(r => r.contractId === c.id)
      const effectiveEndDate = pickEffectiveEndDate(chain, c.endDate)
      const daysLeft = daysBetween(today, toDate(effectiveEndDate))
      return { contract: { ...c, endDate: effectiveEndDate }, chain, effectiveEndDate, daysLeft }
    })
    .filter(x => x.daysLeft >= 0 && x.daysLeft <= 150 && !hasActiveRenewal(x.contract, x.effectiveEndDate))
    .map(x => {
      const ids = tenantIdsFor(x.contract)
      const signers = ids.map(id => {
        const ten = tenantById[id]
        return { tenantId: id, name: signerName(ten), email: ten?.email || '' }
      })
      const blocked = signers.length === 0 || signers.some(s => isPlaceholderEmail(s.email))
      return {
        ...x,
        propertyAddress: propAddress(x.contract.propertyId),
        term: deriveRenewalTerm(x.effectiveEndDate),
        originalLeaseDate: pickOriginalLeaseDate(x.chain, x.contract.startDate),
        signers,
        blocked,
        urgent: x.daysLeft < 90,
      }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)

  // In-flight = any renewal not in draft; surface ready-to-advance rows first.
  const inFlight = leaseRenewals
    .filter(r => ['pending_review', 'sent', 'signed', 'countersigned', 'declined', 'blocked'].includes(r.status))
    .map(r => {
      const ids = (r.signers || []).map(s => s.tenantId).filter(Boolean)
      const names = ids.map(id => signerName(tenantById[id])).join(', ')
      return {
        renewal: r,
        contract: contractById[r.contractId] || null,
        propertyAddress: propAddress(r.propertyId),
        signerNames: names,
        signedDocUrl: signedDocUrlFor(r),
      }
    })
    .sort((a, b) => Number(isReadyToAdvance(b.renewal)) - Number(isReadyToAdvance(a.renewal)))

  const urgentCount = due.filter(d => d.urgent).length
  const blockedCount = due.filter(d => d.blocked).length
  const readyToAdvanceCount = inFlight.filter(x => isReadyToAdvance(x.renewal)).length

  return (
    <div>
      <PageHeader title={t.renewalsTitle} subtitle={t.renewalsSubtitle} />

      <div className="landlord-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 28 }}>
        <Stat label={t.renewalStatDue} value={due.length} icon="calendar" />
        <Stat label={t.renewalStatUrgent} value={urgentCount} icon="clock" color="#ef4444" />
        <Stat label={t.renewalStatBlocked} value={blockedCount} icon="x" color="#f59e0b" />
        <Stat label={t.renewalStatReadyToAdvance} value={readyToAdvanceCount} icon="check" color="#16a34a" />
      </div>

      <div style={{ marginBottom: 32 }}>
        <h2 style={sectionHeading}>{t.renewalsDueHeading}</h2>
        {due.length === 0 ? (
          <div style={emptyState}>{t.renewalsDueEmpty}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {due.map(d => <DueCard key={d.contract.id} due={d} t={t} onPrepare={setPreparing} />)}
          </div>
        )}
      </div>

      <div>
        <h2 style={sectionHeading}>{t.renewalsInFlightHeading}</h2>
        {inFlight.length === 0 ? (
          <div style={emptyState}>{t.renewalsInFlightEmpty}</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {inFlight.map(x => (
              <InFlightRow
                key={x.renewal.id}
                item={x}
                filingBusy={Boolean(filingIds[x.renewal.id])}
                fileError={fileErrors[x.renewal.id] || null}
                onFileToDrive={handleFileToDrive}
                onAdvance={setAdvancing}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      {preparing && (
        <PrepareRenewalModal
          due={preparing} user={user} t={t}
          onClose={() => setPreparing(null)}
          onDone={() => { setPreparing(null); refresh(); }}
        />
      )}

      {advancing && (
        <AdvanceLeaseModal
          item={advancing} user={user} t={t}
          onClose={() => setAdvancing(null)}
          onDone={() => { setAdvancing(null); refresh(); }}
        />
      )}
    </div>
  )
}
