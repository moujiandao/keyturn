// Zelle mutation core (React-free, adapter-injected).
// Houses both the server-side Undo / triage / split / alias invariants and
// the thin client operations consumed by useZelleMutations().

import { isPaidRent } from "../payments/status.js";
import { normalizePayerName } from "./parser.js";
import { expectedMonthlyRent } from "./matcher.js";

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
    splits = null,
    rememberAlias = false,
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
    let savedAlias = null;
    if (rememberAlias && event.payer_name && existing.tenant_id && deps.upsertAlias) {
      savedAlias = await saveZellePayerAlias(deps, {
        landlordId,
        payerName: event.payer_name,
        tenantId: existing.tenant_id,
      });
    }
    return { event: updated, createdPayments: [], linkedPaymentId: paymentId, savedAlias };
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
    let savedAlias = null;
    if (rememberAlias && event.payer_name && deps.upsertAlias) {
      savedAlias = await saveZellePayerAlias(deps, {
        landlordId,
        payerName: event.payer_name,
        tenantId,
      });
    }
    return { event: updated, createdPayments: inserted, savedAlias };
  }

  if (action === "confirm_split") {
    if (!contractId) throw makeError("Select a shared lease before splitting rent.", 400);
    const contract = await deps.getContract(contractId);
    if (!contract || contract.landlord_id !== landlordId) {
      throw makeError("Selected lease does not belong to this team.", 403);
    }
    const monthStart = normalizeMonthStart(targetMonth || event.target_month);
    if (!monthStart) throw makeError("A valid target month is required.", 400);

    const list = Array.isArray(splits) ? splits : [];
    if (list.length < 2) {
      throw makeError("A lease split requires at least two tenants.", 400);
    }
    const seenTenants = new Set();
    const normalizedSplits = [];
    let splitSum = 0;
    for (const item of list) {
      const tid = item?.tenantId;
      const amt = normalizePositiveAmount(item?.amount);
      if (!tid || amt == null) {
        throw makeError("Every split row requires a tenant and a positive amount.", 400);
      }
      if (seenTenants.has(tid)) {
        throw makeError("Each tenant can appear only once in a split.", 400);
      }
      seenTenants.add(tid);
      const ten = await deps.getTenant(tid);
      if (!ten || ten.landlord_id !== landlordId) {
        throw makeError("One or more split tenants do not belong to this team.", 403);
      }
      const existing = await deps.getTenantPayments(landlordId, tid);
      const monthPrefix = monthStart.slice(0, 7);
      if ((existing || []).some((p) => isPaidRent(p) && String(p.due_date || "").slice(0, 7) === monthPrefix)) {
        throw makeError("One or more tenants in this split already have a completed rent payment for that month.", 409);
      }
      splitSum = Math.round((splitSum + amt) * 100) / 100;
      normalizedSplits.push({ tenantId: tid, amount: amt });
    }

    const expectedSum = normalizePositiveAmount(amount ?? event.amount);
    if (expectedSum != null && Math.abs(splitSum - expectedSum) >= 0.01) {
      throw makeError(
        `Split total ($${splitSum.toFixed(2)}) must equal the transfer amount ($${expectedSum.toFixed(2)}).`,
        400
      );
    }

    const rows = normalizedSplits.map((s) => ({
      landlord_id: landlordId,
      tenant_id: s.tenantId,
      contract_id: contractId,
      amount: s.amount,
      due_date: monthStart,
      paid_date: paidDate,
      status: "completed",
      type: "recurring",
      payment_method: "zelle",
      category: "rent",
      zelle_event_id: eventId,
    }));

    const inserted = await deps.insertPayments(rows);
    const paymentIds = inserted.map((p) => p.id);
    const updated = await deps.updateEvent(eventId, {
      status: "confirmed",
      category: "rent",
      target_month: monthStart,
      suggested_tenant_ids: normalizedSplits.map((s) => s.tenantId),
      suggested_contract_id: contractId,
      posted_payment_ids: paymentIds,
      resolved_at: resolvedAt,
      resolved_by: authId,
    });

    let savedAlias = null;
    if (rememberAlias && event.payer_name && deps.upsertAlias) {
      savedAlias = await saveZellePayerAlias(deps, {
        landlordId,
        payerName: event.payer_name,
        contractId,
      });
    }
    return { event: updated, createdPayments: inserted, savedAlias };
  }

  throw makeError(`Unsupported resolution action: ${action}`, 400);
}

