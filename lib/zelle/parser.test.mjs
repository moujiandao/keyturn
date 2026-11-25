import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChaseZelleEmail, normalizePayerName, parseDollarAmount, parseChaseDate } from "./parser.js";
import { classifyZelleMemo, resolveTargetMonth, extractUnitHint } from "./classifier.js";

// Sanitized structural fixture mirroring Chase's actual HTML-only Zelle alert.
const CHASE_HTML_FIXTURE = `
<html lang="en">
<head>
  <script src="/etc.clientlibs/jquery.min.js"></script>
  <title>zelle_auto_accept_receiver</title>
</head>
<body>
  <style type="text/css">body { background-color: #d7dbe0; }</style>
  <table>
    <tr><td>Zelle<sup>® </sup>payment<br></td></tr>
    <tr><td><h1>JANE DOE sent you money<br></h1></td></tr>
    <tr><td>
      Here are the details:<br>
      <table>
        <tbody>
          <tr><td>Amount</td><td><b>$1,250.00</b></td></tr>
          <tr><td>Sent on</td><td><b>Nov 16, 2026</b></td></tr>
          <tr><td>Transaction number</td><td><b>12345678901</b></td></tr>
          <tr><td>Memo</td><td><b>Apt 303 Nov</b></td></tr>
        </tbody>
      </table>
      JANE DOE is registered with a Zelle® member bank.
    </td></tr>
    <tr><td><b>ABOUT THIS MESSAGE</b><br>Chase Mobile® app disclosure text.</td></tr>
  </table>
</body>
</html>
`;

test("parseChaseZelleEmail parses Chase HTML-only alert with all fields and trims boilerplate", () => {
  const res = parseChaseZelleEmail({
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "You received money with Zelle®",
    html: CHASE_HTML_FIXTURE,
    text: "",
    receivedAt: "2026-11-16T22:11:40Z",
    messageId: "<abc@chase.com>",
  });

  assert.equal(res.ok, true);
  assert.equal(res.direction, "received");
  assert.equal(res.payerName, "JANE DOE");
  assert.equal(res.payerNameNormalized, "jane doe");
  assert.equal(res.amount, 1250);
  assert.equal(res.sentOn, "2026-11-16");
  assert.equal(res.zelleTxnId, "12345678901");
  assert.equal(res.memo, "Apt 303 Nov");
  assert.equal(res.dedupeKey, "chase:12345678901");
  assert.equal(res.parseSource, "rules");
  assert.ok(res.rawBody.includes("JANE DOE sent you money"));
  assert.ok(!res.rawBody.includes("ABOUT THIS MESSAGE"));
  assert.ok(!res.rawBody.includes("background-color"));
});

test("parseChaseZelleEmail tolerates missing Memo row and Gmail Fwd: subject prefix", () => {
  const htmlWithoutMemo = CHASE_HTML_FIXTURE.replace(/<tr><td>Memo<\/td>.*?<\/tr>/s, "");
  const res = parseChaseZelleEmail({
    from: "landlord@gmail.com",
    subject: "Fwd: You received money with Zelle®",
    html: htmlWithoutMemo,
    receivedAt: "2026-11-28T18:00:00Z",
    messageId: "<fwd-1@mail.gmail.com>",
  });

  assert.equal(res.ok, true);
  assert.equal(res.memo, null);
  assert.equal(res.payerName, "JANE DOE");
  assert.equal(res.amount, 1250);
  assert.equal(res.dedupeKey, "chase:12345678901");
});

test("parseChaseZelleEmail parses plain-text forwarded Chase alert and falls back to messageId dedupe", () => {
  const res = parseChaseZelleEmail({
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "Fwd: You received money with Zelle",
    text: `---------- Forwarded message ---------
ALEX CHEN sent you money
Amount: $950.50
Sent on: Dec 2, 2026
Memo: December rent`,
    receivedAt: "2026-12-02T15:00:00Z",
    messageId: "<plain-msg-42@example.com>",
  });

  assert.equal(res.ok, true);
  assert.equal(res.payerName, "ALEX CHEN");
  assert.equal(res.amount, 950.5);
  assert.equal(res.sentOn, "2026-12-02");
  assert.equal(res.memo, "December rent");
  assert.equal(res.dedupeKey, "msg:plain-msg-42@example.com");
});

