import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRenewalPdfFileName, fileSignedRenewalToDrive } from "./filing.js";
import { processDocusealWebhook } from "./webhook.js";
import { DriveUploadError } from "../google/drive.js";

function createInMemoryEnv({
  renewal,
  property = {
    id: "prop-1",
    landlord_id: "team-1",
    address: "123 Main St",
    drive_link: "https://drive.google.com/drive/folders/shared_folder_1",
  },
  contract = {
    id: "con-1",
    landlord_id: "team-1",
    unit: "2B",
    start_date: "2024-07-01",
    end_date: "2026-06-30",
    rent_amount: 2400,
  },
  existingDocs = [],
  driveError = null,
} = {}) {
  const state = {
    renewal: {
      id: "ren-1",
      landlord_id: "team-1",
      contract_id: "con-1",
      property_id: "prop-1",
      original_lease_date: "2024-07-01",
      new_term_start: "2026-07-01",
      new_term_end: "2027-07-01",
      rent_amount: 2400,
      status: "sent",
      docuseal_submission_id: "99",
      signers: [
        { tenantId: "ten-1", email: "alice@example.com", submitterId: "11", order: 0, status: "pending", signedAt: null },
        { tenantId: null, email: "landlord@example.com", submitterId: "12", order: 1, status: "pending", signedAt: null },
      ],
      applied_to_contract: false,
      signed_document_url: null,
      document_id: null,
      filing_error: null,
      ...renewal,
    },
    property,
    contract: { ...contract },
    documents: [...existingDocs],
    uploadCalls: [],
    downloadCalls: [],
    updateOrder: [],
  };

  const store = {
    async getRenewalBySubmissionId(submissionId) {
      return state.renewal.docuseal_submission_id === String(submissionId)
        ? { ...state.renewal }
        : null;
    },
    async getProperty(propertyId) {
      return state.property && state.property.id === propertyId ? { ...state.property } : null;
    },
    async getContract(contractId) {
      return state.contract && state.contract.id === contractId ? { ...state.contract } : null;
    },
    async findExistingRenewalDocument({ landlordId, propertyId, contractId, fileName }) {
      return (
        state.documents.find(
          (d) =>
            d.landlord_id === landlordId &&
            d.property_id === propertyId &&
            d.contract_id === contractId &&
            d.document_type === "lease_renewal" &&
            d.file_name === fileName,
        ) || null
      );
    },
    async insertDocument(row) {
      const doc = { id: `doc-${state.documents.length + 1}`, ...row };
      state.documents.push(doc);
      state.updateOrder.push("insertDocument");
      return doc;
    },
    async updateRenewalState(id, patch) {
      assert.equal(id, state.renewal.id);
      Object.assign(state.renewal, patch);
      state.updateOrder.push(`updateRenewalState:${patch.status || "keep"}`);
    },
    async updateRenewalFiling(id, patch) {
      assert.equal(id, state.renewal.id);
      Object.assign(state.renewal, patch);
      state.updateOrder.push("updateRenewalFiling");
    },
  };

  const docuseal = {
    async getSignedDocuments(submissionId) {
      assert.equal(String(submissionId), "99");
      return {
        documents: [{ name: "renewal.pdf", url: "https://files.docuseal.com/merged-99.pdf" }],
      };
    },
    async downloadSignedPdf(url) {
      state.downloadCalls.push(url);
      return { buffer: Buffer.from("%PDF-1.4\nsigned"), contentType: "application/pdf" };
    },
  };

  const drive = {
    async getAccessToken() {
      return "drive-token";
    },
    async uploadPdfToDriveFolder(args) {
      state.uploadCalls.push(args);
      state.updateOrder.push("uploadPdfToDriveFolder");
      if (driveError) throw driveError;
      return {
        fileId: "drive-file-1",
        fileName: args.fileName,
        webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
      };
    },
  };

  return { state, store, docuseal, drive };
}