/**
 * Group multiple Needs Review rent events for the same single tenant + month
 * (e.g. bank daily-limit partial splits) and compare running sum vs expected rent.
 */
export function findPartialRentGroups({ events = [], tenants = [], parkingLeases = [], today = new Date() }) {
  const tenantsById = new Map((tenants || []).map((t) => [t.id, t]));
  const buckets = new Map();

  for (const ev of events || []) {
    if (ev.status !== "needs_review") continue;
    if ((ev.category || "rent") !== "rent") continue;
    if (!(Number(ev.amount) > 0)) continue;
    const suggested = ev.suggestedTenantIds || ev.suggested_tenant_ids || [];
    if (suggested.length !== 1) continue;
    const tenantId = suggested[0];
    const targetMonth = ev.targetMonth || ev.target_month;
    if (!targetMonth) continue;
    const monthKey = String(targetMonth).slice(0, 7);
    const key = `${tenantId}::${monthKey}`;
    if (!buckets.has(key)) {
      buckets.set(key, { key, tenantId, monthKey, targetMonth: `${monthKey}-01`, events: [] });
    }
    buckets.get(key).events.push(ev);
  }

  const groups = [];
  for (const group of buckets.values()) {
    if (group.events.length < 2) continue;
    const tenant = tenantsById.get(group.tenantId) || null;
    const runningTotal = Math.round(
      group.events.reduce((sum, e) => sum + Number(e.amount || 0), 0) * 100
    ) / 100;
    const expectedTotal = tenant ? expectedMonthlyRent(tenant, parkingLeases, today) : 0;
    const remaining = Math.max(0, Math.round((expectedTotal - runningTotal) * 100) / 100);
    groups.push({
      ...group,
      tenant,
      runningTotal,
      expectedTotal,
      remaining,
      meetsExpected: expectedTotal > 0 && runningTotal + 0.005 >= expectedTotal,
    });
  }
  return groups;
}

/**
 * Confirm a group of partial Needs Review Zelle events into one consolidated
 * completed rent payment for (tenantId, targetMonth).
 */
