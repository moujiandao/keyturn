// Pure view-model for the bookkeeper ledger table in the Zelle Inbox
// (Auto-Posted and History sub-tabs). No React, no I/O.
//
// One row per Zelle event. Rows are tied together into "reconciliation groups"
// when they share a posted payment row:
//   - grouped partial transfers: N events -> 1 payment (confirm-group)
//   - housemate splits:          1 event  -> N payments (confirm_split)
// The paid-vs-expected verdict is computed per group, so three partial
// transfers that together cover rent read "Exact", not "Short" three times.
//
// Expected amount uses the tenant's CURRENT expected monthly rent (base rent
// plus active parking). Older months after a rent change can therefore show a
// variance that was correct at the time. Only rent rows get an expected amount.

import { expectedMonthlyRent } from "./matcher.js";

const round2 = (n) => Math.round(n * 100) / 100;

const normName = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function tenantFullName(tenant) {
  if (!tenant) return "";
  return [tenant.name, tenant.lastName].filter(Boolean).join(" ").trim();
}

// Local calendar date (YYYY-MM-DD) of a timestamp or date-only string.
export function localDateKey(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// The rent month an event belongs to, falling back to when it was sent.
export function eventMonthKey(ev) {
  if (ev?.targetMonth) return String(ev.targetMonth).slice(0, 7);
  const sent = localDateKey(ev?.sentOn) || localDateKey(ev?.receivedAt);
  return sent ? sent.slice(0, 7) : null;
}

export function formatMonthLabel(monthKey, lang = "en") {
  if (!monthKey) return "-";
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
  });
}

export function matchVerdict(paid, expected) {
  if (expected == null || !(expected > 0)) return { match: "none", diff: null };
  const diff = round2(paid - expected);
  if (Math.abs(diff) < 0.01) return { match: "exact", diff: 0 };
  return { match: diff < 0 ? "short" : "over", diff };
}

export function buildLedgerRows({
  events = [],
  payments = [],
  tenants = [],
  units = [],
  properties = [],
  parkingLeases = [],
  today = new Date(),
} = {}) {
  const paymentsById = new Map(payments.map((p) => [p.id, p]));
  const tenantsById = new Map(tenants.map((t) => [t.id, t]));
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const propertiesById = new Map(properties.map((p) => [p.id, p]));

  // Union events that share any posted payment id.
  const groupOfPayment = new Map();
  const groupKeyOfEvent = new Map();
  const parent = new Map();
  const find = (k) => {
    while (parent.get(k) !== k) {
      parent.set(k, parent.get(parent.get(k)));
      k = parent.get(k);
    }
    return k;
  };
  for (const ev of events) {
    parent.set(ev.id, ev.id);
    for (const pid of ev.postedPaymentIds || []) {
      const other = groupOfPayment.get(pid);
      if (other) parent.set(find(ev.id), find(other));
      else groupOfPayment.set(pid, ev.id);
    }
  }
  for (const ev of events) groupKeyOfEvent.set(ev.id, find(ev.id));

  const groups = new Map();
  for (const ev of events) {
    const key = groupKeyOfEvent.get(ev.id);
    if (!groups.has(key)) groups.set(key, { events: [], paymentIds: new Set() });
    const g = groups.get(key);
    g.events.push(ev);
    for (const pid of ev.postedPaymentIds || []) g.paymentIds.add(pid);
  }

  const groupInfo = new Map();
  for (const [key, g] of groups) {
    const tenantIds = [];
    for (const pid of g.paymentIds) {
      const tid = paymentsById.get(pid)?.tenantId;
      if (tid && !tenantIds.includes(tid)) tenantIds.push(tid);
    }
    const groupTenants = tenantIds.map((id) => tenantsById.get(id)).filter(Boolean);
    const isRent = g.events.every((e) => e.category === "rent");
    const expected =
      isRent && groupTenants.length > 0
        ? round2(groupTenants.reduce((s, t) => s + expectedMonthlyRent(t, parkingLeases, today), 0))
        : null;
    const paid = round2(g.events.reduce((s, e) => s + (Number(e.amount) || 0), 0));
    groupInfo.set(key, {
      tenants: groupTenants,
      expected: expected > 0 ? expected : null,
      paid,
      size: g.events.length,
      ...matchVerdict(paid, expected),
    });
  }

  return events.map((ev) => {
    const groupKey = groupKeyOfEvent.get(ev.id);
    const g = groupInfo.get(groupKey);
    const primary = g.tenants[0] || null;
    const unit = primary?.unitId ? unitsById.get(primary.unitId) : null;
    const property = primary?.propertyId ? propertiesById.get(primary.propertyId) : null;
    const tenantNames = g.tenants.map(tenantFullName).filter(Boolean);
    const payerNorm = normName(ev.payerName);
    const payerDiffers =
      Boolean(payerNorm) &&
      tenantNames.length > 0 &&
      !g.tenants.some((t) => normName(tenantFullName(t)) === payerNorm);
    const sentKey = localDateKey(ev.sentOn);
    const receivedKey = localDateKey(ev.receivedAt);

    return {
      id: ev.id,
      event: ev,
      groupKey,
      groupSize: g.size,
      unitLabel: unit?.unitNumber || primary?.unit || "",
      propertyId: primary?.propertyId || null,
      propertyLabel: property?.address || "",
      tenantNames,
      payerName: ev.payerName || "",
      payerDiffers,
      monthKey: eventMonthKey(ev),
      sentDate: sentKey,
      receivedDate: receivedKey,
      memo: ev.memo || "",
      txnId: ev.zelleTxnId || "",
      amount: Number(ev.amount) || 0,
      groupPaid: g.paid,
      expected: g.expected,
      match: g.match,
      diff: g.diff,
      category: ev.category,
      status: ev.status,
    };
  });
}

export function filterLedgerRows(rows, { month = "all", propertyId = "all", match = "all", query = "" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return rows.filter((r) => {
    if (month !== "all" && r.monthKey !== month) return false;
    if (propertyId !== "all" && r.propertyId !== propertyId) return false;
    if (match === "exact" && r.match !== "exact") return false;
    if (match === "variance" && r.match !== "short" && r.match !== "over") return false;
    if (q) {
      const hay = [r.unitLabel, r.propertyLabel, ...r.tenantNames, r.payerName, r.memo, r.txnId]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Totals for the visible rows. Excludes ignored and outgoing transfers from
// received, and counts each reconciliation group's expected/variance once so
// a 3-transfer group is not triple-counted.
export function summarizeLedger(rows) {
  let received = 0;
  let expected = 0;
  let variance = 0;
  const seen = new Set();
  for (const r of rows) {
    if (r.status !== "ignored" && r.event?.direction !== "sent") {
      received += r.amount;
    }
    if (r.expected == null || seen.has(r.groupKey)) continue;
    seen.add(r.groupKey);
    expected += r.expected;
    variance += r.groupPaid - r.expected;
  }
  return { received: round2(received), expected: round2(expected), variance: round2(variance), count: rows.length };
}

export function ledgerMonthOptions(rows) {
  return [...new Set(rows.map((r) => r.monthKey).filter(Boolean))].sort().reverse();
}

export function ledgerPropertyOptions(rows) {
  const map = new Map();
  for (const r of rows) if (r.propertyId && !map.has(r.propertyId)) map.set(r.propertyId, r.propertyLabel || r.propertyId);
  return [...map.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
}
