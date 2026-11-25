// Adapter-injected Zelle inbound email ingestion pipeline.
// Keeps webhook handling pure and testable without network or Supabase calls.

import { parseChaseZelleEmail } from "./parser.js";
import { classifyZelleMemo, resolveTargetMonth } from "./classifier.js";
import { matchAndDecideZelleEvent } from "./matcher.js";

/**
 * Extract the high-entropy landlord token from a `zelle+<token>@domain` address.
 */
export function extractZelleTokenFromAddresses(addrs) {
  for (const entry of [].concat(addrs || [])) {
    const raw = String(entry?.address || entry || "");
    const m = raw.match(/zelle\+([a-zA-Z0-9_-]{8,128})@/i);
    if (m) return m[1];
  }
  return null;
}

/**
 * Process one inbound Resend `email.received` event routed to a Zelle token.
 *
 * deps:
 * - findLandlordByToken(token) -> Promise<string | null>
 * - findEventByResendEmailId(resendEmailId) -> Promise<{ id } | null>
 * - findEventByDedupeKey(landlordId, dedupeKey) -> Promise<{ id } | null>
 * - fetchReceivedEmail(resendEmailId) -> Promise<{ from, subject, html, text, headers, message_id, created_at }>
 * - loadLandlordContext(landlordId) -> Promise<{ tenants, properties, contracts, payments, parkingLeases, units, aliases }>
 * - insertZelleEvent(row) -> Promise<{ event, duplicate }>
 * - insertPayments(rows) -> Promise<Array<{ id }>>
 * - updateZelleEvent(id, patch) -> Promise<void>
 * - fallbackParse?(payload) -> Promise<object | null>  (optional LLM fallback)
 */
