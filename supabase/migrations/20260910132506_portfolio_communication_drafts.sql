begin;

create function public.commercial_communication_recipients_valid(value text[])
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare email text; seen text[] := array[]::text[];
begin
  if value is null or cardinality(value) > 100 or coalesce(array_ndims(value), 1) <> 1 then return false; end if;
  foreach email in array value loop
    if not public.commercial_contact_emails_valid(array[email]) or lower(email) = any(seen) then return false; end if;
    seen := array_append(seen, lower(email));
  end loop;
  return true;
end;
$$;
revoke all on function public.commercial_communication_recipients_valid(text[]) from public, anon;
grant execute on function public.commercial_communication_recipients_valid(text[]) to authenticated;

create table public.commercial_communication_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  entity_id text not null check (char_length(entity_id) between 1 and 240),
  entity_kind text not null check (entity_kind in ('central', 'cooperative', 'pa')),
  subject text not null check (char_length(btrim(subject)) between 1 and 300 and subject !~ E'[\r\n]'),
  email_body text not null check (char_length(email_body) between 1 and 40000),
  email_html text not null check (octet_length(email_html) between 1 and 250000),
  whatsapp_body text not null check (char_length(whatsapp_body) between 1 and 40000),
  recipients text[] not null default array[]::text[] check (public.commercial_communication_recipients_valid(recipients)),
  whatsapp_number text not null default '' check (whatsapp_number = '' or whatsapp_number ~ '^[1-9][0-9]{7,14}$'),
  report jsonb not null,
  created_at timestamptz not null default now(),
  constraint commercial_communication_report_check check (coalesce(
    jsonb_typeof(report) = 'object' and report -> 'version' = '1'::jsonb
    and report -> 'year' = to_jsonb(year)
    and report -> 'entity' ->> 'id' = entity_id
    and report -> 'entity' ->> 'kind' = entity_kind
    and jsonb_typeof(report -> 'sections') = 'array'
    and report ->> 'period' in ('daily','month','quarter','semester','annual','ytd')
    and report -> 'month' in ('0'::jsonb,'1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb,'6'::jsonb,'7'::jsonb,'8'::jsonb,'9'::jsonb,'10'::jsonb,'11'::jsonb)
    and report ->> 'source' = case when entity_kind = 'pa' then 'cadence' else 'base' end
    and octet_length(report::text) <= 200000,
    false))
);
comment on table public.commercial_communication_drafts is
  'Private immutable generated portfolio drafts. Saving or opening Outlook/WhatsApp does NOT confirm sending or delivery. No external dispatch is performed.';
comment on column public.commercial_communication_drafts.email_html is
  'Generated email export only. Never render stored HTML as trusted application markup; UI previews are freshly generated with escaping.';
create index commercial_communication_drafts_owner_entity_date_idx
  on public.commercial_communication_drafts(owner_id, year, entity_id, created_at desc);
alter table public.commercial_communication_drafts enable row level security;
revoke all on public.commercial_communication_drafts from public, anon, authenticated;
grant select, insert, delete on public.commercial_communication_drafts to authenticated;
create policy commercial_communication_drafts_read_own on public.commercial_communication_drafts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy commercial_communication_drafts_insert_own on public.commercial_communication_drafts
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy commercial_communication_drafts_delete_own on public.commercial_communication_drafts
  for delete to authenticated using ((select auth.uid()) = owner_id);

commit;
