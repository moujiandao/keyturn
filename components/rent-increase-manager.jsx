'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RentIncreaseNotice } from '@/components/rent-increase-notice'
import { Btn, Icon, Modal, PageHeader, usePropertyMutations } from '@/property-management-app'
import { fmt, fmtDate } from '@/lib/format'
import { parseMaxAgaPercent } from '@/lib/property/core'
import { routes } from '@/lib/routes'
import { STORAGE_KEYS, readMigratedStorage, writeStorage } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'
import { radius } from '@/lib/theme'
import { createRentHistoryAdapter } from '@/lib/units/rent-history-adapter'
import {
  RENT_HISTORY_MAX_RENT,
  RENT_HISTORY_MAX_YEAR,
  RENT_HISTORY_MIN_YEAR,
  previousRentEntry,
  rentChange,
  rentHistoryYearPage,
  saveUnitRentHistory,
} from '@/lib/units/rent-history'

const panel = { background: 'var(--ld-surface)', border: '1px solid var(--ld-border)', borderRadius: radius.md }
const backLink = { display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 16, color: 'var(--ld-muted)', fontSize: 14, textDecoration: 'none' }
const tableStyle = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }
const heading = { background: 'var(--ld-subtle)', color: 'var(--ld-ink)', padding: '12px 16px', fontSize: 13 }
const firstColumn = { position: 'sticky', left: 0, zIndex: 1, minWidth: 72, borderRight: '1px solid var(--ld-border)' }
const currentHeading = { background: 'var(--ld-accent-tint)', color: 'var(--ld-accent-hover)' }
const currentCell = { background: 'color-mix(in srgb, var(--ld-accent-tint) 45%, var(--ld-surface))' }
const toolbar = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }
const trailingAction = { marginLeft: 'auto' }
const yearHeading = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }
const yearLabel = { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 7 }
const currentLabel = { fontSize: 11, fontWeight: 650 }
const removeButton = {
  display: 'grid', placeItems: 'center', flexShrink: 0, width: 32, height: 32,
  padding: 0, border: 0, borderRadius: 6, background: 'transparent',
  color: 'inherit', cursor: 'pointer',
}
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
const agaCard = {
  ...panel,
  padding: '14px 16px',
  marginBottom: 16,
  display: 'flex',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  gap: 12,
}
const agaFieldGroup = { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }
const agaInputWrap = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid var(--ld-border)',
  borderRadius: radius.sm,
  background: 'var(--ld-surface)',
  overflow: 'hidden',
}
const agaInput = {
  width: 112,
  border: 0,
  padding: '9px 10px',
  background: 'transparent',
  color: 'var(--ld-ink)',
  font: 'inherit',
  outline: 'none',
}
const agaSuffix = {
  padding: '0 10px',
  color: 'var(--ld-muted)',
  fontSize: 14,
  fontWeight: 600,
  borderLeft: '1px solid var(--ld-border)',
  alignSelf: 'stretch',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--ld-subtle)',
}
const agaSavedText = { color: '#15803d', fontSize: 13, fontWeight: 600, alignSelf: 'center' }
const agaErrorText = { ...errorText, margin: 0, alignSelf: 'center' }

const emptyYearPreferences = { added: [], hidden: [] }

function readYearPreferences(storageEntry) {
  if (typeof window === 'undefined') return emptyYearPreferences
  try {
    const saved = JSON.parse(readMigratedStorage(storageEntry))
    return {
      added: Array.isArray(saved?.added) ? saved.added.filter(Number.isInteger) : [],
      hidden: Array.isArray(saved?.hidden) ? saved.hidden.filter(Number.isInteger) : [],
    }
  } catch {
    return emptyYearPreferences
  }
}

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

