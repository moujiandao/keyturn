import { test } from "node:test";
import assert from "node:assert/strict";
import { mapLeaseRenewal } from "./mappers.js";

test("mapLeaseRenewal maps Phase 4 filing and apply fields cleanly", () => {
  const mapped = mapLeaseRenewal({
    id: "r1",
    landlord_id: "l1",
    contract_id: "c1",
    property_id: "p1",
    original_lease_date: "2024-08-01",
    new_term_start: "2026-08-01",
    new_term_end: "2027-08-01",
    rent_amount: 2400,
    status: "countersigned",
    docuseal_submission_id: "99",
    signers: [{ email: "a@example.com", order: 0, status: "completed" }],
    applied_to_contract: true,
    applied_at: "2026-06-25T10:00:00Z",
    signed_document_url: "https://drive.google.com/file/d/abc/view",
    document_id: "d1",
    filing_error: null,
    created_at: "2026-06-20T00:00:00Z",
    updated_at: "2026-06-25T10:00:00Z",
  });

  assert.equal(mapped.appliedToContract, true);
  assert.equal(mapped.appliedAt, "2026-06-25T10:00:00Z");
  assert.equal(mapped.signedDocumentUrl, "https://drive.google.com/file/d/abc/view");
  assert.equal(mapped.documentId, "d1");
  assert.equal(mapped.filingError, null);
});

test("mapLeaseRenewal defaults missing Phase 4 columns to null/false for pre-migration rows", () => {
  const mapped = mapLeaseRenewal({
    id: "r2",
    contract_id: "c2",
    status: "sent",
  });

  assert.equal(mapped.appliedToContract, false);
  assert.equal(mapped.appliedAt, null);
  assert.equal(mapped.signedDocumentUrl, null);
  assert.equal(mapped.documentId, null);
  assert.equal(mapped.filingError, null);
});
