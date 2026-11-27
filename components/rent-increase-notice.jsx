'use client'

import { useId, useState } from 'react'
import { Btn } from '@/property-management-app'
import { hasUnfilledNoticeFields, renderRentIncreaseNotice } from '@/lib/units/rent-increase-notice'

const panel = {
  marginTop: 24, padding: 'clamp(14px, 3vw, 24px)', border: '1px solid var(--ld-border)',
  borderRadius: 12, background: 'var(--ld-surface)', color: 'var(--ld-ink)',
}
const heading = { margin: '0 0 16px', fontSize: "1.25rem" }
const label = { display: 'block', marginBottom: 6, fontSize: "0.875rem", fontWeight: 600 }
const input = {
  boxSizing: 'border-box', width: '100%', padding: '10px 12px', border: '1px solid var(--ld-border)',
  borderRadius: 8, background: 'var(--ld-surface)', color: 'var(--ld-ink)', font: 'inherit',
}
const unitSelect = { ...input, maxWidth: 250, marginBottom: 16 }
const letter = { ...input, minHeight: 420, resize: 'vertical', lineHeight: 1.55, tabSize: 4 }
const actions = { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }
const feedback = { margin: '8px 0 0', color: 'var(--ld-muted)', fontSize: "0.8125rem" }

const printStyles = `
  @page { margin: 0.75in; }
  body { margin: 28px auto; padding: 0 22px; max-width: 7in; color: #111;
    font: 12pt/1.42 Georgia, "Times New Roman", serif; }
  button { margin-bottom: 22px; padding: 7px 15px; font: 14px system-ui, sans-serif; cursor: pointer; }
  main { white-space: pre-wrap; overflow-wrap: anywhere; }
  .paired { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1em; }
  .paired span:last-child { text-align: right; }
  @media print { body { margin: 0; padding: 0; max-width: none; } button { display: none; } }
`

function openNoticePrintPreview(text, t) {
  const preview = window.open('', '_blank')
  if (!preview) return false

  preview.opener = null
  const doc = preview.document
  doc.title = t.rentNoticeTitle
  doc.documentElement.lang = 'en'

  const styles = doc.createElement('style')
  styles.textContent = printStyles
  doc.head.append(styles)

  const printButton = doc.createElement('button')
  printButton.textContent = t.rentNoticePrint
  printButton.addEventListener('click', () => preview.print())

  const letterBody = doc.createElement('main')
  for (const line of text.split('\n')) {
    const row = doc.createElement('div')
    const columns = line.split(/\t+/)
    if (columns.length === 2) {
      row.className = 'paired'
      for (const column of columns) {
        const span = doc.createElement('span')
        span.textContent = column
        row.append(span)
      }
    } else {
      row.textContent = line || '\u00a0'
    }
    letterBody.append(row)
  }

  doc.body.replaceChildren(printButton, letterBody)
  return true
}

export function RentIncreaseNotice({ property, units, tenants, getRent, year, t }) {
  const id = useId()
  const [selectedUnitId, setSelectedUnitId] = useState(units[0].id)
  const [edits, setEdits] = useState({})
  const [popupBlocked, setPopupBlocked] = useState(false)
  const unit = units.find(item => item.id === selectedUnitId) ?? units[0]
  const template = renderRentIncreaseNotice({ property, unit, tenants, multipleUnits: units.length > 1, rent: getRent(unit) })
  const edit = edits[unit.id]
  const draft = edit?.text ?? template
  const sourceChanged = Boolean(edit && (edit.year !== year || edit.template !== template))
  const unfilled = hasUnfilledNoticeFields(draft)

  function updateDraft(text) {
    setEdits(previous => ({ ...previous, [unit.id]: text === template ? null : { text, template, year } }))
    setPopupBlocked(false)
  }

  return (
    <section style={panel} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} style={heading}>{t.rentNoticeTitle}</h2>
      <label htmlFor={`${id}-unit`} style={label}>{t.rentHistoryUnit} · {year}</label>
      <select id={`${id}-unit`} style={unitSelect} value={unit.id}
        onChange={event => { setSelectedUnitId(event.target.value); setPopupBlocked(false) }}>
        {units.map(item => <option key={item.id} value={item.id}>{t.rentNoticeUnitOption(item.unitNumber)}</option>)}
      </select>

      <label htmlFor={`${id}-letter`} style={label}>{t.rentNoticeLetter}</label>
      <textarea id={`${id}-letter`} lang="en" style={letter} value={draft} onChange={event => updateDraft(event.target.value)} />
      {sourceChanged && <p role="status" style={feedback}>{t.rentNoticeUpdated}</p>}
      {unfilled && <p role="status" style={feedback}>{t.rentNoticeFillFields}</p>}
      {popupBlocked && <p role="alert" style={feedback}>{t.rentNoticePopupBlocked}</p>}
      <div style={actions}>
        <Btn disabled={!draft.trim() || sourceChanged || unfilled} onClick={() => {
          setPopupBlocked(!openNoticePrintPreview(draft, t))
        }}>{t.rentNoticePrintPreview}</Btn>
        {edit && <Btn variant="secondary" onClick={() => updateDraft(template)}>{t.rentNoticeReset}</Btn>}
      </div>
    </section>
  )
}