export function RentIncreaseManager({ property, units, tenants, setData, refresh, lang, t }) {
  const [currentYear] = useState(() => new Date().getFullYear())
  const upcomingYear = currentYear + 1
  const propertyMx = usePropertyMutations()
  const [agaDraft, setAgaDraft] = useState(() =>
    property.maxAgaPercent == null ? '' : String(property.maxAgaPercent)
  )
  const [agaSaving, setAgaSaving] = useState(false)
  const [agaError, setAgaError] = useState(null)
  const [agaSaved, setAgaSaved] = useState(false)
  const preferenceStorage = STORAGE_KEYS.rentHistoryYears(property.id)
  const [yearPreferences, setYearPreferences] = useState(() => readYearPreferences(preferenceStorage))
  const [anchorYear, setAnchorYear] = useState(upcomingYear)
  const [addingYear, setAddingYear] = useState(false)
  const [editor, setEditor] = useState(null)
  const opener = useRef(null)
  const addYearAction = useRef(null)
  const { history, retry, save } = useUnitRentHistory(property.id)
  const entries = history?.entries ?? []
  const hiddenYears = new Set(yearPreferences.hidden)
  const years = [currentYear + 1, currentYear, ...yearPreferences.added, ...entries.map(entry => entry.year)]
  const noticeYear = years.reduce((latest, year) => Math.max(latest, year), currentYear)
  const page = rentHistoryYearPage(years.filter(year => !hiddenYears.has(year)), anchorYear)
  const entriesByUnit = new Map(units.map(unit => {
    const unitYears = new Map()
    if (unit.monthlyRent != null) {
      unitYears.set(currentYear, { year: currentYear, monthlyRent: unit.monthlyRent, isUnitRent: true })
    }
    return [unit.id, unitYears]
  }))
  for (const entry of entries) {
    entriesByUnit.get(entry.unitId)?.set(entry.year, entry)
  }

  const sortedUnits = [...units].sort((left, right) => left.unitNumber.localeCompare(right.unitNumber, undefined, { numeric: true }))
  const percent = new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { style: 'percent', maximumFractionDigits: 2 })

  function updateYearPreferences(preferences) {
    setYearPreferences(preferences)
    writeStorage(preferenceStorage, JSON.stringify(preferences))
  }

  function addYear(event) {
    event.preventDefault()
    const year = Number(new FormData(event.currentTarget).get('year'))
    updateYearPreferences({
      added: [...new Set([...yearPreferences.added, year])],
      hidden: yearPreferences.hidden.filter(hidden => hidden !== year),
    })
    setAnchorYear(year)
    closeModal()
  }

  function removeYear(year) {
    updateYearPreferences({
      added: yearPreferences.added,
      hidden: [...yearPreferences.hidden, year],
    })
    requestAnimationFrame(() => addYearAction.current?.querySelector('button')?.focus())
  }

  function closeModal() {
    setAddingYear(false)
    setEditor(null)
    requestAnimationFrame(() => opener.current?.focus())
  }

  async function saveMaxAga(event) {
    event.preventDefault()
    if (agaSaving) return
    setAgaError(null)
    setAgaSaved(false)

    let parsed
    try {
      parsed = parseMaxAgaPercent(agaDraft)
    } catch {
      setAgaError(t.rentMaxAgaInvalid)
      return
    }

    const previousValue = property.maxAgaPercent ?? null
    setAgaSaving(true)
    if (setData) {
      setData(prev => ({
        ...prev,
        properties: prev.properties.map(p =>
          p.id === property.id ? { ...p, maxAgaPercent: parsed } : p
        ),
      }))
    }
    try {
      const saved = await propertyMx.setMaxAgaPercent(property.id, agaDraft)
      setAgaDraft(saved == null ? '' : String(saved))
      setAgaSaved(true)
      if (refresh) refresh()
    } catch {
      if (setData) {
        setData(prev => ({
          ...prev,
          properties: prev.properties.map(p =>
            p.id === property.id ? { ...p, maxAgaPercent: previousValue } : p
          ),
        }))
      }
      setAgaError(t.rentMaxAgaSaveError)
    } finally {
      setAgaSaving(false)
    }
  }

  return (
    <div>
      <div inert={addingYear || Boolean(editor)}>
        <Link href={routes.properties()} style={backLink}><span aria-hidden="true">←</span>{t.propTitle}</Link>
        <PageHeader title={t.rentIncreaseManager} subtitle={property.address} />

        <form onSubmit={saveMaxAga} style={agaCard}>
          <div style={agaFieldGroup}>
            <label htmlFor="property-max-aga" style={formLabel}>
              {t.rentMaxAgaLabel(upcomingYear)}
            </label>
            <div style={agaInputWrap}>
              <input
                id="property-max-aga"
                name="maxAgaPercent"
                type="text"
                inputMode="decimal"
                placeholder={t.rentMaxAgaPlaceholder}
                value={agaDraft}
                disabled={agaSaving}
                onChange={event => {
                  setAgaDraft(event.target.value)
                  if (agaSaved) setAgaSaved(false)
                  if (agaError) setAgaError(null)
                }}
                style={agaInput}
              />
              <span style={agaSuffix} aria-hidden="true">%</span>
            </div>
          </div>
          <Btn type="submit" disabled={agaSaving}>
            {agaSaving ? t.saving : t.save}
          </Btn>
          {agaSaved && <span role="status" style={agaSavedText}>{t.rentMaxAgaSaved}</span>}
          {agaError && <p role="alert" style={agaErrorText}>{agaError}</p>}
        </form>

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
            <div style={toolbar}>
              <div ref={addYearAction}>
                <Btn variant="secondary" icon="plus" onClick={event => { opener.current = event.currentTarget; setAddingYear(true) }}>{t.rentHistoryAddYear}</Btn>
              </div>
              {page.newerYear != null && (
                <Btn variant="secondary" onClick={() => setAnchorYear(page.newerYear)}>{t.rentHistoryNewerYears}</Btn>
              )}
              <div style={trailingAction}>
                <Btn variant="secondary" disabled={page.earlierYear == null}
                  onClick={() => setAnchorYear(page.earlierYear)}>{t.rentHistoryPreviousYears}</Btn>
              </div>
            </div>
            {page.years.length === 0 ? (
              <div style={{ ...panel, padding: 16, color: 'var(--ld-muted)' }}>{t.rentHistoryNoYears}</div>
            ) : (
              <div style={{ ...panel, overflowX: 'auto', maxWidth: '100%' }} role="region" aria-label={t.rentIncreaseManager} tabIndex={0}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th scope="col" style={{ ...heading, ...firstColumn }}>{t.rentHistoryUnit}</th>
                      {page.years.map(year => (
                        <th key={year} scope="col" style={year === currentYear ? { ...heading, ...currentHeading } : heading}>
                          <div style={yearHeading}>
                            <span style={yearLabel}>
                              {year}
                              {year === currentYear && <span style={currentLabel}>{t.rentHistoryCurrentYear}</span>}
                            </span>
                            <button type="button" className="ld-rent-remove" style={removeButton}
                              aria-label={t.rentHistoryRemoveYear(year)} title={t.rentHistoryRemoveYear(year)} onClick={() => removeYear(year)}>
                              <Icon name="trash" size={15} />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUnits.map(unit => {
                      const rentByYear = entriesByUnit.get(unit.id)

                      return (
                        <tr key={unit.id}>
                          <th scope="row" style={{ ...heading, ...firstColumn, ...bodyCell }}>{unit.unitNumber}</th>
                          {page.years.map(year => {
                            const entry = rentByYear.get(year)
                            const monthlyRent = entry?.monthlyRent
                            const previous = previousRentEntry(rentByYear.values(), year)
                            const change = rentChange(monthlyRent, previous?.monthlyRent)
                            const comparison = change == null ? '–' : t.rentHistoryComparison(percent.format(change), previous.year)
                            const increaseStartDate = entry?.increaseStartDate
                            const detailsId = `rent-${unit.id}-${year}`

                            return (
                              <td key={year} style={year === currentYear ? { ...bodyCell, ...currentCell } : bodyCell}>
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
                                    {entry?.isUnitRent && <span style={cellDetail}>{t.rentHistoryUnitRate}</span>}
                                    <span style={cellDetail}>{t.rentHistoryPercent} · {comparison}</span>
                                    <span style={cellDetail}>{t.rentHistoryDate} · {fmtDate(increaseStartDate)}</span>
                                  </span>
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {history?.entries && sortedUnits.length > 0 && (
          <RentIncreaseNotice property={property} units={sortedUnits} tenants={tenants} year={noticeYear} t={t}
            getRent={unit => entriesByUnit.get(unit.id).get(noticeYear) ?? {}} />
        )}
      </div>

      {addingYear && (
        <Modal title={t.rentHistoryAddYear} closeLabel={t.cancel} onClose={closeModal}>
          <form onSubmit={addYear}>
            <label style={formLabel}>
              {t.rentHistoryYear}
              <input name="year" type="number" min={RENT_HISTORY_MIN_YEAR} max={RENT_HISTORY_MAX_YEAR}
                step="1" defaultValue={yearPreferences.hidden.at(-1) ?? Math.min(RENT_HISTORY_MAX_YEAR, noticeYear + 1)} required autoFocus style={field} />
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
