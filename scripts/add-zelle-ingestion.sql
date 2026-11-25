-- =====================================================================
-- Zelle email ingestion and rent reconciliation (Ticket #19)
--
-- Extends landlord_profiles with a private high-entropy inbound token,
-- adds zelle_events as the audit record and review queue for forwarded
-- Chase Zelle alerts, and adds minimal payment metadata columns on
-- payments (payment_method, category, zelle_event_id).
--
-- Idempotent: safe to run more than once in Supabase -> SQL Editor.
-- =====================================================================

begin;

-- Reuse the generic set_updated_at() trigger function from earlier migrations.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------
-- 1. landlord_profiles.zelle_inbound_token
-- ---------------------------------------------------------------------
alter table public.landlord_profiles
  add column if not exists zelle_inbound_token text;

create unique index if not exists landlord_profiles_zelle_inbound_token_uidx
  on public.landlord_profiles (zelle_inbound_token)
  where zelle_inbound_token is not null;

-- ---------------------------------------------------------------------
-- 2. zelle_events
-- ---------------------------------------------------------------------
create table if not exists public.zelle_events (
  id                    uuid primary key default gen_random_uuid(),
  landlord_id           uuid not null references public.landlord_profiles(id) on delete cascade,
  resend_email_id       text,
  dedupe_key            text not null,
  email_from            text,
  email_subject         text,
  received_at           timestamptz,
  raw_body              text,
  raw_headers           jsonb not null default '{}'::jsonb,
  bank                  text not null default 'chase',
  direction             text not null default 'unknown',
  payer_name            text,
  payer_name_normalized text,
  amount                numeric,
  sent_on               date,
  memo                  text,
  zelle_txn_id          text,
  parse_source          text not null default 'rules',
  parse_notes           text,
  category              text not null default 'rent',
  target_month          date,
  suggested_tenant_ids  jsonb not null default '[]'::jsonb,
  suggested_contract_id uuid,
  match_reason          text,
  status                text not null default 'needs_review',
  posted_payment_ids    jsonb not null default '[]'::jsonb,
  resolved_at           timestamptz,
  resolved_by           uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (landlord_id, dedupe_key)
);

create unique index if not exists zelle_events_resend_email_id_uidx
  on public.zelle_events (resend_email_id)
  where resend_email_id is not null;

create index if not exists zelle_events_landlord_status_idx
  on public.zelle_events (landlord_id, status, created_at desc);

create index if not exists zelle_events_landlord_payer_idx
  on public.zelle_events (landlord_id, payer_name_normalized);

drop trigger if exists zelle_events_set_updated_at on public.zelle_events;
create trigger zelle_events_set_updated_at
  before update on public.zelle_events
  for each row execute function set_updated_at();

alter table public.zelle_events enable row level security;

drop policy if exists zelle_events_team_all on public.zelle_events;
create policy zelle_events_team_all on public.zelle_events
  for all using (public.is_team_member(landlord_id))
          with check (public.is_team_member(landlord_id));

-- ---------------------------------------------------------------------
-- 3. Minimal payments extensions (backwards-compatible nullable columns)
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists payment_method text;

alter table public.payments
  add column if not exists category text;

alter table public.payments
  add column if not exists zelle_event_id uuid references public.zelle_events(id) on delete set null;

create index if not exists payments_zelle_event_id_idx
  on public.payments (zelle_event_id)
  where zelle_event_id is not null;

-- Prevent duplicate payments for the same Zelle event + tenant under concurrent
-- review clicks or webhook retries.
create unique index if not exists payments_zelle_event_tenant_uidx
  on public.payments (zelle_event_id, tenant_id)
  where zelle_event_id is not null;

commit;
