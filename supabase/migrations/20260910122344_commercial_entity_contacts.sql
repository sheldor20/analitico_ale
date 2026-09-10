begin;

create function public.commercial_contact_emails_valid(value text[])
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  email text;
  normalized text;
  seen text[] := array[]::text[];
begin
  if value is null or cardinality(value) > 10 then return false; end if;
  foreach email in array value loop
    if email is null then return false; end if;
    normalized := lower(btrim(email));
    if email <> btrim(email)
      or char_length(email) not between 3 and 254
      or normalized !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
      or normalized = any(seen) then
      return false;
    end if;
    seen := array_append(seen, normalized);
  end loop;
  return true;
end;
$$;
revoke all on function public.commercial_contact_emails_valid(text[]) from public, anon;
grant execute on function public.commercial_contact_emails_valid(text[]) to authenticated;

create table public.commercial_entity_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_year integer not null check (workspace_year between 2020 and 2100),
  entity_id text not null check (char_length(entity_id) between 1 and 240),
  entity_kind text not null check (entity_kind in ('central', 'cooperative', 'pa')),
  central text not null check (central ~ '^[0-9]{1,12}$'),
  cooperative text check (cooperative is null or cooperative ~ '^[0-9]{1,12}$'),
  pa text check (pa is null or pa ~ '^[0-9]{1,12}$'),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  job_title text not null default '' check (char_length(job_title) <= 160),
  teams text not null default '' check (char_length(teams) <= 300),
  whatsapp text not null default '' check (char_length(whatsapp) <= 40),
  emails text[] not null default array[]::text[] check (public.commercial_contact_emails_valid(emails)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_entity_contacts_workspace_fkey
    foreign key (owner_id, workspace_year)
    references public.commercial_workspaces(owner_id, year)
    on delete cascade,
  constraint commercial_entity_contacts_path_check check (
    (entity_kind = 'central' and cooperative is null and pa is null)
    or (entity_kind = 'cooperative' and cooperative is not null and pa is null)
    or (entity_kind = 'pa' and cooperative is not null and pa is not null)
  )
);

comment on table public.commercial_entity_contacts is
  'Responsible people linked to a fixed Central, Cooperative or PA registry entry for portfolio scenario communication.';
comment on column public.commercial_entity_contacts.emails is
  'Up to 10 unique validated e-mail addresses for the responsible person.';

create index commercial_entity_contacts_owner_year_entity_idx
  on public.commercial_entity_contacts(owner_id, workspace_year, entity_id);

alter table public.commercial_entity_contacts enable row level security;
revoke all on public.commercial_entity_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.commercial_entity_contacts to authenticated;

create policy commercial_entity_contacts_read_own
  on public.commercial_entity_contacts for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy commercial_entity_contacts_insert_own
  on public.commercial_entity_contacts for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy commercial_entity_contacts_update_own
  on public.commercial_entity_contacts for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy commercial_entity_contacts_delete_own
  on public.commercial_entity_contacts for delete to authenticated
  using ((select auth.uid()) = owner_id);

create function public.commercial_entity_contacts_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.owner_id <> old.owner_id
    or new.workspace_year <> old.workspace_year
    or new.entity_id <> old.entity_id
    or new.entity_kind <> old.entity_kind
    or new.central <> old.central
    or new.cooperative is distinct from old.cooperative
    or new.pa is distinct from old.pa then
    raise exception 'Responsible contact identity cannot be changed; recreate the contact for another unit.' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.commercial_entity_contacts_touch() from public, anon, authenticated;
create trigger commercial_entity_contacts_touch
  before update on public.commercial_entity_contacts
  for each row execute function public.commercial_entity_contacts_touch();

commit;
