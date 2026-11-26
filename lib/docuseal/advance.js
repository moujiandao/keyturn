// Phase 4B: Manual landlord confirmation to advance `contracts.end_date` from a
// countersigned renewal and flip `lease_renewals.applied_to_contract = true`
// idempotently. Never invoked from a webhook.

export class RenewalAdvanceError extends Error {
  constructor(message, { code = "ADVANCE_FAILED", status = 400 } = {}) {
    super(message);
    this.name = "RenewalAdvanceError";
    this.code = code;
    this.status = status;
  }
}

function requiredId(value, label) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) {
    throw new RenewalAdvanceError(`${label} is required.`, {
      code: "MISSING_REQUIRED_FIELD",
      status: 400,
    });
  }
  return id;
}

/**
 * Advance a contract's end_date to the countersigned renewal's new_term_end and
 * mark the renewal applied_to_contract=true in one atomic adapter operation.
 */
export async function advanceLeaseRenewal(adapter, { landlordId, renewalId } = {}) {
  const cleanLandlordId = requiredId(landlordId, "landlordId");
  const cleanRenewalId = requiredId(renewalId, "renewalId");

  const result = await adapter.advanceLeaseRenewal({
    landlordId: cleanLandlordId,
    renewalId: cleanRenewalId,
  });

  return {
    ok: true,
    alreadyApplied: Boolean(result.alreadyApplied),
    renewalId: result.renewalId || cleanRenewalId,
    contractId: result.contractId || null,
    previousEndDate: result.previousEndDate || null,
    newEndDate: result.newEndDate || null,
    appliedAt: result.appliedAt || null,
  };
}