export async function ingestZelleEmail(
  deps,
  { token, resendEmailId, webhookData = {}, today = new Date() }
) {
  if (!token) {
    return { status: "ignored", note: "missing zelle inbound token" };
  }

  const landlordId = await deps.findLandlordByToken(token);
  if (!landlordId) {
    return { status: "ignored", note: "unknown zelle inbound token" };
  }

  if (resendEmailId) {
    const existingByResend = await deps.findEventByResendEmailId(resendEmailId);
    if (existingByResend) {
      return { status: "duplicate", eventId: existingByResend.id, note: "duplicate resend_email_id" };
    }
  }

  // Resend's email.received webhook is metadata-only; fetch full HTML/text/headers.
  const fetched = resendEmailId && deps.fetchReceivedEmail
    ? await deps.fetchReceivedEmail(resendEmailId)
    : webhookData;

  const emailFrom = fetched?.from || webhookData?.from || "";
  const emailSubject = fetched?.subject || webhookData?.subject || "";
  const receivedAt = fetched?.created_at || webhookData?.created_at || today.toISOString();
  const messageId = fetched?.message_id || webhookData?.message_id || null;
  const rawHeaders = fetched?.headers || {};

  let parsed = parseChaseZelleEmail({
    from: emailFrom,
    subject: emailSubject,
    html: fetched?.html || "",
    text: fetched?.text || "",
    receivedAt,
    messageId,
    resendEmailId,
  });

  let classification = classifyZelleMemo(parsed.memo, parsed.direction);
  let targetMonth = resolveTargetMonth({
    memo: parsed.memo,
    sentOn: parsed.sentOn,
    receivedAt,
  });

  // Optional LLM fallback (wired in Ticket #24): only runs on parse failure or
  // ambiguous non-empty memo, and always marks parseSource = 'llm' (never auto-posts).
  const needsFallback =
    typeof deps.fallbackParse === "function" &&
    parsed.direction !== "sent" &&
    (!parsed.ok || classification.ambiguous);

  if (needsFallback) {
    try {
      const llm = await deps.fallbackParse({
        subject: emailSubject,
        rawBody: parsed.rawBody,
        parsed,
        classification,
      });
      if (llm) {
        const mergedDirection =
          llm.direction && llm.direction !== "unknown" ? llm.direction : parsed.direction;
        const mergedMemo = llm.memo ?? parsed.memo;
        parsed = {
          ...parsed,
          direction: mergedDirection,
          payerName: llm.payerName ?? parsed.payerName,
          payerNameNormalized: llm.payerNameNormalized ?? parsed.payerNameNormalized,
          amount: llm.amount ?? parsed.amount,
          sentOn: llm.sentOn ?? parsed.sentOn,
          memo: mergedMemo,
          parseSource: "llm",
          parseNotes: llm.notes || parsed.parseNotes || "Parsed via Claude Haiku fallback",
          ok: Boolean(
            mergedDirection === "received" &&
            (llm.payerName ?? parsed.payerName) &&
            (llm.amount ?? parsed.amount) > 0
          ),
        };
        if (llm.category) {
          classification = {
            category: llm.category,
            ambiguous: false,
            reason: "llm_classified",
          };
        }
        if (llm.targetMonth) {
          targetMonth = llm.targetMonth;
        }
      }
    } catch (err) {
      parsed = {
        ...parsed,
        parseNotes: [parsed.parseNotes, `LLM fallback failed: ${err?.message || "unknown error"}`]
          .filter(Boolean)
          .join("; "),
      };
    }
  }

  const dedupeKey = parsed.dedupeKey || `resend:${resendEmailId || Date.now()}`;
  const existingByKey = await deps.findEventByDedupeKey(landlordId, dedupeKey);
  if (existingByKey) {
    return { status: "duplicate", eventId: existingByKey.id, note: "duplicate dedupe_key" };
  }

  const ctx = await deps.loadLandlordContext(landlordId);
  const decision = matchAndDecideZelleEvent({
    parsed: { ...parsed, dedupeKey },
    classification,
    targetMonth,
    tenants: ctx.tenants || [],
    properties: ctx.properties || [],
    contracts: ctx.contracts || [],
    payments: ctx.payments || [],
    parkingLeases: ctx.parkingLeases || [],
    units: ctx.units || [],
    aliases: ctx.aliases || [],
    today,
  });

  const eventRow = {
    landlord_id: landlordId,
    resend_email_id: resendEmailId || null,
    dedupe_key: dedupeKey,
    email_from: parsed.from,
    email_subject: parsed.subject,
    received_at: receivedAt,
    raw_body: parsed.rawBody,
    raw_headers: rawHeaders,
    bank: parsed.bank,
    direction: parsed.direction,
    payer_name: parsed.payerName,
    payer_name_normalized: parsed.payerNameNormalized || null,
    amount: parsed.amount,
    sent_on: parsed.sentOn,
    memo: parsed.memo,
    zelle_txn_id: parsed.zelleTxnId,
    parse_source: parsed.parseSource,
    parse_notes: parsed.parseNotes,
    category: classification.category,
    target_month: targetMonth,
    suggested_tenant_ids: decision.suggestedTenantIds,
    suggested_contract_id: decision.suggestedContractId,
    match_reason: decision.matchReason,
    status: decision.status,
    posted_payment_ids: [],
    resolved_at: decision.status === "auto_posted" ? today.toISOString() : null,
  };

  const { event, duplicate } = await deps.insertZelleEvent(eventRow);
  if (duplicate) {
    return { status: "duplicate", eventId: event?.id ?? null, note: "duplicate on insert" };
  }

  if (decision.status === "auto_posted" && decision.paymentsToInsert.length > 0) {
    try {
      const paymentRows = decision.paymentsToInsert.map((p) => ({
        ...p,
        landlord_id: landlordId,
        zelle_event_id: event.id,
      }));
      const insertedPayments = await deps.insertPayments(paymentRows);
      const postedIds = (insertedPayments || []).map((p) => p.id);
      await deps.updateZelleEvent(event.id, { posted_payment_ids: postedIds });
      return {
        status: "auto_posted",
        eventId: event.id,
        postedPaymentIds: postedIds,
        matchReason: decision.matchReason,
      };
    } catch (err) {
      // Never leave an event marked auto_posted if the payment insert failed.
      await deps.updateZelleEvent(event.id, {
        status: "needs_review",
        match_reason: "auto_post_failed",
        parse_notes: [parsed.parseNotes, `Auto-post failed: ${err?.message || "unknown error"}`]
          .filter(Boolean)
          .join("; "),
        resolved_at: null,
      });
      return {
        status: "needs_review",
        eventId: event.id,
        matchReason: "auto_post_failed",
      };
    }
  }

  return {
    status: decision.status,
    eventId: event.id,
    matchReason: decision.matchReason,
  };
}
