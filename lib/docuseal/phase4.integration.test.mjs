import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadSignedPdf } from "./client.js";
import { processDocusealWebhook } from "./webhook.js";
import { fileSignedRenewalToDrive } from "./filing.js";
import { advanceLeaseRenewal } from "./advance.js";
import { createFakeRenewalAdvanceAdapter } from "./fake.js";
import { mapLeaseRenewal } from "./mappers.js";
import {
  deriveRenewalTerm,
  pickEffectiveEndDate,
  pickOriginalLeaseDate,
  isReadyToAdvance,
} from "./renewal.js";
import { uploadPdfToDriveFolder } from "../google/drive.js";

test("Phase 4 end-to-end: countersign webhook -> Shared Drive auto-file -> replay idempotency -> manual advance -> next-year chain", async () => {
  const contractRow = {
    id: "con-1",
    landlord_id: "team-1",
    unit: "3A",
    start_date: "2024-07-01",
    end_date: "2026-06-30",
    rent_amount: 2600,
  };
  const renewalRow = {
    id: "ren-1",
    landlord_id: "team-1",
    contract_id: "con-1",
    property_id: "prop-1",
    original_lease_date: "2024-07-01",
    new_term_start: "2026-07-01",
    new_term_end: "2027-07-01",
    rent_amount: 2600,
    status: "sent",
    docuseal_submission_id: "501",
    signers: [
      { tenantId: "ten-1", email: "alice@example.com", submitterId: "61", order: 0, status: "pending", signedAt: null },
      { tenantId: null, email: "owner@example.com", submitterId: "62", order: 1, status: "pending", signedAt: null },
    ],
    applied_to_contract: false,
    applied_at: null,
    signed_document_url: null,
    document_id: null,
    filing_error: null,
    created_at: "2026-03-01T00:00:00Z",
  };
  const propertyRow = {
    id: "prop-1",
    landlord_id: "team-1",
    address: "456 Oak Ave",
    drive_link: "https://drive.google.com/drive/folders/shared_oak_folder",
  };

  const documents = [];
  const driveHttpCalls = [];
  const pdfDownloadHeaders = [];

  const driveFetch = async (url, opts = {}) => {
    driveHttpCalls.push({ url, method: opts.method || "GET" });
    if (url.includes("/drive/v3/files/shared_oak_folder")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "shared_oak_folder",
          name: "456 Oak Ave",
          mimeType: "application/vnd.google-apps.folder",
          driveId: "0ADsharedOakDrive",
        }),
      };
    }
    if (url.includes("/upload/drive/v3/files")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gdrive-pdf-501",
          name: "Lease Renewal - 456 Oak Ave Unit 3A (2026-07-01 to 2027-07-01).pdf",
          webViewLink: "https://drive.google.com/file/d/gdrive-pdf-501/view",
        }),
      };
    }
    throw new Error(`Unexpected Drive URL: ${url}`);
  };

  const pdfFetch = async (_url, opts = {}) => {
    pdfDownloadHeaders.push(opts.headers || {});
    const bytes = Buffer.from("%PDF-1.4\nmerged-signed-renewal");
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf", "content-length": String(bytes.length) }),
      arrayBuffer: async () => bytes,
    };
  };

  const store = {
    async getRenewalBySubmissionId(subId) {
      return renewalRow.docuseal_submission_id === String(subId) ? { ...renewalRow } : null;
    },
    async getProperty(id) {
      return id === propertyRow.id ? { ...propertyRow } : null;
    },
    async getContract(id) {
      return id === contractRow.id ? { ...contractRow } : null;
    },
    async findExistingRenewalDocument({ landlordId, propertyId, contractId, fileName }) {
      return (
        documents.find(
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
      const inserted = { id: `doc-${documents.length + 1}`, ...row };
      documents.push(inserted);
      return inserted;
    },
    async updateRenewalState(_id, patch) {
      Object.assign(renewalRow, patch);
    },
    async updateRenewalFiling(_id, patch) {
      Object.assign(renewalRow, patch);
    },
  };

  const docuseal = {
    async getSignedDocuments() {
      return {
        documents: [{ name: "renewal.pdf", url: "https://cdn.example.com/signed/501.pdf" }],
      };
    },
    downloadSignedPdf: (url) =>
      downloadSignedPdf(url, {
        fetchImpl: pdfFetch,
        baseUrl: "https://api.docuseal.com",
        apiKey: "super-secret-key",
      }),
  };

  const drive = {
    async getAccessToken() {
      return "service-account-token";
    },
    uploadPdfToDriveFolder: (args) => uploadPdfToDriveFolder({ ...args, fetchImpl: driveFetch }),
  };

  // 1. Tenant signs -> signed, not ready to advance, no Drive traffic, contract untouched.
  const step1 = await processDocusealWebhook({
    event: {
      event_type: "form.completed",
      data: { id: 61, submission_id: 501, email: "alice@example.com", completed_at: "2026-06-10T10:00:00Z" },
    },
    store,
    docuseal,
    drive,
  });
  assert.equal(step1.status, 200);
  assert.equal(renewalRow.status, "signed");
  assert.equal(isReadyToAdvance(mapLeaseRenewal(renewalRow)), false);
  assert.equal(driveHttpCalls.length, 0);
  assert.equal(contractRow.end_date, "2026-06-30");

  // 2. Landlord countersigns -> countersigned, auto-filed to Shared Drive, contract STILL untouched.
  const step2 = await processDocusealWebhook({
    event: {
      event_type: "form.completed",
      data: { id: 62, submission_id: 501, email: "owner@example.com", completed_at: "2026-06-11T15:00:00Z" },
    },
    store,
    docuseal,
    drive,
  });
  assert.equal(step2.status, 200);
  assert.equal(step2.body.filed, true);
  assert.equal(renewalRow.status, "countersigned");
  assert.equal(pdfDownloadHeaders[0]["X-Auth-Token"], undefined);
  assert.equal(driveHttpCalls.length, 2);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].document_type, "lease_renewal");
  assert.equal(renewalRow.signed_document_url, "https://drive.google.com/file/d/gdrive-pdf-501/view");
  assert.equal(renewalRow.document_id, "doc-1");
  assert.equal(contractRow.end_date, "2026-06-30");
  assert.equal(isReadyToAdvance(mapLeaseRenewal(renewalRow)), true);

  // 3. Duplicate countersign webhook replay -> idempotent, zero extra uploads or documents.
  const step3 = await processDocusealWebhook({
    event: {
      event_type: "form.completed",
      data: { id: 62, submission_id: 501, email: "owner@example.com" },
    },
    store,
    docuseal,
    drive,
  });
  assert.equal(step3.status, 200);
  assert.equal(step3.body.alreadyFiled, true);
  assert.equal(driveHttpCalls.length, 2);
  assert.equal(documents.length, 1);

  // 4. Manual landlord confirmation advances contract end_date and sets applied_to_contract.
  const advanceAdapter = createFakeRenewalAdvanceAdapter({
    contracts: [contractRow],
    renewals: [renewalRow],
    now: () => "2026-06-12T08:00:00.000Z",
  });
  const step4 = await advanceLeaseRenewal(advanceAdapter, {
    landlordId: "team-1",
    renewalId: "ren-1",
  });
  assert.equal(step4.alreadyApplied, false);
  assert.equal(step4.previousEndDate, "2026-06-30");
  assert.equal(step4.newEndDate, "2027-07-01");

  const updatedContract = advanceAdapter.contracts.get("con-1");
  const updatedRenewal = advanceAdapter.renewals.get("ren-1");
  assert.equal(updatedContract.start_date, "2024-07-01");
  assert.equal(updatedContract.end_date, "2027-07-01");
  assert.equal(updatedRenewal.applied_to_contract, true);
  assert.equal(isReadyToAdvance(mapLeaseRenewal(updatedRenewal)), false);

  // 5. Repeat confirmation is idempotent.
  const step5 = await advanceLeaseRenewal(advanceAdapter, {
    landlordId: "team-1",
    renewalId: "ren-1",
  });
  assert.equal(step5.alreadyApplied, true);
  assert.equal(advanceAdapter.contracts.get("con-1").end_date, "2027-07-01");

  // 6. Next-year renewal term derivation walks the applied chain and preserves original_lease_date.
  const nextEffectiveEnd = pickEffectiveEndDate([updatedRenewal], updatedContract.end_date);
  assert.equal(nextEffectiveEnd, "2027-07-01");
  assert.deepEqual(deriveRenewalTerm(nextEffectiveEnd), {
    newTermStart: "2027-07-02",
    newTermEnd: "2028-07-02",
  });
  assert.equal(pickOriginalLeaseDate([updatedRenewal], updatedContract.start_date), "2024-07-01");
});

