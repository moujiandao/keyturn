---
project: Keyturn
priority: P2
state: IDLE
attention: NONE
human_blocked: false
owner: brian
agent: none
current_task: None
next_action: Run scripts/add-property-max-aga.sql in Supabase SQL Editor if not yet applied
waiting_on: None
updated: 2026-11-25T19:58:00-08:00
---

# Current State

Repository, local checkout, Vercel deployment (`https://keyturnapp.vercel.app`), Supabase Auth URLs, and webhooks are fully rebranded and cut over to **Keyturn** (`moujiandao/keyturn` at `/Users/brianmar/workspace/keyturn`). All 7 linked worktrees remain repaired to `/Users/brianmar/workspace/keyturn/.git`.

# Recent Work

- Merged `chore/rebrand-keyturn` (`5e59141`, `1e91211`): renamed package to `keyturn`, updated `AGENTS.md`, and migrated all 7 browser `localStorage` keys with one-time fallback migration.
- Merged `feat/property-max-aga` (`070b840`, `aa9727f`): added per-property Max AGA (%) field on Rent Increase Manager with SQL migration `scripts/add-property-max-aga.sql`.
- Renamed GitHub repo `moujiandao/propmanager` -> `moujiandao/keyturn`, moved local directory to `/Users/brianmar/workspace/keyturn`, updated `origin`, repaired all linked worktrees, and completed Vercel (`https://keyturnapp.vercel.app`), Supabase Auth, webhook, and `README.md` cutover.

# Blocker

None.

# Next Action

Run `scripts/add-property-max-aga.sql` in Supabase SQL Editor if not yet applied.
