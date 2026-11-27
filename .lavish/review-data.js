window.PM_FLOWS = {
  "architecture": {
    "current": {
      "lanes": [
        [
          "Screen reads",
          [
            [
              "Page guard",
              "Session + role"
            ],
            [
              "Portfolio loader",
              "18 queries + link lookup"
            ],
            [
              "Shared store",
              "All feature collections"
            ],
            [
              "Route view",
              "Client rendering"
            ]
          ]
        ],
        [
          "Seamed writes",
          [
            [
              "Feature UI",
              "User action"
            ],
            [
              "Mutation hook",
              "Optimistic update"
            ],
            [
              "Core + adapter",
              "Domain rules"
            ],
            [
              "Supabase",
              "Anon client + RLS"
            ]
          ]
        ],
        [
          "Privileged API path",
          [
            [
              "Direct request",
              "Page guard bypassed"
            ],
            [
              "Body-supplied IDs",
              "No caller verification",
              true
            ],
            [
              "Service-role client",
              "RLS bypass",
              true
            ],
            [
              "Privileged operation",
              "Database / Auth / providers"
            ]
          ]
        ]
      ],
      "note": "Confirmed gap: several API handlers have no session or team-ownership check."
    },
    "proposed": {
      "lanes": [
        [
          "Screen reads",
          [
            [
              "Persistent layout",
              "Identity + language"
            ],
            [
              "Feature query",
              "Explicit columns + scope"
            ],
            [
              "Bounded result",
              "Pagination + summaries"
            ],
            [
              "Route view",
              "Loading / error / success"
            ]
          ]
        ],
        [
          "Business writes",
          [
            [
              "Validated request",
              "Stable input contract"
            ],
            [
              "Authorize action",
              "Session + team + resource"
            ],
            [
              "Domain module",
              "One business interface"
            ],
            [
              "Persistence",
              "RLS + atomic operations"
            ]
          ]
        ],
        [
          "External effects",
          [
            [
              "Approved action",
              "Preserve human review"
            ],
            [
              "Durable work record",
              "State + attempt + claim"
            ],
            [
              "Provider call",
              "Stable idempotency key"
            ],
            [
              "Reconciliation",
              "Verified webhook + retry"
            ]
          ]
        ]
      ],
      "note": "Proposed direction: evolve the existing modular monolith in small feature slices."
    }
  },
  "identity": {
    "current": {
      "lanes": [
        [
          "Sign in",
          [
            [
              "Home / pricing",
              "Public pages"
            ],
            [
              "Login / signup",
              "Supabase session"
            ],
            [
              "Role lookup",
              "Team member or tenant"
            ],
            [
              "App layout",
              "Dashboard or portal"
            ]
          ]
        ],
        [
          "Team screen",
          [
            [
              "Landlord navigation",
              "Settings / team"
            ],
            [
              "List-users API",
              "No caller check",
              true
            ],
            [
              "Auth admin list",
              "Platform-wide users",
              true
            ]
          ]
        ]
      ],
      "note": "The current team screen uses a platform-wide Auth-user list."
    },
    "proposed": {
      "lanes": [
        [
          "Sign in",
          [
            [
              "Login",
              "Verified session"
            ],
            [
              "Identity module",
              "Team and tenant identity"
            ],
            [
              "Role destination",
              "Existing route structure"
            ]
          ]
        ],
        [
          "Team management",
          [
            [
              "Team screen",
              "Membership actions"
            ],
            [
              "Authorize action",
              "Current team + permission"
            ],
            [
              "Scoped members",
              "Current team only"
            ]
          ]
        ],
        [
          "Optional platform admin",
          [
            [
              "Separate surface",
              "Only if needed"
            ],
            [
              "Explicit privilege",
              "Server enforced"
            ],
            [
              "Admin operations",
              "Audit trail"
            ]
          ]
        ]
      ],
      "note": "Platform administration needs a separate decision and authorization model."
    }
  },
  "turnover": {
    "current": {
      "lanes": [
        [
          "Tenant transition",
          [
            [
              "Property + unit",
              "Tenant assignment"
            ],
            [
              "Move dates",
              "Status + occupancy derived"
            ],
            [
              "Dashboard queue",
              "Upcoming / awaiting"
            ],
            [
              "Landlord confirms",
              "Acknowledgement timestamp"
            ]
          ]
        ],
        [
          "Related records",
          [
            [
              "Residential lease",
              "Own term dates"
            ],
            [
              "Parking lease",
              "Independent end date"
            ],
            [
              "Deposit / documents",
              "Separate screens"
            ]
          ],
          "independent"
        ]
      ],
      "note": "Move-out does not automatically end parking; that independence is intentional."
    },
    "proposed": {
      "lanes": [
        [
          "Turnover workspace",
          [
            [
              "Existing queue",
              "Keep date-derived state"
            ],
            [
              "Tenant / unit detail",
              "Linked action checklist"
            ],
            [
              "Related actions",
              "Lease / deposit / documents"
            ],
            [
              "Landlord confirms",
              "Retain explicit acknowledgement"
            ]
          ]
        ],
        [
          "Parking",
          [
            [
              "Separate agreement",
              "Keep independent terms"
            ],
            [
              "Visible reminder",
              "Review parking end date"
            ],
            [
              "Explicit action",
              "End only when intended"
            ]
          ]
        ]
      ],
      "note": "Product proposal: connect existing actions without merging independent agreements."
    }
  },
  "leases": {
    "current": {
      "lanes": [
        [
          "Manual lease",
          [
            [
              "Lease form",
              "Multiple tenants"
            ],
            [
              "Create route",
              "One contract"
            ],
            [
              "Participant links",
              "contract_tenants"
            ],
            [
              "Readers / renewals",
              "Use junction links"
            ]
          ]
        ],
        [
          "Document import",
          [
            [
              "Upload + extract",
              "AI JSON"
            ],
            [
              "Human review",
              "People + fields"
            ],
            [
              "Person-by-person loop",
              "One contract per person",
              true
            ],
            [
              "Legacy tenant_id",
              "No junction links",
              true
            ]
          ]
        ],
        [
          "Edit failure window",
          [
            [
              "Update contract",
              "First request"
            ],
            [
              "Delete old links",
              "Second request"
            ],
            [
              "Insert new links",
              "Can fail after deletion",
              true
            ]
          ]
        ]
      ],
      "note": "Confirmed mismatch: manual entry and document import write different relationship models."
    },
    "proposed": {
      "lanes": [
        [
          "Manual entry",
          [
            [
              "Lease form",
              "Validated fields"
            ],
            [
              "Lease module",
              "One agreement + participants"
            ]
          ]
        ],
        [
          "Document import",
          [
            [
              "Extraction draft",
              "Validate + match people"
            ],
            [
              "Human review",
              "Approved fields"
            ],
            [
              "Lease module",
              "Same business operation"
            ]
          ]
        ],
        [
          "Persistence",
          [
            [
              "Authorized operation",
              "Team and resource checks"
            ],
            [
              "One transaction",
              "Contract + participant links"
            ],
            [
              "Consistent read model",
              "Same data for UI + renewals"
            ]
          ]
        ]
      ],
      "note": "Both input paths call the same lease interface; failed writes preserve prior relationships."
    }
  },
  "payments": {
    "current": {
      "lanes": [
        [
          "Bank connection",
          [
            [
              "Bank form",
              "Routing / account input"
            ],
            [
              "Profile write",
              "bank_connected = true",
              true
            ],
            [
              "Connected display",
              "Hardcoded bank details",
              true
            ]
          ]
        ],
        [
          "Payment",
          [
            [
              "Pay button",
              "snake_case IDs"
            ],
            [
              "Create route",
              "Expects camelCase IDs",
              true
            ],
            [
              "PaymentIntent",
              "If request corrected"
            ],
            [
              "Client confirmation",
              "Missing",
              true
            ]
          ]
        ],
        [
          "Auto-pay",
          [
            [
              "Toggle",
              "User preference"
            ],
            [
              "Profile boolean",
              "No charging engine found",
              true
            ]
          ]
        ]
      ],
      "note": "Already documented gaps: bank connection, payment confirmation, and auto-pay are incomplete."
    },
    "proposed": {
      "lanes": [
        [
          "Immediate",
          [
            [
              "Incomplete controls",
              "Hide / mark unavailable"
            ],
            [
              "Scope decision",
              "Choose whether to finish ACH"
            ]
          ]
        ],
        [
          "Complete ACH if chosen",
          [
            [
              "Server payment request",
              "Payer + lease + amount verified"
            ],
            [
              "Stripe collection",
              "Bank setup + required actions"
            ],
            [
              "Confirm payment",
              "Processing state"
            ],
            [
              "Verified webhook",
              "Persist final outcome"
            ]
          ]
        ],
        [
          "Retry handling",
          [
            [
              "Payment attempt",
              "Stable operation ID"
            ],
            [
              "Provider idempotency",
              "No duplicate attempt"
            ],
            [
              "Durable event receipt",
              "Deduplicate + reconcile"
            ]
          ]
        ]
      ],
      "note": "PaymentIntent creation is only one step; success must reflect provider-backed state."
    }
  },
  "email": {
    "current": {
      "lanes": [
        [
          "Local generator",
          [
            [
              "Unit / month / amount",
              "Group recipient rows"
            ],
            [
              "Render template",
              "Client state"
            ],
            [
              "Copy output",
              "No send operation"
            ]
          ]
        ],
        [
          "Manual batch",
          [
            [
              "Automation",
              "Stage drafts"
            ],
            [
              "Review + confirm",
              "Human gate"
            ],
            [
              "Atomic claim",
              "draft → queued"
            ],
            [
              "Resend + finalize",
              "Crash recovery gap",
              true
            ]
          ]
        ],
        [
          "Automatic",
          [
            [
              "Daily cron",
              "Secret authenticated"
            ],
            [
              "Due audience",
              "Event + scope"
            ],
            [
              "Claim + send",
              "Inside request"
            ]
          ]
        ],
        [
          "Legacy reminders",
          [
            [
              "Settings page",
              "Toggle flags"
            ],
            [
              "email_settings",
              "No sender found",
              true
            ]
          ]
        ]
      ],
      "note": "The Generator, reviewed batches, automatic jobs, and legacy reminders are distinct flows."
    },
    "proposed": {
      "lanes": [
        [
          "Local generator",
          [
            [
              "Group + render",
              "Keep local"
            ],
            [
              "Copy output",
              "Keep no-send behavior"
            ]
          ]
        ],
        [
          "Delivery",
          [
            [
              "Review or due job",
              "Preserve existing approval rules"
            ],
            [
              "Durable queue record",
              "Claim expiry + retry state"
            ],
            [
              "Resend",
              "Stable idempotency key"
            ],
            [
              "Reconcile",
              "Sent / failed / uncertain"
            ]
          ]
        ],
        [
          "Legacy reminders",
          [
            [
              "Truthful availability",
              "Label / hide unavailable engine"
            ],
            [
              "Product decision",
              "Implement or retire separately"
            ]
          ]
        ]
      ],
      "note": "Use existing message tables first; recover uncertain sends instead of blindly resending."
    }
  },
  "renewals": {
    "current": {
      "lanes": [
        [
          "Preparation",
          [
            [
              "Due queue",
              "Term derivation"
            ],
            [
              "DocuSeal draft",
              "Suppressed invitation"
            ],
            [
              "Landlord review",
              "Explicit confirmation"
            ]
          ]
        ],
        [
          "Sending and signing",
          [
            [
              "Send gate",
              "Environment flag required"
            ],
            [
              "Release invitations",
              "Sequential external calls"
            ],
            [
              "Sign + countersign",
              "Webhook updates"
            ],
            [
              "Lease / Drive",
              "No automatic advancement"
            ]
          ]
        ]
      ],
      "note": "Sending is configuration-gated; the deployed flag and provider behavior were not tested."
    },
    "proposed": {
      "lanes": [
        [
          "Preparation",
          [
            [
              "Due queue",
              "Keep shared term rules"
            ],
            [
              "Validated participants",
              "Same lease module"
            ],
            [
              "Review + gate",
              "Preserve explicit release"
            ]
          ]
        ],
        [
          "Durable release",
          [
            [
              "Authorized operation",
              "Server-derived identity"
            ],
            [
              "Per-signer progress",
              "Claim + retry state"
            ],
            [
              "DocuSeal",
              "Reconcile uncertain results"
            ],
            [
              "Verified webhook",
              "Durable status update"
            ]
          ]
        ]
      ],
      "note": "Automatic lease advancement and Drive filing remain separate product decisions."
    }
  }
};
window.PM_FINDINGS = [
  {
    "id": "R01",
    "priority": "Critical",
    "body": "**Confirmed:** [account listing](/Users/brianmar/workspace/propmanager/app/api/auth/list-users/route.js:3), [account deletion](/Users/brianmar/workspace/propmanager/app/api/auth/delete-user/route.js:4), [tenant update](/Users/brianmar/workspace/propmanager/app/api/auth/update-tenant/route.js:5), [property update](/Users/brianmar/workspace/propmanager/app/api/properties/update/route.js:3), and [payment deletion](/Users/brianmar/workspace/propmanager/app/api/payments/delete/route.js:3) instantiate a stateless service-role client without authenticating the caller. Tenant update can also change an Auth email or password. Other routes accept a body-supplied `landlordId` as their apparent identity check, including [batch sending](/Users/brianmar/workspace/propmanager/app/api/email/batches/[id]/send/route.js:12).\n\n**Change:** introduce a small server-only authorization module that resolves the session, membership, and permitted action. Derive team identity from the session. Verify that every supplied property, tenant, lease, or document belongs to that team. Make the session-carrying anon client the ordinary data client; reserve an explicitly named, sessionless admin client for authorized Auth administration, trusted jobs, and verified webhooks. Public signup remains a deliberate public exception with validation and abuse controls. Cron and webhook authentication remain distinct from user authentication.\n\nThe current [service-role SSR helper](/Users/brianmar/workspace/propmanager/lib/supabase/server.js:4) mixes cookies with a privileged key. Separate those clients so authorization behavior cannot change with cookie presence. Supabase documents that a user session can replace the authorization header on a service-key client. [Supabase explanation](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z).\n\n**Acceptance:** anonymous requests fail before side effects; tenant and team-A requests cannot read or mutate team-B resources; team membership changes are honored. The team screen should manage the current team, with any platform-wide administration explicitly separate. Page guards are insufficient for route handlers. [Next.js guidance](https://nextjs.org/docs/app/guides/authentication).",
    "title": "Check who is allowed to use every privileged API",
    "summary": "The login screen protects pages, but several API handlers can perform admin actions without checking the caller.",
    "now": "Some endpoints can list accounts or change records using a database key that bypasses normal row permissions. The handler does not first establish who is calling or which team owns the record.",
    "why": "Someone can call an API directly without going through the screen. A hidden button or a page redirect therefore cannot protect these operations.",
    "change": "Put a shared authorization check at the start of each protected operation: identify the user, resolve their team, check the requested action and record, then perform the write.",
    "example": "Example risk: changing a property ID in a request must never let team A edit team B’s property. Anonymous requests should stop before any database action."
  },
  {
    "id": "R02",
    "priority": "High",
    "body": "**Confirmed, already recorded in the changelog:** [the portal](/Users/brianmar/workspace/propmanager/property-management-app.jsx:4001) sends snake_case IDs while [the route](/Users/brianmar/workspace/propmanager/app/api/payments/create/route.js:8) expects camelCase plus a landlord ID. The portal does not consume or confirm the returned client secret. Bank connection and recurring payment only update booleans. The bank display is hardcoded demo data.\n\n**Change:** mark these controls unavailable until the full flow exists. When implementing collection, derive the payer, lease, team, and allowed amount on the server; use Stripe's bank-collection/confirmation flow; derive displayed connection/payment state from provider-backed records. Define a validated request contract shared with its tests. Do not treat PaymentIntent creation as payment success. Use a stable idempotency key for each payment attempt.\n\n**Acceptance:** a sandbox browser flow verifies bank setup, required actions, confirmation, processing, success, and failure. A double click/retry does not create a second payment. This is a product-scope decision: completing ACH and hiding incomplete controls have different costs.",
    "title": "Back bank and auto-pay controls with working payment flows",
    "summary": "“Bank connected” and “auto-pay enabled” currently reflect saved flags, not completed Stripe operations.",
    "now": "The bank form changes a profile flag and shows demo bank details. Auto-pay saves a preference. The payment button also sends fields the API does not expect and never completes Stripe’s client confirmation step.",
    "why": "A tenant could reasonably assume rent will be collected when no recurring collection engine exists in this checkout. Creating a payment request is also different from successfully paying it.",
    "change": "First hide or clearly mark unfinished controls as unavailable. If ACH collection is chosen, finish bank setup, payment confirmation, recurring collection, and status updates, then show states backed by those operations.",
    "example": "Example risk: turning on auto-pay should not imply next month’s rent will be paid unless a real scheduled collection workflow exists. This is what “truthful” meant in the original title."
  },
  {
    "id": "R03",
    "priority": "High",
    "body": "**Confirmed:** [the loader](/Users/brianmar/workspace/propmanager/lib/dashboard/load.js:126) repeatedly uses `result.data || []` without checking `result.error`. An injected failure across all 18 queries returned an empty portfolio. [The provider](/Users/brianmar/workspace/propmanager/components/app-store.jsx:55) catches thrown failures and still marks loading complete. The route error boundary cannot display an error that is swallowed here.\n\n**Change:** return explicit success/error states for each read or reject required-load failures. Preserve the last successful data on refresh failure, display a stale-data/error indicator with retry, and present a distinct cold-load failure screen. Log the operation and a correlation ID without tenant-sensitive payloads.\n\n**Acceptance:** initial failure shows an error, a legitimate empty portfolio shows onboarding, and refresh failure preserves existing rows. An old overlapping refresh must not overwrite a newer result.",
    "title": "Show a loading failure instead of an empty portfolio",
    "summary": "A failed database read can currently look like there are no properties or tenants.",
    "now": "The loader turns missing query data into empty arrays without checking the query errors. A separate catch also ends loading without presenting the failure.",
    "why": "An outage or permission problem can look like lost data. On refresh, replacing existing rows with empty results also removes useful information from the screen.",
    "change": "Represent loading, success, and failure explicitly. Show retry on an initial failure; on a failed refresh, retain the last successful data and label it as potentially out of date.",
    "example": "Example: “Could not refresh, showing the last loaded data” tells you what happened. “No tenants yet” should appear only after a successful read that really returned no tenants."
  },
  {
    "id": "R04",
    "priority": "High",
    "body": "**Confirmed:** [manual creation](/Users/brianmar/workspace/propmanager/app/api/contracts/create/route.js:17) creates one contract and multiple `contract_tenants` links. [Document import](/Users/brianmar/workspace/propmanager/app/api/documents/process-lease/route.js:117) loops over people and inserts a separate contract with `tenant_id`, without junction links. [The read mapper](/Users/brianmar/workspace/propmanager/lib/contracts/mappers.js:9) gets tenants exclusively from the junction. Depending on deployed legacy columns, imported contracts can fail or lack the links that current reads and renewals require.\n\nThe importer also copies one extracted email/phone onto every approved person and matches existing tenants by name. [Extraction](/Users/brianmar/workspace/propmanager/app/api/documents/parse/route.js:102) parses JSON but does not validate its field types and domain rules.\n\n**Change:** create a lease module whose interface owns one agreement plus its participants. Both entry paths call it. Keep extraction as a proposed draft, validate the output, require explicit tenant matching, preserve per-person contact data, and keep the human review gate. Repair the junction's RLS/read path instead of relying on an unguarded service-role fallback.\n\n**Acceptance:** importing a two-person lease creates one contract with two links; repeating the import is safe; conflicting name matches require a selection; unapproved fields remain unchanged.",
    "title": "Create the same lease record from forms and document imports",
    "summary": "Manual entry and document import currently describe the same agreement in different database shapes.",
    "now": "Manual entry creates one lease with links to its tenants. Document import creates a separate lease for each person using an older tenant field, while current screens read the newer links.",
    "why": "Imported leases can fail or appear without participants. The importer also reuses one contact’s details and matches by name, which can associate the wrong person.",
    "change": "Give both paths one lease-creation operation: one agreement, explicitly selected participants, and each person’s contact details. Validate extracted fields and retain the human review step before saving.",
    "example": "Example: Alice and Bob signing the same apartment lease should produce one lease with two tenant links, regardless of whether you typed it or uploaded a PDF."
  },
  {
    "id": "R05",
    "priority": "High",
    "body": "**Confirmed:** [lease editing](/Users/brianmar/workspace/propmanager/app/api/contracts/update/route.js:34) deletes existing tenant links before inserting replacements. If insertion fails, the old relationship has already disappeared. [Lease deletion](/Users/brianmar/workspace/propmanager/app/api/contracts/delete/route.js:13) also performs dependent changes as separate requests. Import and Auth onboarding mix several writes with partial rollback.\n\n**Change:** perform related Postgres writes in one authorized transaction, exposed through a narrowly scoped RPC or equivalent server operation. Keep external Auth/email/document operations outside that transaction, with an operation record and explicit retry/compensation state. The lease module should hide these ordering requirements from callers.\n\n**Acceptance:** injected failure after each database step leaves the old lease and links intact. External failure remains visible and retryable without duplicating the business record.",
    "title": "Save related database changes together or not at all",
    "summary": "A failed lease edit can leave only part of the requested change saved.",
    "now": "Changing lease participants updates the lease, deletes the old participant links, then inserts replacements in separate database requests. Failure after deletion does not restore the original links.",
    "why": "The screen can report an error even though the database has already changed. Retrying may then operate on an incomplete lease.",
    "change": "Wrap related database writes in one transaction so they all commit or all roll back. Track separate recovery steps for external services, since an email or Auth action cannot be undone by a database rollback.",
    "example": "Example: replacing a roommate fails during insertion. The original lease and participants should remain intact, rather than leaving a lease with no participants."
  },
  {
    "id": "R06",
    "priority": "High",
    "body": "**Confirmed:** the email batch's [atomic draft-to-queued claim](/Users/brianmar/workspace/propmanager/app/api/email/batches/[id]/send/route.js:53) is good concurrency protection. But a crash after claiming can strand a message in `queued`; subsequent batch sends select only drafts. [The send wrapper](/Users/brianmar/workspace/propmanager/lib/email/send.js:50) supplies no provider idempotency key. Batch finalization can report `sent` despite failed recipients. [The Stripe webhook](/Users/brianmar/workspace/propmanager/app/api/webhooks/stripe/route.js:18) ignores database errors and returns success, and does not record processed event IDs.\n\n**Change:** extend existing message/operation tables into a durable work queue: claim lease/expiry, attempt count, retry time, last error, provider ID, and stable idempotency key. Preserve the explicit reviewed-send gate. Reconcile uncertain sends; do not blindly resend after the provider's deduplication window. Record webhook receipt durably before acknowledgement, deduplicate events, and prevent older payment events from regressing current state.\n\n**Acceptance:** simulate a crash before sending, a timeout after provider acceptance, database finalization failure, duplicate events, and reordered events. Resend retains idempotency keys for 24 hours, so local durable reconciliation remains necessary. [Resend guidance](https://resend.com/docs/dashboard/emails/idempotency-keys). Stripe documents retries, duplicates, and unordered delivery. [Stripe guidance](https://docs.stripe.com/webhooks).\n\nTradeoff: start with the existing database and scheduler. A separate queue service is unnecessary until the operational workload justifies it.",
    "title": "Recover interrupted sends and payment updates safely",
    "summary": "After a crash or timeout, the app needs to know whether work is pending, failed, or already completed.",
    "now": "Email sending claims a draft before sending, which prevents concurrent sends. But a crash can leave it stuck as queued. Stripe webhooks can also report success even when the database update failed.",
    "why": "Blindly retrying can duplicate an email; never retrying can lose it. A missed payment update can leave the app showing the wrong status even though Stripe processed the payment.",
    "change": "Persist attempts, errors, retry timing, and provider IDs. Reuse a stable key to prevent duplicate provider requests and check uncertain results before retrying. Save webhook events durably and handle duplicates or older events.",
    "example": "Example: Resend accepts an email, then the app crashes before recording success. Recovery should find the accepted send and record it without emailing the tenant again."
  },
  {
    "id": "R07",
    "priority": "Medium",
    "body": "**Confirmed:** [the landlord loader](/Users/brianmar/workspace/propmanager/lib/dashboard/load.js:67) loads 18 collections for every cold page. Most have no pagination; email history has a fixed 300-row cap. Completeness of the other collections depends on deployed API row limits. Page calculations and deletion prechecks use these arrays. No latency or bundle benchmark was performed.\n\n**Change:** retain the layout shell, identity, language, and useful navigation cache. Introduce page/feature queries with explicit columns, pagination, and server-side summaries. Invalidate affected queries after writes. Fetch a property's units and relevant tenant dates together so derived occupancy remains correct. Do not replace a complete aggregate with a paginated subset and continue summing it as if it were complete.\n\n**Acceptance:** opening maintenance does not fetch email bodies, documents, and parking data. Summary totals remain correct when fixtures exceed a page/API cap. Navigating back can reuse fresh cached results.\n\nTradeoff: migrate one feature at a time; a new state/query library is optional and should be justified by the actual caching/concurrency needs.",
    "title": "Load the data each page needs, with explicit limits",
    "summary": "Opening one page currently loads most of the portfolio, and large collections may be incomplete.",
    "now": "Every cold landlord page loads 18 collections. Most queries have no pagination, and many mutations refresh the whole portfolio again. Completeness depends on database API row limits.",
    "why": "As data grows, pages do unnecessary work and client-side totals may be calculated from truncated collections. The review identified this structure; it did not measure actual latency.",
    "change": "Load by feature, paginate lists, and compute complete totals on the server. Refresh only affected data after edits while keeping useful navigation caching and the inputs needed for derived occupancy.",
    "example": "Example: opening maintenance should fetch its requests and required property/tenant context, without also loading email bodies. A payment total must include every matching payment, not just the first page."
  },
  {
    "id": "R08",
    "priority": "Medium",
    "body": "**Confirmed:** [the main library](/Users/brianmar/workspace/propmanager/property-management-app.jsx:1) has 4,511 lines. Phase 2 has 1,277, email 875, and renewals 337. The main library imports those feature libraries while they import its primitives/hooks. [The sidebar](/Users/brianmar/workspace/propmanager/components/sidebar.jsx:9) imports its icon from this same graph.\n\n**Change:** put reusable UI primitives in `components/ui`, and feature pages/hooks next to their feature modules. Enforce a one-way dependency direction: route → feature UI → domain module/adapter, with shared UI independent of features. Preserve the existing inline-style policy and domain cores. Remove dead imports before measuring route chunks; source file size alone is not bundle-size evidence.\n\n**Acceptance:** shared UI/sidebar imports do not pull in feature modules, feature cycles disappear, and a page change has a small, local review surface.",
    "title": "Separate shared UI from feature pages and hooks",
    "summary": "Small feature changes currently require navigating large files with dependencies in both directions.",
    "now": "The main component library has 4,511 lines and imports feature libraries that import its UI primitives or hooks in return. Even the sidebar gets its icon from this feature-heavy module.",
    "why": "This makes ownership and dependencies harder to understand and changes harder to review. File size alone does not prove a slow page or a large production bundle.",
    "change": "Move reusable primitives into independent UI files, and group each feature’s screens and hooks together. Keep a one-way flow from route to feature to domain logic, with shared UI independent of features.",
    "example": "Example: changing the shared Button should not require importing maintenance or payments. Changing a maintenance workflow should mostly involve the maintenance feature’s files."
  },
  {
    "id": "R09",
    "priority": "Medium",
    "body": "**Confirmed:** [maintenance rollback](/Users/brianmar/workspace/propmanager/property-management-app.jsx:3071) restores an entire collection snapshot. If two cards change concurrently and one fails, restoring that snapshot can erase the other card's successful local update. There is also no refresh generation check in the provider.\n\n**Change:** roll back the affected record/fields only, conditional on the same pending mutation, or serialize writes for the same record. Use operation IDs and targeted invalidation. State updater functions should compute state without being used to capture mutable values needed by an async operation.\n\n**Acceptance:** two cards move concurrently, one succeeds and one fails, and only the failed move rolls back. Reversed response order does not restore stale data.",
    "title": "Undo only the update that failed",
    "summary": "Rolling back one optimistic edit can currently erase another edit that succeeded.",
    "now": "Maintenance updates the screen before the save finishes. On failure, it restores a snapshot of the entire request list. Overlapping refreshes also have no check to reject an older response.",
    "why": "Two independent edits can interfere even when the server correctly saves one of them. The screen may then disagree with the database until it reloads.",
    "change": "Track each pending operation and undo only its affected record or fields, provided a newer edit has not superseded it. Ignore stale refresh responses and reload affected data when needed.",
    "example": "Example: move cards A and B to Done. A saves, B fails. Only B should move back; A should stay Done."
  },
  {
    "id": "R10",
    "priority": "Medium",
    "body": "**Confirmed:** [the test command](/Users/brianmar/workspace/propmanager/package.json:10) covers selected domain test globs. No route-handler, RLS integration, or browser suites were found. The current lint baseline fails. Migration/setup instructions are scattered through scripts, including [manual parking sequencing](/Users/brianmar/workspace/propmanager/scripts/add-parking.sql:34) and [a team migration mixing schema and specific production IDs](/Users/brianmar/workspace/propmanager/scripts/migrate-team-landlords.sql:1).\n\n**Change:** add an ordered migration history and reproducible local schema, separating schema changes, synthetic seeds, and one-off production repairs. Keep the fast core tests, then add a small set of real adapter/RLS/HTTP tests plus browser smoke tests for login, tenant/lease creation, maintenance, email review, and sandbox payments. Add CI gates for tests, lint, and build, and verify the branch-protection configuration separately.\n\n**Acceptance:** a fresh local database can be recreated without production IDs; team-A/team-B/tenant/anonymous fixtures exercise authorization; CI fails on the actual payment payload mismatch and a lost lease link. Restore a clean lint baseline without disabling the rules to hide findings.",
    "title": "Make database setup and real-flow checks repeatable",
    "summary": "The current tests validate useful domain logic, but miss the API, permission, and browser failures found here.",
    "now": "The 195 domain tests pass, but no route-handler, database-permission, or browser suites were found. Lint fails, no tracked CI was found, and database setup relies on scattered scripts, some with production-specific IDs.",
    "why": "A green unit-test run cannot catch a screen sending the wrong API fields or an endpoint accepting another team’s record. A hard-to-recreate database also makes these checks unreliable.",
    "change": "Keep the fast tests, add a small set of real API, permission, and browser checks, and run them in CI with lint and build. Make ordered schema migrations and synthetic test data reproducible independently of production repairs.",
    "example": "Example: a fresh test database contains team A and team B. A test proves that team A cannot change team B’s lease, and a browser smoke test exercises the actual payment request contract."
  }
];
