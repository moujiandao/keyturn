# PropManager architecture and flow review

Reviewed 2026-09-24. Checkout: `/Users/brianmar/workspace/propmanager`, branch `feat/email-generator`, commit `e56a571`. The working tree was clean before and after inspection. This is an assessment and a proposed direction, not an implementation or deployment.

The highest priority is API authorization. Keep the current Next.js/Supabase stack and evolve it as a modular monolith. The existing URL routing, pure domain functions, mappers, injected adapters, and parking database constraints are good foundations. A rewrite would introduce migration risk without fixing the immediate correctness gaps.

## Evidence and limits

| Check | Result |
| --- | --- |
| `npm test` | 195 passed, 0 failed, 0 skipped |
| `npm run lint` | Failed: 22 errors, 10 warnings |
| `npm run build` | Passed |
| Anonymous handler probes | With the Supabase SDK replaced by an in-memory fake, account listing, property update, and payment deletion reached privileged operations and returned HTTP 200 without a session |
| Loader failure probe | When all 18 landlord queries returned an error, `loadAllData` resolved with empty collections instead of rejecting |
| Checked-in CI and installed local hooks | No tracked `.github`, `.husky`, or `.githooks` files found; no active local Git hooks found; no `core.hooksPath` configured |
| Production and external services | Not exercised. No live payments, emails, destructive API calls, or database mutations performed |

The isolated probes execute the source handlers with fake dependencies. They establish missing handler checks, not whether a deployed environment has additional upstream protection. Actual deployed RLS policies, schema, service configuration, browser behavior, bundle sizes, and latency remain unverified. No dedicated type-check script is configured. A successful build does not cover lint, permissions, or business behavior.

## Current flow

1. **Entry and identity:** public home/pricing → signup or login → Supabase session → membership/tenant lookup → landlord dashboard or tenant portal. Middleware refreshes the cookie and redirects unauthenticated app-page requests. Server layouts resolve the user and role. The API handlers are separate entry points.
2. **Landlord reads:** `AppProvider` → browser Supabase client → 18 parallel collection queries → a further contract/tenant-links API request when contracts exist → mappers and derived occupancy → one shared data object. Soft navigation reuses this object. Many mutations call `refresh()`, repeating the portfolio load.
3. **Writes:** some views → mutation hook → domain core → injected adapter → RLS-protected browser write; other views → API route → service-role database/Auth/provider operation. The latter path lacks a consistent authorization interface.
4. **Turnover:** property/unit and tenant dates → derived future/current/previous status and occupancy → dashboard move-in/out queue → landlord acknowledgement. Move-out acknowledgement becomes due after the move-out day. Residential and parking leases intentionally have independent terms; moving out does not end a parking lease.
5. **Lease documents:** upload or Drive link → optional extraction → human field/tenant review → process-lease route → tenant and contract writes. The last step uses an older relationship model than manual lease creation.
6. **Email:** the local Generator groups rows and renders copyable text, without sending. Templates/Automations support a separate manual draft/review/confirm/send path and a daily cron path. Legacy Payment Reminders writes `email_settings`, but no repository engine consumes those settings.
7. **Renewals:** due queue → suppressed DocuSeal submission → review → send endpoint, gated by `RENEWALS_SEND_ENABLED` → tenant signatures/countersignature → webhook updates. Current v1 does not automatically advance the residential lease or file the result to Drive. The deployed gate value was not checked.
8. **Tenant payment:** bank form → boolean profile flag; payment button → a mismatched request contract → PaymentIntent creation route. There is no client confirmation step, and auto-pay is only a stored preference in this checkout.

## Prioritized recommendations

### 1. Critical: authorize every privileged API operation

**Confirmed:** [account listing](/Users/brianmar/workspace/propmanager/app/api/auth/list-users/route.js:3), [account deletion](/Users/brianmar/workspace/propmanager/app/api/auth/delete-user/route.js:4), [tenant update](/Users/brianmar/workspace/propmanager/app/api/auth/update-tenant/route.js:5), [property update](/Users/brianmar/workspace/propmanager/app/api/properties/update/route.js:3), and [payment deletion](/Users/brianmar/workspace/propmanager/app/api/payments/delete/route.js:3) instantiate a stateless service-role client without authenticating the caller. Tenant update can also change an Auth email or password. Other routes accept a body-supplied `landlordId` as their apparent identity check, including [batch sending](/Users/brianmar/workspace/propmanager/app/api/email/batches/[id]/send/route.js:12).

