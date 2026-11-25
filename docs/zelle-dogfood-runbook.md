# Runbook: Zelle Dogfood Provisioning and Verification (Ticket #25)

Use this checklist once `feat/zelle-ingestion` is merged and deployed to Vercel.

## 1. Run Supabase SQL Migrations (in order)

Run both idempotent scripts in the Supabase SQL Editor:
1. `scripts/add-zelle-ingestion.sql` (adds `landlord_profiles.zelle_inbound_token`, `zelle_events` with RLS, and `payments.payment_method` / `category` / `zelle_event_id`)
2. `scripts/add-zelle-payer-aliases.sql` (adds `zelle_payer_aliases` with RLS)

## 2. Provision Your Private Inbound Address

Run a dry-run preview first, then apply:

```bash
node --env-file=.env.local scripts/provision-zelle-token.mjs --landlord-id <YOUR_LANDLORD_UUID> --domain <YOUR_RESEND_INBOUND_DOMAIN>
node --env-file=.env.local scripts/provision-zelle-token.mjs --landlord-id <YOUR_LANDLORD_UUID> --domain <YOUR_RESEND_INBOUND_DOMAIN> --apply
```

Keep the resulting `zelle+<token>@<domain>` address private.

## 3. Configure Resend Inbound

1. In Resend Dashboard -> Domains -> `<your-domain>`, enable **Receiving (Inbound)** and verify the MX DNS record.
2. In Resend Dashboard -> Webhooks, confirm the existing webhook pointing to `https://<your-keyturn-host>/api/webhooks/resend` is subscribed to `email.received` (and `RESEND_WEBHOOK_SECRET` + `RESEND_API_KEY` are set in Vercel).
3. Monitor Resend Free tier usage (3,000 emails/month and 100 emails/day shared between outbound reminders and inbound Zelle alerts).

## 4. Configure Gmail Auto-Forward Filter

1. In Gmail -> Settings -> Forwarding and POP/IMAP -> Add a forwarding address: `zelle+<token>@<domain>`.
   - Note: Gmail sends a verification email to that address; check Resend Inbound logs (or `zelle_events` `raw_body`) to retrieve the confirmation link/code, then mark that test event `Ignored` in Keyturn's Zelle Inbox.
2. Create one Gmail filter:
   - **From:** `no.reply.alerts@chase.com`
   - **Subject:** `"You received money with Zelle"`
   - **Action:** Forward it to `zelle+<token>@<domain>`

## 5. Live End-to-End Verification Checklist

- [ ] Forward one real Chase Zelle alert for a known tenant with exact monthly rent -> verify it appears in **Payments -> Zelle Inbox -> Auto-Posted** and checks off the right month in **Payment Tracker**.
- [ ] Re-forward the exact same email -> verify zero duplicate `zelle_events` rows and zero duplicate `payments` rows.
- [ ] Click **Undo** on the auto-posted row -> verify the payment row is removed, the month grid unchecks, and the event moves to **Needs Review**.
- [ ] Confirm from **Needs Review** -> verify the month checks back off and the event moves to **History**.
- [ ] Switch UI language between English and Chinese -> verify all Zelle Inbox labels, pills, buttons, and empty states are translated.

## 6. First-Month Monitoring and Eval Trace Collection

Do not create synthetic LLM evals up front. During the first month of live Chase alerts:
- Query `zelle_events` where `parse_source in ('llm', 'failed')` or `match_reason in ('parse_failed', 'ambiguous_memo', 'llm_fallback')`.
- Collect at least 20 real fallback/failure traces before designing any LLM evaluator or rubric.
