import { test } from "node:test";
import assert from "node:assert/strict";
import { matchAndDecideZelleEvent, expectedMonthlyRent } from "./matcher.js";

const TODAY = new Date("2026-11-16T12:00:00");

const baseContext = () => ({
  properties: [
    { id: "prop-prod", address: "100 Main St", in_production: true },
    { id: "prop-test", address: "999 Staging Ave", in_production: false },
  ],
  units: [
    { id: "u-303", property_id: "prop-prod", unit_number: "303" },
  ],
  tenants: [
    {
      id: "t-jane",
      name: "Jane",
      last_name: "Doe",
      zelle_name: "JANE DOE",
      property_id: "prop-prod",
      unit_id: "u-303",
      monthly_rent: 1250,
      move_in_date: "2026-01-01",
      move_out_date: null,
    },
    {
      id: "t-nonprod",
      name: "Test",
      last_name: "User",
      zelle_name: "TEST USER",
      property_id: "prop-test",
      monthly_rent: 1000,
      move_in_date: "2026-01-01",
      move_out_date: null,
    },
    {
      id: "t-past",
      name: "Old",
      last_name: "Tenant",
      zelle_name: "OLD TENANT",
      property_id: "prop-prod",
      monthly_rent: 1100,
      move_in_date: "2025-01-01",
      move_out_date: "2026-06-30",
    },
  ],
  contracts: [
    { id: "c-jane", contract_tenants: [{ tenant_id: "t-jane" }] },
  ],
  payments: [],
  parkingLeases: [],
  aliases: [],
  today: TODAY,
});

const cleanParsed = (overrides = {}) => ({
  ok: true,
  direction: "received",
  parseSource: "rules",
  payerName: "JANE DOE",
  payerNameNormalized: "jane doe",
  amount: 1250,
  sentOn: "2026-11-16",
  memo: "Apt 303 Nov",
  dedupeKey: "chase:12345678901",
  ...overrides,
});

const rentClass = { category: "rent", ambiguous: false };

test("all 6 gates pass -> auto_posted completed rent payment without touching ach_status", () => {
  const decision = matchAndDecideZelleEvent({
    ...baseContext(),
    parsed: cleanParsed(),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });

  assert.equal(decision.status, "auto_posted");
  assert.equal(decision.matchReason, "exact_rent_match");
  assert.deepEqual(decision.suggestedTenantIds, ["t-jane"]);
  assert.equal(decision.paymentsToInsert.length, 1);
  assert.deepEqual(decision.paymentsToInsert[0], {
    tenant_id: "t-jane",
    contract_id: "c-jane",
    amount: 1250,
    due_date: "2026-11-01",
    paid_date: "2026-11-16",
    status: "completed",
    type: "recurring",
    payment_method: "zelle",
    category: "rent",
  });
  assert.equal("ach_status" in decision.paymentsToInsert[0], false);
});

test("expectedMonthlyRent folds in active tenant parking lease rate, matching Rent Total", () => {
  const ctx = baseContext();
  ctx.parkingLeases = [
    { id: "pl-1", tenant_id: "t-jane", rate: 150, start_date: "2026-01-01", end_date: null },
  ];

  assert.equal(expectedMonthlyRent(ctx.tenants[0], ctx.parkingLeases, TODAY), 1400);

  // Sending $1,250 when Rent Total is $1,400 is flagged as partial_payment, never auto-posted
  const partial = matchAndDecideZelleEvent({
    ...ctx,
    parsed: cleanParsed({ amount: 1250 }),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });
  assert.equal(partial.status, "needs_review");
  assert.equal(partial.matchReason, "partial_payment");

  // Sending exact $1,400 auto-posts
  const exact = matchAndDecideZelleEvent({
    ...ctx,
    parsed: cleanParsed({ amount: 1400 }),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });
  assert.equal(exact.status, "auto_posted");
  assert.equal(exact.paymentsToInsert[0].amount, 1400);
});

test("auto-post gates block non-production properties and previous tenants", () => {
  const nonProd = matchAndDecideZelleEvent({
    ...baseContext(),
    parsed: cleanParsed({ payerName: "TEST USER", payerNameNormalized: "test user", amount: 1000, memo: "" }),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });
  assert.equal(nonProd.status, "needs_review");
  assert.equal(nonProd.matchReason, "unknown_payer");

  const pastTenant = matchAndDecideZelleEvent({
    ...baseContext(),
    parsed: cleanParsed({ payerName: "OLD TENANT", payerNameNormalized: "old tenant", amount: 1100, memo: "" }),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });
  assert.equal(pastTenant.status, "needs_review");
  assert.equal(pastTenant.matchReason, "unknown_payer");
});

test("auto-post gates block already-paid months, but ignore completed one-time deposits", () => {
  const ctxPaidRent = baseContext();
  ctxPaidRent.payments = [
    { id: "p-existing", tenant_id: "t-jane", due_date: "2026-11-01", status: "completed", category: "rent" },
  ];
  const alreadyPaid = matchAndDecideZelleEvent({
    ...ctxPaidRent,
    parsed: cleanParsed(),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });
  assert.equal(alreadyPaid.status, "needs_review");
  assert.equal(alreadyPaid.matchReason, "already_paid");

  const ctxDepositOnly = baseContext();
  ctxDepositOnly.payments = [
    { id: "p-dep", tenant_id: "t-jane", due_date: "2026-11-01", status: "completed", category: "deposit" },
  ];
  const canPost = matchAndDecideZelleEvent({
    ...ctxDepositOnly,
    parsed: cleanParsed(),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });
  assert.equal(canPost.status, "auto_posted");
});

test("non-rent category, ambiguous memo, LLM fallback, and sent alert never auto-post", () => {
  const ctx = baseContext();

  const deposit = matchAndDecideZelleEvent({
    ...ctx,
    parsed: cleanParsed({ memo: "security deposit" }),
    classification: { category: "deposit", ambiguous: false },
    targetMonth: "2026-11-01",
  });
  assert.equal(deposit.status, "needs_review");
  assert.equal(deposit.matchReason, "non_rent_category");

  const ambiguous = matchAndDecideZelleEvent({
    ...ctx,
    parsed: cleanParsed({ memo: "thanks!" }),
    classification: { category: "other", ambiguous: true },
    targetMonth: "2026-11-01",
  });
  assert.equal(ambiguous.status, "needs_review");
  assert.equal(ambiguous.matchReason, "ambiguous_memo");

  const llm = matchAndDecideZelleEvent({
    ...ctx,
    parsed: cleanParsed({ parseSource: "llm" }),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });
  assert.equal(llm.status, "needs_review");
  assert.equal(llm.matchReason, "llm_fallback");

  const sent = matchAndDecideZelleEvent({
    ...ctx,
    parsed: cleanParsed({ ok: false, direction: "sent" }),
    classification: { category: "ignore", ambiguous: false },
    targetMonth: "2026-11-01",
  });
  assert.equal(sent.status, "needs_review");
  assert.equal(sent.matchReason, "sent_alert");
});

test("unknown payer with unit hint suggests unit tenant without auto-posting", () => {
  const res = matchAndDecideZelleEvent({
    ...baseContext(),
    parsed: cleanParsed({ payerName: "PARENT DOE", payerNameNormalized: "parent doe", memo: "Apt 303 Nov" }),
    classification: rentClass,
    targetMonth: "2026-11-01",
  });
  assert.equal(res.status, "needs_review");
  assert.equal(res.matchReason, "unknown_payer");
  assert.deepEqual(res.suggestedTenantIds, ["t-jane"]);
});
