import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeZelleServerDeps } from "./fake.js";
import { undoZelleAutoPost, undoZelleEvent } from "./core.js";

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
