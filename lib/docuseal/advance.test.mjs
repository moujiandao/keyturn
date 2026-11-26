import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceLeaseRenewal, RenewalAdvanceError } from "./advance.js";
import { createFakeRenewalAdvanceAdapter } from "./fake.js";
import { deriveRenewalTerm, pickEffectiveEndDate, pickOriginalLeaseDate } from "./renewal.js";

function baseFixtures(overrides = {}) {
  return {
    contracts: [
      {
        id: "con-1",
        landlord_id: "team-1",
        start_date: "2024-07-01",
        end_date: "2026-06-30",
        rent_amount: 2400,
        ...(overrides.contract || {}),
      },
    ],
    renewals: [
      {
        id: "ren-1",
        landlord_id: "team-1",
        contract_id: "con-1",
        original_lease_date: "2024-07-01",
        new_term_start: "2026-07-01",
        new_term_end: "2027-07-01",
        rent_amount: 2400,
        status: "countersigned",
        applied_to_contract: false,
        applied_at: null,
        created_at: "2026-03-10T00:00:00Z",
        ...(overrides.renewal || {}),
      },
    ],
  };
}

test("advanceLeaseRenewal updates contract end_date, preserves start_date, and marks renewal applied", async () => {
  const fake = createFakeRenewalAdvanceAdapter(baseFixtures());
  const res = await advanceLeaseRenewal(fake, { landlordId: "team-1", renewalId: "ren-1" });

  assert.deepEqual(res, {
    ok: true,
    alreadyApplied: false,
    renewalId: "ren-1",
    contractId: "con-1",
    previousEndDate: "2026-06-30",
    newEndDate: "2027-07-01",
    appliedAt: "2026-06-25T12:00:00.000Z",
  });

  const contract = fake.contracts.get("con-1");
  const renewal = fake.renewals.get("ren-1");
  assert.equal(contract.start_date, "2024-07-01");
  assert.equal(contract.end_date, "2027-07-01");
  assert.equal(renewal.applied_to_contract, true);
  assert.equal(renewal.applied_at, "2026-06-25T12:00:00.000Z");
});

test("advanceLeaseRenewal is idempotent on repeat confirmations", async () => {
  let tick = 0;
  const fake = createFakeRenewalAdvanceAdapter({
    ...baseFixtures(),
    now: () => (++tick === 1 ? "2026-06-25T12:00:00.000Z" : "2026-06-26T00:00:00.000Z"),
  });

  const first = await advanceLeaseRenewal(fake, { landlordId: "team-1", renewalId: "ren-1" });
  const second = await advanceLeaseRenewal(fake, { landlordId: "team-1", renewalId: "ren-1" });

  assert.equal(first.alreadyApplied, false);
  assert.equal(second.alreadyApplied, true);
  assert.equal(second.appliedAt, "2026-06-25T12:00:00.000Z");
  assert.equal(fake.contracts.get("con-1").end_date, "2027-07-01");
});

test("advanceLeaseRenewal rejects non-countersigned renewals without mutating the contract", async () => {
  for (const status of ["draft", "pending_review", "sent", "signed", "declined", "blocked"]) {
    const fake = createFakeRenewalAdvanceAdapter(baseFixtures({ renewal: { status } }));
    await assert.rejects(
      () => advanceLeaseRenewal(fake, { landlordId: "team-1", renewalId: "ren-1" }),
      (err) => err instanceof RenewalAdvanceError && err.code === "NOT_COUNTERSIGNED" && err.status === 409,
    );
    assert.equal(fake.contracts.get("con-1").end_date, "2026-06-30");
    assert.equal(fake.renewals.get("ren-1").applied_to_contract, false);
  }
});

test("advanceLeaseRenewal rejects rolling contract end_date backwards", async () => {
  const fake = createFakeRenewalAdvanceAdapter(
    baseFixtures({
      contract: { end_date: "2028-07-01" },
      renewal: { new_term_end: "2027-07-01" },
    }),
  );

  await assert.rejects(
    () => advanceLeaseRenewal(fake, { landlordId: "team-1", renewalId: "ren-1" }),
    (err) => err instanceof RenewalAdvanceError && err.code === "STALE_RENEWAL" && err.status === 409,
  );
  assert.equal(fake.contracts.get("con-1").end_date, "2028-07-01");
});

test("advanceLeaseRenewal enforces team scoping (cross-team renewal returns 404)", async () => {
  const fake = createFakeRenewalAdvanceAdapter(baseFixtures());
  await assert.rejects(
    () => advanceLeaseRenewal(fake, { landlordId: "other-team", renewalId: "ren-1" }),
    (err) => err instanceof RenewalAdvanceError && err.code === "NOT_FOUND" && err.status === 404,
  );
  assert.equal(fake.contracts.get("con-1").end_date, "2026-06-30");
});

test("advanceLeaseRenewal rejects missing ids or invalid renewal terms", async () => {
  const fake = createFakeRenewalAdvanceAdapter(
    baseFixtures({ renewal: { new_term_end: null } }),
  );

  await assert.rejects(
    () => advanceLeaseRenewal(fake, { landlordId: "", renewalId: "ren-1" }),
    (err) => err instanceof RenewalAdvanceError && err.status === 400,
  );
  await assert.rejects(
    () => advanceLeaseRenewal(fake, { landlordId: "team-1", renewalId: "ren-1" }),
    (err) => err instanceof RenewalAdvanceError && err.code === "INVALID_TERM" && err.status === 422,
  );
});

test("multi-year renewal chain derives next term from advanced end_date while pinning original_lease_date", async () => {
  const fake = createFakeRenewalAdvanceAdapter(baseFixtures());
  await advanceLeaseRenewal(fake, { landlordId: "team-1", renewalId: "ren-1" });

  const contract = fake.contracts.get("con-1");
  const chain = [fake.renewals.get("ren-1")];
  const effectiveEnd = pickEffectiveEndDate(chain, contract.end_date);
  const nextTerm = deriveRenewalTerm(effectiveEnd);
  const pinnedOriginal = pickOriginalLeaseDate(chain, contract.start_date);

  assert.equal(effectiveEnd, "2027-07-01");
  assert.deepEqual(nextTerm, { newTermStart: "2027-07-02", newTermEnd: "2028-07-02" });
  assert.equal(pinnedOriginal, "2024-07-01");
});
