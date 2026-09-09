-- Additive migration: no changes to existing business tables.
begin;
create table if not exists public.commercial_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  year integer not null check (year between 2020 and 2100),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  dataset jsonb not null check (
    jsonb_typeof(dataset) = 'object'
    and dataset @> '{"version":1}'::jsonb
    and dataset ?& array['rows', 'year', 'config', 'sources']
    and (dataset ->> 'year')::integer = year
    and jsonb_typeof(dataset -> 'rows') = 'array'
    and jsonb_array_length(dataset -> 'rows') between 1 and 50000
    and octet_length(dataset::text) <= 20000000
  ),
  created_at timestamptz not null default now(),
  unique(owner_id, fingerprint),
  unique(id, owner_id)
);
create index if not exists commercial_imports_owner_created_idx on public.commercial_imports(owner_id, created_at desc);
alter table public.commercial_imports enable row level security;
revoke all on public.commercial_imports from anon;
revoke all on public.commercial_imports from authenticated;
grant select, insert on public.commercial_imports to authenticated;
create policy commercial_imports_read_own on public.commercial_imports for select to authenticated using ((select auth.uid()) = owner_id);
create policy commercial_imports_insert_own on public.commercial_imports for insert to authenticated with check ((select auth.uid()) = owner_id);

create table if not exists public.commercial_actions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_key text not null check (char_length(entity_key) between 1 and 160),
  owner_name text not null default '' check (char_length(owner_name) <= 120),
  due_date date,
  status text not null default 'Aberta' check (status in ('Aberta','Em andamento','Concluída')),
  notes text not null default '' check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(import_id,entity_key),
  foreign key (import_id,owner_id) references public.commercial_imports(id,owner_id) on delete cascade
);
create index if not exists commercial_actions_owner_idx on public.commercial_actions(owner_id,import_id);
alter table public.commercial_actions enable row level security;
revoke all on public.commercial_actions from anon;
revoke all on public.commercial_actions from authenticated;
grant select, insert, update on public.commercial_actions to authenticated;
create policy commercial_actions_read_own on public.commercial_actions for select to authenticated using ((select auth.uid()) = owner_id);
create policy commercial_actions_insert_own on public.commercial_actions for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy commercial_actions_update_own on public.commercial_actions for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create or replace function public.commercial_touch_action() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger commercial_actions_updated before update on public.commercial_actions for each row execute function public.commercial_touch_action();
revoke all on function public.commercial_touch_action() from public;
commit;
