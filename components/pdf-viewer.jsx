'use client'
import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const DEFAULT_LABELS = {
  loading: 'Loading PDF…',
  error: 'Failed to load PDF. The document may have moved or access may have expired.',
  prev: '‹ Prev',
  next: 'Next ›',
}

const viewerWrap = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

export default function PdfViewer({ url, labels }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [numPages, setNumPages] = useState(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState(false)

  const copy = { ...DEFAULT_LABELS, ...labels }

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof window === 'undefined') return undefined

    const updateFromEl = () => {
      const next = Math.floor(el.clientWidth)
      if (next > 0) setContainerWidth(next)
    }

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const next = Math.floor(entries[0]?.contentRect?.width || el.clientWidth || 0)
        if (next > 0) setContainerWidth(next)
      })
      observer.observe(el)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateFromEl)
    const rafId = window.requestAnimationFrame(updateFromEl)
    return () => {
      window.removeEventListener('resize', updateFromEl)
      window.cancelAnimationFrame(rafId)
    }
  }, [])

  const fallbackWidth = typeof window !== 'undefined' ? Math.max(240, Math.min(window.innerWidth - 80, 820)) : 700
  const width = containerWidth > 0 ? Math.min(containerWidth, 820) : fallbackWidth

  if (error) {
    return (
      <div style={{ padding: 24, color: '#ef4444', fontSize: "0.875rem" }}>
        {copy.error}
      </div>
    )
  }

  return (
    <div ref={containerRef} style={viewerWrap}>
      <Document
        file={url}
        onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPage(1); }}
        onLoadError={() => setError(true)}
        loading={<div style={{ padding: 32, color: '#94a3b8', fontSize: "0.875rem" }}>{copy.loading}</div>}
      >
        <Page pageNumber={page} width={width} />
      </Document>
      {numPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, fontSize: "0.8125rem", color: '#374151' }}>
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 14px', minHeight: 36, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, fontSize: "0.8125rem" }}
          >{copy.prev}</button>
          <span>{page} / {numPages}</span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(numPages, p + 1))}
            disabled={page === numPages}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 14px', minHeight: 36, cursor: page === numPages ? 'default' : 'pointer', opacity: page === numPages ? 0.4 : 1, fontSize: "0.8125rem" }}
          >{copy.next}</button>
        </div>
      )}
    </div>
  )
}
