// Production Supabase adapter for Phase 4 renewal operations:
// - Webhook state updates & Drive filing store (`createRenewalStore`)
// - Atomic lease-term advance via Postgres RPC (`createRenewalAdvanceAdapter`)
import { RenewalAdvanceError } from "./advance.js";

function isMissingColumnError(error) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

function isMissingFunctionError(error) {
  return error?.code === "42883" || error?.code === "PGRST202";
}

function mapAdvanceRpcError(error) {
  if (isMissingFunctionError(error)) {
    return new RenewalAdvanceError(
      "Database function advance_lease_renewal is missing. Run scripts/add-lease-renewal-phase4.sql in Supabase first.",
      { code: "MIGRATION_REQUIRED", status: 500 },
    );
  }
  const message = error?.message || "Failed to advance lease term.";
  if (/renewal not found|contract not found/i.test(message)) {
    return new RenewalAdvanceError(message, { code: "NOT_FOUND", status: 404 });
  }
  if (/must be countersigned/i.test(message)) {
    return new RenewalAdvanceError(message, { code: "NOT_COUNTERSIGNED", status: 409 });
  }
  if (/already past this renewal term/i.test(message)) {
    return new RenewalAdvanceError(message, { code: "STALE_RENEWAL", status: 409 });
  }
  if (/has no new_term_end|cannot precede contract start_date/i.test(message)) {
    return new RenewalAdvanceError(message, { code: "INVALID_TERM", status: 422 });
  }
  return new RenewalAdvanceError(message, { code: "ADVANCE_FAILED", status: 400 });
}

export function createRenewalAdvanceAdapter(supabase) {
  return {
    async advanceLeaseRenewal({ landlordId, renewalId }) {
      const { data, error } = await supabase.rpc("advance_lease_renewal", {
        p_renewal_id: renewalId,
        p_landlord_id: landlordId,
      });
      if (error) throw mapAdvanceRpcError(error);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object") {
        throw new RenewalAdvanceError("advance_lease_renewal returned no result.", {
          code: "ADVANCE_FAILED",
          status: 500,
        });
      }
      return {
        alreadyApplied: Boolean(row.already_applied),
        renewalId: row.renewal_id || renewalId,
        contractId: row.contract_id || null,
        previousEndDate: row.previous_end_date || null,
        newEndDate: row.new_end_date || null,
        appliedAt: row.applied_at || null,
      };
    },
  };
}

export function createRenewalStore(supabase) {
  return {
    async getRenewalBySubmissionId(submissionId) {
      const { data, error } = await supabase
        .from("lease_renewals")
        .select("*")
        .eq("docuseal_submission_id", String(submissionId))
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data || null;
    },

    async getRenewalById(renewalId, landlordId) {
      const { data, error } = await supabase
        .from("lease_renewals")
        .select("*")
        .eq("id", renewalId)
        .eq("landlord_id", landlordId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data || null;
    },

    async findTenantByEmail(email, landlordId) {
      let query = supabase
        .from("tenant_profiles")
        .select("id")
        .ilike("email", email);
      if (landlordId) query = query.eq("landlord_id", landlordId);
      const { data, error } = await query.maybeSingle();
      if (error) return null;
      return data || null;
    },

    async getProperty(propertyId, landlordId) {
      let query = supabase
        .from("properties")
        .select("id, address, drive_link")
        .eq("id", propertyId);
      if (landlordId) query = query.eq("landlord_id", landlordId);
      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(error.message);
      return data || null;
    },

    async getContract(contractId, landlordId) {
      let query = supabase
        .from("contracts")
        .select("id, unit, start_date, end_date, rent_amount")
        .eq("id", contractId);
      if (landlordId) query = query.eq("landlord_id", landlordId);
      const { data, error } = await query.maybeSingle();
      if (error) throw new Error(error.message);
      return data || null;
    },

    async findExistingRenewalDocument({ landlordId, propertyId, contractId, fileName }) {
      let query = supabase
        .from("documents")
        .select("id, drive_link, file_name")
        .eq("landlord_id", landlordId)
        .eq("document_type", "lease_renewal")
        .eq("file_name", fileName);
      if (propertyId) query = query.eq("property_id", propertyId);
      if (contractId) query = query.eq("contract_id", contractId);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data || null;
    },

    async insertDocument(row) {
      const { data, error } = await supabase
        .from("documents")
        .insert(row)
        .select("id, drive_link, file_name")
        .single();
      if (error) throw new Error(`Failed to record document row: ${error.message}`);
      return data;
    },

    async updateRenewalState(renewalId, patch) {
      const { error } = await supabase
        .from("lease_renewals")
        .update(patch)
        .eq("id", renewalId);
      if (error) throw new Error(error.message);
    },

    async updateRenewalFiling(renewalId, patch) {
      const { error } = await supabase
        .from("lease_renewals")
        .update(patch)
        .eq("id", renewalId);
      if (error) {
        // Tolerate pre-migration deploys where Phase 4 columns aren't added yet;
        // the `documents` row is already durably recorded.
        if (isMissingColumnError(error)) return;
        throw new Error(error.message);
      }
    },
  };
}
