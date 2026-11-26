-- DocuSeal Lease Renewals - Phase 4 (Deferred v2)
-- Adds signed-document filing metadata on lease_renewals and an atomic
-- PostgreSQL RPC for manual landlord confirmation to advance contracts.end_date.
--
-- Apply after scripts/add-lease-renewals.sql and scripts/migrate-team-landlords.sql.
-- Safe to re-run (all DDL is idempotent).

ALTER TABLE public.lease_renewals
  ADD COLUMN IF NOT EXISTS signed_document_url TEXT,
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS filing_error TEXT,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS lease_renewals_document_id_idx
  ON public.lease_renewals (document_id)
  WHERE document_id IS NOT NULL;

-- Atomic manual confirmation to advance a lease term from a countersigned renewal.
-- Locks both the renewal and contract rows FOR UPDATE so concurrent clicks
-- cannot double-apply or race against another edit. Never called from a webhook.
CREATE OR REPLACE FUNCTION public.advance_lease_renewal(
  p_renewal_id UUID,
  p_landlord_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_renewal public.lease_renewals%ROWTYPE;
  v_contract public.contracts%ROWTYPE;
  v_prev_end DATE;
  v_now TIMESTAMPTZ;
BEGIN
  IF p_renewal_id IS NULL THEN
    RAISE EXCEPTION 'renewal_id is required';
  END IF;
  IF p_landlord_id IS NULL THEN
    RAISE EXCEPTION 'landlord_id is required';
  END IF;

  SELECT *
    INTO v_renewal
    FROM public.lease_renewals
   WHERE id = p_renewal_id
     AND landlord_id = p_landlord_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'renewal not found';
  END IF;

  SELECT *
    INTO v_contract
    FROM public.contracts
   WHERE id = v_renewal.contract_id
     AND landlord_id = p_landlord_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract not found';
  END IF;

  -- Idempotent: if already applied, report success without mutating again.
  IF v_renewal.applied_to_contract IS TRUE THEN
    RETURN jsonb_build_object(
      'already_applied', TRUE,
      'renewal_id', v_renewal.id,
      'contract_id', v_contract.id,
      'previous_end_date', v_contract.end_date,
      'new_end_date', COALESCE(v_renewal.new_term_end, v_contract.end_date),
      'applied_at', v_renewal.applied_at
    );
  END IF;

  IF v_renewal.status <> 'countersigned' THEN
    RAISE EXCEPTION 'renewal must be countersigned before advancing lease term';
  END IF;

  IF v_renewal.new_term_end IS NULL THEN
    RAISE EXCEPTION 'renewal has no new_term_end';
  END IF;

  IF v_contract.start_date IS NOT NULL AND v_renewal.new_term_end < v_contract.start_date THEN
    RAISE EXCEPTION 'new_term_end cannot precede contract start_date';
  END IF;

  IF v_contract.end_date IS NOT NULL AND v_contract.end_date > v_renewal.new_term_end THEN
    RAISE EXCEPTION 'contract end_date is already past this renewal term';
  END IF;

  v_prev_end := v_contract.end_date;
  v_now := NOW();

  UPDATE public.contracts
     SET end_date = v_renewal.new_term_end
   WHERE id = v_contract.id;

  UPDATE public.lease_renewals
     SET applied_to_contract = TRUE,
         applied_at = v_now
   WHERE id = v_renewal.id;

  RETURN jsonb_build_object(
    'already_applied', FALSE,
    'renewal_id', v_renewal.id,
    'contract_id', v_contract.id,
    'previous_end_date', v_prev_end,
    'new_end_date', v_renewal.new_term_end,
    'applied_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_lease_renewal(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_lease_renewal(UUID, UUID) TO service_role;