test("Phase 4 recovery: personal My Drive failure degrades safely on webhook and succeeds on manual retry after switching to Shared Drive", async () => {
  const propertyRow = {
    id: "prop-2",
    landlord_id: "team-1",
    address: "789 Pine Rd",
    drive_link: "https://drive.google.com/drive/folders/personal_folder",
  };
  const renewalRow = {
    id: "ren-2",
    landlord_id: "team-1",
    contract_id: "con-2",
    property_id: "prop-2",
    new_term_start: "2026-09-01",
    new_term_end: "2027-09-01",
    status: "signed",
    docuseal_submission_id: "702",
    signers: [
      { tenantId: "ten-2", email: "bob@example.com", submitterId: "71", order: 0, status: "completed", signedAt: "2026-05-01T00:00:00Z" },
      { tenantId: null, email: "owner@example.com", submitterId: "72", order: 1, status: "pending", signedAt: null },
    ],
    applied_to_contract: false,
    signed_document_url: null,
    document_id: null,
    filing_error: null,
  };
  const documents = [];

  const driveFetch = async (url) => {
    if (url.includes("/drive/v3/files/personal_folder")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "personal_folder",
          name: "789 Pine Rd",
          mimeType: "application/vnd.google-apps.folder",
        }),
      };
    }
    if (url.includes("/drive/v3/files/shared_pine_folder")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "shared_pine_folder",
          name: "789 Pine Rd",
          mimeType: "application/vnd.google-apps.folder",
          driveId: "0ADsharedPine",
        }),
      };
    }
    if (url.includes("/upload/drive/v3/files")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "gdrive-pdf-702",
          name: "Lease Renewal - 789 Pine Rd (2026-09-01 to 2027-09-01).pdf",
          webViewLink: "https://drive.google.com/file/d/gdrive-pdf-702/view",
        }),
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const store = {
    async getRenewalBySubmissionId() { return { ...renewalRow }; },
    async getProperty() { return { ...propertyRow }; },
    async getContract() { return { id: "con-2", unit: null }; },
    async findExistingRenewalDocument() { return null; },
    async insertDocument(row) {
      const inserted = { id: `doc-${documents.length + 1}`, ...row };
      documents.push(inserted);
      return inserted;
    },
    async updateRenewalState(_id, patch) { Object.assign(renewalRow, patch); },
    async updateRenewalFiling(_id, patch) { Object.assign(renewalRow, patch); },
  };

  const docuseal = {
    async getSignedDocuments() {
      return { documents: [{ name: "signed.pdf", url: "https://cdn.example.com/702.pdf" }] };
    },
    async downloadSignedPdf() {
      return { buffer: Buffer.from("%PDF-1.4\nbytes"), contentType: "application/pdf" };
    },
  };

  const drive = {
    async getAccessToken() { return "tok"; },
    uploadPdfToDriveFolder: (args) => uploadPdfToDriveFolder({ ...args, fetchImpl: driveFetch }),
  };

  const webhookRes = await processDocusealWebhook({
    event: { event_type: "form.completed", data: { id: 72, submission_id: 702, email: "owner@example.com" } },
    store,
    docuseal,
    drive,
  });
  assert.equal(webhookRes.status, 200);
  assert.equal(webhookRes.body.filed, false);
  assert.equal(renewalRow.status, "countersigned");
  assert.match(renewalRow.filing_error, /Shared Drive/i);

  // Landlord updates property Drive link to a Shared Drive folder and retries filing.
  propertyRow.drive_link = "https://drive.google.com/drive/folders/shared_pine_folder";
  const retryRes = await fileSignedRenewalToDrive({ renewal: renewalRow, store, docuseal, drive });
  assert.equal(retryRes.ok, true);
  assert.equal(retryRes.alreadyFiled, false);
  assert.equal(renewalRow.filing_error, null);
  assert.equal(renewalRow.signed_document_url, "https://drive.google.com/file/d/gdrive-pdf-702/view");
  assert.equal(documents.length, 1);
});
