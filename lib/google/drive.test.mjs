import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRIVE_SCOPES,
  DriveUploadError,
  extractDriveFolderId,
  parseServiceAccountCredentials,
  getDriveAccessToken,
  listDriveFolderFiles,
  inspectDriveFolder,
  buildMultipartRelatedBody,
  uploadPdfToDriveFolder,
} from "./drive.js";

test("DRIVE_SCOPES includes both drive.readonly and drive.file", () => {
  assert.ok(DRIVE_SCOPES.includes("https://www.googleapis.com/auth/drive.readonly"));
  assert.ok(DRIVE_SCOPES.includes("https://www.googleapis.com/auth/drive.file"));
});

test("extractDriveFolderId parses standard and query-bearing folder URLs", () => {
  assert.equal(
    extractDriveFolderId("https://drive.google.com/drive/folders/1AbC_def-987?usp=sharing"),
    "1AbC_def-987",
  );
  assert.equal(extractDriveFolderId("https://drive.google.com/file/d/abc123/view"), null);
  assert.equal(extractDriveFolderId(null), null);
});

test("parseServiceAccountCredentials decodes valid base64 JSON and rejects malformed input", () => {
  const encoded = Buffer.from(
    JSON.stringify({ client_email: "svc@proj.iam.gserviceaccount.com", private_key: "KEY" }),
  ).toString("base64");
  assert.deepEqual(parseServiceAccountCredentials(encoded), {
    client_email: "svc@proj.iam.gserviceaccount.com",
    private_key: "KEY",
  });

  assert.throws(() => parseServiceAccountCredentials(""), /missing or invalid/i);
  assert.throws(
    () => parseServiceAccountCredentials(Buffer.from("{}").toString("base64")),
    /client_email/,
  );
});

test("getDriveAccessToken requests elevated DRIVE_SCOPES by default", async () => {
  let capturedOptions = null;
  class FakeGoogleAuth {
    constructor(opts) {
      capturedOptions = opts;
    }
    async getClient() {
      return { getAccessToken: async () => ({ token: "tok-123" }) };
    }
  }

  const token = await getDriveAccessToken({
    credentials: { client_email: "svc@example.com", private_key: "KEY" },
    GoogleAuthClass: FakeGoogleAuth,
  });

  assert.equal(token, "tok-123");
  assert.deepEqual(capturedOptions.scopes, DRIVE_SCOPES);
});

test("listDriveFolderFiles passes supportsAllDrives and includeItemsFromAllDrives", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        files: [{ id: "f1", name: "lease.pdf", mimeType: "application/pdf", webViewLink: "https://drive/f1" }],
      }),
    };
  };

  const files = await listDriveFolderFiles("folder_123", {
    accessToken: "tok",
    fetchImpl,
  });

  assert.equal(files.length, 1);
  assert.match(calls[0].url, /supportsAllDrives=true/);
  assert.match(calls[0].url, /includeItemsFromAllDrives=true/);
  assert.equal(calls[0].opts.headers.Authorization, "Bearer tok");
});

test("inspectDriveFolder detects Shared Drive membership via driveId", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: "folder_1",
      name: "123 Main St",
      mimeType: "application/vnd.google-apps.folder",
      driveId: "0ADsharedDrive",
    }),
  });

  const info = await inspectDriveFolder("folder_1", { accessToken: "tok", fetchImpl });
  assert.equal(info.isFolder, true);
  assert.equal(info.isSharedDrive, true);
  assert.equal(info.driveId, "0ADsharedDrive");
});

test("buildMultipartRelatedBody packs JSON metadata and raw PDF bytes", () => {
  const pdf = Buffer.from("%PDF-1.4\nhello");
  const { contentType, body } = buildMultipartRelatedBody({
    metadata: { name: "renewal.pdf", parents: ["f1"], mimeType: "application/pdf" },
    contentBuffer: pdf,
    boundary: "test_boundary",
  });

  assert.equal(contentType, "multipart/related; boundary=test_boundary");
  const text = body.toString("utf8");
  assert.ok(text.includes("--test_boundary\r\nContent-Type: application/json; charset=UTF-8"));
  assert.ok(text.includes('"parents":["f1"]'));
  assert.ok(text.includes("Content-Type: application/pdf\r\n\r\n%PDF-1.4\nhello\r\n--test_boundary--"));
});

test("uploadPdfToDriveFolder blocks personal My Drive folders with SHARED_DRIVE_REQUIRED", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: "personal_folder",
      name: "My Folder",
      mimeType: "application/vnd.google-apps.folder",
      // no driveId -> personal My Drive
    }),
  });

  await assert.rejects(
    () =>
      uploadPdfToDriveFolder({
        folderId: "personal_folder",
        fileName: "renewal.pdf",
        pdfBuffer: Buffer.from("%PDF-1.4"),
        accessToken: "tok",
        fetchImpl,
      }),
    (err) => err instanceof DriveUploadError && err.code === "SHARED_DRIVE_REQUIRED",
  );
});

test("uploadPdfToDriveFolder uploads multipart PDF to a verified Shared Drive folder", async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: "shared_folder",
          name: "123 Main St",
          mimeType: "application/vnd.google-apps.folder",
          driveId: "0ADsharedDrive",
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "uploaded_file_99",
        name: "Lease Renewal - 123 Main St.pdf",
        webViewLink: "https://drive.google.com/file/d/uploaded_file_99/view",
      }),
    };
  };

  const result = await uploadPdfToDriveFolder({
    folderId: "shared_folder",
    fileName: "Lease Renewal - 123 Main St.pdf",
    pdfBuffer: Buffer.from("%PDF-1.4\nbody"),
    accessToken: "tok",
    fetchImpl,
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /upload\/drive\/v3\/files\?uploadType=multipart&supportsAllDrives=true/);
  assert.equal(calls[1].opts.method, "POST");
  assert.match(calls[1].opts.headers["Content-Type"], /^multipart\/related; boundary=/);
  assert.deepEqual(result, {
    fileId: "uploaded_file_99",
    fileName: "Lease Renewal - 123 Main St.pdf",
    webViewLink: "https://drive.google.com/file/d/uploaded_file_99/view",
  });
});

test("uploadPdfToDriveFolder translates Google 403 storageQuotaExceeded to SHARED_DRIVE_REQUIRED", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    text: async () => '{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}',
  });

  await assert.rejects(
    () =>
      uploadPdfToDriveFolder({
        folderId: "folder_1",
        fileName: "renewal.pdf",
        pdfBuffer: Buffer.from("%PDF-1.4"),
        accessToken: "tok",
        requireSharedDrive: false,
        fetchImpl,
      }),
    (err) => err instanceof DriveUploadError && err.code === "SHARED_DRIVE_REQUIRED",
  );
});
