-- Keep monthly acknowledgement identities stable while adding distinct period states.
begin;

alter table public.commercial_goal_alert_states
  add column period text not null default 'month';

-- The original constraints used generated names. Match their exact columns/field
-- rather than relying on PostgreSQL's identifier truncation for those names.
do $$
declare legacy_unique text; legacy_key_check text;
begin
  select c.conname into strict legacy_unique
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.commercial_goal_alert_states'::regclass and c.contype = 'u'
    and (select array_agg(a.attname::text order by k.ord)
      from unnest(c.conkey) with ordinality k(attnum,ord)
      join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)
      = array['owner_id','workspace_year','entity_id','month','metric']::text[];
  select c.conname into strict legacy_key_check
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.commercial_goal_alert_states'::regclass and c.contype = 'c'
    and pg_catalog.pg_get_constraintdef(c.oid) like '%alert_key%';
  execute format('alter table public.commercial_goal_alert_states drop constraint %I',legacy_unique);
  execute format('alter table public.commercial_goal_alert_states drop constraint %I',legacy_key_check);
end;
$$;

alter table public.commercial_goal_alert_states
  add constraint commercial_goal_alert_states_period_check
    check (period in ('month','quarter','semester','annual','ytd')),
  add constraint commercial_goal_alert_states_period_anchor_check
    check (period in ('month','ytd')
      or (period='quarter' and month in (3,6,9,12))
      or (period='semester' and month in (6,12))
      or (period='annual' and month=12)),
  add constraint commercial_goal_alert_states_period_identity_key
    unique (owner_id,workspace_year,entity_id,period,month,metric),
  add constraint commercial_goal_alert_states_period_alert_key_check
    check (alert_key = workspace_year::text || ':'
      || case when period='month' then '' else period || ':' end
      || month::text || ':' || entity_id || ':' || metric);

create index commercial_goal_alert_states_owner_year_period_month_idx
  on public.commercial_goal_alert_states(owner_id,workspace_year,period,month);

create or replace function public.commercial_entity_relationship_touch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.owner_id <> old.owner_id or new.workspace_year <> old.workspace_year
      or new.entity_id <> old.entity_id or new.entity_kind <> old.entity_kind or new.central <> old.central
      or new.cooperative is distinct from old.cooperative or new.pa is distinct from old.pa then
      raise exception 'A identidade da unidade e o proprietário não podem ser alterados.' using errcode = '23514';
    end if;
    if tg_table_name = 'commercial_goal_alert_states' then
      if new.period <> old.period or new.month <> old.month or new.metric <> old.metric or new.alert_key <> old.alert_key then
        raise exception 'A competência do alerta não pode ser alterada.' using errcode = '23514';
      end if;
    end if;
  end if;
  if not exists (
    select 1 from public.commercial_workspaces w,
      jsonb_array_elements(coalesce(w.dataset->'registry'->'entities','[]'::jsonb)) entity
    where w.owner_id = new.owner_id and w.year = new.workspace_year and entity->>'id' = new.entity_id
      and entity->>'kind' = new.entity_kind and entity->>'central' = new.central
      and (new.entity_kind = 'central' or entity->>'cooperative' = new.cooperative)
      and (new.entity_kind <> 'pa' or entity->>'pa' = new.pa)
  ) then
    raise exception 'A unidade precisa existir no cadastro fixo deste ano.' using errcode = '23514';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end; $$;
revoke all on function public.commercial_entity_relationship_touch() from public,anon,authenticated;
comment on column public.commercial_goal_alert_states.period is
  'Achievement scope. Monthly keys retain their original format; longer periods use canonical final-month anchors.';
comment on table public.commercial_goal_alert_states is
  'Owner-scoped read and user-confirmed communication states by period. Achievement is recalculated from monthly production; acknowledgement never changes financial data.';

commit;
