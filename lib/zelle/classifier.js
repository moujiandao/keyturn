// Deterministic memo categorization, unit-hint extraction, and target-month
// attribution for Chase Zelle transfers.

const MONTH_PATTERNS = [
  { month: 1, re: /\b(?:jan(?:uary)?)\b/i },
  { month: 2, re: /\b(?:feb(?:ruary)?)\b/i },
  { month: 3, re: /\b(?:mar(?:ch)?)\b/i },
  { month: 4, re: /\b(?:apr(?:il)?)\b/i },
  { month: 5, re: /\b(?:may)\b/i },
  { month: 6, re: /\b(?:jun(?:e)?)\b/i },
  { month: 7, re: /\b(?:jul(?:y)?)\b/i },
  { month: 8, re: /\b(?:aug(?:ust)?)\b/i },
  { month: 9, re: /\b(?:sep(?:t(?:ember)?)?)\b/i },
  { month: 10, re: /\b(?:oct(?:ober)?)\b/i },
  { month: 11, re: /\b(?:nov(?:ember)?)\b/i },
  { month: 12, re: /\b(?:dec(?:ember)?)\b/i },
];

const PARKING_RE = /\b(parking|spot|garage|car)\b/i;
const DEPOSIT_RE = /\b(deposit|security)\b/i;
const UTILITY_RE = /\b(utility|utilities|electric|electricity|water|gas|internet|wifi|trash|sewer|cable|pge|pg&e)\b/i;
const RENT_RE = /\b(rent|apt|apartment|unit|room|rm)\b|#\s*[0-9a-z]+/i;

export function extractUnitHint(memo) {
  if (!memo) return null;
  const s = String(memo).trim();
  const m = s.match(/\b(?:apt|apartment|unit|room|rm)\.?\s*#?\s*([0-9a-z-]{1,10})\b/i)
    || s.match(/#\s*([0-9a-z-]{1,10})\b/i);
  return m ? m[1].toLowerCase() : null;
}

export function classifyZelleMemo(memo, direction = "received") {
  if (direction === "sent") {
    return { category: "ignore", ambiguous: false, reason: "sent_alert" };
  }
  const text = String(memo || "").trim();
  if (!text) {
    return { category: "rent", ambiguous: false, reason: "empty_memo_default_rent" };
  }

  // Specific non-rent categories take priority over generic unit/month words
  // (e.g. "Apt 303 Nov parking" -> parking, "Apt 303 security deposit" -> deposit).
  if (PARKING_RE.test(text)) {
    return { category: "parking", ambiguous: false, reason: "keyword_parking" };
  }
  if (DEPOSIT_RE.test(text)) {
    return { category: "deposit", ambiguous: false, reason: "keyword_deposit" };
  }
  if (UTILITY_RE.test(text)) {
    return { category: "other", ambiguous: false, reason: "keyword_utility" };
  }
  if (RENT_RE.test(text) || MONTH_PATTERNS.some(({ re }) => re.test(text))) {
    return { category: "rent", ambiguous: false, reason: "keyword_rent_or_month" };
  }

  return { category: "other", ambiguous: true, reason: "ambiguous_memo" };
}

function parseAnchorYmd(sentOn, receivedAt) {
  if (sentOn && /^\d{4}-\d{2}-\d{2}$/.test(sentOn)) {
    const [y, m, d] = sentOn.split("-").map(Number);
    return { year: y, month: m, day: d };
  }
  if (receivedAt) {
    const dt = new Date(receivedAt);
    if (!Number.isNaN(dt.getTime())) {
      // Convert UTC timestamp to America/Los_Angeles calendar date when possible
      // so evening US payments do not jump to the next UTC day on the 19th/20th.
      try {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(dt);
        const year = Number(parts.find((p) => p.type === "year")?.value);
        const month = Number(parts.find((p) => p.type === "month")?.value);
        const day = Number(parts.find((p) => p.type === "day")?.value);
        if (year && month && day) return { year, month, day };
      } catch {
        // Fallback to UTC date if Intl timezone data is unavailable.
      }
      return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function formatMonthStart(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function pickNearestYearForMonth(targetMonth, anchorYear, anchorMonth) {
  const candidates = [anchorYear - 1, anchorYear, anchorYear + 1];
  const anchorTotal = anchorYear * 12 + (anchorMonth - 1);
  let bestYear = anchorYear;
  let bestDiff = Infinity;

  for (const y of candidates) {
    const candTotal = y * 12 + (targetMonth - 1);
    const diff = Math.abs(candTotal - anchorTotal);
    // On an exact 6-month tie, prefer the future/current year.
    if (diff < bestDiff || (diff === bestDiff && candTotal >= anchorTotal)) {
      bestDiff = diff;
      bestYear = y;
    }
  }
  return bestYear;
}

/**
 * Determine target rent month (`YYYY-MM-01`):
 * 1. Explicit month in memo (with optional year, or nearest year for Dec/Jan rollover).
 * 2. Fallback cutoff on anchor date (`sentOn` preferred, else `receivedAt`):
 *    day >= 20 -> next month; day < 20 -> current month.
 */
export function resolveTargetMonth({ memo = "", sentOn = null, receivedAt = null } = {}) {
  const anchor = parseAnchorYmd(sentOn, receivedAt);
  const text = String(memo || "").trim();

  if (text) {
    // Explicit YYYY-MM or MM/YYYY
    const isoMonth = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
    if (isoMonth) {
      return formatMonthStart(Number(isoMonth[1]), Number(isoMonth[2]));
    }
    const slashMonth = text.match(/\b(0?[1-9]|1[0-2])\/(20\d{2})\b/);
    if (slashMonth) {
      return formatMonthStart(Number(slashMonth[2]), Number(slashMonth[1]));
    }

    // Named month (e.g., "Apt 303 Nov", "Jan 2027 rent")
    for (const { month, re } of MONTH_PATTERNS) {
      const m = text.match(re);
      if (m) {
        const yearMatch = text.match(/\b(20\d{2})\b/);
        const year = yearMatch
          ? Number(yearMatch[1])
          : pickNearestYearForMonth(month, anchor.year, anchor.month);
        return formatMonthStart(year, month);
      }
    }
  }

  // Cutoff rule: day >= 20 -> next month; day < 20 -> current month.
  if (anchor.day >= 20) {
    const nextMonth = anchor.month === 12 ? 1 : anchor.month + 1;
    const nextYear = anchor.month === 12 ? anchor.year + 1 : anchor.year;
    return formatMonthStart(nextYear, nextMonth);
  }
  return formatMonthStart(anchor.year, anchor.month);
}