**Change:** introduce a small server-only authorization module that resolves the session, membership, and permitted action. Derive team identity from the session. Verify that every supplied property, tenant, lease, or document belongs to that team. Make the session-carrying anon client the ordinary data client; reserve an explicitly named, sessionless admin client for authorized Auth administration, trusted jobs, and verified webhooks. Public signup remains a deliberate public exception with validation and abuse controls. Cron and webhook authentication remain distinct from user authentication.

The current [service-role SSR helper](/Users/brianmar/workspace/propmanager/lib/supabase/server.js:4) mixes cookies with a privileged key. Separate those clients so authorization behavior cannot change with cookie presence. Supabase documents that a user session can replace the authorization header on a service-key client. [Supabase explanation](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z).

**Acceptance:** anonymous requests fail before side effects; tenant and team-A requests cannot read or mutate team-B resources; team membership changes are honored. The team screen should manage the current team, with any platform-wide administration explicitly separate. Page guards are insufficient for route handlers. [Next.js guidance](https://nextjs.org/docs/app/guides/authentication).

### 2. High: make the tenant payment flow truthful and complete

**Confirmed, already recorded in the changelog:** [the portal](/Users/brianmar/workspace/propmanager/property-management-app.jsx:4001) sends snake_case IDs while [the route](/Users/brianmar/workspace/propmanager/app/api/payments/create/route.js:8) expects camelCase plus a landlord ID. The portal does not consume or confirm the returned client secret. Bank connection and recurring payment only update booleans. The bank display is hardcoded demo data.

**Change:** mark these controls unavailable until the full flow exists. When implementing collection, derive the payer, lease, team, and allowed amount on the server; use Stripe's bank-collection/confirmation flow; derive displayed connection/payment state from provider-backed records. Define a validated request contract shared with its tests. Do not treat PaymentIntent creation as payment success. Use a stable idempotency key for each payment attempt.

**Acceptance:** a sandbox browser flow verifies bank setup, required actions, confirmation, processing, success, and failure. A double click/retry does not create a second payment. This is a product-scope decision: completing ACH and hiding incomplete controls have different costs.

### 3. High: separate failed reads from empty data

**Confirmed:** [the loader](/Users/brianmar/workspace/propmanager/lib/dashboard/load.js:126) repeatedly uses `result.data || []` without checking `result.error`. An injected failure across all 18 queries returned an empty portfolio. [The provider](/Users/brianmar/workspace/propmanager/components/app-store.jsx:55) catches thrown failures and still marks loading complete. The route error boundary cannot display an error that is swallowed here.

**Change:** return explicit success/error states for each read or reject required-load failures. Preserve the last successful data on refresh failure, display a stale-data/error indicator with retry, and present a distinct cold-load failure screen. Log the operation and a correlation ID without tenant-sensitive payloads.

**Acceptance:** initial failure shows an error, a legitimate empty portfolio shows onboarding, and refresh failure preserves existing rows. An old overlapping refresh must not overwrite a newer result.

### 4. High: use one lease-write interface for manual entry and document import

**Confirmed:** [manual creation](/Users/brianmar/workspace/propmanager/app/api/contracts/create/route.js:17) creates one contract and multiple `contract_tenants` links. [Document import](/Users/brianmar/workspace/propmanager/app/api/documents/process-lease/route.js:117) loops over people and inserts a separate contract with `tenant_id`, without junction links. [The read mapper](/Users/brianmar/workspace/propmanager/lib/contracts/mappers.js:9) gets tenants exclusively from the junction. Depending on deployed legacy columns, imported contracts can fail or lack the links that current reads and renewals require.

The importer also copies one extracted email/phone onto every approved person and matches existing tenants by name. [Extraction](/Users/brianmar/workspace/propmanager/app/api/documents/parse/route.js:102) parses JSON but does not validate its field types and domain rules.

**Change:** create a lease module whose interface owns one agreement plus its participants. Both entry paths call it. Keep extraction as a proposed draft, validate the output, require explicit tenant matching, preserve per-person contact data, and keep the human review gate. Repair the junction's RLS/read path instead of relying on an unguarded service-role fallback.

**Acceptance:** importing a two-person lease creates one contract with two links; repeating the import is safe; conflicting name matches require a selection; unapproved fields remain unchanged.

### 5. High: make multi-record changes atomic

**Confirmed:** [lease editing](/Users/brianmar/workspace/propmanager/app/api/contracts/update/route.js:34) deletes existing tenant links before inserting replacements. If insertion fails, the old relationship has already disappeared. [Lease deletion](/Users/brianmar/workspace/propmanager/app/api/contracts/delete/route.js:13) also performs dependent changes as separate requests. Import and Auth onboarding mix several writes with partial rollback.

**Change:** perform related Postgres writes in one authorized transaction, exposed through a narrowly scoped RPC or equivalent server operation. Keep external Auth/email/document operations outside that transaction, with an operation record and explicit retry/compensation state. The lease module should hide these ordering requirements from callers.

**Acceptance:** injected failure after each database step leaves the old lease and links intact. External failure remains visible and retryable without duplicating the business record.

### 6. High: add durable delivery and reconciliation for external effects

**Confirmed:** the email batch's [atomic draft-to-queued claim](/Users/brianmar/workspace/propmanager/app/api/email/batches/[id]/send/route.js:53) is good concurrency protection. But a crash after claiming can strand a message in `queued`; subsequent batch sends select only drafts. [The send wrapper](/Users/brianmar/workspace/propmanager/lib/email/send.js:50) supplies no provider idempotency key. Batch finalization can report `sent` despite failed recipients. [The Stripe webhook](/Users/brianmar/workspace/propmanager/app/api/webhooks/stripe/route.js:18) ignores database errors and returns success, and does not record processed event IDs.

**Change:** extend existing message/operation tables into a durable work queue: claim lease/expiry, attempt count, retry time, last error, provider ID, and stable idempotency key. Preserve the explicit reviewed-send gate. Reconcile uncertain sends; do not blindly resend after the provider's deduplication window. Record webhook receipt durably before acknowledgement, deduplicate events, and prevent older payment events from regressing current state.

**Acceptance:** simulate a crash before sending, a timeout after provider acceptance, database finalization failure, duplicate events, and reordered events. Resend retains idempotency keys for 24 hours, so local durable reconciliation remains necessary. [Resend guidance](https://resend.com/docs/dashboard/emails/idempotency-keys). Stripe documents retries, duplicates, and unordered delivery. [Stripe guidance](https://docs.stripe.com/webhooks).

Tradeoff: start with the existing database and scheduler. A separate queue service is unnecessary until the operational workload justifies it.

### 7. Medium: replace portfolio-wide loading with bounded reads

**Confirmed:** [the landlord loader](/Users/brianmar/workspace/propmanager/lib/dashboard/load.js:67) loads 18 collections for every cold page. Most have no pagination; email history has a fixed 300-row cap. Completeness of the other collections depends on deployed API row limits. Page calculations and deletion prechecks use these arrays. No latency or bundle benchmark was performed.

**Change:** retain the layout shell, identity, language, and useful navigation cache. Introduce page/feature queries with explicit columns, pagination, and server-side summaries. Invalidate affected queries after writes. Fetch a property's units and relevant tenant dates together so derived occupancy remains correct. Do not replace a complete aggregate with a paginated subset and continue summing it as if it were complete.

**Acceptance:** opening maintenance does not fetch email bodies, documents, and parking data. Summary totals remain correct when fixtures exceed a page/API cap. Navigating back can reuse fresh cached results.

Tradeoff: migrate one feature at a time; a new state/query library is optional and should be justified by the actual caching/concurrency needs.

### 8. Medium: move feature UI and hooks out of the shared component library

**Confirmed:** [the main library](/Users/brianmar/workspace/propmanager/property-management-app.jsx:1) has 4,511 lines. Phase 2 has 1,277, email 875, and renewals 337. The main library imports those feature libraries while they import its primitives/hooks. [The sidebar](/Users/brianmar/workspace/propmanager/components/sidebar.jsx:9) imports its icon from this same graph.

**Change:** put reusable UI primitives in `components/ui`, and feature pages/hooks next to their feature modules. Enforce a one-way dependency direction: route → feature UI → domain module/adapter, with shared UI independent of features. Preserve the existing inline-style policy and domain cores. Remove dead imports before measuring route chunks; source file size alone is not bundle-size evidence.

**Acceptance:** shared UI/sidebar imports do not pull in feature modules, feature cycles disappear, and a page change has a small, local review surface.

### 9. Medium: make optimistic rollback operation-specific

**Confirmed:** [maintenance rollback](/Users/brianmar/workspace/propmanager/property-management-app.jsx:3071) restores an entire collection snapshot. If two cards change concurrently and one fails, restoring that snapshot can erase the other card's successful local update. There is also no refresh generation check in the provider.

**Change:** roll back the affected record/fields only, conditional on the same pending mutation, or serialize writes for the same record. Use operation IDs and targeted invalidation. State updater functions should compute state without being used to capture mutable values needed by an async operation.

**Acceptance:** two cards move concurrently, one succeeds and one fails, and only the failed move rolls back. Reversed response order does not restore stale data.

### 10. Medium: make verification and database setup reproducible

**Confirmed:** [the test command](/Users/brianmar/workspace/propmanager/package.json:10) covers selected domain test globs. No route-handler, RLS integration, or browser suites were found. The current lint baseline fails. Migration/setup instructions are scattered through scripts, including [manual parking sequencing](/Users/brianmar/workspace/propmanager/scripts/add-parking.sql:34) and [a team migration mixing schema and specific production IDs](/Users/brianmar/workspace/propmanager/scripts/migrate-team-landlords.sql:1).

**Change:** add an ordered migration history and reproducible local schema, separating schema changes, synthetic seeds, and one-off production repairs. Keep the fast core tests, then add a small set of real adapter/RLS/HTTP tests plus browser smoke tests for login, tenant/lease creation, maintenance, email review, and sandbox payments. Add CI gates for tests, lint, and build, and verify the branch-protection configuration separately.

**Acceptance:** a fresh local database can be recreated without production IDs; team-A/team-B/tenant/anonymous fixtures exercise authorization; CI fails on the actual payment payload mismatch and a lost lease link. Restore a clean lint baseline without disabling the rules to hide findings.

## Product-flow decisions to make explicitly

- **Legacy Payment Reminders:** settings exist without a sender. Label or hide the unavailable behavior now; implement an engine only if still needed. Combining it with Email Automation is a product/architecture decision requiring approval, and contradicts the current separation rule unless intentionally revised.
- **Team administration:** the current screen lists platform Auth users rather than managing the current team's membership. Decide whether platform administration is needed at all, then give it a separate authorization model.
- **Turnover workspace:** the dashboard already provides the strongest workflow spine. A useful incremental improvement is a tenant/unit detail checklist linking existing lease, document, deposit, maintenance, and parking actions. Show parking's separate end date explicitly. Avoid automatically coupling independent agreements.
- **Pricing and renewals:** pricing tiers are not enforced and signed renewals do not automatically advance leases. Make product claims reflect that current capability. These gaps are already noted in [the changelog](/Users/brianmar/workspace/propmanager/CHANGELOG.md:3).
- **Responsive tenant experience:** the authenticated shell has a fixed 240px sidebar and fixed left margin. Verify it on narrow screens and introduce a collapsed navigation pattern before inviting tenants to use it on phones. This is a source-level layout concern, not a completed device test.

## Suggested sequence

1. Contain privileged API access and add anonymous/cross-team regression tests. Hide or clearly label incomplete tenant payment controls.
2. Fix explicit read errors, unify lease writes/import, and make lease changes transactional. Establish a clean lint/CI baseline alongside these fixes.
3. Add provider idempotency, durable retry/reconciliation, and webhook persistence. Complete ACH only if it remains a chosen product goal.
4. Extract feature UI/hooks, introduce bounded reads and targeted invalidation, and add browser coverage as each flow moves.

No application files were edited, committed, merged, or deployed. Proposed changes to security interfaces, database contracts, and payment scope remain decisions for approval before implementation.
