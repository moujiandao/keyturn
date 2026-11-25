# PRD: Zelle Email Ingestion and Rent Reconciliation

**Status:** Approved (tracked in GitHub Issues #19-#25)
**Date:** 2026-11-25
**Owner:** Brian
**Companion Spec:** [zelle-ingestion-spec.md](./zelle-ingestion-spec.md)

---

## 1. Problem

Landlords using Keyturn collect most residential rent via Zelle, not Stripe ACH. Today, confirming who paid each month requires opening bank emails or the Chase app, reading each Zelle alert, figuring out which tenant (or parent/housemate) sent it, and manually checking boxes in Keyturn's payment month grid.

This is repetitive, error-prone when a third party pays on a tenant's behalf or splits rent across multiple transfers, and leaves no audit trail linking a checked month back to the actual bank confirmation.

## 2. Goals and Non-Goals

### Goals (v1)

- **Zero-touch posting for clean rent payments:** Automatically detect Chase Zelle alerts forwarded to Keyturn and check off the tenant's rent month when the payer, amount, category, and target month are unambiguous.
- **Fast human review for everything else:** Surface unknown payers, amount mismatches, housemate lump sums, partial transfers, deposits, parking transfers, and personal Zelle transfers in a dedicated reconciliation queue with one-click actions.
- **Remember payer mappings:** Reuse `tenant_profiles.zelle_name` and save additional payer aliases (parents, spouses, guarantors, alternate legal names) once confirmed so future payments match automatically.
- **Safe, reversible ledger writes:** Keep Keyturn's payment month grid accurate (`status = 'completed'` for rent only), prevent duplicate postings from webhook retries or manual checkoffs, and allow one-click Undo on auto-posted payments.
- **Zero added fixed infrastructure cost:** Fit within Resend Free tier (3,000 emails/month, 100/day shared) and Keyturn's existing Supabase, Vercel, and Anthropic setup.

### Non-Goals (v1)

- **Self-serve multi-landlord onboarding UI:** Dogfood on Brian's landlord team first. Database tables still enforce team-scoped RLS (`is_team_member(landlord_id)`), but v1 skips a self-serve forwarding setup wizard.
- **Additional bank parsers beyond Chase:** Bank of America, Wells Fargo, Citi, and Capital One are deferred until v1 is proven on Chase.
- **Parking payment ledger:** Parking Zelle transfers are tagged and acknowledged in the Zelle inbox only; v1 does not create a parking billing ledger or link `payments` rows to non-tenant `parking_renters`.
- **Historical mailbox backfill via Gmail/IMAP OAuth:** v1 ingests live forwarded emails via Resend Inbound (no mailbox credential storage or Google OAuth verification).
- **Lease-renewal changes:** DocuSeal renewal extensions (Phase 4 PDF filing, variable rent) are tracked in a separate delta spec against [docuseal-tenant-renewal-spec.md](./docuseal-tenant-renewal-spec.md).

## 3. Target User and Scope

- **Primary user:** Landlord team operating Keyturn on their own portfolio (~25 units, ~30-100 Zelle alerts/month, Chase bank alerts, English and Chinese UI).
- **Tenants:** No tenant-facing UI changes in v1. Auto-posted or confirmed `payments` rows appear normally in the tenant portal payment history where already supported.

## 4. Supported Real-World Payment Patterns

v1 must handle all five Zelle patterns observed in the portfolio:

| Pattern | Example | v1 Behavior |
| --- | --- | --- |
| **1-to-1 full rent** | Tenant sends exact monthly rent under their known Zelle name | **Auto-post** if payer matches one active tenant, category is `rent`, amount matches expected rent, and target month is unpaid. |
| **Third-party payer alias** | Parent, spouse, or guarantor pays under a different name | Queued on first sighting. Landlord picks the tenant and checks "Remember payer alias." Future matching payments auto-post. |
| **Housemate lump sum (1-to-N)** | One roommate sends combined rent for a shared contract | Queued with a suggested split across the contract's tenants (or auto-posted only if alias is explicitly mapped to the contract and amount equals exact combined rent with all tenants unpaid). Confirm posts one `completed` row per tenant for the target month. |
| **Multiple partial transfers** | Tenant sends two transfers (e.g., $1,000 + $800) to stay under Zelle daily limits | First transfer stays queued as partial (does not mark the month paid). When additional transfer(s) from the same payer/tenant for the same month bring the combined total to expected rent, landlord can confirm the combined group to mark the month paid (or confirm partial manually). |
| **Non-rent and personal transfers** | Security deposit, utility share, parking rent, or personal friend transfer | Never auto-checks the rent month grid. Classified into `deposit`, `parking`, `other`, or `ignore`: deposits/other can be logged as `one-time` payments on confirm; `parking` is marked acknowledged in the inbox; `ignore` hides personal transfers without touching `payments`. |

## 5. User Flows

### 5.1 One-Time Setup (Dogfood)

1. Landlord team gets a private inbound address (`zelle+<secret_token>@<verified-resend-domain>`).
2. In Gmail (or Outlook), landlord creates a single auto-forward filter for Chase Zelle received-payment emails to that address.

### 5.2 Auto-Posted Payment Flow (Happy Path)

1. Tenant sends monthly rent via Zelle; Chase emails the landlord; the inbox filter forwards it to Keyturn via Resend Inbound.
2. Keyturn verifies the webhook signature, fetches the full email, parses Chase fields, classifies the memo as `rent`, resolves the payer to one active production-property tenant, and attributes the target month.
3. Because every auto-post gate passes (known payer, `rent` category, exact expected rent amount, target month not already paid), Keyturn inserts the `completed` rent row into `payments` and records the event as `auto_posted`.
4. The tenant's checkbox on the Payments month grid immediately shows as paid.
5. In the Zelle Inbox's "Auto-Posted" tab, the landlord can inspect the original email text and click **Undo** if anything was misattributed (which deletes the created `payments` row and returns the event to `needs_review`).

### 5.3 Review Queue Flow (Exceptions and First-Time Payers)

1. An incoming Zelle email fails any auto-post gate (unknown payer, partial/overpayment, ambiguous memo, duplicate month already marked paid, housemate lump sum, non-rent category, or parse failure).
2. The event appears in the **Zelle Inbox** under "Needs Review" with:
   - Extracted payer name, amount, date, memo, and suggested category (`rent`, `deposit`, `parking`, `other`, `ignore`).
   - Suggested tenant(s) and target month (editable).
   - Expandable view of the raw Chase email plain text for verification.
3. Landlord takes one action:
   - **Confirm (Rent):** Posts one or more `completed` `recurring` rows to `payments` (handling 1-to-1, 1-to-N split, or grouped partials) and optionally saves the payer name as an alias.
   - **Link to Existing Payment:** When the month was already manually checked off, links the Zelle event to the existing `payments` row without creating a duplicate.
   - **Confirm (Deposit / Other):** Logs a `one-time` `completed` row to `payments` without checking off the monthly rent grid.
   - **Acknowledge (Parking):** Marks the event acknowledged in the Zelle Inbox with no `payments` write.
   - **Ignore (Personal / Spam):** Marks the event ignored so it never touches `payments`.

## 6. Functional Requirements

1. **Inbound email capture and deduplication:** Every forwarded email is deduplicated by Chase transaction/confirmation ID (falling back to email `Message-ID`). Re-sending a webhook or forwarding the same email twice must never create duplicate events or duplicate `payments` rows.
2. **Chase-first deterministic parsing with Claude Haiku fallback:** Parse payer name, amount, date, memo, and transaction ID with deterministic Chase rules first. Only call Claude Haiku (`@anthropic-ai/sdk`) when deterministic extraction fails or a memo category is ambiguous.
3. **Target month attribution:** Use an explicit month name in the memo when present (e.g., "June rent" -> June); otherwise apply the cutoff rule (received on day >= 20 -> next calendar month; day < 20 -> current calendar month). Always editable before confirming in the review queue.
4. **Payer identity resolution:** Match incoming payer names against `tenant_profiles.zelle_name`, full tenant name (`name + last_name`), and a new `zelle_payer_aliases` mapping table (supporting multiple aliases per tenant and contract-level aliases for housemate lump sums). Exclude non-production properties via `nonProductionPropertyIds(properties)` and exclude non-current tenants via `lib/tenant/status.js` for automatic matching (still selectable manually in review).
5. **Strict auto-post safety gates:** Auto-post ONLY when all conditions hold:
   - Parsed cleanly with a valid amount > 0 and transaction/message ID.
   - Category is unambiguously `rent`.
   - Payer matches a single known tenant (or explicitly mapped lump-sum contract) with no ambiguity.
   - Amount matches expected monthly rent (exact match; no tolerance guessing in v1).
   - Target `(tenant_id, YYYY-MM)` does not already have a `completed` rent row in `payments`.
   - Never modify `payments.ach_status` (owned by Stripe).
6. **Auditability and Undo:** Every `zelle_events` row stores extracted fields, raw email plain text, match confidence/reason, processing status, and linked `payment_ids`. Auto-posted events support one-click Undo.
7. **Bilingual landlord UI:** Every new landlord-visible string (headings, tabs, status pills, buttons, empty states, tooltips, errors, toasts) must be added to both `T.en` and `T.zh` in [lib/i18n/strings.js](file:///Users/brianmar/workspace/propmanager/lib/i18n/strings.js).

## 7. Acceptance Criteria

- Forwarding a real Chase Zelle alert for a known tenant with exact monthly rent auto-posts a `completed` `payments` row within seconds and checks off the right month in the Payments grid.
- Forwarding the same email a second time is a no-op (no second event, no second payment).
- Forwarding a Zelle alert from a parent's name queues it in "Needs Review"; confirming with "Remember alias" posts the payment and causes the next email from that parent to auto-post.
- Forwarding a housemate lump sum lets the landlord split and confirm across all tenants on that contract in one step.
- Forwarding two partial transfers in the same month keeps the month unpaid until combined/confirmed, rather than prematurely checking off the month grid.
- Forwarding a security deposit, parking transfer, or personal Zelle transfer never checks off the rent month grid.
- Clicking **Undo** on an auto-posted event removes the created `payments` row, unchecks the month grid, and moves the event back to "Needs Review."
- All new tables enforce `is_team_member(landlord_id)` RLS so no landlord team can read or mutate another team's Zelle events or aliases.

## 8. Open Inputs Needed Before Implementation

- **Chase Zelle alert email sample:** Verified (2026-11-25) from a real Chase `.eml` (HTML-only email with headline + 4-row table: `Amount`, `Sent on`, `Transaction number`, `Memo`). Sanitized fixtures will be built from this exact layout without storing personal data.
- **Resend Inbound MX verification:** Deferred until Phase 4 live testing (not blocking Phases 1-3).
