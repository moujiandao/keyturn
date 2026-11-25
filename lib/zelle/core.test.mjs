import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeZelleServerDeps } from "./fake.js";
import { undoZelleAutoPost, undoZelleEvent, resolveZelleEvent, saveZellePayerAlias, deleteZellePayerAlias } from "./core.js";
import { isPaidRent } from "../payments/status.js";

test("undoZelleAutoPost removes only payments linked to the event and returns it to needs_review", async () => {
  const deps = createFakeZelleServerDeps({
    events: [
      {
        id: "ze-1",
        landlord_id: "landlord-1",
        status: "auto_posted",
        match_reason: "exact_rent_match",
        posted_payment_ids: ["p-1", "p-unrelated"],
        resolved_at: "2026-11-16T22:12:00Z",
      },
    ],
    payments: [
      { id: "p-1", landlord_id: "landlord-1", zelle_event_id: "ze-1", amount: 1250 },
      { id: "p-unrelated", landlord_id: "landlord-1", zelle_event_id: "ze-other", amount: 1250 },
    ],
  });

  const res = await undoZelleAutoPost(deps, { landlordId: "landlord-1", eventId: "ze-1" });
  assert.equal(res.alreadyUndone, false);
  assert.deepEqual(res.removedPaymentIds, ["p-1"]);
  assert.equal(res.event.status, "needs_review");
  assert.equal(res.event.match_reason, "undone_by_landlord");
  assert.deepEqual(res.event.posted_payment_ids, []);
  assert.deepEqual(deps._store.payments.map((p) => p.id), ["p-unrelated"]);

  // Idempotent second call succeeds without error
  const second = await undoZelleAutoPost(deps, { landlordId: "landlord-1", eventId: "ze-1" });
  assert.equal(second.alreadyUndone, true);
  assert.deepEqual(second.removedPaymentIds, []);
});

test("undoZelleAutoPost rejects cross-team access and non-auto_posted resolved events", async () => {
  const deps = createFakeZelleServerDeps({
    events: [
      { id: "ze-other-team", landlord_id: "landlord-2", status: "auto_posted", posted_payment_ids: [] },
      { id: "ze-confirmed", landlord_id: "landlord-1", status: "confirmed", posted_payment_ids: ["p-2"] },
    ],
  });

  await assert.rejects(
    () => undoZelleAutoPost(deps, { landlordId: "landlord-1", eventId: "ze-other-team" }),
    (err) => err.status === 403
  );
  await assert.rejects(
    () => undoZelleAutoPost(deps, { landlordId: "landlord-1", eventId: "ze-confirmed" }),
    (err) => err.status === 409
  );
});

test("undoZelleEvent validates eventId before calling adapter", async () => {
  await assert.rejects(() => undoZelleEvent({ undoEvent() {} }, ""), /eventId is required/);
});

test("resolveZelleEvent confirm_rent creates completed recurring rent payment and rejects duplicate month", async () => {
  const deps = createFakeZelleServerDeps({
    tenants: [{ id: "t-1", landlord_id: "landlord-1" }],
    events: [
      { id: "ze-1", landlord_id: "landlord-1", status: "needs_review", amount: 1250, sent_on: "2026-11-16", target_month: "2026-11-01" },
      { id: "ze-2", landlord_id: "landlord-1", status: "needs_review", amount: 1250, sent_on: "2026-11-17", target_month: "2026-11-01" },
    ],
  });

  const res = await resolveZelleEvent(deps, {
    landlordId: "landlord-1",
    authId: "auth-1",
    eventId: "ze-1",
    action: "confirm_rent",
    tenantId: "t-1",
    targetMonth: "2026-11",
    amount: 1250,
  });

  assert.equal(res.event.status, "confirmed");
  assert.equal(res.createdPayments.length, 1);
  assert.equal(res.createdPayments[0].type, "recurring");
  assert.equal(res.createdPayments[0].category, "rent");
  assert.equal(res.createdPayments[0].payment_method, "zelle");
  assert.equal(isPaidRent(res.createdPayments[0]), true);

  // Second event for same tenant & month is rejected with 409 so landlord links instead
  await assert.rejects(
    () =>
      resolveZelleEvent(deps, {
        landlordId: "landlord-1",
        eventId: "ze-2",
        action: "confirm_rent",
        tenantId: "t-1",
        targetMonth: "2026-11",
      }),
    (err) => err.status === 409
  );
});

test("resolveZelleEvent link_existing attaches event without duplicating payments", async () => {
  const deps = createFakeZelleServerDeps({
    events: [{ id: "ze-link", landlord_id: "landlord-1", status: "needs_review", amount: 1250, target_month: "2026-11-01" }],
    payments: [{ id: "p-existing", landlord_id: "landlord-1", tenant_id: "t-1", due_date: "2026-11-01", status: "completed", amount: 1250 }],
  });

  const res = await resolveZelleEvent(deps, {
    landlordId: "landlord-1",
    eventId: "ze-link",
    action: "link_existing",
    paymentId: "p-existing",
  });
  assert.equal(res.event.status, "linked");
  assert.deepEqual(res.event.posted_payment_ids, ["p-existing"]);
  assert.equal(deps._store.payments.length, 1);
  assert.equal(deps._store.payments[0].zelle_event_id, "ze-link");
});

