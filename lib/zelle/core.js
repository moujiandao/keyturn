// Zelle mutation core (React-free, adapter-injected).
// Houses both the server-side Undo / triage / split / alias invariants and
// the thin client operations consumed by useZelleMutations().

import { isPaidRent } from "../payments/status.js";

function makeError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeMonthStart(monthInput) {
  if (!monthInput) return null;
  const s = String(monthInput).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(0, 7)}-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return null;
}

function normalizePositiveAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Server-side Undo for an auto_posted Zelle event.
 * - Safe & idempotent: if already undone to needs_review with no posted payments,
 *   returns ok with removedPaymentIds: [].
 * - Deletes ONLY payment rows listed in posted_payment_ids that belong to the
 *   same landlord team AND carry zelle_event_id === eventId.
 */
export async function undoZelleAutoPost(deps, { landlordId, eventId }) {
  if (!landlordId) throw makeError("undoZelleAutoPost: landlordId is required", 400);
  if (!eventId) throw makeError("undoZelleAutoPost: eventId is required", 400);

  const event = await deps.getEvent(eventId);
  if (!event) throw makeError("Zelle event not found.", 404);
  if (event.landlord_id !== landlordId) {
    throw makeError("You do not have access to this Zelle event.", 403);
  }

  const postedIds = Array.isArray(event.posted_payment_ids)
    ? event.posted_payment_ids.filter(Boolean)
    : [];

  if (
    event.status === "needs_review" &&
    postedIds.length === 0 &&
    event.match_reason === "undone_by_landlord"
  ) {
    return { event, removedPaymentIds: [], alreadyUndone: true };
  }

  if (event.status !== "auto_posted") {
    throw makeError(
      `Only auto-posted events can be undone (current status: ${event.status}).`,
      409
    );
  }

  let removedPaymentIds = [];
  if (postedIds.length > 0) {
    removedPaymentIds = await deps.deleteLinkedPayments({
      landlordId,
      eventId,
      paymentIds: postedIds,
    });
  }

  const updated = await deps.updateEvent(eventId, {
    status: "needs_review",
    match_reason: "undone_by_landlord",
    posted_payment_ids: [],
    resolved_at: null,
    resolved_by: null,
  });

  return { event: updated, removedPaymentIds, alreadyUndone: false };
}

/**
 * Server-side resolution for a Needs Review Zelle event.
 * Supported actions:
 * - confirm_rent: insert 1 completed recurring rent payment
 * - link_existing: attach event to an existing payment row without duplicating
 * - confirm_other: insert 1 completed one-time deposit/other payment
 * - acknowledge_parking: mark acknowledged in inbox (no payments write)
 * - ignore: mark ignored (no payments write)
 */
