-- Mutable annual registry; immutable commercial_imports remain unchanged.
begin;

create function public.commercial_workspace_dataset_valid(value jsonb, expected_year integer)
returns boolean
language plpgsql immutable security invoker
set search_path = ''
as $$
declare
  entry jsonb;
  amount jsonb;
  field_name text;
begin
  if value is null or jsonb_typeof(value) <> 'object'
    or not (value ?& array['version', 'year', 'config', 'sources', 'rows'])
    or value -> 'version' <> '2'::jsonb
    or value -> 'year' <> to_jsonb(expected_year)
    or jsonb_typeof(value -> 'config') <> 'object'
    or jsonb_typeof(value -> 'sources') <> 'array'
    or jsonb_typeof(value -> 'rows') <> 'array'
    or octet_length(value::text) > 20000000 then
    return false;
  end if;
  if jsonb_array_length(value -> 'rows') > 50000 then return false; end if;

  for entry in select jsonb_array_elements(value -> 'rows') loop
    if jsonb_typeof(entry) <> 'object'
      or not (entry ?& array['key', 'central', 'cooperative', 'metric', 'targets', 'actuals', 'annualTarget'])
      or jsonb_typeof(entry -> 'key') <> 'string'
      or char_length(entry ->> 'key') not between 1 and 240
      or jsonb_typeof(entry -> 'central') <> 'string'
      or jsonb_typeof(entry -> 'cooperative') <> 'string'
      or jsonb_typeof(entry -> 'metric') <> 'string'
      or entry ->> 'metric' not in ('VN', 'AR')
      or jsonb_typeof(entry -> 'annualTarget') not in ('number', 'null') then
      return false;
    end if;
    foreach field_name in array array['targets', 'actuals'] loop
      if jsonb_typeof(entry -> field_name) <> 'array' then return false; end if;
      if jsonb_array_length(entry -> field_name) <> 12 then return false; end if;
      for amount in select jsonb_array_elements(entry -> field_name) loop
        if jsonb_typeof(amount) not in ('number', 'null') then return false; end if;
      end loop;
    end loop;
  end loop;

  if value ? 'registry' then
    if jsonb_typeof(value -> 'registry') <> 'object'
      or not ((value -> 'registry') ?& array['version', 'entities'])
      or value -> 'registry' -> 'version' <> '1'::jsonb
      or jsonb_typeof(value -> 'registry' -> 'entities') <> 'array' then
      return false;
    end if;
    if jsonb_array_length(value -> 'registry' -> 'entities') > 50000 then return false; end if;
    for entry in select jsonb_array_elements(value -> 'registry' -> 'entities') loop
      if jsonb_typeof(entry) <> 'object'
        or not (entry ?& array['id', 'kind', 'central', 'name'])
        or jsonb_typeof(entry -> 'id') <> 'string'
        or char_length(entry ->> 'id') not between 1 and 240
        or jsonb_typeof(entry -> 'kind') <> 'string'
        or entry ->> 'kind' not in ('central', 'cooperative', 'pa')
        or jsonb_typeof(entry -> 'central') <> 'string'
        or jsonb_typeof(entry -> 'name') <> 'string' then
        return false;
      end if;
    end loop;
  end if;
  return true;
end;
$$;
revoke all on function public.commercial_workspace_dataset_valid(jsonb, integer) from public, anon;
grant execute on function public.commercial_workspace_dataset_valid(jsonb, integer) to authenticated;

create table public.commercial_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  dataset jsonb not null,
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  constraint commercial_workspaces_owner_year_key unique (owner_id, year),
  constraint commercial_workspaces_dataset_check
    check (public.commercial_workspace_dataset_valid(dataset, year))
);

comment on table public.commercial_workspaces is
  'One mutable fixed registry and cumulative dataset per owner/year. Original imports are retained separately as immutable snapshots.';
comment on column public.commercial_workspaces.revision is
  'Optimistic concurrency token: update with WHERE revision = expected and SET revision = expected + 1. Never use an unconditional upsert.';

alter table public.commercial_workspaces enable row level security;
revoke all on public.commercial_workspaces from public, anon, authenticated;
grant select, insert, update, delete on public.commercial_workspaces to authenticated;

create policy commercial_workspaces_read_own
  on public.commercial_workspaces for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy commercial_workspaces_insert_own
  on public.commercial_workspaces for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy commercial_workspaces_update_own
  on public.commercial_workspaces for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy commercial_workspaces_delete_own
  on public.commercial_workspaces for delete to authenticated
  using ((select auth.uid()) = owner_id);

create function public.commercial_workspace_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'A new workspace must start at revision 1' using errcode = '23514';
    end if;
  else
    if new.id <> old.id or new.owner_id <> old.owner_id or new.year <> old.year then
      raise exception 'Workspace identity and year cannot be changed' using errcode = '23514';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'Workspace revision conflict; reload before saving' using errcode = '40001';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.commercial_workspace_revision() from public, anon, authenticated;
create trigger commercial_workspaces_revision
  before insert or update on public.commercial_workspaces
  for each row execute function public.commercial_workspace_revision();

commit;
