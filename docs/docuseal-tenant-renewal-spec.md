# SPEC: DocuSeal Tenant Lease-Renewal Workflow

**Status:** v1 (Phases 1-3, 5) + Phase 4 (4A Drive auto-filing & 4B manual lease-term advance) implemented in code; live external provisioning (§7) remains manual
**Date:** 2026-06-19 (Phase 4 implemented 2026-11-25)
**Owner:** Brian
**Type:** Feature spec

---

## 1. Summary

Automate the annual lease-renewal signing flow. The system detects 12-month
leases nearing expiry, pre-fills a renewal/extension addendum from existing
PropManager data, lets the landlord review the filled draft, then sends it via
DocuSeal for the tenant(s) to sign and the landlord to countersign. Tenants sign
directly from their email — **no tenant portal login**. Signed results are matched
back to tenant records by email.

This is a **deliberate, low-volume** workflow: ~8 renewals/year, ~20 signatures
total. It is intentionally *not* wired into the high-volume cron/email-automation
system (Resend), which handles date-triggered reminders to many tenants.

---

## 2. Locked Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| DocuSeal deployment | **Cloud, free tier** | ~20 sigs/yr fits free tier; self-hosting is all ops cost, no benefit at this volume. Stack is already all-SaaS. |
| Document model | **Reusable template + pre-fill** | Renewal is the same form 8×/year with different values; clean structured data already exists. |
| Renewal type | **Extension addendum, same rate** | Addendum references the original lease on "X date", extends 12 months, keeps the existing rent. No new-rent input required. |
| Signers | **All housemates parallel → landlord countersigns last (sequential)** | DocuSeal `order` groups: tenants share order `0`, landlord is order `1`. Cosigners deferred to v2. |
| Sender | **DocuSeal sends signer emails** (not Resend) | Reuses DocuSeal's native signing-link emails + reminders; keeps Resend system separate. |
| Trigger | **Date-surfaced review queue + confirm-to-send gate** | Leases ~3–5 months from `end_date` surface for review; nothing emails until the landlord confirms. |
| Review UX | **DocuSeal-rendered preview** | Create submission with emails suppressed; landlord previews the filled doc; confirm releases invites. |
| "X date" stability | **Immutable `original_lease_date` pinned at chain root** | Addendum reference must never drift across multiple renewals. |
| Signed-doc filing | **Google Drive (property folder) + link in PropManager** *(deferred to v2 — see §6)* | Matches existing Drive-based document handling. |
| Lease term advance | **Manual confirm, never auto** | Don't mutate governing lease dates off a webhook. |
| Bad emails | **Block + flag renewals with placeholder/missing signer emails** | Placeholder `@placeholder.local` addresses can't receive or be matched; silent partial-send is the failure mode to avoid. |

---

## 3. Data Model — `lease_renewals` (new table)

First-class record of each renewal attempt; serves as the **review queue**, the
**renewal chain**, and the **audit trail**. Conceptual fields (DDL at build time):

- Identity & links: renewal id, contract id, property id, landlord id, signer tenant ids
- `original_lease_date` — immutable "X date", copied to every renewal in the chain
- New term: `new_term_start`, `new_term_end` (derived: start = current `end_date` + 1 day, end = +12 months), carried-over `rent_amount`
- Workflow `status`: `draft → pending_review → sent → signed → countersigned` (+ `declined`/`blocked`)
- DocuSeal linkage: `submission_id`, per-submitter ids, per-signer signed timestamps
- Result: signed-doc link (v2 Drive link), `applied_to_contract` flag

The existing `contracts` table is unchanged. Renewals live alongside it. The chain
is walked (ordered by term) to compute the next renewal from the latest signed one.

---

## 4. DocuSeal API Contract (verified 2026-06-19)

- **Create submission:** `POST /submissions` — `template_id`, `submitters[]` each with
  `email`, `values{}` (pre-fill by field name), `order`. Global `order: "preserved"`
  = sequential; same submitter `order` number = a parallel group.
- **Suppress emails:** `send_email: false` on create (enables the review gate).
- **Release invite (the gate):** `PUT /submitters/{id}` with `send_email: true` after
  landlord confirms. Higher-order countersigner is auto-notified once tenants finish.
- **Signed PDF:** `GET /submissions/{id}/documents?merge=true`.
- **Webhooks:** `form.completed` (+ related) events. HMAC-SHA256 via
  `X-Docuseal-Signature` header (`timestamp.signature`), secret `whsec_…` — same
  verification shape as the existing Resend webhook (`app/api/webhooks/resend`).

---

## 5. Phases (v1)

**Phase 1 — Data + detection**
- Add `lease_renewals` table + snake→camel mapper.
- Surface a "Renewals due" queue: leases within the window of `end_date`.
- Compute next term from the latest signed renewal in the chain.
- Flag rows with placeholder/missing signer emails as not-sendable.

**Phase 2 — Draft + review gate**
- "Prepare renewal" builds a DocuSeal submission (`send_email: false`) with pre-filled
  fields (names, derived term dates, carried rate, original lease date).