test("buildRenewalPdfFileName produces a clean, sanitized PDF filename", () => {
  assert.equal(
    buildRenewalPdfFileName({
      propertyAddress: "123 Main St / Apt",
      unit: "2B",
      newTermStart: "2026-07-01",
      newTermEnd: "2027-07-01",
    }),
    "Lease Renewal - 123 Main St Apt Unit 2B (2026-07-01 to 2027-07-01).pdf",
  );
  assert.equal(buildRenewalPdfFileName({ fallbackName: "docuseal_merged" }), "docuseal_merged.pdf");
});

test("tenant completion marks renewal signed without touching Google Drive or contracts", async () => {
  const { state, store, docuseal, drive } = createInMemoryEnv();

  const res = await processDocusealWebhook({
    event: {
      event_type: "form.completed",
      data: {
        id: 11,
        submission_id: 99,
        email: "alice@example.com",
        completed_at: "2026-06-20T12:00:00Z",
      },
    },
    store,
    docuseal,
    drive,
  });

  assert.equal(res.status, 200);
  assert.equal(state.renewal.status, "signed");
  assert.equal(state.uploadCalls.length, 0);
  assert.equal(state.documents.length, 0);
  assert.equal(state.contract.end_date, "2026-06-30");
  assert.equal(state.renewal.applied_to_contract, false);
});

