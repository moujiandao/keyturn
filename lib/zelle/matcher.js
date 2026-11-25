// Payer resolution and 6-gate auto-post decision engine for Zelle events.
// React-free and isomorphic so unit tests and webhook routes share one truth.

import { isCurrentRow } from "../tenant/status.js";
import { isActiveLease } from "../parking/status.js";
import { isPaidRent } from "../payments/status.js";
import { normalizePayerName } from "./parser.js";
import { extractUnitHint } from "./classifier.js";

const centsEqual = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

function isNonProduction(property) {
  return property?.inProduction === false || property?.in_production === false;
}

function tenantFullName(t) {
  return [t?.name, t?.lastName ?? t?.last_name].filter(Boolean).join(" ").trim();
}

function tenantMonthlyRent(t) {
  return Number(t?.monthlyRent ?? t?.monthly_rent ?? 0) || 0;
}

function tenantPropertyId(t) {
  return t?.propertyId ?? t?.property_id ?? null;
}

function tenantUnitId(t) {
  return t?.unitId ?? t?.unit_id ?? null;
}

function tenantZelleName(t) {
  return t?.zelleName ?? t?.zelle_name ?? "";
}

function paymentTenantId(p) {
  return p?.tenantId ?? p?.tenant_id ?? null;
}

function paymentDueDate(p) {
  return p?.dueDate ?? p?.due_date ?? "";
}

function contractTenantIds(c) {
  if (Array.isArray(c?.tenantIds)) return c.tenantIds;
  if (Array.isArray(c?.contract_tenants)) {
    return c.contract_tenants.map((ct) => ct.tenant_id).filter(Boolean);
  }
  return [];
}

/**
 * Expected monthly payment for a tenant: monthly rent plus any active tenant
 * parking lease rates, mirroring PaymentsPage's Rent Total column.
 */
export function expectedMonthlyRent(tenant, parkingLeases = [], today = new Date()) {
  const base = tenantMonthlyRent(tenant);
  let parking = 0;
  for (const lease of parkingLeases || []) {
    const leaseTenantId = lease?.tenantId ?? lease?.tenant_id ?? null;
    if (leaseTenantId !== tenant.id) continue;
    const active = isActiveLease(
      {
        startDate: lease.startDate ?? lease.start_date,
        endDate: lease.endDate ?? lease.end_date,
      },
      today
    );
    if (active) parking += Number(lease.rate || 0) || 0;
  }
  return Math.round((base + parking) * 100) / 100;
}

export function findUnitHintTenantIds({ memo, activeTenants, units = [] }) {
  const hint = extractUnitHint(memo);
  if (!hint) return [];
  const matchingUnitIds = new Set(
    (units || [])
      .filter((u) => String(u.unitNumber ?? u.unit_number ?? "").trim().toLowerCase() === hint)
      .map((u) => u.id)
  );
  return activeTenants
    .filter((t) => {
      const uid = tenantUnitId(t);
      if (uid && matchingUnitIds.has(uid)) return true;
      const rawUnit = String(t.unit || "").trim().toLowerCase();
      return rawUnit && rawUnit === hint;
    })
    .map((t) => t.id);
}

/**
 * Evaluate all 6 auto-post safety gates and produce the match/posting decision.
 */
