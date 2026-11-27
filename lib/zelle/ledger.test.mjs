import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLedgerRows,
  filterLedgerRows,
  summarizeLedger,
  matchVerdict,
  eventMonthKey,
  ledgerMonthOptions,
  ledgerPropertyOptions,
} from "./ledger.js";

const TODAY = new Date("2026-11-20T12:00:00");

const tenants = [
  { id: "t1", name: "Yeana", lastName: "Kang", propertyId: "p1", unitId: "u303", unit: "303", monthlyRent: 990 },
  { id: "t2", name: "Marcus", lastName: "Chen", propertyId: "p1", unitId: null, unit: "102", monthlyRent: 1450 },
  { id: "t3", name: "Priya", lastName: "Patel", propertyId: "p2", unitId: "u204", monthlyRent: 1250 },
  { id: "t4", name: "Ana", lastName: "Lee", propertyId: "p2", unitId: "u204", monthlyRent: 600 },
];
const units = [
  { id: "u303", propertyId: "p1", unitNumber: "303" },
  { id: "u204", propertyId: "p2", unitNumber: "204" },
];
const properties = [
  { id: "p1", address: "12 Oak St" },
  { id: "p2", address: "40 Maple Ave" },
];

const ev = (over) => ({
  id: "e",
  payerName: null,
  amount: 0,
  sentOn: "2026-11-05",
  receivedAt: "2026-11-05T18:00:00",
  memo: null,
  zelleTxnId: null,
  category: "rent",
  targetMonth: "2026-11-01",
  status: "auto_posted",
  postedPaymentIds: [],
  ...over,
});

test("matchVerdict classifies exact, short, over, and missing expected", () => {
  assert.deepEqual(matchVerdict(990, 990), { match: "exact", diff: 0 });
  assert.deepEqual(matchVerdict(900, 990), { match: "short", diff: -90 });
  assert.deepEqual(matchVerdict(1000, 990), { match: "over", diff: 10 });
  assert.deepEqual(matchVerdict(500, null), { match: "none", diff: null });
});

test("eventMonthKey prefers targetMonth and falls back to sent date", () => {
  assert.equal(eventMonthKey({ targetMonth: "2026-11-01" }), "2026-11");
  assert.equal(eventMonthKey({ sentOn: "2026-10-30" }), "2026-10");
  assert.equal(eventMonthKey({}), null);
});

test("single rent row resolves unit, property, expected, and exact match", () => {
  const [row] = buildLedgerRows({
    events: [ev({ id: "e1", payerName: "YEANA KANG", amount: 990, memo: "Apt 303 Nov", postedPaymentIds: ["pay1"] })],
    payments: [{ id: "pay1", tenantId: "t1" }],
    tenants,
    units,
    properties,
    today: TODAY,
  });
  assert.equal(row.unitLabel, "303");
  assert.equal(row.propertyLabel, "12 Oak St");
  assert.deepEqual(row.tenantNames, ["Yeana Kang"]);
  assert.equal(row.payerDiffers, false, "all-caps bank name equals tenant name");
  assert.equal(row.expected, 990);
  assert.equal(row.match, "exact");
  assert.equal(row.memo, "Apt 303 Nov");
  assert.equal(row.sentDate, "2026-11-05");
  assert.equal(row.receivedDate, "2026-11-05");
});

test("third-party payer is flagged and legacy unit text is used when unitId is missing", () => {
  const [row] = buildLedgerRows({
    events: [ev({ id: "e2", payerName: "LINDA CHEN", amount: 1450, postedPaymentIds: ["pay2"] })],
    payments: [{ id: "pay2", tenantId: "t2" }],
    tenants,
    units,
    properties,
    today: TODAY,
  });
  assert.equal(row.payerDiffers, true);
  assert.equal(row.unitLabel, "102");
});

test("expected amount includes active parking", () => {
  const [row] = buildLedgerRows({
    events: [ev({ id: "e1", payerName: "Yeana Kang", amount: 990, postedPaymentIds: ["pay1"] })],
    payments: [{ id: "pay1", tenantId: "t1" }],
    tenants,
    units,
    properties,
    parkingLeases: [{ tenantId: "t1", rate: 75, startDate: "2026-01-01", endDate: null }],
    today: TODAY,
  });
  assert.equal(row.expected, 1065);
  assert.equal(row.match, "short");
  assert.equal(row.diff, -75);
});

test("grouped partial transfers are judged on their combined total", () => {
  const rows = buildLedgerRows({
    events: [
      ev({ id: "a", payerName: "Priya Patel", amount: 700, status: "confirmed", postedPaymentIds: ["payG"] }),
      ev({ id: "b", payerName: "Priya Patel", amount: 550, status: "confirmed", postedPaymentIds: ["payG"] }),
    ],
    payments: [{ id: "payG", tenantId: "t3" }],
    tenants,
    units,
    properties,
    today: TODAY,
  });
  for (const r of rows) {
    assert.equal(r.groupSize, 2);
    assert.equal(r.groupPaid, 1250);
    assert.equal(r.match, "exact");
  }
  const s = summarizeLedger(rows);
  assert.equal(s.received, 1250);
  assert.equal(s.expected, 1250, "group expected counted once");
  assert.equal(s.variance, 0);
});

