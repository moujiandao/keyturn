// In-memory fake mirroring the exact contract of `public.advance_lease_renewal`
// in scripts/add-lease-renewal-phase4.sql so core tests exercise the real
// invariants (team scoping, countersigned gate, idempotency, monotonicity,
// atomic update of contracts.end_date + lease_renewals.applied_to_contract).
import { RenewalAdvanceError } from "./advance.js";

export function createFakeRenewalAdvanceAdapter({
  renewals = [],
  contracts = [],
  now = () => "2026-06-25T12:00:00.000Z",
} = {}) {
  const renewalMap = new Map(renewals.map((r) => [r.id, { ...r }]));
  const contractMap = new Map(contracts.map((c) => [c.id, { ...c }]));

  return {
    renewals: renewalMap,
    contracts: contractMap,

    async advanceLeaseRenewal({ landlordId, renewalId }) {
      const renewal = renewalMap.get(renewalId);
      if (!renewal || renewal.landlord_id !== landlordId) {
        throw new RenewalAdvanceError("renewal not found", {
          code: "NOT_FOUND",
          status: 404,
        });
      }

      const contract = contractMap.get(renewal.contract_id);
      if (!contract || contract.landlord_id !== landlordId) {
        throw new RenewalAdvanceError("contract not found", {
          code: "NOT_FOUND",
          status: 404,
        });
      }

      if (renewal.applied_to_contract === true) {
        return {
          alreadyApplied: true,
          renewalId: renewal.id,
          contractId: contract.id,
          previousEndDate: contract.end_date || null,
          newEndDate: renewal.new_term_end || contract.end_date || null,
          appliedAt: renewal.applied_at || null,
        };
      }

      if (renewal.status !== "countersigned") {
        throw new RenewalAdvanceError(
          "renewal must be countersigned before advancing lease term",
          { code: "NOT_COUNTERSIGNED", status: 409 },
        );
      }

      if (!renewal.new_term_end) {
        throw new RenewalAdvanceError("renewal has no new_term_end", {
          code: "INVALID_TERM",
          status: 422,
        });
      }

      if (contract.start_date && renewal.new_term_end < contract.start_date) {
        throw new RenewalAdvanceError("new_term_end cannot precede contract start_date", {
          code: "INVALID_TERM",
          status: 422,
        });
      }

      if (contract.end_date && contract.end_date > renewal.new_term_end) {
        throw new RenewalAdvanceError("contract end_date is already past this renewal term", {
          code: "STALE_RENEWAL",
          status: 409,
        });
      }

      const previousEndDate = contract.end_date || null;
      const appliedAt = now();

      contract.end_date = renewal.new_term_end;
      renewal.applied_to_contract = true;
      renewal.applied_at = appliedAt;

      return {
        alreadyApplied: false,
        renewalId: renewal.id,
        contractId: contract.id,
        previousEndDate,
        newEndDate: renewal.new_term_end,
        appliedAt,
      };
    },
  };
}