export function matchAndDecideZelleEvent({
  parsed,
  classification,
  targetMonth,
  tenants = [],
  properties = [],
  contracts = [],
  payments = [],
  parkingLeases = [],
  units = [],
  aliases = [],
  today = new Date(),
}) {
  const nonProdPropIds = new Set((properties || []).filter(isNonProduction).map((p) => p.id));
  const activeTenants = (tenants || []).filter((t) => {
    const propId = tenantPropertyId(t);
    if (propId && nonProdPropIds.has(propId)) return false;
    return isCurrentRow(
      {
        move_in_date: t.move_in_date ?? t.moveInDate ?? null,
        move_out_date: t.move_out_date ?? t.moveOutDate ?? null,
      },
      today
    );
  });
  const activeById = new Map(activeTenants.map((t) => [t.id, t]));
  const monthPrefix = targetMonth ? String(targetMonth).slice(0, 7) : "";

  const isMonthAlreadyPaid = (tenantId) =>
    (payments || []).some(
      (p) =>
        paymentTenantId(p) === tenantId &&
        isPaidRent(p) &&
        String(paymentDueDate(p)).slice(0, 7) === monthPrefix
    );

  const findContractForTenant = (tenantId) => {
    const matches = (contracts || []).filter((c) => contractTenantIds(c).includes(tenantId));
    return matches.find((c) => c.status === "active") || matches[0] || null;
  };

  const baseResult = (overrides) => ({
    status: "needs_review",
    matchReason: "needs_review",
    suggestedTenantIds: [],
    suggestedContractId: null,
    paymentsToInsert: [],
    ...overrides,
  });

  // Gate 1: Sent alerts or failed parse never auto-post.
  if (parsed?.direction === "sent") {
    return baseResult({ matchReason: "sent_alert" });
  }
  if (!parsed?.ok || parsed?.amount == null || !(parsed.amount > 0) || !parsed?.dedupeKey) {
    return baseResult({ matchReason: "parse_failed" });
  }

  // Resolve payer identity (aliases -> tenant zelle_name -> tenant full name).
  const payerNorm = parsed.payerNameNormalized || normalizePayerName(parsed.payerName);
  let matchedTenants = [];
  let matchedContract = null;
  let resolvedViaAlias = false;

  if (payerNorm) {
    const aliasMatch = (aliases || []).find(
      (a) => (a.payerNameNormalized ?? a.payer_name_normalized) === payerNorm
    );
    if (aliasMatch) {
      resolvedViaAlias = true;
      const aTenantId = aliasMatch.tenantId ?? aliasMatch.tenant_id ?? null;
      const aContractId = aliasMatch.contractId ?? aliasMatch.contract_id ?? null;
      if (aTenantId && activeById.has(aTenantId)) {
        matchedTenants = [activeById.get(aTenantId)];
      } else if (aContractId) {
        const contract = (contracts || []).find((c) => c.id === aContractId);
        if (contract) {
          const members = contractTenantIds(contract)
            .map((id) => activeById.get(id))
            .filter(Boolean);
          if (members.length > 0) {
            matchedContract = contract;
            matchedTenants = members;
          }
        }
      }
    }

    if (!resolvedViaAlias && matchedTenants.length === 0) {
      const zelleMatches = activeTenants.filter(
        (t) => normalizePayerName(tenantZelleName(t)) === payerNorm
      );
      if (zelleMatches.length > 0) {
        matchedTenants = zelleMatches;
      } else {
        const nameMatches = activeTenants.filter(
          (t) => normalizePayerName(tenantFullName(t)) === payerNorm
        );
        if (nameMatches.length > 0) {
          matchedTenants = nameMatches;
        }
      }
    }
  }

  // Unit hint fallback suggestions when payer is unknown (never auto-posts).
  if (matchedTenants.length === 0) {
    const unitSuggested = findUnitHintTenantIds({ memo: parsed.memo, activeTenants, units });
    const firstContract = unitSuggested.length > 0 ? findContractForTenant(unitSuggested[0]) : null;
    if (parsed.parseSource === "llm") {
      return baseResult({
        matchReason: "llm_fallback",
        suggestedTenantIds: unitSuggested,
        suggestedContractId: firstContract?.id ?? null,
      });
    }
    if (classification?.category !== "rent" || classification?.ambiguous) {
      return baseResult({
        matchReason: classification?.ambiguous ? "ambiguous_memo" : "non_rent_category",
        suggestedTenantIds: unitSuggested,
        suggestedContractId: firstContract?.id ?? null,
      });
    }
    return baseResult({
      matchReason: "unknown_payer",
      suggestedTenantIds: unitSuggested,
      suggestedContractId: firstContract?.id ?? null,
    });
  }

  const suggestedTenantIds = matchedTenants.map((t) => t.id);
  const suggestedContractId =
    matchedContract?.id ?? (matchedTenants.length === 1 ? findContractForTenant(matchedTenants[0].id)?.id ?? null : null);

  // LLM fallback hard invariant: never auto-post in v1.
  if (parsed.parseSource === "llm") {
    return baseResult({
      matchReason: "llm_fallback",
      suggestedTenantIds,
      suggestedContractId,
    });
  }

  // Gate 2: Must be unambiguously classified as rent.
  if (classification?.category !== "rent" || classification?.ambiguous) {
    return baseResult({
      matchReason: classification?.ambiguous ? "ambiguous_memo" : "non_rent_category",
      suggestedTenantIds,
      suggestedContractId,
    });
  }

  // Gate 3: Ambiguous payer name matching multiple distinct tenants (not via a contract alias).
  if (!matchedContract && matchedTenants.length > 1) {
    return baseResult({
      matchReason: "multiple_tenant_matches",
      suggestedTenantIds,
      suggestedContractId: null,
    });
  }

  // Gate 4: Exact expected rent total match.
  const perTenantExpected = matchedTenants.map((t) => ({
    tenant: t,
    expected: expectedMonthlyRent(t, parkingLeases, today),
  }));
  const totalExpected = Math.round(
    perTenantExpected.reduce((sum, item) => sum + item.expected, 0) * 100
  ) / 100;

  if (!(totalExpected > 0)) {
    return baseResult({
      matchReason: "amount_mismatch",
      suggestedTenantIds,
      suggestedContractId,
    });
  }
  if (!centsEqual(parsed.amount, totalExpected)) {
    return baseResult({
      matchReason: parsed.amount < totalExpected ? "partial_payment" : "amount_mismatch",
      suggestedTenantIds,
      suggestedContractId,
    });
  }

  // Gate 5: None of the target (tenant_id, targetMonth) pairs may already be paid.
  if (!monthPrefix || matchedTenants.some((t) => isMonthAlreadyPaid(t.id))) {
    return baseResult({
      matchReason: "already_paid",
      suggestedTenantIds,
      suggestedContractId,
    });
  }

  // All 6 gates passed -> build completed recurring rent payment row(s).
  const paidDate = parsed.sentOn || (parsed.receivedAt ? String(parsed.receivedAt).slice(0, 10) : null);
  const paymentsToInsert = perTenantExpected.map(({ tenant, expected }) => ({
    tenant_id: tenant.id,
    contract_id: matchedContract?.id ?? findContractForTenant(tenant.id)?.id ?? null,
    amount: expected,
    due_date: targetMonth,
    paid_date: paidDate,
    status: "completed",
    type: "recurring",
    payment_method: "zelle",
    category: "rent",
  }));

  return {
    status: "auto_posted",
    matchReason: matchedContract ? "exact_contract_alias_match" : "exact_rent_match",
    suggestedTenantIds,
    suggestedContractId,
    paymentsToInsert,
  };
}
