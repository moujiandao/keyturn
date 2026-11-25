'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { PageHeader, Icon } from './property-management-app'
import { fmtDate } from '@/lib/format'
import { LEARNINGS, learningPdfUrl } from '@/lib/learnings/catalog'

const PdfViewer = dynamic(() => import('./components/pdf-viewer'), {
  ssr: false,
  loading: () => <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>…</div>,
})

const layoutRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 20,
  alignItems: 'flex-start',
}
const listCard = {
  flex: '1 1 260px',
  minWidth: 0,
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #eaeaea',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const viewerCard = {
  flex: '999 1 480px',
  maxWidth: '100%',
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #eaeaea',
  padding: 20,
  minWidth: 0,
}
const viewerHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 14,
  flexWrap: 'wrap',
  paddingBottom: 14,
  marginBottom: 16,
  borderBottom: '1px solid #f1f5f9',
}
const actionLink = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 40,
  padding: '8px 13px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}
const primaryLink = {
  ...actionLink,
  background: '#111111',
  borderColor: '#111111',
  color: '#fff',
}
const tagRow = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  marginTop: 8,
}
const tagPill = {
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 14,
  background: '#f3f4f6',
  color: '#374151',
}
const emptyBox = {
  background: '#fff',
  borderRadius: 14,
  border: '1px solid #eaeaea',
  padding: '48px 24px',
  textAlign: 'center',
  color: '#6b7280',
  fontSize: 14,
}
const pdfFrame = {
  background: '#f8fafc',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  padding: '16px 12px',
  overflowX: 'auto',
}

export function LearningsPage({ t, lang }) {
  const locale = lang === 'zh' ? 'zh' : 'en'
  const [selectedSlug, setSelectedSlug] = useState(LEARNINGS[0]?.slug || null)
  const selected = LEARNINGS.find((item) => item.slug === selectedSlug) || LEARNINGS[0] || null

  return (
    <div>
      <PageHeader
        title={t.learnTitle}
        subtitle={`${t.learnSubtitle} (${t.learnCount(LEARNINGS.length)})`}
      />

      {!selected ? (
        <div style={emptyBox}>{t.learnEmpty}</div>
      ) : (
        <div style={layoutRow}>
          <div style={listCard}>
            {LEARNINGS.map((item) => {
              const active = item.slug === selected.slug
              return (
                <button
                  key={item.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedSlug(item.slug)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 13px',
                    borderRadius: 10,
                    border: active ? '1px solid #111111' : '1px solid #eef0f2',
                    background: active ? '#f8fafc' : '#fff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>
                    <Icon name="calendar" size={13} />
                    <span>{fmtDate(item.date)}</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', lineHeight: 1.35 }}>
                    {item.title[locale] || item.title.en}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.4 }}>
                    {item.summary[locale] || item.summary.en}
                  </div>
                </button>
              )
            })}
          </div>

          <div style={viewerCard}>
            <div style={viewerHeader}>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4, overflowWrap: 'anywhere' }}>
                  {fmtDate(selected.date)} · <code>{selected.fileName}</code>
                </div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111111' }}>
                  {selected.title[locale] || selected.title.en}
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#4b5563', lineHeight: 1.45 }}>
                  {selected.summary[locale] || selected.summary.en}
                </p>
                <div style={tagRow}>
                  {(selected.tags || []).map((tag) => (
                    <span key={tag} style={tagPill}>{tag}</span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href={learningPdfUrl(selected.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={actionLink}
                >
                  <Icon name="file" size={14} />
                  <span>{t.learnOpenPdf}</span>
                </a>
                <a
                  href={learningPdfUrl(selected.slug, { download: true })}
                  style={primaryLink}
                >
                  <Icon name="download" size={14} />
                  <span>{t.learnDownloadPdf}</span>
                </a>
              </div>
            </div>

            <div style={pdfFrame}>
              <PdfViewer
                key={selected.slug}
                url={learningPdfUrl(selected.slug)}
                labels={{
                  loading: t.learnPdfLoading,
                  error: t.learnPdfError,
                  prev: t.learnPdfPrev,
                  next: t.learnPdfNext,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
