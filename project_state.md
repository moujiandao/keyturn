---
project: Keyturn
priority: P1
state: READY
attention: ACTION
human_blocked: true
owner: brian
agent: none
current_task: Provision live Chase/Resend Zelle dogfooding (#25)
next_action: Follow docs/zelle-dogfood-runbook.md to run Supabase SQL migrations, provision inbound token, and connect Resend Inbound MX + Gmail filter
waiting_on: Manual Supabase migrations, Resend Inbound MX DNS, and Gmail Chase forward filter (#25)
updated: 2026-11-25T11:42:00-08:00
---

# Current State

[PR #26](https://github.com/moujiandao/propmanager/pull/26) rebase-merged to `main` (`cc7a2d0`), closing `#19`-`#24`. All 280 tests, ESLint (0 errors), Next.js production build, PII scan, and read-only code review passed.

# Recent Work

Merged Chase Zelle email ingestion and rent reconciliation: HTML-only Chase parser, deterministic memo classifier, month attribution, 6-gate auto-poster, bilingual Zelle Inbox UI with 1-click Undo, review triage actions, `zelle_payer_aliases` memory, housemate 1-to-N splits, grouped partial transfers, Claude Haiku fallback (never auto-posts), and the Ticket `#25` dogfood provisioning script/runbook.

# Blocker

Ticket `#25` (live dogfood verification) waits on manual production setup: running `scripts/add-zelle-ingestion.sql` and `scripts/add-zelle-payer-aliases.sql` in Supabase, provisioning the team inbound token, verifying Resend Inbound MX DNS records, and adding the Gmail Chase auto-forward filter.

# Next Action

Follow `docs/zelle-dogfood-runbook.md` to run the two SQL migrations in Supabase, provision your `zelle+<token>@<domain>` address, verify Resend Inbound MX + `email.received` webhook, and forward one real Chase Zelle alert end-to-end.

# Notes

Merged via PR #26 without touching pre-existing uncommitted pine-theme edits in the local `main` checkout. `load.js` tolerates missing Zelle tables (`PGRST205`/`42P01`) until the two SQL migrations are executed.
