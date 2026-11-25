'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Btn, Icon, Modal, PageHeader } from '@/property-management-app'
import { fmt, fmtDate } from '@/lib/format'
import { routes } from '@/lib/routes'
import { createClient } from '@/lib/supabase/client'
import { radius } from '@/lib/theme'
import { createRentHistoryAdapter } from '@/lib/units/rent-history-adapter'
import {
  RENT_HISTORY_MAX_RENT,
  RENT_HISTORY_MAX_YEAR,
  RENT_HISTORY_MIN_YEAR,
  rentChange,
  saveUnitRentHistory,
} from '@/lib/units/rent-history'

const panel = { background: 'var(--ld-surface)', border: '1px solid var(--ld-border)', borderRadius: radius.md }
const backLink = { display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 16, color: 'var(--ld-muted)', fontSize: 14, textDecoration: 'none' }
const tableStyle = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }
const heading = { background: 'var(--ld-subtle)', color: 'var(--ld-ink)', padding: '12px 16px', fontSize: 13 }
const firstColumn = { position: 'sticky', left: 0, zIndex: 1, minWidth: 72, borderRight: '1px solid var(--ld-border)' }
const bodyCell = { borderTop: '1px solid var(--ld-border)', verticalAlign: 'top' }
const cellButton = {
  width: '100%', minWidth: 202, padding: '12px 16px', border: 0, background: 'transparent',
  color: 'var(--ld-ink)', font: 'inherit', textAlign: 'left', cursor: 'pointer',
}
const cellAmount = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontWeight: 760, fontSize: 21, letterSpacing: '-.03em' }
const cellDetail = { display: 'block', marginTop: 4, color: 'var(--ld-muted)', fontSize: 12 }
const field = {
  display: 'block', width: '100%', boxSizing: 'border-box', margin: '6px 0 16px',
  padding: '10px 12px', border: '1px solid var(--ld-border)', borderRadius: radius.sm, font: 'inherit',
}
const formLabel = { color: 'var(--ld-ink)', fontSize: 14, fontWeight: 600 }
const errorText = { color: '#b42318', fontSize: 14 }

function useUnitRentHistory(propertyId) {
  const [history, setHistory] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const entries = await createRentHistoryAdapter(createClient()).list(propertyId, controller.signal)
        if (!controller.signal.aborted) setHistory({ entries })
      } catch {
        if (!controller.signal.aborted) setHistory({ error: true })
      }
    }
    load()
    return () => controller.abort()
  }, [propertyId, attempt])

  function retry() {
    setHistory(null)
    setAttempt(value => value + 1)
  }

  async function save(entry) {
    const saved = await saveUnitRentHistory(createRentHistoryAdapter(createClient()), entry)
    setHistory(({ entries }) => ({
      entries: [
        ...entries.filter(item => item.unitId !== saved.unitId || item.year !== saved.year),
        saved,
      ],
    }))
  }

  return { history, retry, save }
}

