import { test } from "node:test";
import assert from "node:assert/strict";
import { createRenewalAdvanceAdapter, createRenewalStore } from "./adapter.js";
import { RenewalAdvanceError } from "./advance.js";

test("createRenewalAdvanceAdapter maps RPC JSONB payload to camelCase", async () => {
  const calls = [];
  const supabase = {
    async rpc(fn, params) {
      calls.push({ fn, params });
      return {
        data: {
          already_applied: false,
          renewal_id: "ren-1",
          contract_id: "con-1",
          previous_end_date: "2026-06-30",
          new_end_date: "2027-07-01",
          applied_at: "2026-06-25T10:00:00Z",
        },
        error: null,
      };
    },
  };

  const adapter = createRenewalAdvanceAdapter(supabase);
  const out = await adapter.advanceLeaseRenewal({ landlordId: "team-1", renewalId: "ren-1" });

  assert.deepEqual(calls[0], {
    fn: "advance_lease_renewal",
    params: { p_renewal_id: "ren-1", p_landlord_id: "team-1" },
  });
  assert.deepEqual(out, {
    alreadyApplied: false,
    renewalId: "ren-1",
    contractId: "con-1",
    previousEndDate: "2026-06-30",
    newEndDate: "2027-07-01",
    appliedAt: "2026-06-25T10:00:00Z",
  });
});

test("createRenewalAdvanceAdapter maps Postgres RPC error codes/messages accurately", async () => {
  const cases = [
    [{ code: "PGRST202", message: "Could not find function" }, "MIGRATION_REQUIRED", 500],
    [{ code: "42883", message: "function does not exist" }, "MIGRATION_REQUIRED", 500],
    [{ message: "renewal not found" }, "NOT_FOUND", 404],
    [{ message: "renewal must be countersigned before advancing lease term" }, "NOT_COUNTERSIGNED", 409],
    [{ message: "contract end_date is already past this renewal term" }, "STALE_RENEWAL", 409],
    [{ message: "new_term_end cannot precede contract start_date" }, "INVALID_TERM", 422],
  ];

  for (const [error, expectedCode, expectedStatus] of cases) {
    const adapter = createRenewalAdvanceAdapter({
      async rpc() {
        return { data: null, error };
      },
    });
    await assert.rejects(
      () => adapter.advanceLeaseRenewal({ landlordId: "team-1", renewalId: "ren-1" }),
      (err) => err instanceof RenewalAdvanceError && err.code === expectedCode && err.status === expectedStatus,
    );
  }
});

test("createRenewalStore.updateRenewalFiling tolerates missing Phase 4 columns (42703/PGRST204) and throws real errors", async () => {
  const makeSupabase = (error) => ({
    from() {
      return {
        update() {
          return {
            async eq() {
              return { error };
            },
          };
        },
      };
    },
  });

  await createRenewalStore(makeSupabase({ code: "42703", message: "column does not exist" }))
    .updateRenewalFiling("ren-1", { filing_error: "err" });
  await createRenewalStore(makeSupabase({ code: "PGRST204", message: "column not in schema cache" }))
    .updateRenewalFiling("ren-1", { filing_error: "err" });

  await assert.rejects(
    () =>
      createRenewalStore(makeSupabase({ code: "23503", message: "foreign key violation" }))
        .updateRenewalFiling("ren-1", { document_id: "bad" }),
    /foreign key violation/,
  );
});
