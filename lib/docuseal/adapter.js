// Production Supabase adapter for Phase 4 renewal operations:
// - Webhook state updates & Drive filing store (`createRenewalStore`)
// - Atomic lease-term advance via Postgres RPC (`createRenewalAdvanceAdapter`)

function isMissingColumnError(error) {
  return error?.code === "42703" || error?.code === "PGRST204";
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
