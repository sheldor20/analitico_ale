begin;

-- Operational actions no longer depend on an immutable import snapshot.
create table public.commercial_workspace_actions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 workspace_year integer not null,
 entity_key text not null check (char_length(entity_key) between 1 and 240),
 entity_id text not null check (char_length(entity_id) between 1 and 240),
 owner_name text not null default '' check (char_length(owner_name)<=120),
 due_date date,
 status text not null default 'Aberta' check (status in ('Aberta','Em andamento','Concluída')),
 notes text not null default '' check (char_length(notes)<=4000),
 updated_at timestamptz not null default now(),
 unique(owner_id,workspace_year,entity_key),
 foreign key(owner_id,workspace_year) references public.commercial_workspaces(owner_id,year) on delete cascade
);
alter table public.commercial_workspace_actions enable row level security;
revoke all on public.commercial_workspace_actions from public,anon,authenticated;
grant select,insert,update,delete on public.commercial_workspace_actions to authenticated;
create policy workspace_actions_owner on public.commercial_workspace_actions for all to authenticated
 using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy workspace_actions_session on public.commercial_workspace_actions as restrictive for all to authenticated
 using ((select commercial_security.session_allowed())) with check ((select commercial_security.session_allowed()));

create function public.commercial_workspace_action_validate() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.workspace_year<>old.workspace_year or new.entity_key<>old.entity_key or new.entity_id<>old.entity_id) then
  raise exception 'A identidade da ação não pode ser alterada.' using errcode='23514';
 end if;
 if not exists(select 1 from public.commercial_workspaces w,
  jsonb_array_elements(coalesce(w.dataset->'registry'->'entities','[]'::jsonb)) e
  where w.owner_id=new.owner_id and w.year=new.workspace_year and e->>'id'=new.entity_id) then
  raise exception 'A unidade da ação precisa existir no cadastro anual.' using errcode='23514';
 end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function public.commercial_workspace_action_validate() from public,anon,authenticated;
create trigger workspace_action_validate before insert or update on public.commercial_workspace_actions
 for each row execute function public.commercial_workspace_action_validate();

-- Carry the latest existing action forward when its unit still exists. Originals remain intact.
with candidates as (
 select a.*,i.year,
 case when a.entity_key ~ '^(base|cadence):(VN|AR):(central|cooperative):' then regexp_replace(a.entity_key,'^(base|cadence):(VN|AR):','')
 when a.entity_key ~ '^cadence:[0-9]+:[0-9]+:[0-9]+:VN$' then 'pa:'||split_part(a.entity_key,':',2)||':'||split_part(a.entity_key,':',3)||':'||split_part(a.entity_key,':',4)
 when a.entity_key ~ '^base:[0-9]+:[0-9]+::(VN|AR)$' then 'cooperative:'||split_part(a.entity_key,':',2)||':'||split_part(a.entity_key,':',3)
 else null end entity_id
 from public.commercial_actions a join public.commercial_imports i on i.id=a.import_id and i.owner_id=a.owner_id
), latest as (
 select distinct on(c.owner_id,c.year,c.entity_key) c.* from candidates c join public.commercial_workspaces w on w.owner_id=c.owner_id and w.year=c.year
 where exists(select 1 from jsonb_array_elements(coalesce(w.dataset->'registry'->'entities','[]'::jsonb)) e where e->>'id'=c.entity_id)
 order by c.owner_id,c.year,c.entity_key,c.updated_at desc,c.id
)
insert into public.commercial_workspace_actions(owner_id,workspace_year,entity_key,entity_id,owner_name,due_date,status,notes)
select owner_id,year,entity_key,entity_id,coalesce(owner_name,''),due_date,status,coalesce(notes,'') from latest;

-- Each successful revision keeps its predecessor; clients cannot forge history.
alter table public.commercial_workspaces add column change_reason text not null default 'Atualização do cadastro'
 check (char_length(change_reason) between 1 and 200);
create table public.commercial_workspace_versions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 workspace_year integer not null,
 revision integer not null check(revision>=1),
 dataset jsonb not null,
 saved_at timestamptz not null,
 archived_at timestamptz not null default now(),
 change_reason text not null,
 unique(owner_id,workspace_year,revision),
 foreign key(owner_id,workspace_year) references public.commercial_workspaces(owner_id,year) on delete cascade
);
alter table public.commercial_workspace_versions enable row level security;
revoke all on public.commercial_workspace_versions from public,anon,authenticated;
grant select on public.commercial_workspace_versions to authenticated;
create policy workspace_versions_owner on public.commercial_workspace_versions for select to authenticated using ((select auth.uid())=owner_id);
create policy workspace_versions_session on public.commercial_workspace_versions as restrictive for all to authenticated
 using ((select commercial_security.session_allowed())) with check ((select commercial_security.session_allowed()));

create function commercial_security.archive_workspace_revision() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is not null and (select auth.uid())<>old.owner_id then
  raise exception 'A versão pertence a outra conta.' using errcode='42501';
 end if;
 insert into public.commercial_workspace_versions(owner_id,workspace_year,revision,dataset,saved_at,change_reason)
 values(old.owner_id,old.year,old.revision,old.dataset,old.updated_at,new.change_reason);
 return new;
