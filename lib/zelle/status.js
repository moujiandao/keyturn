// Closed vocabularies for Zelle email ingestion and reconciliation.
// Enforced in JS across parser, matcher, routes, and UI so states never drift.

export const ZELLE_EVENT_STATUSES = [
  "auto_posted",
  "needs_review",
  "confirmed",
  "linked",
  "acknowledged",
  "ignored",
];

export const ZELLE_CATEGORIES = [
  "rent",
  "deposit",
  "parking",
  "other",
  "ignore",
];

export const ZELLE_DIRECTIONS = ["received", "sent", "unknown"];
export const ZELLE_PARSE_SOURCES = ["rules", "llm", "failed"];

export const isValidZelleStatus = (s) => ZELLE_EVENT_STATUSES.includes(s);
export const isValidZelleCategory = (c) => ZELLE_CATEGORIES.includes(c);

export const isZellePending = (ev) => ev?.status === "needs_review";
export const isZelleAutoPosted = (ev) => ev?.status === "auto_posted";
export const isZelleResolved = (ev) =>
  ["confirmed", "linked", "acknowledged", "ignored"].includes(ev?.status);
