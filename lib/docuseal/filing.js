// Phase 4A: Auto-file countersigned renewal PDFs to the property's Google Drive
// Shared Drive folder and record the link as a `documents` row
// (`document_type: 'lease_renewal'`).
//
// Dependency-injected over `store`, `docuseal`, and `drive` so both the webhook
// and the manual retry route share one idempotent implementation that is
// unit-testable without live DocuSeal, Google Drive, or Supabase credentials.
import { extractDriveFolderId } from "../google/drive.js";

function sanitizeSegment(value) {
  return String(value || "")
    .replace(/[/\\:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRenewalPdfFileName({
  propertyAddress,
  unit,
  newTermStart,
  newTermEnd,
  fallbackName,
} = {}) {
  const parts = [];
  const addr = sanitizeSegment(propertyAddress);
  const cleanUnit = sanitizeSegment(unit);
  if (addr) parts.push(addr);
  if (cleanUnit) parts.push(`Unit ${cleanUnit}`);

  const term =
    newTermStart && newTermEnd
      ? `${sanitizeSegment(newTermStart)} to ${sanitizeSegment(newTermEnd)}`
      : sanitizeSegment(newTermEnd || newTermStart);

  if (parts.length > 0 || term) {
    const label = parts.length > 0 ? parts.join(" ") : "Lease";
    const suffix = term ? ` (${term})` : "";
    return `Lease Renewal - ${label}${suffix}.pdf`;
  }

  const fallback = sanitizeSegment(fallbackName);
  if (fallback) {
    return fallback.toLowerCase().endsWith(".pdf") ? fallback : `${fallback}.pdf`;
  }
  return "Lease Renewal.pdf";
}

function existingFiledResult(renewal) {
  const driveLink = renewal.signed_document_url ?? renewal.signedDocumentUrl ?? null;
  const documentId = renewal.document_id ?? renewal.documentId ?? null;
  if (driveLink || documentId) {
    return {
      ok: true,
      alreadyFiled: true,
      driveLink,
      documentId,
    };
  }
  return null;
}

/**
 * Download the merged signed PDF from DocuSeal, upload it to the property's
 * Google Drive Shared Drive folder, record a `documents` row
 * (`document_type: 'lease_renewal'`), and update the renewal row.
 *
 * Never throws: records `filing_error` via `store.updateRenewalFiling` on
 * failure and returns `{ ok: false, error, code }` so webhook callers never
 * drop status advancement.
 */
export async function fileSignedRenewalToDrive({ renewal, store, docuseal, drive }) {
  if (!renewal?.id) {
    return { ok: false, error: "Renewal record is required.", code: "INVALID_RENEWAL" };
  }

  const already = existingFiledResult(renewal);
  if (already) return already;

  const persistError = async (message) => {
    try {
      await store.updateRenewalFiling(renewal.id, { filing_error: message });
    } catch {
      // Best-effort: never mask the original filing failure or fail a webhook.
    }
  };

  if (renewal.status !== "countersigned") {
    return {
      ok: false,
      error: `Renewal must be countersigned before filing (current status: ${renewal.status}).`,
      code: "NOT_COUNTERSIGNED",
    };
  }

  const submissionId = renewal.docuseal_submission_id ?? renewal.docusealSubmissionId ?? null;
  if (!submissionId) {
    const msg = "Renewal has no DocuSeal submission ID to download signed documents from.";
    await persistError(msg);
    return { ok: false, error: msg, code: "MISSING_SUBMISSION_ID" };
  }

  const landlordId = renewal.landlord_id ?? renewal.landlordId;
  const propertyId = renewal.property_id ?? renewal.propertyId ?? null;
  const contractId = renewal.contract_id ?? renewal.contractId ?? null;

  if (!propertyId) {
    const msg = "Renewal is not linked to a property with a Google Drive folder.";
    await persistError(msg);
    return { ok: false, error: msg, code: "NO_PROPERTY" };
  }

  try {
    const property = await store.getProperty(propertyId, landlordId);
    if (!property?.drive_link) {
      const msg = "No Google Drive folder is linked to this property. Add a Shared Drive folder link on the Properties page.";
      await persistError(msg);
      return { ok: false, error: msg, code: "NO_DRIVE_FOLDER" };
    }

    const folderId = extractDriveFolderId(property.drive_link);
    if (!folderId) {
      const msg = "The property's Google Drive link is not a valid folder URL.";
      await persistError(msg);
      return { ok: false, error: msg, code: "INVALID_DRIVE_LINK" };
    }

    const contract = contractId ? await store.getContract(contractId, landlordId) : null;
    const { documents } = await docuseal.getSignedDocuments(submissionId);
    const mergedDoc = (documents || []).find((d) => d && d.url);
    if (!mergedDoc) {
      const msg = "DocuSeal returned no signed PDF documents for this submission.";
      await persistError(msg);
      return { ok: false, error: msg, code: "NO_SIGNED_DOCUMENTS" };
    }

    const fileName = buildRenewalPdfFileName({
      propertyAddress: property.address,
      unit: contract?.unit,
      newTermStart: renewal.new_term_start ?? renewal.newTermStart,
      newTermEnd: renewal.new_term_end ?? renewal.newTermEnd,
      fallbackName: mergedDoc.name,
    });

    // Idempotency recovery: if a prior attempt already inserted the renewal
    // document row before updating lease_renewals, link it instead of uploading
    // a duplicate PDF into Google Drive.
    if (typeof store.findExistingRenewalDocument === "function") {
      const existingDoc = await store.findExistingRenewalDocument({
        landlordId,
        propertyId,
        contractId,
        fileName,
      });
      if (existingDoc?.drive_link) {
        await store.updateRenewalFiling(renewal.id, {
          signed_document_url: existingDoc.drive_link,
          document_id: existingDoc.id,
          filing_error: null,
        });
        return {
          ok: true,
          alreadyFiled: true,
          driveLink: existingDoc.drive_link,
          documentId: existingDoc.id,
          fileName: existingDoc.file_name || fileName,
        };
      }
    }

    const { buffer } = await docuseal.downloadSignedPdf(mergedDoc.url);
    const accessToken = await drive.getAccessToken();
    const uploaded = await drive.uploadPdfToDriveFolder({
      folderId,
      fileName,
      pdfBuffer: buffer,
      accessToken,
      requireSharedDrive: true,
    });

    const insertedDoc = await store.insertDocument({
      landlord_id: landlordId,
      property_id: propertyId,
      contract_id: contractId,
      tenant_id: null,
      drive_link: uploaded.webViewLink,
      file_name: uploaded.fileName,
      document_type: "lease_renewal",
    });

    await store.updateRenewalFiling(renewal.id, {
      signed_document_url: uploaded.webViewLink,
      document_id: insertedDoc.id,
      filing_error: null,
    });

    return {
      ok: true,
      alreadyFiled: false,
      driveLink: uploaded.webViewLink,
      documentId: insertedDoc.id,
      fileName: uploaded.fileName,
    };
  } catch (err) {
    const message = err?.message || "Failed to file signed renewal PDF to Google Drive.";
    await persistError(message);
    return {
      ok: false,
      error: message,
      code: err?.code || "FILING_FAILED",
    };
  }
}