test("countersign completion persists status first, auto-files PDF to Drive, records lease_renewal doc, and never mutates contract", async () => {
  const { state, store, docuseal, drive } = createInMemoryEnv({
    renewal: {
      status: "signed",
      signers: [
        { tenantId: "ten-1", email: "alice@example.com", submitterId: "11", order: 0, status: "completed", signedAt: "2026-06-20T12:00:00Z" },
        { tenantId: null, email: "landlord@example.com", submitterId: "12", order: 1, status: "pending", signedAt: null },
      ],
    },
  });

  const res = await processDocusealWebhook({
    event: {
      event_type: "form.completed",
      data: {
        id: 12,
        submission_id: 99,
        email: "landlord@example.com",
        completed_at: "2026-06-21T09:00:00Z",
      },
    },
    store,
    docuseal,
    drive,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
  assert.equal(res.body.filed, true);
  assert.equal(state.renewal.status, "countersigned");
  assert.equal(state.renewal.signed_document_url, "https://drive.google.com/file/d/drive-file-1/view");
  assert.equal(state.renewal.document_id, "doc-1");
  assert.equal(state.renewal.filing_error, null);

  // Ordering invariant: countersigned persisted BEFORE Drive upload.
  assert.deepEqual(state.updateOrder, [
    "updateRenewalState:countersigned",
    "uploadPdfToDriveFolder",
    "insertDocument",
    "updateRenewalFiling",
  ]);

  // Document row contract.
  assert.equal(state.documents.length, 1);
  assert.equal(state.documents[0].document_type, "lease_renewal");
  assert.equal(state.documents[0].contract_id, "con-1");
  assert.equal(state.documents[0].property_id, "prop-1");
  assert.equal(state.documents[0].drive_link, "https://drive.google.com/file/d/drive-file-1/view");

  // Phase 4B invariant: webhook NEVER mutates contracts.
  assert.equal(state.contract.end_date, "2026-06-30");
  assert.equal(state.renewal.applied_to_contract, false);
});

test("duplicate countersign webhook replay is idempotent and uploads zero extra files", async () => {
  const { state, store, docuseal, drive } = createInMemoryEnv({
    renewal: {
      status: "countersigned",
      signers: [
        { tenantId: "ten-1", email: "alice@example.com", submitterId: "11", order: 0, status: "completed", signedAt: "2026-06-20T12:00:00Z" },
        { tenantId: null, email: "landlord@example.com", submitterId: "12", order: 1, status: "completed", signedAt: "2026-06-21T09:00:00Z" },
      ],
      signed_document_url: "https://drive.google.com/file/d/existing/view",
      document_id: "doc-existing",
    },
  });

  const res = await processDocusealWebhook({
    event: {
      event_type: "form.completed",
      data: { id: 12, submission_id: 99, email: "landlord@example.com" },
    },
    store,
    docuseal,
    drive,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.alreadyFiled, true);
  assert.equal(state.uploadCalls.length, 0);
  assert.equal(state.downloadCalls.length, 0);
  assert.equal(state.documents.length, 0);
});

test("Drive failure (personal My Drive folder) still saves countersigned status, records filing_error, and returns 200", async () => {
  const { state, store, docuseal, drive } = createInMemoryEnv({
    renewal: {
      status: "signed",
      signers: [
        { tenantId: "ten-1", email: "alice@example.com", submitterId: "11", order: 0, status: "completed", signedAt: "2026-06-20T12:00:00Z" },
        { tenantId: null, email: "landlord@example.com", submitterId: "12", order: 1, status: "pending", signedAt: null },
      ],
    },
    driveError: new DriveUploadError("Move folder to a Shared Drive.", {
      code: "SHARED_DRIVE_REQUIRED",
      status: 422,
    }),
  });

  const res = await processDocusealWebhook({
    event: {
      event_type: "form.completed",
      data: { id: 12, submission_id: 99, email: "landlord@example.com" },
    },
    store,
    docuseal,
    drive,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
  assert.equal(res.body.filed, false);
  assert.match(res.body.filingError, /Shared Drive/);
  assert.equal(state.renewal.status, "countersigned");
  assert.match(state.renewal.filing_error, /Shared Drive/);
  assert.equal(state.renewal.signed_document_url, null);
});

test("fileSignedRenewalToDrive links an existing lease_renewal document row without re-uploading", async () => {
  const { state, store, docuseal, drive } = createInMemoryEnv({
    renewal: { status: "countersigned", filing_error: "prior timeout" },
    existingDocs: [
      {
        id: "doc-prior",
        landlord_id: "team-1",
        property_id: "prop-1",
        contract_id: "con-1",
        document_type: "lease_renewal",
        file_name: "Lease Renewal - 123 Main St Unit 2B (2026-07-01 to 2027-07-01).pdf",
        drive_link: "https://drive.google.com/file/d/prior-file/view",
      },
    ],
  });

  const res = await fileSignedRenewalToDrive({
    renewal: state.renewal,
    store,
    docuseal,
    drive,
  });

  assert.equal(res.ok, true);
  assert.equal(res.alreadyFiled, true);
  assert.equal(res.documentId, "doc-prior");
  assert.equal(state.uploadCalls.length, 0);
  assert.equal(state.renewal.filing_error, null);
  assert.equal(state.renewal.signed_document_url, "https://drive.google.com/file/d/prior-file/view");
});

test("stale form.declined on an already-countersigned renewal leaves status and signers untouched", async () => {
  const { state, store, docuseal, drive } = createInMemoryEnv({
    renewal: {
      status: "countersigned",
      signers: [
        { tenantId: "ten-1", email: "alice@example.com", submitterId: "11", order: 0, status: "completed", signedAt: "2026-06-20T12:00:00Z" },
        { tenantId: null, email: "landlord@example.com", submitterId: "12", order: 1, status: "completed", signedAt: "2026-06-21T09:00:00Z" },
      ],
    },
  });

  const res = await processDocusealWebhook({
    event: {
      event_type: "form.declined",
      data: { id: 11, submission_id: 99, email: "alice@example.com" },
    },
    store,
    docuseal,
    drive,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.note, "already countersigned");
  assert.equal(state.renewal.status, "countersigned");
  assert.equal(state.renewal.signers[0].status, "completed");
});

test("transient store read/write failures return 500 so DocuSeal can retry", async () => {
  const { store, docuseal, drive } = createInMemoryEnv();
  store.getRenewalBySubmissionId = async () => {
    throw new Error("connection timeout");
  };

  const res = await processDocusealWebhook({
    event: {
      event_type: "form.completed",
      data: { id: 11, submission_id: 99, email: "alice@example.com" },
    },
    store,
    docuseal,
    drive,
  });

  assert.equal(res.status, 500);
  assert.match(res.body.error, /connection timeout/);
});
