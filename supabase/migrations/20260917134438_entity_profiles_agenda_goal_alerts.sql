begin;

create function public.commercial_entity_path_valid(kind text, central text, cooperative text, pa text, entity_id text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(central ~ '^[0-9]{1,12}$' and (
    (kind = 'central' and cooperative is null and pa is null and entity_id = 'central:' || central)
    or (kind = 'cooperative' and cooperative ~ '^[0-9]{1,12}$' and pa is null and entity_id = 'cooperative:' || central || ':' || cooperative)
    or (kind = 'pa' and cooperative ~ '^[0-9]{1,12}$' and pa ~ '^[0-9]{1,12}$' and entity_id = 'pa:' || central || ':' || cooperative || ':' || pa)
  ), false);
$$;
revoke all on function public.commercial_entity_path_valid(text,text,text,text,text) from public, anon;
grant execute on function public.commercial_entity_path_valid(text,text,text,text,text) to authenticated;

create function public.commercial_profile_rates_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare entry jsonb; ids text[] := array[]::text[]; rate numeric; item_date text;
begin
  if value is null or jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 30 then return false; end if;
  for entry in select jsonb_array_elements(value) loop
    if jsonb_typeof(entry) <> 'object' or not (entry ?& array['id','name','rate','unit','period','validFrom','validUntil','notes'])
      or jsonb_typeof(entry->'id') <> 'string' or char_length(entry->>'id') not between 1 and 160
      or (entry->>'id') = any(ids)
      or jsonb_typeof(entry->'name') <> 'string' or char_length(btrim(entry->>'name')) not between 1 and 160
      or jsonb_typeof(entry->'rate') <> 'number'
      or jsonb_typeof(entry->'unit') <> 'string' or entry->>'unit' not in ('percent','permille','brl')
      or jsonb_typeof(entry->'period') <> 'string' or entry->>'period' not in ('monthly','annual','single')
      or jsonb_typeof(entry->'validFrom') <> 'string' or jsonb_typeof(entry->'validUntil') <> 'string'
      or jsonb_typeof(entry->'notes') <> 'string' or char_length(entry->>'notes') > 2000 then return false; end if;
    ids := array_append(ids, entry->>'id');
    rate := (entry->>'rate')::numeric;
    if rate < 0 or rate <> round(rate,6)
      or (entry->>'unit' = 'percent' and rate > 100)
      or (entry->>'unit' = 'permille' and rate > 1000)
      or rate > 1000000000000 then return false; end if;
    foreach item_date in array array[entry->>'validFrom',entry->>'validUntil'] loop
      if item_date <> '' and (item_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or item_date::date::text <> item_date) then return false; end if;
    end loop;
    if entry->>'validFrom' <> '' and entry->>'validUntil' <> '' and entry->>'validUntil' < entry->>'validFrom' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.commercial_profile_rates_valid(jsonb) from public, anon;
grant execute on function public.commercial_profile_rates_valid(jsonb) to authenticated;

create table public.commercial_entity_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_year integer not null check (workspace_year between 2020 and 2100),
  entity_id text not null,
  entity_kind text not null,
  central text not null,
  cooperative text,
  pa text,
  capital_modality text not null default 'Não informado' check (capital_modality in ('Não informado','Fixo','Vinculado','Variável','Outro')),
  capital_notes text not null default '' check (char_length(capital_notes) <= 4000),
  rate_tables jsonb not null default '[]'::jsonb check (public.commercial_profile_rates_valid(rate_tables)),
  collection_notes text not null default '' check (char_length(collection_notes) <= 4000),
  new_sales_notes text not null default '' check (char_length(new_sales_notes) <= 4000),
  general_notes text not null default '' check (char_length(general_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, workspace_year, entity_id),
  foreign key (owner_id, workspace_year) references public.commercial_workspaces(owner_id,year) on delete cascade,
  check (public.commercial_entity_path_valid(entity_kind,central,cooperative,pa,entity_id))
);

create table public.commercial_entity_appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_year integer not null check (workspace_year between 2020 and 2100),
  entity_id text not null,
  entity_kind text not null,
  central text not null,
  cooperative text,
  pa text,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  kind text not null check (kind in ('visit','training','meeting','call')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo' check (timezone in ('America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha')),
  location text not null default '' check (char_length(location) <= 500),
  notes text not null default '' check (char_length(notes) <= 4000),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_id, workspace_year) references public.commercial_workspaces(owner_id,year) on delete cascade,
  check (public.commercial_entity_path_valid(entity_kind,central,cooperative,pa,entity_id)),
  check (isfinite(starts_at) and isfinite(ends_at) and ends_at > starts_at and ends_at <= starts_at + interval '7 days'),
  check (extract(year from starts_at at time zone timezone) = workspace_year)
);
create index commercial_entity_appointments_owner_year_entity_date_idx on public.commercial_entity_appointments(owner_id,workspace_year,entity_id,starts_at);