- Landlord previews the DocuSeal-rendered filled addendum.
- Confirm releases tenant invites (`PUT /submitters`); status `draft → pending_review → sent`.

**Phase 3 — Signing + webhook**
- New webhook route (same shape as Resend/Stripe) advancing per-signer status.
- Enforce tenants-then-landlord ordering via DocuSeal order groups.
- Match signer emails back to `tenant_profiles`; stamp signed timestamps; status → `signed`/`countersigned`.

**Phase 5 — Polish**
- Bilingual strings (`T.en`/`T.zh`) for all new UI (per project translation rule).
- Status badges; build + one targeted browser check.

---

## 6. Phase 4 — Filing + lease advance (Implemented)

Implemented in code (`scripts/add-lease-renewal-phase4.sql`, `lib/google/drive.js`, `lib/docuseal/filing.js`, `lib/docuseal/webhook.js`, `lib/docuseal/advance.js`, `app/api/webhooks/docuseal/route.js`, `app/api/renewals/file/route.js`, `app/api/renewals/advance/route.js`, `renewal-components.jsx`, `phase2-components.jsx`):

- **Phase 4A (Auto-file signed PDF to Google Drive):**
  - On countersign completion (`form.completed` in `app/api/webhooks/docuseal/route.js`), persists `countersigned` status first, downloads the merged signed PDF (`GET /submissions/{id}/documents?merge=true` + binary fetch without leaking `X-Auth-Token` to third-party origins), uploads it to the property's Google Drive Shared Drive folder, records a `documents` row (`document_type: 'lease_renewal'`), and stores `signed_document_url` and `document_id` on `lease_renewals`.
  - Duplicate webhook replays are idempotent. Drive errors (missing folder link, personal My Drive folder, API failures) are recorded in `filing_error` without blocking `countersigned` or failing the webhook; landlords can retry via `POST /api/renewals/file` from `/renewals`.
  - Shared Google Drive client (`lib/google/drive.js`) uses `drive.readonly` + `drive.file`, passes `supportsAllDrives=true` / `includeItemsFromAllDrives=true`, and verifies `driveId` (Shared Drive) before upload so personal My Drive folders fail fast with an actionable error.
- **Phase 4B (Manual confirm to advance lease term):**
  - Webhooks never mutate `contracts`.
  - `/renewals` surfaces countersigned unapplied renewals with a "Signed - ready to advance" badge, a "Ready to advance" stat card, and an explicit confirmation modal (`AdvanceLeaseModal`).
  - Confirming calls `POST /api/renewals/advance`, which invokes the atomic `public.advance_lease_renewal(p_renewal_id, p_landlord_id)` RPC to advance `contracts.end_date` to `new_term_end`, preserve `contracts.start_date` and `original_lease_date`, and flip `lease_renewals.applied_to_contract = true` idempotently.

---

## 7. External Prerequisites (manual, not code)

- Apply `scripts/add-lease-renewals.sql` and `scripts/add-lease-renewal-phase4.sql` in Supabase SQL Editor.
- Create DocuSeal Cloud account and build the reusable renewal addendum template with exact pre-fill field names:
  `Tenant Name`, `Property Address`, `Original Lease Date`, `New Term Start`, `New Term End`, `Monthly Rent`.
- Configure environment variables in Vercel / runtime:
  - `DOCUSEAL_API_KEY`
  - `DOCUSEAL_RENEWAL_TEMPLATE_ID`
  - `DOCUSEAL_WEBHOOK_SECRET` (`whsec_…`)
  - `RENEWALS_SEND_ENABLED=true` (when ready to release live signing emails)
  - `GOOGLE_SERVICE_ACCOUNT_JSON` (base64-encoded service account key JSON)
- Confirm each property's `drive_link` points to a folder inside a Google **Shared Drive** (not a personal My Drive folder) shared with the service account email as Content Manager / Contributor, and verify a live `form.completed` webhook payload against DocuSeal Cloud.

---

## 8. Risks

- **Email matching is the fragile seam.** DocuSeal returns whoever signed; matching on email
  is only as good as tenant email hygiene. Blocking placeholders up front is the main defense.
- **Webhook payload shape** must be confirmed against DocuSeal's live `form.completed` payload
  before Phase 3 (does it carry submitter email + submission id directly).
- **Service-account → Drive write** (v2) is the likeliest "works in theory, fails on quota" spot;
  the Shared Drive check de-risks it.

---

## Sources
- [DocuSeal API Reference](https://www.docuseal.com/docs/api)
- [Send documents for signature via API](https://www.docuseal.com/guides/send-documents-for-signature-via-api)
- [Pre-fill PDF form fields with API](https://www.docuseal.com/guides/pre-fill-pdf-document-form-fields-with-api)
- [Download Signed Documents](https://www.docuseal.com/guides/download-signed-documents)
- [Use Webhooks](https://www.docuseal.com/resources/use-webhooks)