export async function confirmPartialZelleGroup(
  deps,
  { landlordId, authId = null, eventIds = [], tenantId, contractId = null, targetMonth, now = new Date() }
) {
  if (!landlordId) throw makeError("confirmPartialZelleGroup: landlordId is required", 400);
  const uniqueIds = [...new Set((eventIds || []).filter(Boolean))];
  if (uniqueIds.length < 2) {
    throw makeError("At least two partial Zelle events are required to confirm a group.", 400);
  }
  if (!tenantId) throw makeError("Select a tenant before confirming this group.", 400);
  const monthStart = normalizeMonthStart(targetMonth);
  if (!monthStart) throw makeError("A valid target month is required.", 400);

  const tenant = await deps.getTenant(tenantId);
  if (!tenant || tenant.landlord_id !== landlordId) {
    throw makeError("Selected tenant does not belong to this team.", 403);
  }

  const events = await deps.getEventsByIds(landlordId, uniqueIds);
  if (events.length !== uniqueIds.length) {
    throw makeError("One or more selected Zelle events were not found.", 404);
  }
  for (const ev of events) {
    if (ev.status !== "needs_review") {
      throw makeError(`Event ${ev.id} is already resolved (status: ${ev.status}).`, 409);
    }
    if (normalizePositiveAmount(ev.amount) == null) {
      throw makeError(`Event ${ev.id} has no valid positive amount.`, 400);
    }
  }

  const existing = await deps.getTenantPayments(landlordId, tenantId);
  const monthPrefix = monthStart.slice(0, 7);
  if ((existing || []).some((p) => isPaidRent(p) && String(p.due_date || "").slice(0, 7) === monthPrefix)) {
    throw makeError("This tenant already has a completed rent payment for that month.", 409);
  }

  const totalAmount = Math.round(
    events.reduce((sum, ev) => sum + Number(ev.amount), 0) * 100
  ) / 100;
  const resolvedAt = now.toISOString();
  const dates = events
    .map((ev) => ev.sent_on || (ev.received_at ? String(ev.received_at).slice(0, 10) : null))
    .filter(Boolean)
    .sort();
  const paidDate = dates[dates.length - 1] || resolvedAt.slice(0, 10);
  const primaryEvent = events[0];

  const inserted = await deps.insertPayments([
    {
      landlord_id: landlordId,
      tenant_id: tenantId,
      contract_id: contractId || null,
      amount: totalAmount,
      due_date: monthStart,
      paid_date: paidDate,
      status: "completed",
      type: "recurring",
      payment_method: "zelle",
      category: "rent",
      zelle_event_id: primaryEvent.id,
    },
  ]);
  const payment = inserted[0];

  const updatedEvents = [];
  for (const ev of events) {
    const upd = await deps.updateEvent(ev.id, {
      status: "confirmed",
      category: "rent",
      target_month: monthStart,
      suggested_tenant_ids: [tenantId],
      posted_payment_ids: [payment.id],
      resolved_at: resolvedAt,
      resolved_by: authId,
    });
    updatedEvents.push(upd);
  }

  return { payment, events: updatedEvents, totalAmount };
}

/**
 * Save or update a normalized payer alias mapped to exactly one tenant or contract.
 */
export async function saveZellePayerAlias(
  deps,
  { landlordId, payerName, tenantId = null, contractId = null }
) {
  if (!landlordId) throw makeError("saveZellePayerAlias: landlordId is required", 400);
  const display = String(payerName || "").trim();
  const normalized = normalizePayerName(display);
  if (!normalized) throw makeError("A valid payer name is required.", 400);
  if ((tenantId ? 1 : 0) + (contractId ? 1 : 0) !== 1) {
    throw makeError("Alias must target exactly one tenant or contract.", 400);
  }
  if (tenantId) {
    const tenant = await deps.getTenant(tenantId);
    if (!tenant || tenant.landlord_id !== landlordId) {
      throw makeError("Selected tenant does not belong to this team.", 403);
    }
  }
  if (contractId) {
    const contract = await deps.getContract(contractId);
    if (!contract || contract.landlord_id !== landlordId) {
      throw makeError("Selected contract does not belong to this team.", 403);
    }
  }
  return deps.upsertAlias({
    landlord_id: landlordId,
    payer_name_normalized: normalized,
    payer_name_display: display,
    tenant_id: tenantId || null,
    contract_id: contractId || null,
  });
}

export async function deleteZellePayerAlias(deps, { landlordId, aliasId }) {
  if (!landlordId) throw makeError("deleteZellePayerAlias: landlordId is required", 400);
  if (!aliasId) throw makeError("aliasId is required.", 400);
  const removed = await deps.deleteAlias(landlordId, aliasId);
  if (removed !== 1) throw makeError("Saved payer alias not found.", 404);
  return { deletedId: aliasId };
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

export async function deleteZelleAliasClient(adapter, aliasId) {
  if (!aliasId) throw makeError("deleteZelleAlias: aliasId is required", 400);
  return adapter.deleteAlias(aliasId);
}

export async function confirmPartialGroupClient(adapter, payload) {
  if (!Array.isArray(payload?.eventIds) || payload.eventIds.length < 2) {
    throw makeError("confirmPartialGroup: at least two eventIds are required", 400);
  }
  return adapter.confirmPartialGroup(payload);
}
