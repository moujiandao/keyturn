// The payment vocabularies.
//
// Enforced in JS rather than as DB CHECK constraints, but for a different
// reason than the parking module's spot `type`: the app genuinely DOES dispatch
// on status (the month grid keys itself on `completed`), so by the rule in
// CLAUDE.md this one has earned a database constraint. It doesn't have one
// today, and adding it to a table with live rows is a schema decision rather
// than a code one, so the picklist holds the line at every write path in the
// meantime. If that CHECK ever lands, this list is what it should be built from.
export const PAYMENT_STATUSES = ["pending", "completed", "failed"];
export const PAYMENT_TYPES = ["recurring", "one-time"];
export const PAYMENT_CATEGORIES = ["rent", "deposit", "other"];

export const isValidPaymentStatus = (s) => PAYMENT_STATUSES.includes(s);
export const isValidPaymentType = (t) => !t || PAYMENT_TYPES.includes(t);
export const isValidPaymentCategory = (c) => !c || PAYMENT_CATEGORIES.includes(c);

// A payment counts as settled when it is completed. The month grid's checkbox
// means exactly this, so the two can't drift apart.
export const isPaid = (payment) => payment?.status === "completed";

// Legacy rows have category === null and represent monthly rent. Only explicit
// non-rent categories (such as "deposit" or "other") are excluded from the
// monthly rent grid and unpaid-rent calculations.
export const isRentPayment = (payment) =>
  Boolean(payment) && (!payment.category || payment.category === "rent");

export const isPaidRent = (payment) => isPaid(payment) && isRentPayment(payment);
