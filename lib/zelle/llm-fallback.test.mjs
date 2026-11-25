import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateLlmFallbackJson,
  parseZelleWithClaudeHaiku,
  createClaudeHaikuFallback,
} from "./llm-fallback.js";
import { ingestZelleEmail } from "./ingest.js";

test("validateLlmFallbackJson parses strict JSON, strips code fences, and rejects malformed output", () => {
  const valid = validateLlmFallbackJson(
    '```json\n{"direction":"received","payer_name":"JANE DOE","amount":"$1,250.00","sent_on":"Nov 16, 2026","memo":"Apt 303","category":"rent","target_month":"2026-11","notes":"ok"}\n```'
  );
  assert.equal(valid.direction, "received");
  assert.equal(valid.payerName, "JANE DOE");
  assert.equal(valid.payerNameNormalized, "jane doe");
  assert.equal(valid.amount, 1250);
  assert.equal(valid.sentOn, "2026-11-16");
  assert.equal(valid.category, "rent");
  assert.equal(valid.targetMonth, "2026-11-01");

  assert.equal(validateLlmFallbackJson("not json at all"), null);
  assert.equal(validateLlmFallbackJson("[1,2,3]"), null);
  assert.equal(validateLlmFallbackJson(""), null);

  // Unknown category is sanitized to null instead of passing through off-list values
  const badCat = validateLlmFallbackJson('{"direction":"received","category":"crypto","amount":-5}');
  assert.equal(badCat.category, null);
  assert.equal(badCat.amount, null);
});

test("createClaudeHaikuFallback returns null when no API key or client is provided", () => {
  assert.equal(createClaudeHaikuFallback({ apiKey: "" }), null);
});

test("ingestZelleEmail skips Claude Haiku on clean Chase emails, invokes it on ambiguous/failed emails, and NEVER auto-posts LLM output", async () => {
  let llmCalls = 0;
  const fakeClient = {
    messages: {
      async create() {
        llmCalls += 1;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                direction: "received",
                payer_name: "JANE DOE",
                amount: 1250,
                sent_on: "2026-11-16",
                memo: "thanks for covering Apt 303",
                category: "rent",
                target_month: "2026-11-01",
                notes: "Extracted from non-standard alert",
              }),
            },
          ],
        };
      },
    },
  };

  const state = { events: [], payments: [] };
  let emailPayload = {
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "You received money with Zelle®",
    html: `<html><head><title>zelle_auto_accept_receiver</title></head><body>
      <h1>JANE DOE sent you money</h1>
      <table>
        <tr><td>Amount</td><td><b>$1,250.00</b></td></tr>
        <tr><td>Sent on</td><td><b>Nov 16, 2026</b></td></tr>
        <tr><td>Transaction number</td><td><b>11111111111</b></td></tr>
        <tr><td>Memo</td><td><b>Apt 303 Nov</b></td></tr>
      </table></body></html>`,
    created_at: "2026-11-16T22:11:40Z",
  };

  const deps = {
    async findLandlordByToken() { return "landlord-1"; },
    async findEventByResendEmailId(id) { return state.events.find((e) => e.resend_email_id === id) || null; },
    async findEventByDedupeKey(lid, k) { return state.events.find((e) => e.landlord_id === lid && e.dedupe_key === k) || null; },
    async fetchReceivedEmail() { return emailPayload; },
    async loadLandlordContext() {
      return {
        properties: [{ id: "p-1", in_production: true }],
        units: [{ id: "u-303", property_id: "p-1", unit_number: "303" }],
        tenants: [
          {
            id: "t-jane",
            name: "Jane",
            last_name: "Doe",
            zelle_name: "JANE DOE",
            property_id: "p-1",
            unit_id: "u-303",
            monthly_rent: 1250,
            move_in_date: "2026-01-01",
            move_out_date: null,
          },
        ],
        contracts: [{ id: "c-1", contract_tenants: [{ tenant_id: "t-jane" }] }],
        payments: state.payments,
        parkingLeases: [],
        aliases: [],
      };
    },
    async insertZelleEvent(row) {
      const ev = { id: `ze-${state.events.length + 1}`, ...row };
      state.events.push(ev);
      return { event: ev, duplicate: false };
    },
    async insertPayments(rows) {
      const inserted = rows.map((r, i) => ({ id: `pay-${state.payments.length + i + 1}`, ...r }));
      state.payments.push(...inserted);
      return inserted;
    },
    async updateZelleEvent(id, patch) {
      const ev = state.events.find((e) => e.id === id);
      if (ev) Object.assign(ev, patch);
    },
    fallbackParse: createClaudeHaikuFallback({ client: fakeClient }),
  };

  // 1) Clean Chase email -> zero LLM calls, auto-posts
  const cleanRes = await ingestZelleEmail(deps, {
    token: "tok_valid_123456",
    resendEmailId: "re_clean",
    today: new Date("2026-11-16T22:12:00Z"),
  });
  assert.equal(cleanRes.status, "auto_posted");
  assert.equal(llmCalls, 0);
  assert.equal(state.payments.length, 1);

  // Reset payments so target month is unpaid again, then test unrecognized format -> LLM called, NEVER auto-posts
  state.payments.length = 0;
  emailPayload = {
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "Zelle alert",
    text: "You got $1,250 from Jane Doe today for Apt 303",
    message_id: "<weird-1@chase.com>",
    created_at: "2026-11-16T22:15:00Z",
  };
  const fallbackRes = await ingestZelleEmail(deps, {
    token: "tok_valid_123456",
    resendEmailId: "re_weird",
    today: new Date("2026-11-16T22:16:00Z"),
  });
  assert.equal(llmCalls, 1);
  assert.equal(fallbackRes.status, "needs_review");
  assert.equal(fallbackRes.matchReason, "llm_fallback");
  assert.equal(state.events[1].parse_source, "llm");
  assert.equal(state.events[1].amount, 1250);
  assert.equal(state.payments.length, 0);
});

test("LLM fallback timeout/error degrades safely to needs_review without dropping the webhook", async () => {
  const brokenClient = {
    messages: {
      async create() {
        throw new Error("Anthropic timeout");
      },
    },
  };

  const state = { events: [] };
  const deps = {
    async findLandlordByToken() { return "landlord-1"; },
    async findEventByResendEmailId() { return null; },
    async findEventByDedupeKey() { return null; },
    async fetchReceivedEmail() {
      return {
        from: "Chase <no.reply.alerts@chase.com>",
        subject: "Unusual alert",
        text: "Unrecognized body",
        message_id: "<broken-1@chase.com>",
        created_at: "2026-11-16T22:15:00Z",
      };
    },
    async loadLandlordContext() {
      return { properties: [], units: [], tenants: [], contracts: [], payments: [], parkingLeases: [], aliases: [] };
    },
    async insertZelleEvent(row) {
      const ev = { id: "ze-err", ...row };
      state.events.push(ev);
      return { event: ev, duplicate: false };
    },
    async insertPayments() { return []; },
    async updateZelleEvent() {},
    fallbackParse: (payload) => parseZelleWithClaudeHaiku({ client: brokenClient, ...payload }),
  };

  const res = await ingestZelleEmail(deps, {
    token: "tok_valid_123456",
    resendEmailId: "re_err",
    today: new Date("2026-11-16T22:16:00Z"),
  });
  assert.equal(res.status, "needs_review");
  assert.equal(res.matchReason, "parse_failed");
  assert.ok(state.events[0].parse_notes.includes("Anthropic timeout"));
});