test("parseChaseZelleEmail detects outgoing Chase sent-money alerts", () => {
  const res = parseChaseZelleEmail({
    from: "Chase <no.reply.alerts@chase.com>",
    subject: "You sent money with Zelle®",
    html: "<html><head><title>zelle_sender</title></head><body><h1>You sent $200.00 to BOB SMITH</h1></body></html>",
    receivedAt: "2026-11-16T22:11:40Z",
    messageId: "<sent-1@chase.com>",
  });

  assert.equal(res.ok, false);
  assert.equal(res.direction, "sent");
  assert.equal(res.parseSource, "rules");
});

test("parseChaseZelleEmail marks unrecognized emails as parse failed", () => {
  const res = parseChaseZelleEmail({
    from: "newsletter@example.com",
    subject: "Monthly statement ready",
    text: "Your statement is available online.",
    receivedAt: "2026-11-16T22:11:40Z",
    resendEmailId: "re_123",
  });

  assert.equal(res.ok, false);
  assert.equal(res.direction, "unknown");
  assert.equal(res.parseSource, "failed");
  assert.equal(res.dedupeKey, "resend:re_123");
});

test("normalizePayerName, parseDollarAmount, and parseChaseDate handle punctuation and formats", () => {
  assert.equal(normalizePayerName("  José  O'Connor-Smith "), "jose o connor smith");
  assert.equal(parseDollarAmount("$2,400.50"), 2400.5);
  assert.equal(parseDollarAmount("$0.00"), null);
  assert.equal(parseChaseDate("Nov 16, 2026"), "2026-11-16");
  assert.equal(parseChaseDate("11/16/2026"), "2026-11-16");
});

test("classifyZelleMemo handles empty memos, unit+month rent, parking, deposit, utilities, and ambiguous text", () => {
  assert.deepEqual(classifyZelleMemo(null).category, "rent");
  assert.equal(classifyZelleMemo("Apt 303 Nov").category, "rent");
  assert.equal(classifyZelleMemo("Apt 303 Nov").ambiguous, false);
  assert.equal(classifyZelleMemo("Apt 303 Nov parking").category, "parking");
  assert.equal(classifyZelleMemo("Security deposit unit 2B").category, "deposit");
  assert.equal(classifyZelleMemo("PG&E electric utility share").category, "other");
  assert.equal(classifyZelleMemo("PG&E electric utility share").ambiguous, false);
  assert.equal(classifyZelleMemo("thanks for dinner!").ambiguous, true);
  assert.equal(classifyZelleMemo("rent", "sent").category, "ignore");
  assert.equal(extractUnitHint("Apt 303 Nov"), "303");
  assert.equal(extractUnitHint("Unit 2B rent"), "2b");
});

test("resolveTargetMonth prioritizes explicit memo month with Dec/Jan rollover and applies day >= 20 cutoff", () => {
  assert.equal(resolveTargetMonth({ memo: "Apt 303 Nov", sentOn: "2026-11-28" }), "2026-11-01");
  assert.equal(resolveTargetMonth({ memo: "Jan rent", sentOn: "2026-12-26" }), "2027-01-01");
  assert.equal(resolveTargetMonth({ memo: "Dec rent", sentOn: "2027-01-03" }), "2026-12-01");
  assert.equal(resolveTargetMonth({ memo: "06/2026 rent", sentOn: "2026-05-25" }), "2026-06-01");

  // Cutoff rule when memo has no month
  assert.equal(resolveTargetMonth({ memo: "", sentOn: "2026-11-19" }), "2026-11-01");
  assert.equal(resolveTargetMonth({ memo: "", sentOn: "2026-11-20" }), "2026-12-01");
  assert.equal(resolveTargetMonth({ memo: "", sentOn: "2026-12-28" }), "2027-01-01");
});
