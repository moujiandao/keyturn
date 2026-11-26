import { createClient } from '../../../../lib/supabase/server'
import {
  verifyWebhookSignature,
  getSignedDocuments,
  downloadSignedPdf,
} from '../../../../lib/docuseal/client'
import { createRenewalStore } from '../../../../lib/docuseal/adapter'
import { processDocusealWebhook } from '../../../../lib/docuseal/webhook'
import {
  DRIVE_SCOPES,
  parseServiceAccountCredentials,
  getDriveAccessToken,
  uploadPdfToDriveFolder,
} from '../../../../lib/google/drive'

export const dynamic = 'force-dynamic'

// DocuSeal webhook: advances a lease_renewals row as its submitters sign, and
// on countersign completion automatically files the merged signed PDF to the
// property's Google Drive Shared Drive folder (Phase 4A).
//
// Never mutates `contracts` (Phase 4B lease-term advance is strictly manual).
export async function POST(request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-docuseal-signature')

  if (!verifyWebhookSignature(rawBody, signature, process.env.DOCUSEAL_WEBHOOK_SECRET)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 })
  }

  const supabase = await createClient()
  const store = createRenewalStore(supabase)

  const result = await processDocusealWebhook({
    event,
    store,
    docuseal: { getSignedDocuments, downloadSignedPdf },
    drive: {
      getAccessToken: () =>
        getDriveAccessToken({
          credentials: parseServiceAccountCredentials(),
          scopes: DRIVE_SCOPES,
        }),
      uploadPdfToDriveFolder,
    },
  })

  return Response.json(result.body, { status: result.status })
}