export async function resolveZelleEvent(
  deps,
  {
    landlordId,
    authId = null,
    eventId,
    action,
    tenantId = null,
    contractId = null,
    targetMonth = null,
    amount = null,
    category = null,
    paymentId = null,
    now = new Date(),
  }
) {
  if (!landlordId) throw makeError("resolveZelleEvent: landlordId is required", 400);
  if (!eventId) throw makeError("resolveZelleEvent: eventId is required", 400);

  const event = await deps.getEvent(eventId);
  if (!event) throw makeError("Zelle event not found.", 404);
  if (event.landlord_id !== landlordId) {
    throw makeError("You do not have access to this Zelle event.", 403);
  }
  if (event.status !== "needs_review") {
    throw makeError(`Event is already resolved (status: ${event.status}).`, 409);
  }

  const resolvedAt = now.toISOString();
  const paidDate =
    event.sent_on ||
    (event.received_at ? String(event.received_at).slice(0, 10) : resolvedAt.slice(0, 10));

  if (action === "ignore") {
    const updated = await deps.updateEvent(eventId, {
      status: "ignored",
      category: "ignore",
      posted_payment_ids: [],
      resolved_at: resolvedAt,
      resolved_by: authId,
    });
    return { event: updated, createdPayments: [] };
  }

  if (action === "acknowledge_parking") {
    const updated = await deps.updateEvent(eventId, {
      status: "acknowledged",
      category: "parking",
      posted_payment_ids: [],
      resolved_at: resolvedAt,
      resolved_by: authId,
    });
    return { event: updated, createdPayments: [] };
  }

  if (action === "link_existing") {
    if (!paymentId) throw makeError("paymentId is required to link an existing payment.", 400);
    const existing = await deps.getPayment(paymentId);
    if (!existing) throw makeError("Existing payment not found.", 404);
    if (existing.landlord_id !== landlordId) {
      throw makeError("You do not have access to this payment.", 403);
    }

    const paymentPatch = { zelle_event_id: eventId };
    if (!existing.payment_method) paymentPatch.payment_method = "zelle";
    await deps.updatePayment(paymentId, paymentPatch);

    const updated = await deps.updateEvent(eventId, {
      status: "linked",
      category: category || event.category || "rent",
      target_month: normalizeMonthStart(targetMonth) || existing.due_date || event.target_month,
      posted_payment_ids: [paymentId],
      resolved_at: resolvedAt,
      resolved_by: authId,
    });
    return { event: updated, createdPayments: [], linkedPaymentId: paymentId };
  }

  if (action === "confirm_other") {
    const cat = category === "deposit" ? "deposit" : "other";
    if (!tenantId) throw makeError("Select a tenant before logging this payment.", 400);
    const tenant = await deps.getTenant(tenantId);
    if (!tenant || tenant.landlord_id !== landlordId) {
      throw makeError("Selected tenant does not belong to this team.", 403);
    }
    const finalAmount = normalizePositiveAmount(amount ?? event.amount);
    if (finalAmount == null) throw makeError("A positive payment amount is required.", 400);

    const dueDate = normalizeMonthStart(targetMonth) || paidDate;
    const inserted = await deps.insertPayments([
      {
        landlord_id: landlordId,
        tenant_id: tenantId,
        contract_id: contractId || null,
        amount: finalAmount,
        due_date: dueDate,
        paid_date: paidDate,
        status: "completed",
        type: "one-time",
        payment_method: "zelle",
        category: cat,
        zelle_event_id: eventId,
      },
    ]);
    const paymentIds = inserted.map((p) => p.id);
    const updated = await deps.updateEvent(eventId, {
      status: "confirmed",
      category: cat,
      target_month: normalizeMonthStart(targetMonth) || event.target_month,
      posted_payment_ids: paymentIds,
      resolved_at: resolvedAt,
      resolved_by: authId,
    });
    return { event: updated, createdPayments: inserted };
  }

  if (action === "confirm_rent") {
    if (!tenantId) throw makeError("Select a tenant before confirming rent.", 400);
    const tenant = await deps.getTenant(tenantId);
    if (!tenant || tenant.landlord_id !== landlordId) {
      throw makeError("Selected tenant does not belong to this team.", 403);
    }
    const monthStart = normalizeMonthStart(targetMonth || event.target_month);
    if (!monthStart) throw makeError("A valid target month is required.", 400);

    const finalAmount = normalizePositiveAmount(amount ?? event.amount);
    if (finalAmount == null) throw makeError("A positive payment amount is required.", 400);

    // Prevent accidental duplicate rent rows for the same tenant and month.
    const existingForTenant = await deps.getTenantPayments(landlordId, tenantId);
    const monthPrefix = monthStart.slice(0, 7);
    const duplicateRent = (existingForTenant || []).find(
      (p) => isPaidRent(p) && String(p.due_date || "").slice(0, 7) === monthPrefix
    );
    if (duplicateRent) {
      throw makeError(
        "This tenant already has a completed rent payment for that month. Use Link to Existing Payment instead.",
        409
      );
    }

    const inserted = await deps.insertPayments([
      {
        landlord_id: landlordId,
        tenant_id: tenantId,
        contract_id: contractId || null,
        amount: finalAmount,
        due_date: monthStart,
        paid_date: paidDate,
        status: "completed",
        type: "recurring",
        payment_method: "zelle",
        category: "rent",
        zelle_event_id: eventId,
      },
    ]);
    const paymentIds = inserted.map((p) => p.id);
    const updated = await deps.updateEvent(eventId, {
      status: "confirmed",
      category: "rent",
      target_month: monthStart,
      posted_payment_ids: paymentIds,
      resolved_at: resolvedAt,
      resolved_by: authId,
    });
    return { event: updated, createdPayments: inserted };
  }

  throw makeError(`Unsupported resolution action: ${action}`, 400);
}

/**
 * Client-side mutations.
 */
export async function undoZelleEvent(adapter, eventId) {
  if (!eventId) throw makeError("undoZelleEvent: eventId is required", 400);
  return adapter.undoEvent(eventId);
}

export async function resolveZelleEventClient(adapter, payload) {
  if (!payload?.eventId) throw makeError("resolveZelleEvent: eventId is required", 400);
  if (!payload?.action) throw makeError("resolveZelleEvent: action is required", 400);
  return adapter.resolveEvent(payload);
}
