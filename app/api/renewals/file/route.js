import { createClient } from '@supabase/supabase-js'
import { requireLandlord, rejectMismatchedLandlord } from '@/lib/auth/authorize'
import { getSignedDocuments, downloadSignedPdf } from '../../../../lib/docuseal/client'
import { createRenewalStore } from '../../../../lib/docuseal/adapter'
import { fileSignedRenewalToDrive } from '../../../../lib/docuseal/filing'
import {
  DRIVE_SCOPES,
  parseServiceAccountCredentials,
  getDriveAccessToken,
  uploadPdfToDriveFolder,
} from '../../../../lib/google/drive'

// POST /api/renewals/file
// Body: { landlordId, renewalId }
// Manual / retry trigger for Phase 4A Drive filing on a countersigned renewal
// (e.g. after linking a Shared Drive folder or recovering from a transient
// Google Drive outage). Idempotent when already filed.
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { landlordId, renewalId } = body || {}
  const auth = await requireLandlord()
  if (auth.response) return auth.response
  const teamMismatch = rejectMismatchedLandlord(landlordId, auth.landlordId)
  if (teamMismatch) return teamMismatch
  if (!renewalId) {
    return Response.json({ error: 'renewalId is required.' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const store = createRenewalStore(supabase)

  let renewal
  try {
    renewal = await store.getRenewalById(renewalId, auth.landlordId)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 })
  }
  if (!renewal) {
    return Response.json({ error: `No renewal found with id ${renewalId}` }, { status: 404 })
  }
  if (renewal.status !== 'countersigned') {
    return Response.json(
      { error: `Renewal cannot be filed from status '${renewal.status}'.` },
      { status: 409 }
    )
  }

  const result = await fileSignedRenewalToDrive({
    renewal,
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

  if (!result.ok) {
    const status = [
      'NO_PROPERTY',
      'NO_DRIVE_FOLDER',
      'INVALID_DRIVE_LINK',
      'SHARED_DRIVE_REQUIRED',
      'NOT_A_FOLDER',
      'MISSING_SUBMISSION_ID',
      'NO_SIGNED_DOCUMENTS',
    ].includes(result.code)
      ? 422
      : 502
    return Response.json({ error: result.error, code: result.code }, { status })
  }

  return Response.json({
    ok: true,
    alreadyFiled: Boolean(result.alreadyFiled),
    driveLink: result.driveLink,
    documentId: result.documentId,
    fileName: result.fileName || null,
  })
}
