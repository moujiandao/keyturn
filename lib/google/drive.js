// Shared Google Drive service-account client for reading property folders
// (sync-drive-folder) and uploading countersigned lease renewal PDFs (Phase 4A).
//
// Scopes: `drive.readonly` + `drive.file`.
// - `drive.readonly` lets the service account list pre-existing landlord PDFs
//   and inspect folder metadata (to confirm the destination is a Shared Drive).
// - `drive.file` elevates write access to create/upload app-created PDFs without
//   requesting broad `drive` scope.
//
// Shared Drive requirement: service accounts have no personal My Drive storage
// quota, so uploading into a regular shared My Drive folder fails with 403
// `storageQuotaExceeded`. We check `driveId` before uploading and also pass
// `supportsAllDrives=true` on all Drive v3 calls.
import crypto from "crypto";
import { GoogleAuth } from "google-auth-library";

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

const FOLDER_ID_RE = /^[a-zA-Z0-9_-]+$/;
const FOLDER_LINK_RE = /\/folders\/([a-zA-Z0-9_-]+)/;
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export class DriveUploadError extends Error {
  constructor(message, { code = "DRIVE_ERROR", status = 500 } = {}) {
    super(message);
    this.name = "DriveUploadError";
    this.code = code;
    this.status = status;
  }
}

export function extractDriveFolderId(driveLink) {
  if (typeof driveLink !== "string") return null;
  const match = driveLink.match(FOLDER_LINK_RE);
  return match ? match[1] : null;
}