-- Acknowledgement is separate from computed results: an import correction can revoke a goal.
create table public.commercial_goal_alert_states (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_year integer not null check (workspace_year between 2020 and 2100),
  entity_id text not null,
  entity_kind text not null,
  central text not null,
  cooperative text,
  pa text,
  month integer not null check (month between 1 and 12),
  metric text not null check (metric in ('VN','AR')),
  alert_key text not null,
  read_at timestamptz check (read_at is null or isfinite(read_at)),
  notified_at timestamptz check (notified_at is null or isfinite(notified_at)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id,workspace_year,entity_id,month,metric),
  foreign key (owner_id,workspace_year) references public.commercial_workspaces(owner_id,year) on delete cascade,
  check (public.commercial_entity_path_valid(entity_kind,central,cooperative,pa,entity_id)),
  check (alert_key = workspace_year::text || ':' || month::text || ':' || entity_id || ':' || metric)
);
create index commercial_goal_alert_states_owner_year_month_idx on public.commercial_goal_alert_states(owner_id,workspace_year,month);

-- Same approval/session boundary as all existing application data; ownership alone is insufficient.
do $$ declare target text; begin
  foreach target in array array['commercial_entity_profiles','commercial_entity_appointments','commercial_goal_alert_states'] loop
    execute format('alter table public.%I enable row level security',target);
    execute format('revoke all on public.%I from public, anon, authenticated',target);
    execute format('grant select, insert, update, delete on public.%I to authenticated',target);
    execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',target);
    execute format('create policy commercial_active_session on public.%I as restrictive for all to authenticated using ((select commercial_security.session_allowed())) with check ((select commercial_security.session_allowed()))',target);
  end loop;
end; $$;

create function public.commercial_entity_relationship_touch()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.owner_id <> old.owner_id or new.workspace_year <> old.workspace_year
      or new.entity_id <> old.entity_id or new.entity_kind <> old.entity_kind or new.central <> old.central
      or new.cooperative is distinct from old.cooperative or new.pa is distinct from old.pa then
      raise exception 'A identidade da unidade e o proprietário não podem ser alterados.' using errcode = '23514';
    end if;
    if tg_table_name = 'commercial_goal_alert_states' then
      if new.month <> old.month or new.metric <> old.metric or new.alert_key <> old.alert_key then
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
create trigger commercial_entity_profiles_touch before insert or update on public.commercial_entity_profiles for each row execute function public.commercial_entity_relationship_touch();
create trigger commercial_entity_appointments_touch before insert or update on public.commercial_entity_appointments for each row execute function public.commercial_entity_relationship_touch();
create trigger commercial_goal_alert_states_touch before insert or update on public.commercial_goal_alert_states for each row execute function public.commercial_entity_relationship_touch();

-- Prevent silent orphaning of a dossier/calendar when a unit is moved, renamed by code or removed.
create function public.commercial_workspace_relationship_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.dataset->'registry' is not distinct from old.dataset->'registry' then return new; end if;
  if exists (
    select 1 from (
      select entity_id from public.commercial_entity_profiles where owner_id = old.owner_id and workspace_year = old.year
      union select entity_id from public.commercial_entity_appointments where owner_id = old.owner_id and workspace_year = old.year
    ) linked
    where exists (select 1 from jsonb_array_elements(coalesce(old.dataset->'registry'->'entities','[]'::jsonb)) e where e->>'id' = linked.entity_id)
      and not exists (select 1 from jsonb_array_elements(coalesce(new.dataset->'registry'->'entities','[]'::jsonb)) e where e->>'id' = linked.entity_id)
  ) then
    raise exception 'Esta unidade possui ficha ou compromissos. Exclua a ficha e os compromissos antes de remover ou alterar seu código.' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function public.commercial_workspace_relationship_guard() from public,anon,authenticated;
create trigger commercial_workspace_relationship_guard before update of dataset on public.commercial_workspaces for each row execute function public.commercial_workspace_relationship_guard();

comment on table public.commercial_entity_profiles is 'Owner-scoped annual central/cooperative/PA dossiers; rates are descriptive and do not change goal calculations.';
comment on table public.commercial_entity_appointments is 'Owner-scoped commercial calendar; no invitations or outbound messages are sent by these records.';
comment on table public.commercial_goal_alert_states is 'Read and user-confirmed communication state only. Achievement is always recalculated from current monthly realized figures.';
commit;
