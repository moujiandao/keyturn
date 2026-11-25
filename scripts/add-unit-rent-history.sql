-- Run before deploying the Rent Increase Manager.
begin;

create table if not exists public.unit_rent_history (
  unit_id uuid not null references public.units(id) on delete cascade,
  year integer not null check (year between 1000 and 9999),
  monthly_rent numeric(12, 2) not null check (monthly_rent >= 0 and monthly_rent <> 'NaN'::numeric),
  increase_start_date date check (extract(year from increase_start_date) = year),
  primary key (unit_id, year)
);

alter table public.unit_rent_history enable row level security;

revoke all on public.unit_rent_history from anon, authenticated;
grant select, insert, update on public.unit_rent_history to authenticated;

drop policy if exists unit_rent_history_team on public.unit_rent_history;
-- For an ALL policy, USING also checks inserted and updated rows.
create policy unit_rent_history_team on public.unit_rent_history
  for all to authenticated
  using (
    exists (
      select 1
        from public.units u
        join public.properties p on p.id = u.property_id
       where u.id = unit_rent_history.unit_id
         and public.is_team_member(p.landlord_id)
    )
  );

commit;