export function parseServiceAccountCredentials(encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  if (!encoded || typeof encoded !== "string") {
    throw new DriveUploadError("GOOGLE_SERVICE_ACCOUNT_JSON env var is missing or invalid.", {
      code: "MISSING_CREDENTIALS",
      status: 500,
    });
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new DriveUploadError("GOOGLE_SERVICE_ACCOUNT_JSON env var is missing or invalid.", {
      code: "INVALID_CREDENTIALS",
      status: 500,
    });
  }
  if (!parsed?.client_email || !parsed?.private_key) {
    throw new DriveUploadError(
      "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.",
      { code: "INVALID_CREDENTIALS", status: 500 },
    );
  }
  return {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

export async function getDriveAccessToken({
  credentials,
  scopes = DRIVE_SCOPES,
  GoogleAuthClass = GoogleAuth,
} = {}) {
  const resolved = credentials || parseServiceAccountCredentials();
  const googleAuth = new GoogleAuthClass({
    credentials: {
      client_email: resolved.client_email,
      private_key: resolved.private_key,
    },
    scopes,
  });

  try {
    const client = await googleAuth.getClient();
    const tokenRes = await client.getAccessToken();
    const token = typeof tokenRes === "string" ? tokenRes : tokenRes?.token;
    if (!token) {
      throw new Error("empty access token");
    }
    return token;
  } catch (err) {
    throw new DriveUploadError(`Google authentication failed: ${err.message}`, {
      code: "AUTH_FAILED",
      status: 500,
    });
  }
}

function assertValidFolderId(folderId) {
  if (!folderId || typeof folderId !== "string" || !FOLDER_ID_RE.test(folderId)) {
    throw new DriveUploadError("Invalid Google Drive folder ID.", {
      code: "INVALID_FOLDER_ID",
      status: 400,
    });
  }
}

export async function listDriveFolderFiles(
  folderId,
  { accessToken, fetchImpl = fetch } = {},
) {
  assertValidFolderId(folderId);
  if (!accessToken) {
    throw new DriveUploadError("Google Drive access token is required.", {
      code: "AUTH_FAILED",
      status: 500,
    });
  }

  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const url =
    `https://www.googleapis.com/drive/v3/files?q=${query}` +
    "&fields=files(id,name,mimeType,webViewLink)&pageSize=100" +
    "&supportsAllDrives=true&includeItemsFromAllDrives=true";

  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new DriveUploadError(`Drive API error: ${errText}`, {
      code: "DRIVE_LIST_FAILED",
      status: res.status || 500,
    });
  }

  const data = await res.json();
  return data.files || [];
}

export async function inspectDriveFolder(
  folderId,
  { accessToken, fetchImpl = fetch } = {},
) {
  assertValidFolderId(folderId);
  if (!accessToken) {
    throw new DriveUploadError("Google Drive access token is required.", {
      code: "AUTH_FAILED",
      status: 500,
    });
  }

  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}` +
    "?fields=id,name,mimeType,driveId&supportsAllDrives=true";

  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new DriveUploadError(`Could not access Google Drive folder (${res.status}): ${errText}`, {
      code: res.status === 404 ? "FOLDER_NOT_FOUND" : "FOLDER_INSPECT_FAILED",
      status: res.status || 500,
    });
  }

  const data = await res.json();
  return {
    id: data.id,
    name: data.name || "",
    mimeType: data.mimeType || "",
    driveId: data.driveId || null,
    isFolder: data.mimeType === FOLDER_MIME_TYPE,
    isSharedDrive: Boolean(data.driveId),
  };
}

export function buildMultipartRelatedBody({
  metadata,
  contentBuffer,
  mimeType = "application/pdf",
  boundary = `keyturn_${crypto.randomBytes(12).toString("hex")}`,
}) {
  const binary = Buffer.isBuffer(contentBuffer)
    ? contentBuffer
    : Buffer.from(contentBuffer);

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, "utf8");

  return {
    boundary,
    contentType: `multipart/related; boundary=${boundary}`,
    body: Buffer.concat([preamble, binary, closing]),
  };
}

export async function uploadPdfToDriveFolder({
  folderId,
  fileName,
  pdfBuffer,
  accessToken,
  requireSharedDrive = true,
  fetchImpl = fetch,
} = {}) {
  assertValidFolderId(folderId);
  const cleanName = typeof fileName === "string" ? fileName.trim() : "";
  if (!cleanName) {
    throw new DriveUploadError("fileName is required.", {
      code: "INVALID_FILE_NAME",
      status: 400,
    });
  }
  const binary = Buffer.isBuffer(pdfBuffer)
    ? pdfBuffer
    : pdfBuffer instanceof Uint8Array
      ? Buffer.from(pdfBuffer)
      : null;
  if (!binary || binary.length === 0) {
    throw new DriveUploadError("pdfBuffer must be a non-empty Buffer or Uint8Array.", {
      code: "EMPTY_PDF",
      status: 400,
    });
  }
  if (!accessToken) {
    throw new DriveUploadError("Google Drive access token is required.", {
      code: "AUTH_FAILED",
      status: 500,
    });
  }

  if (requireSharedDrive) {
    const folder = await inspectDriveFolder(folderId, { accessToken, fetchImpl });
    if (!folder.isFolder) {
      throw new DriveUploadError("The property's Google Drive link does not point to a folder.", {
        code: "NOT_A_FOLDER",
        status: 422,
      });
    }
    if (!folder.isSharedDrive) {
      throw new DriveUploadError(
        "The property's Google Drive folder is in a personal My Drive, not a Shared Drive. Service accounts have no storage quota in My Drive; move the folder to a Shared Drive and update the property's Drive link.",
        { code: "SHARED_DRIVE_REQUIRED", status: 422 },
      );
    }
  }

  const { contentType, body } = buildMultipartRelatedBody({
    metadata: {
      name: cleanName,
      parents: [folderId],
      mimeType: "application/pdf",
    },
    contentBuffer: binary,
    mimeType: "application/pdf",
  });

  const url =
    "https://www.googleapis.com/upload/drive/v3/files" +
    "?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink";

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 403 && /storageQuotaExceeded/i.test(errText)) {
      throw new DriveUploadError(
        "Google Drive rejected the upload because service accounts have no My Drive storage quota. Move the property folder into a Shared Drive.",
        { code: "SHARED_DRIVE_REQUIRED", status: 422 },
      );
    }
    throw new DriveUploadError(`Google Drive upload failed (${res.status}): ${errText}`, {
      code: "UPLOAD_FAILED",
      status: res.status || 502,
    });
  }

  const uploaded = await res.json();
  const fileId = uploaded.id;
  const webViewLink =
    uploaded.webViewLink || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : null);

  if (!fileId || !webViewLink) {
    throw new DriveUploadError("Google Drive upload succeeded without returning a file ID or link.", {
      code: "UPLOAD_INCOMPLETE",
      status: 502,
    });
  }

  return {
    fileId,
    fileName: uploaded.name || cleanName,
    webViewLink,
  };
}