test("housemate split sums expected across all posted tenants", () => {
  const [row] = buildLedgerRows({
    events: [ev({ id: "s", payerName: "PRIYA PATEL", amount: 1850, status: "confirmed", postedPaymentIds: ["x1", "x2"] })],
    payments: [
      { id: "x1", tenantId: "t3" },
      { id: "x2", tenantId: "t4" },
    ],
    tenants,
    units,
    properties,
    today: TODAY,
  });
  assert.deepEqual(row.tenantNames, ["Priya Patel", "Ana Lee"]);
  assert.equal(row.expected, 1850);
  assert.equal(row.match, "exact");
  assert.equal(row.payerDiffers, false);
});

test("non-rent and unposted rows have no expected amount", () => {
  const rows = buildLedgerRows({
    events: [
      ev({ id: "d", category: "deposit", amount: 500, status: "confirmed", postedPaymentIds: ["dp"] }),
      ev({ id: "i", category: "ignore", amount: 40, status: "ignored", payerName: "MOM" }),
    ],
    payments: [{ id: "dp", tenantId: "t1" }],
    tenants,
    units,
    properties,
    today: TODAY,
  });
  assert.equal(rows[0].expected, null);
  assert.equal(rows[0].match, "none");
  assert.equal(rows[1].expected, null);
  assert.deepEqual(rows[1].tenantNames, []);
  assert.equal(rows[1].payerDiffers, false, "no tenant to differ from");
});

test("filters by month, property, match, and free-text search", () => {
  const rows = buildLedgerRows({
    events: [
      ev({ id: "e1", payerName: "YEANA KANG", amount: 990, memo: "Apt 303 Nov", zelleTxnId: "316509", postedPaymentIds: ["pay1"] }),
      ev({ id: "e2", payerName: "LINDA CHEN", amount: 1400, targetMonth: "2026-10-01", postedPaymentIds: ["pay2"] }),
    ],
    payments: [
      { id: "pay1", tenantId: "t1" },
      { id: "pay2", tenantId: "t2" },
    ],
    tenants,
    units,
    properties,
    today: TODAY,
  });
  assert.deepEqual(filterLedgerRows(rows, { month: "2026-11" }).map((r) => r.id), ["e1"]);
  assert.deepEqual(filterLedgerRows(rows, { propertyId: "p2" }).map((r) => r.id), []);
  assert.deepEqual(filterLedgerRows(rows, { match: "variance" }).map((r) => r.id), ["e2"]);
  assert.deepEqual(filterLedgerRows(rows, { match: "exact" }).map((r) => r.id), ["e1"]);
  assert.deepEqual(filterLedgerRows(rows, { query: "linda" }).map((r) => r.id), ["e2"]);
  assert.deepEqual(filterLedgerRows(rows, { query: "316509" }).map((r) => r.id), ["e1"]);
  assert.deepEqual(filterLedgerRows(rows, { query: "oak st" }).map((r) => r.id), ["e1", "e2"]);
  assert.deepEqual(ledgerMonthOptions(rows), ["2026-11", "2026-10"]);
  assert.deepEqual(ledgerPropertyOptions(rows), [{ id: "p1", label: "12 Oak St" }]);
  const s = summarizeLedger(rows);
  assert.equal(s.variance, -50);
  assert.equal(s.count, 2);
});

test("sentDate stays null when sentOn is missing so UI labels email date accurately", () => {
  const [diffDay, emailOnly] = buildLedgerRows({
    events: [
      ev({ id: "e1", sentOn: "2026-11-05", receivedAt: "2026-11-06T09:00:00" }),
      ev({ id: "e2", sentOn: null, receivedAt: "2026-11-06T09:00:00" }),
    ],
    today: TODAY,
  });
  assert.equal(diffDay.sentDate, "2026-11-05");
  assert.equal(diffDay.receivedDate, "2026-11-06");
  assert.equal(emailOnly.sentDate, null);
  assert.equal(emailOnly.receivedDate, "2026-11-06");
});

test("summarizeLedger excludes ignored and outgoing sent transfers from received", () => {
  const rows = buildLedgerRows({
    events: [
      ev({ id: "e1", payerName: "YEANA KANG", amount: 990, status: "confirmed", postedPaymentIds: ["pay1"] }),
      ev({ id: "e2", payerName: "MOM", amount: 250, category: "ignore", status: "ignored" }),
      ev({ id: "e3", payerName: "PLUMBER", amount: 400, direction: "sent", category: "ignore", status: "ignored" }),
    ],
    payments: [{ id: "pay1", tenantId: "t1" }],
    tenants,
    units,
    properties,
    today: TODAY,
  });
  const s = summarizeLedger(rows);
  assert.equal(s.received, 990);
  assert.equal(s.expected, 990);
  assert.equal(s.variance, 0);
  assert.equal(s.count, 3);
});