end $$;
revoke all on function commercial_security.archive_workspace_revision() from public,anon,authenticated;
create trigger archive_workspace_revision after update on public.commercial_workspaces
 for each row execute function commercial_security.archive_workspace_revision();

comment on table public.commercial_workspace_versions is 'Immutable owner-scoped predecessors of successful annual workspace updates. Restoring creates a new revision and preserves current history.';
comment on table public.commercial_workspace_actions is 'Current operational actions by owner, year and analytical unit. Historical import actions remain unchanged.';
alter table public.commercial_cnv_actions drop constraint commercial_cnv_actions_year_check;
alter table public.commercial_cnv_actions add constraint commercial_cnv_actions_year_check check(year between 2020 and 2100);
create or replace function commercial_security.cnv_details_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare field text; item jsonb; start_date date; end_date date;
begin
  if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text) > 100000
    or (jsonb_typeof(value->'year') is distinct from 'number' or (value->>'year') !~ '^(20[2-9][0-9]|2100)$') or value->'needsReview' is distinct from 'false'::jsonb
    or jsonb_typeof(value->'title') is distinct from 'string' or length(btrim(value->>'title')) not between 1 and 200
    or jsonb_typeof(value->'summary') is distinct from 'string' or length(btrim(value->>'summary')) not between 1 and 6000
    or jsonb_typeof(value->'periodLabel') is distinct from 'string' or length(value->>'periodLabel') > 600
    or not (value ?& array['title','year','summary','products','goals','startDate','endDate','periodLabel','eligibility','rewards','importantRules','needsReview'])
  then return false; end if;
  foreach field in array array['products','goals','eligibility','rewards','importantRules'] loop
    if jsonb_typeof(value->field) is distinct from 'array' or jsonb_array_length(value->field) > 60 then return false; end if;
    for item in select * from jsonb_array_elements(value->field) loop
      if jsonb_typeof(item) is distinct from 'string' or length(btrim(item#>>'{}')) not between 1 and 4000 then return false; end if;
    end loop;
  end loop;
  foreach field in array array['startDate','endDate'] loop
    if value->field <> 'null'::jsonb then
      if jsonb_typeof(value->field) is distinct from 'string' or (value->>field) !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
      if field='startDate' then start_date := (value->>field)::date; else end_date := (value->>field)::date; end if;
    end if;
  end loop;
  if start_date > end_date then return false; end if;
  if value ? 'warnings' then
    if jsonb_typeof(value->'warnings') is distinct from 'array' or jsonb_array_length(value->'warnings') > 30 then return false; end if;
    for item in select * from jsonb_array_elements(value->'warnings') loop
      if jsonb_typeof(item) is distinct from 'string' or length(btrim(item#>>'{}')) not between 1 and 4000 then return false; end if;
    end loop;
  end if;
  if value ? 'sourcePages' then
    if jsonb_typeof(value->'sourcePages') is distinct from 'array' or jsonb_array_length(value->'sourcePages') > 120 then return false; end if;
    for item in select * from jsonb_array_elements(value->'sourcePages') loop
      if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['field','page','excerpt'])
        or jsonb_typeof(item->'field') is distinct from 'string' or length(btrim(item->>'field')) not between 1 and 100
        or jsonb_typeof(item->'excerpt') is distinct from 'string' or length(item->>'excerpt') > 1200
        or jsonb_typeof(item->'page') is distinct from 'number' or (item->>'page') !~ '^\d+$' or (item->>'page')::integer not between 1 and 200
      then return false; end if;
    end loop;
  end if;
  return true;
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;
alter table public.commercial_cnv_actions add constraint commercial_cnv_actions_year_matches_details check(year=(details->>'year')::integer);
create function commercial_security.workspace_calendar_valid(value jsonb, expected_year integer)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; parsed date;
begin
 if not (coalesce(value->'config','{}'::jsonb) ? 'calendarHolidays') then return true;end if;
 if jsonb_typeof(value->'config'->'calendarHolidays') is distinct from 'array' or jsonb_array_length(value->'config'->'calendarHolidays')>366 then return false;end if;
 for item in select jsonb_array_elements(value->'config'->'calendarHolidays') loop
  if jsonb_typeof(item) is distinct from 'string' or (item#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false;end if;
  parsed:=(item#>>'{}')::date;
  if extract(year from parsed)<>expected_year or to_char(parsed,'YYYY-MM-DD')<>(item#>>'{}') then return false;end if;
 end loop;
 return true;
 exception when others then return false;
end $$;
revoke all on function commercial_security.workspace_calendar_valid(jsonb,integer) from public,anon;
grant execute on function commercial_security.workspace_calendar_valid(jsonb,integer) to authenticated;
alter table public.commercial_workspaces add constraint commercial_workspace_calendar_check check(commercial_security.workspace_calendar_valid(dataset,year));

commit;
