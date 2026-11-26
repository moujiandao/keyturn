// Pure, dependency-injected DocuSeal webhook processor.
//
// Status machine (per docs/docuseal-tenant-renewal-spec.md):
//   pending_review / sent -> signed        (all order:0 tenants completed)
//                         -> countersigned (landlord order:1 completed too)
//                         -> declined      (any submitter declined)
//
// Phase 4A invariant: once countersigned, persist the status transition FIRST,
// then auto-file the merged signed PDF to Google Drive (idempotently). Any
// Drive error is recorded in `filing_error` and never fails the webhook.
//
// Phase 4B invariant: this webhook NEVER mutates `contracts`. Advancing the
// lease term requires explicit manual landlord confirmation.
import { fileSignedRenewalToDrive } from "./filing.js";

function submissionIdFrom(data) {
  return data?.submission_id || data?.submission?.id || null;
}

const idStr = (v) => (v == null ? null : String(v));

export async function processDocusealWebhook({
  event,
  store,
  docuseal,
  drive,
  now = () => new Date().toISOString(),
}) {
  const type = event?.event_type || event?.type || "";
  const data = event?.data || {};

  const isCompleted = type === "form.completed";
  const isDeclined = type === "form.declined";
  if (!isCompleted && !isDeclined) {
    return { status: 200, body: { received: true, ignored: type } };
  }

  const rawSubmissionId = submissionIdFrom(data);
  const submissionId = idStr(rawSubmissionId);
  const submitterId = idStr(data?.id);
  const email = (data?.email || "").trim().toLowerCase();
  const when = data?.completed_at || data?.declined_at || event?.timestamp || now();

  if (!submissionId) {
    return { status: 200, body: { received: true, note: "no submission id in payload" } };
  }

  let renewal;
  try {
    renewal = await store.getRenewalBySubmissionId(submissionId);
  } catch (err) {
    return { status: 400, body: { error: err.message } };
  }

  if (!renewal) {
    return { status: 200, body: { received: true, note: "no matching renewal" } };
  }

  const signers = Array.isArray(renewal.signers) ? renewal.signers : [];

  // Prefer submitterId (exact), fall back to stored signer email, then
  // tenant_profiles scoped to this renewal's landlord.
  let idx = submitterId
    ? signers.findIndex((s) => s && idStr(s.submitterId) === submitterId)
    : -1;
  if (idx === -1 && email) {
    idx = signers.findIndex((s) => s && (s.email || "").trim().toLowerCase() === email);
  }
  if (idx === -1 && email && typeof store.findTenantByEmail === "function") {
    const tenant = await store.findTenantByEmail(email, renewal.landlord_id);
    if (tenant) {
      idx = signers.findIndex((s) => s && idStr(s.tenantId) === idStr(tenant.id));
    }
  }

  if (idx === -1) {
    return { status: 200, body: { received: true, note: "submitter not found on renewal" } };
  }

  const updatedSigners = signers.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: isDeclined ? "declined" : "completed",
          signedAt: isDeclined ? (s.signedAt ?? null) : (s.signedAt || when),
        }
      : s,
  );

  let derivedStatus = renewal.status;
  if (isDeclined) {
    derivedStatus = "declined";
  } else {
    const tenants = updatedSigners.filter((s) => s && s.order === 0);
    const landlords = updatedSigners.filter((s) => s && s.order === 1);
    const allTenantsDone = tenants.length > 0 && tenants.every((s) => s.status === "completed");
    const allLandlordsDone = landlords.length > 0 && landlords.every((s) => s.status === "completed");

    if (allTenantsDone && allLandlordsDone) {
      derivedStatus = "countersigned";
    } else if (allTenantsDone) {
      derivedStatus = "signed";
    }
  }

  const patch = { signers: updatedSigners };
  // Never downgrade a renewal that already reached countersigned (e.g. a late
  // duplicate tenant event re-deriving 'signed').
  const effectiveStatus =
    renewal.status === "countersigned" && derivedStatus !== "countersigned"
      ? "countersigned"
      : derivedStatus;

  if (renewal.status !== "countersigned" || derivedStatus === "countersigned") {
    patch.status = effectiveStatus;
  }

  // Persist status + signers BEFORE touching Google Drive so a Drive failure
  // can never prevent countersign completion from being recorded.
  try {
    await store.updateRenewalState(renewal.id, patch);
  } catch (err) {
    return { status: 400, body: { error: err.message } };
  }

  if (effectiveStatus === "countersigned" && !isDeclined) {
    const filing = await fileSignedRenewalToDrive({
      renewal: { ...renewal, ...patch, status: effectiveStatus },
      store,
      docuseal,
      drive,
    });
    return {
      status: 200,
      body: {
        received: true,
        filed: filing.ok,
        ...(filing.alreadyFiled ? { alreadyFiled: true } : {}),
        ...(filing.driveLink ? { driveLink: filing.driveLink } : {}),
        ...(filing.documentId ? { documentId: filing.documentId } : {}),
        ...(filing.ok ? {} : { filingError: filing.error }),
      },
    };
  }

  return { status: 200, body: { received: true } };
}
