// Deterministic Chase Zelle alert email parser.
// Grounded on Chase's HTML-only Zelle received-money alert template
// (`text/html; charset=UTF-8`, headline + 2-column details table) with plain-text
// and Gmail-forward fallbacks.

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function normalizePayerName(name) {
  if (!name) return "";
  return String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlEntities(input) {
  if (!input) return "";
  return String(input)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&reg;/gi, "®")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    });
}

export function stripHtmlToText(html) {
  if (!html) return "";
  const cleaned = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(tr|table)\b[^>]*>/gi, "\n")
    .replace(/<\/(tr|p|div|h[1-6]|li|table)>/gi, "\n")
    .replace(/<\/td>\s*<td\b[^>]*>/gi, ": ")
    .replace(/<[^>]+>/g, " ");

  const decoded = decodeHtmlEntities(cleaned);
  return decoded
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripForwardingHeader(text) {
  if (!text) return "";
  return String(text)
    .replace(/^[- ]*Forwarded message[- ]*$/gim, "")
    .trim();
}

export function parseDollarAmount(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function parseChaseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Mon DD, YYYY or Month DD, YYYY (e.g., "Nov 16, 2026")
  const named = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = Number(named[3]);
    if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // MM/DD/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

function extractHtmlTableFields(html) {
  const fields = {};
  if (!html) return fields;
  // Match innermost <tr> rows only so outer layout tables wrapping the details
  // table never swallow the first row (Amount).
  const rowRe = /<tr\b[^>]*>((?:(?!<tr\b)[\s\S])*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    const cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      const cellText = decodeHtmlEntities(cellMatch[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      cells.push(cellText);
    }
    if (cells.length === 2 && cells[0] && cells[1]) {
      const label = cells[0].toLowerCase().replace(/:$/, "").trim();
      if (["amount", "sent on", "transaction number", "memo"].includes(label)) {
        fields[label] = cells[1];
      }
    }
  }
  return fields;
}

function extractTextFields(plainText) {
  const fields = {};
  if (!plainText) return fields;
  const patterns = [
    ["amount", /^amount\s*:?\s*(.+)$/im],
    ["sent on", /^sent\s+on\s*:?\s*(.+)$/im],
    ["transaction number", /^transaction\s+number\s*:?\s*(.+)$/im],
    ["memo", /^memo\s*:?\s*(.+)$/im],
  ];
  for (const [key, re] of patterns) {
    const m = plainText.match(re);
    if (m && m[1].trim()) {
      fields[key] = m[1].trim();
    }
  }
  return fields;
}

function extractPayerName(html, plainText) {
  if (html) {
    const h1Re = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
    let m;
    while ((m = h1Re.exec(html)) !== null) {
      const heading = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      const sentMatch = heading.match(/^(.+?)\s+sent\s+you\s+money$/i);
      if (sentMatch) return sentMatch[1].trim();
    }
  }

  if (plainText) {
    const lineMatch = plainText.match(/^([^\n:]{2,120}?)\s+sent\s+you\s+money\b/im);
    if (lineMatch) return lineMatch[1].trim();

    const bodyMatch = plainText.match(
      /^([^\n:]{2,120}?)\s+is\s+registered\s+with\s+a\s+Zelle/im
    );
    if (bodyMatch) return bodyMatch[1].trim();
  }

  return null;
}

function detectDirection({ subject, html, plainText }) {
  const subj = String(subject || "").trim();
  const titleMatch = html ? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) : null;
  const title = titleMatch ? titleMatch[1].trim().toLowerCase() : "";

  // Check explicit sent-money subject/title first so an outgoing transfer whose
  // memo mentions "sent you money" is never misclassified as received.
  if (
    /you\s+sent\s+money\s+with\s+zelle/i.test(subj) ||
    /zelle_.*sender/i.test(title)
  ) {
    return "sent";
  }

  if (
    /you\s+received\s+money\s+with\s+zelle/i.test(subj) ||
    title.includes("zelle_auto_accept_receiver") ||
    /sent\s+you\s+money/i.test(plainText || "")
  ) {
    return "received";
  }

  if (/you\s+sent\s+\$/i.test(plainText || "")) {
    return "sent";
  }

  return "unknown";
}

function normalizeMessageId(messageId) {
  if (!messageId) return null;
  const cleaned = String(messageId).trim().replace(/^<|>$/g, "").trim();
  return cleaned || null;
}

/**
 * Parse a Chase Zelle alert email (HTML-first, plain-text fallback).
 * Always returns a structured object so callers can store raw_body + parse_notes
 * even when deterministic extraction fails.
 */
export function parseChaseZelleEmail({
  from = "",
  subject = "",
  html = "",
  text = "",
  receivedAt = null,
  messageId = null,
  resendEmailId = null,
} = {}) {
  const strippedFromHtml = html ? stripHtmlToText(html) : "";
  const cleanedText = stripForwardingHeader(text || "");
  const plainText = strippedFromHtml || cleanedText;

  // Compact audit body: truncate Chase's long legal disclosure footer if present.
  const rawBody = (() => {
    const idx = plainText.indexOf("ABOUT THIS MESSAGE");
    const trimmed = idx > 0 ? plainText.slice(0, idx).trim() : plainText;
    return trimmed.slice(0, 8000);
  })();

  const direction = detectDirection({ subject, html, plainText });
  const htmlFields = extractHtmlTableFields(html);
  const textFields = extractTextFields(plainText);
  const fields = { ...textFields, ...htmlFields };

  const payerName = extractPayerName(html, plainText);
  const payerNameNormalized = normalizePayerName(payerName);
  const amount = parseDollarAmount(fields.amount);
  const sentOn = parseChaseDate(fields["sent on"]);
  const zelleTxnId = fields["transaction number"]
    ? fields["transaction number"].replace(/\s+/g, "").trim()
    : null;
  const memo = fields.memo ? fields.memo.trim() : null;

  const normMsgId = normalizeMessageId(messageId);
  const dedupeKey = zelleTxnId
    ? `chase:${zelleTxnId}`
    : normMsgId
      ? `msg:${normMsgId}`
      : resendEmailId
        ? `resend:${resendEmailId}`
        : null;

  const missing = [];
  if (direction === "received") {
    if (!payerName) missing.push("payer_name");
    if (amount == null) missing.push("amount");
    if (!sentOn && !receivedAt) missing.push("date");
  }

  const ok = direction === "received" && missing.length === 0;
  const parseSource = direction === "sent" ? "rules" : ok ? "rules" : "failed";
  const parseNotes =
    direction === "sent"
      ? "Outgoing Chase Zelle transfer alert"
      : ok
        ? null
        : direction === "unknown"
          ? "Unrecognized Chase Zelle email format"
          : `Missing required fields: ${missing.join(", ")}`;

  return {
    ok,
    bank: "chase",
    direction,
    payerName,
    payerNameNormalized,
    amount,
    sentOn,
    memo,
    zelleTxnId,
    dedupeKey,
    rawBody,
    parseSource,
    parseNotes,
    from: String(from || "").trim() || null,
    subject: String(subject || "").trim() || null,
    receivedAt: receivedAt || null,
  };
}
