import { test } from "node:test";
import assert from "node:assert/strict";
import { extractZelleTokenFromAddresses, ingestZelleEmail } from "./ingest.js";

const SAMPLE_HTML = `
<html><head><title>zelle_auto_accept_receiver</title></head><body>
<h1>JANE DOE sent you money</h1>
<table>
  <tr><td>Amount</td><td><b>$1,250.00</b></td></tr>
  <tr><td>Sent on</td><td><b>Nov 16, 2026</b></td></tr>
  <tr><td>Transaction number</td><td><b>99887766554</b></td></tr>
  <tr><td>Memo</td><td><b>Apt 303 Nov</b></td></tr>
</table>
</body></html>
`;

function createFakeIngestDeps({ failPaymentInsert = false } = {}) {
  const state = {
    events: [],
    payments: [],
    fetchCount: 0,
  };
  let nextEventId = 1;
  let nextPaymentId = 1;

  const deps = {
    async findLandlordByToken(token) {
      return token === "tok_valid_123456" ? "landlord-1" : null;
    },
    async findEventByResendEmailId(emailId) {
      return state.events.find((e) => e.resend_email_id === emailId) || null;
    },
    async findEventByDedupeKey(landlordId, dedupeKey) {
      return state.events.find((e) => e.landlord_id === landlordId && e.dedupe_key === dedupeKey) || null;
    },
    async fetchReceivedEmail(emailId) {
      state.fetchCount += 1;
      return {
        id: emailId,
        from: "Chase <no.reply.alerts@chase.com>",
        subject: "You received money with Zelle®",
        html: SAMPLE_HTML,
        text: "",
        headers: { "x-ntfy-id": "test" },
        message_id: "<msg-1@chase.com>",
        created_at: "2026-11-16T22:11:40Z",
      };
    },
    async loadLandlordContext() {
      return {
        properties: [{ id: "p-1", in_production: true }],
        units: [{ id: "u-1", property_id: "p-1", unit_number: "303" }],
        tenants: [
          {
            id: "t-1",
            name: "Jane",
            last_name: "Doe",
            zelle_name: "JANE DOE",
            property_id: "p-1",
            unit_id: "u-1",
            monthly_rent: 1250,
            move_in_date: "2026-01-01",
            move_out_date: null,
          },
        ],
        contracts: [{ id: "c-1", contract_tenants: [{ tenant_id: "t-1" }] }],
        payments: state.payments,
        parkingLeases: [],
        aliases: [],
      };
    },
    async insertZelleEvent(row) {
      if (state.events.some((e) => e.landlord_id === row.landlord_id && e.dedupe_key === row.dedupe_key)) {
        return { event: null, duplicate: true };
      }
      const event = { id: `ze-${nextEventId++}`, ...row };
      state.events.push(event);
      return { event, duplicate: false };
    },
    async insertPayments(rows) {
      if (failPaymentInsert) throw new Error("db write failed");
      const inserted = rows.map((r) => ({ id: `pay-${nextPaymentId++}`, ...r }));
      state.payments.push(...inserted);
      return inserted;
    },
    async updateZelleEvent(id, patch) {
      const ev = state.events.find((e) => e.id === id);
      if (ev) Object.assign(ev, patch);
    },
  };

  return { deps, state };
}

test("extractZelleTokenFromAddresses parses zelle+<token>@ addresses and ignores reply+ addresses", () => {
  assert.equal(extractZelleTokenFromAddresses(["zelle+tok_valid_123456@mail.keyturn.app"]), "tok_valid_123456");
  assert.equal(extractZelleTokenFromAddresses([{ address: "reply+11111111-2222-3333-4444-555555555555@mail.keyturn.app" }]), null);
  assert.equal(extractZelleTokenFromAddresses(["zelle+short@mail.keyturn.app"]), null);
});

test("ingestZelleEmail fetches Resend email, auto-posts 1-to-1 rent, and suppresses duplicate replays", async () => {
  const { deps, state } = createFakeIngestDeps();
  const today = new Date("2026-11-16T22:12:00Z");

  const first = await ingestZelleEmail(deps, {
    token: "tok_valid_123456",
    resendEmailId: "re_email_1",
    today,
  });
  assert.equal(first.status, "auto_posted");
  assert.equal(state.events.length, 1);
  assert.equal(state.payments.length, 1);
  assert.equal(state.payments[0].zelle_event_id, first.eventId);
  assert.deepEqual(state.events[0].posted_payment_ids, [state.payments[0].id]);

  // Replay exact same Resend webhook -> skipped before even refetching
  const replay = await ingestZelleEmail(deps, {
    token: "tok_valid_123456",
    resendEmailId: "re_email_1",
    today,
  });
  assert.equal(replay.status, "duplicate");
  assert.equal(state.fetchCount, 1);
  assert.equal(state.payments.length, 1);

  // Forward same Chase email again with a new Resend email_id -> deduplicated on Chase txn number
  const reforward = await ingestZelleEmail(deps, {
    token: "tok_valid_123456",
    resendEmailId: "re_email_2",
    today,
  });
  assert.equal(reforward.status, "duplicate");
  assert.equal(state.events.length, 1);
  assert.equal(state.payments.length, 1);
});

test("ingestZelleEmail degrades safely to needs_review if payment insert fails", async () => {
  const { deps, state } = createFakeIngestDeps({ failPaymentInsert: true });
  const res = await ingestZelleEmail(deps, {
    token: "tok_valid_123456",
    resendEmailId: "re_email_err",
    today: new Date("2026-11-16T22:12:00Z"),
  });

  assert.equal(res.status, "needs_review");
  assert.equal(res.matchReason, "auto_post_failed");
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].status, "needs_review");
  assert.equal(state.payments.length, 0);
});

test("ingestZelleEmail ignores unknown inbound tokens", async () => {
  const { deps, state } = createFakeIngestDeps();
  const res = await ingestZelleEmail(deps, {
    token: "tok_unknown_999999",
    resendEmailId: "re_email_3",
  });
  assert.equal(res.status, "ignored");
  assert.equal(state.events.length, 0);
});
