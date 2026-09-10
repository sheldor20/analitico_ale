-- Historical data continues in commercial_workspaces, UNIQUE(owner_id, year).
-- No existing datasets, targets, production, contacts or drafts are modified.
create table public.commercial_message_templates (
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_kind text not null check (entity_kind in ('central','cooperative','pa')),
  metric text not null check (metric in ('VN','AR','BOTH')),
  email_template text not null default '{{cenario}}' check (char_length(email_template) between 1 and 12000),
  whatsapp_template text not null default '{{cenario}}' check (char_length(whatsapp_template) between 1 and 12000),
  enabled boolean not null default false,
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  primary key (owner_id, entity_kind, metric),
  check (entity_kind <> 'pa' or metric = 'VN')
);
alter table public.commercial_message_templates enable row level security;
revoke all on public.commercial_message_templates from public, anon, authenticated;
grant select, insert, update, delete on public.commercial_message_templates to authenticated;
grant all on public.commercial_message_templates to service_role;
create policy message_templates_select on public.commercial_message_templates for select to authenticated using ((select auth.uid()) = owner_id);
create policy message_templates_insert on public.commercial_message_templates for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy message_templates_update on public.commercial_message_templates for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy message_templates_delete on public.commercial_message_templates for delete to authenticated using ((select auth.uid()) = owner_id);
comment on table public.commercial_message_templates is 'Private optional message defaults per owner, hierarchy level and metric. Templates contain user text and runtime placeholders, never automatic snapshots or recipient lists.';