test("resolveZelleEvent confirm_other logs one-time non-rent payment that does not check off rent grid", async () => {
  const deps = createFakeZelleServerDeps({
    tenants: [{ id: "t-1", landlord_id: "landlord-1" }],
    events: [{ id: "ze-dep", landlord_id: "landlord-1", status: "needs_review", amount: 1500, sent_on: "2026-11-10" }],
  });

  const res = await resolveZelleEvent(deps, {
    landlordId: "landlord-1",
    eventId: "ze-dep",
    action: "confirm_other",
    category: "deposit",
    tenantId: "t-1",
    targetMonth: "2026-11",
    amount: 1500,
  });

  assert.equal(res.event.status, "confirmed");
  assert.equal(res.event.category, "deposit");
  assert.equal(res.createdPayments[0].type, "one-time");
  assert.equal(res.createdPayments[0].category, "deposit");
  assert.equal(isPaidRent(res.createdPayments[0]), false);
});

test("resolveZelleEvent acknowledge_parking and ignore touch zero payments and reject cross-team access", async () => {
  const deps = createFakeZelleServerDeps({
    events: [
      { id: "ze-park", landlord_id: "landlord-1", status: "needs_review", amount: 150 },
      { id: "ze-ign", landlord_id: "landlord-1", status: "needs_review", amount: 40 },
      { id: "ze-foreign", landlord_id: "landlord-2", status: "needs_review", amount: 500 },
    ],
  });

  const park = await resolveZelleEvent(deps, { landlordId: "landlord-1", eventId: "ze-park", action: "acknowledge_parking" });
  assert.equal(park.event.status, "acknowledged");
  assert.equal(park.event.category, "parking");

  const ign = await resolveZelleEvent(deps, { landlordId: "landlord-1", eventId: "ze-ign", action: "ignore" });
  assert.equal(ign.event.status, "ignored");
  assert.equal(ign.event.category, "ignore");
  assert.equal(deps._store.payments.length, 0);

  await assert.rejects(
    () => resolveZelleEvent(deps, { landlordId: "landlord-1", eventId: "ze-foreign", action: "ignore" }),
    (err) => err.status === 403
  );
});

test("confirm_rent with rememberAlias saves normalized alias and multiple aliases can map to one tenant", async () => {
  const deps = createFakeZelleServerDeps({
    tenants: [{ id: "t-1", landlord_id: "landlord-1" }],
    events: [
      { id: "ze-mom", landlord_id: "landlord-1", status: "needs_review", payer_name: "MARY DOE-SMITH", amount: 1250, sent_on: "2026-11-01", target_month: "2026-11-01" },
      { id: "ze-dad", landlord_id: "landlord-1", status: "needs_review", payer_name: "ROBERT DOE", amount: 1250, sent_on: "2026-12-01", target_month: "2026-12-01" },
    ],
  });

  const r1 = await resolveZelleEvent(deps, {
    landlordId: "landlord-1",
    eventId: "ze-mom",
    action: "confirm_rent",
    tenantId: "t-1",
    targetMonth: "2026-11",
    rememberAlias: true,
  });
  assert.equal(r1.savedAlias.payer_name_normalized, "mary doe smith");
  assert.equal(r1.savedAlias.tenant_id, "t-1");

  const r2 = await resolveZelleEvent(deps, {
    landlordId: "landlord-1",
    eventId: "ze-dad",
    action: "confirm_rent",
    tenantId: "t-1",
    targetMonth: "2026-12",
    rememberAlias: true,
  });
  assert.equal(r2.savedAlias.payer_name_normalized, "robert doe");
  assert.equal(deps._store.aliases.length, 2);

  // Removing an alias works for the owning team and rejects another team
  await assert.rejects(
    () => deleteZellePayerAlias(deps, { landlordId: "landlord-2", aliasId: r1.savedAlias.id }),
    (err) => err.status === 404
  );
  await deleteZellePayerAlias(deps, { landlordId: "landlord-1", aliasId: r1.savedAlias.id });
  assert.equal(deps._store.aliases.length, 1);
});

test("saveZellePayerAlias enforces exactly one target (tenant or contract)", async () => {
  const deps = createFakeZelleServerDeps({
    tenants: [{ id: "t-1", landlord_id: "landlord-1" }],
    contracts: [{ id: "c-1", landlord_id: "landlord-1" }],
  });
  await assert.rejects(
    () => saveZellePayerAlias(deps, { landlordId: "landlord-1", payerName: "MOM", tenantId: "t-1", contractId: "c-1" }),
    /exactly one/
  );
  await assert.rejects(
    () => saveZellePayerAlias(deps, { landlordId: "landlord-1", payerName: "MOM" }),
    /exactly one/
  );
});
