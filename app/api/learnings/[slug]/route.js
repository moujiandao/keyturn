import fs from 'node:fs/promises'
import path from 'node:path'
import { requireLandlord } from '@/lib/auth/authorize'
import { findLearningBySlug } from '@/lib/learnings/catalog'

export const runtime = 'nodejs'

export async function GET(request, context) {
  const auth = await requireLandlord()
  if (auth.response) return auth.response

  const { slug } = await context.params
  const entry = findLearningBySlug(slug)
  if (!entry) {
    return Response.json({ error: 'Learning document not found.' }, { status: 404 })
  }

  const filePath = path.join(process.cwd(), 'docs', 'learnings', entry.fileName)
  let bytes
  try {
    bytes = await fs.readFile(filePath)
  } catch (err) {
    console.error('[learnings] failed to read PDF:', entry.fileName, err)
    return Response.json({ error: 'Learning PDF is unavailable.' }, { status: 404 })
  }

  const url = new URL(request.url)
  const download = url.searchParams.get('download') === '1'
  const disposition = download ? 'attachment' : 'inline'

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${entry.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
