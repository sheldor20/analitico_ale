begin;

create function commercial_security.proposal_amounts_valid(amounts jsonb)
returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(amounts) is distinct from 'object' or octet_length(amounts::text) > 200000 then
    return false;
  end if;
  if (select count(*) from jsonb_each(amounts)) not between 1 and 1000 then
    return false;
  end if;
  if exists (
    select 1 from jsonb_each(amounts) entry(cooperative, statuses)
    where cooperative !~ '^[1-9][0-9]{0,11}$'
      or jsonb_typeof(statuses) is distinct from 'object'
      or not (statuses ?& array['accepted', 'cancelled', 'inReview', 'pending', 'rejected'])
  ) then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_each(amounts) entry(cooperative, statuses)
    cross join lateral jsonb_each(statuses) status(name, amount)
    where name not in ('accepted', 'cancelled', 'inReview', 'pending', 'rejected')
      or jsonb_typeof(amount) is distinct from 'number'
      or amount::text !~ '^(0|[1-9][0-9]{0,9})$'
  );
end;
$$;
revoke all on function commercial_security.proposal_amounts_valid(jsonb) from public, anon;
grant execute on function commercial_security.proposal_amounts_valid(jsonb) to authenticated;

create table public.commercial_proposal_positions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  position_date date,
  accumulated_since_january boolean not null default false,
  amounts jsonb not null check (commercial_security.proposal_amounts_valid(amounts)),
  revision integer not null default 1 check (revision > 0),
  primary key (owner_id, year),
  check (position_date is null or extract(year from position_date) = year),
  check (not accumulated_since_january or position_date is not null)
);
comment on table public.commercial_proposal_positions is 'Private annual proposal position by account. Amounts by cooperative and status are integer BRL cents.';

alter table public.commercial_proposal_positions enable row level security;
revoke all on public.commercial_proposal_positions from public, anon, authenticated;
grant select on public.commercial_proposal_positions to authenticated;
grant insert (owner_id, year, position_date, accumulated_since_january, amounts) on public.commercial_proposal_positions to authenticated;
grant update (position_date, accumulated_since_january, amounts) on public.commercial_proposal_positions to authenticated;

create policy proposal_positions_owner on public.commercial_proposal_positions for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy proposal_positions_session on public.commercial_proposal_positions as restrictive for all to authenticated
  using ((select commercial_security.session_allowed())) with check ((select commercial_security.session_allowed()));

create function commercial_security.advance_proposal_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function commercial_security.advance_proposal_revision() from public, anon, authenticated;
create trigger advance_proposal_revision before update on public.commercial_proposal_positions
  for each row execute function commercial_security.advance_proposal_revision();

commit;