function RentEntryEditor({ entry, save, close, t }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const pending = useRef(false)
  const { unit, year } = entry

  async function submit(event) {
    event.preventDefault()
    if (pending.current) return
    const form = new FormData(event.currentTarget)
    pending.current = true
    setSaving(true)
    setError(false)
    try {
      await save({
        unitId: unit.id,
        year,
        monthlyRent: form.get('monthlyRent'),
        increaseStartDate: form.get('increaseStartDate'),
      })
      close()
    } catch {
      setError(true)
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <Modal title={t.rentHistoryEdit(unit.unitNumber, year)} closeLabel={t.cancel} onClose={() => { if (!pending.current) close() }}>
      <form onSubmit={submit}>
        <label style={formLabel}>
          {t.unitRentLabel}
          <input name="monthlyRent" type="number" min="0" max={RENT_HISTORY_MAX_RENT} step="0.01" required autoFocus
            defaultValue={entry.monthlyRent ?? ''} disabled={saving} style={field} />
        </label>
        <label style={formLabel}>
          {t.rentHistoryDate}
          <input name="increaseStartDate" type="date" min={`${year}-01-01`} max={`${year}-12-31`}
            defaultValue={entry.increaseStartDate ?? ''} disabled={saving} style={field} />
        </label>
        {error && <p role="alert" style={errorText}>{t.rentHistorySaveError}</p>}
        <Btn disabled={saving}>{saving ? t.saving : t.save}</Btn>
      </form>
    </Modal>
  )
}

export function RentIncreaseManager({ property, units, lang, t }) {
  const [currentYear] = useState(() => new Date().getFullYear())
  const [addedYears, setAddedYears] = useState([])
  const [addingYear, setAddingYear] = useState(false)
  const [editor, setEditor] = useState(null)
  const opener = useRef(null)
  const { history, retry, save } = useUnitRentHistory(property.id)
  const entries = history?.entries ?? []
  const rentByUnitYear = new Map(entries.map(entry => [`${entry.unitId}:${entry.year}`, entry]))
  const years = [...new Set([currentYear, currentYear - 1, ...addedYears, ...entries.map(entry => entry.year)])]
    .sort((left, right) => right - left)
  const sortedUnits = [...units].sort((left, right) => left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }))
  const percent = new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { style: 'percent', maximumFractionDigits: 2 })

  function amountForYear(unit, year) {
    return rentByUnitYear.get(`${unit.id}:${year}`)?.monthlyRent
      ?? (year === currentYear ? unit.monthlyRent : null)
  }

  function addYear(event) {
    event.preventDefault()
    const year = Number(new FormData(event.currentTarget).get('year'))
    setAddedYears(previous => [...new Set([...previous, year])])
    closeModal()
  }

  function closeModal() {
    setAddingYear(false)
    setEditor(null)
    requestAnimationFrame(() => opener.current?.focus())
  }

  return (
    <div>
      <div inert={addingYear || Boolean(editor)}>
        <Link href={routes.properties()} style={backLink}><span aria-hidden="true">←</span>{t.propTitle}</Link>
        <PageHeader title={t.rentIncreaseManager} subtitle={property.address} />

        {units.length === 0 ? (
          <div style={{ ...panel, padding: 16 }}><Link href={routes.property(property)}>{t.unitsEmpty}</Link></div>
        ) : history?.error ? (
          <div style={{ ...panel, padding: 16 }}>
            <p role="alert" style={{ ...errorText, marginTop: 0 }}>{t.rentHistoryLoadError}</p>
            <Btn variant="secondary" onClick={retry}>{t.rentHistoryRetry}</Btn>
          </div>
        ) : !history ? (
          <p role="status" style={{ color: 'var(--ld-muted)' }}>{t.rentHistoryLoading}</p>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <Btn variant="secondary" icon="plus" onClick={event => { opener.current = event.currentTarget; setAddingYear(true) }}>{t.rentHistoryAddYear}</Btn>
            </div>
            <div style={{ ...panel, overflowX: 'auto', maxWidth: '100%' }} role="region" aria-label={t.rentIncreaseManager} tabIndex={0}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...heading, ...firstColumn }}>{t.rentHistoryUnit}</th>
                    {years.map(year => <th key={year} scope="col" style={heading}>{year}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sortedUnits.map(unit => (
                    <tr key={unit.id}>
                      <th scope="row" style={{ ...heading, ...firstColumn, ...bodyCell }}>{unit.unitNumber}</th>
                      {years.map(year => {
                        const entry = rentByUnitYear.get(`${unit.id}:${year}`)
                        const monthlyRent = amountForYear(unit, year)
                        const isUnitRent = !entry && monthlyRent != null
                        const change = rentChange(monthlyRent, amountForYear(unit, year - 1))
                        const increaseStartDate = entry?.increaseStartDate
                        const detailsId = `rent-${unit.id}-${year}`

                        return (
                          <td key={year} style={bodyCell}>
                            <button type="button" className="ld-rent-cell" aria-label={t.rentHistoryEdit(unit.unitNumber, year)}
                              aria-describedby={detailsId} style={cellButton}
                              onClick={event => {
                                opener.current = event.currentTarget
                                setEditor({ unit, year, monthlyRent, increaseStartDate })
                              }}>
                              <span id={detailsId}>
                                <span style={cellAmount}>
                                  {monthlyRent == null ? '–' : fmt(monthlyRent)}
                                  <Icon name="edit" size={14} />
                                </span>
                                {isUnitRent && <span style={cellDetail}>{t.rentHistoryUnitRate}</span>}
                                <span style={cellDetail}>{t.rentHistoryPercent} · {change == null ? '–' : percent.format(change)}</span>
                                <span style={cellDetail}>{t.rentHistoryDate} · {fmtDate(increaseStartDate)}</span>
                              </span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {addingYear && (
        <Modal title={t.rentHistoryAddYear} closeLabel={t.cancel} onClose={closeModal}>
          <form onSubmit={addYear}>
            <label style={formLabel}>
              {t.rentHistoryYear}
              <input name="year" type="number" min={RENT_HISTORY_MIN_YEAR} max={RENT_HISTORY_MAX_YEAR}
                step="1" defaultValue={currentYear + 1} required autoFocus style={field} />
            </label>
            <Btn>{t.rentHistoryAddYear}</Btn>
          </form>
        </Modal>
      )}
      {editor && (
        <RentEntryEditor key={`${editor.unit.id}:${editor.year}`} entry={editor} save={save} close={closeModal} t={t} />
      )}
    </div>
  )
}
