-- =====================================================================
-- Zelle payer aliases (Ticket #22)
--
-- Maps recurring third-party Zelle sender names (parents, spouses,
-- guarantors, or a housemate paying a shared contract lump sum) to
-- exactly one tenant_id or contract_id per landlord team.
--
-- Idempotent: safe to run more than once in Supabase -> SQL Editor.
-- =====================================================================

begin;

create table if not exists public.zelle_payer_aliases (
  id                    uuid primary key default gen_random_uuid(),
  landlord_id           uuid not null references public.landlord_profiles(id) on delete cascade,
  payer_name_normalized text not null,
  payer_name_display    text not null,
  tenant_id             uuid references public.tenant_profiles(id) on delete cascade,
  contract_id           uuid references public.contracts(id) on delete cascade,
  created_at            timestamptz not null default now(),
  check ((tenant_id is not null)::int + (contract_id is not null)::int = 1),
  unique (landlord_id, payer_name_normalized)
);

create index if not exists zelle_payer_aliases_landlord_id_idx
  on public.zelle_payer_aliases (landlord_id);

alter table public.zelle_payer_aliases enable row level security;

drop policy if exists zelle_payer_aliases_team_all on public.zelle_payer_aliases;
create policy zelle_payer_aliases_team_all on public.zelle_payer_aliases
  for all using (public.is_team_member(landlord_id))
          with check (public.is_team_member(landlord_id));

commit;
