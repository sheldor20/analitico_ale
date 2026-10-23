-- CNV summaries and original regulations stay private to the approved account.
create or replace function commercial_security.cnv_details_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare field text; item jsonb; start_date date; end_date date;
begin
  if jsonb_typeof(value) is distinct from 'object' or octet_length(value::text) > 100000
    or value->'year' is distinct from '2026'::jsonb or value->'needsReview' is distinct from 'false'::jsonb
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
revoke all on function commercial_security.cnv_details_valid(jsonb) from public, anon;
grant execute on function commercial_security.cnv_details_valid(jsonb) to authenticated;

create table public.commercial_cnv_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  year integer not null default 2026 check (year=2026),
  title text not null check (length(btrim(title)) between 1 and 200),
  details jsonb not null check (commercial_security.cnv_details_valid(details)),
  filename text not null check (length(filename) between 1 and 220 and filename !~ '[[:cntrl:]/\\]'),
  storage_path text not null check (storage_path=owner_id::text||'/'||id::text||'/regulamento.pdf'),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  page_count integer not null check (page_count between 1 and 200),
  revision integer not null default 1 check (revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,file_sha256),
  check (title=details->>'title')
);
create index commercial_cnv_actions_owner_id on public.commercial_cnv_actions(owner_id,id);

create or replace function commercial_security.cnv_guard_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
    or new.year is distinct from old.year or new.storage_path is distinct from old.storage_path
    or new.file_sha256 is distinct from old.file_sha256 or new.filename is distinct from old.filename
    or new.page_count is distinct from old.page_count or new.created_at is distinct from old.created_at
  then raise exception 'A identidade e o regulamento original da ação não podem ser alterados.'; end if;
  if new.revision <> old.revision+1 then raise exception 'Recarregue a ação antes de salvar uma nova revisão.'; end if;
  new.updated_at := clock_timestamp();
  return new;
end; $$;
revoke all on function commercial_security.cnv_guard_identity() from public, anon, authenticated;
create trigger commercial_cnv_actions_guard before update on public.commercial_cnv_actions
for each row execute function commercial_security.cnv_guard_identity();

alter table public.commercial_cnv_actions enable row level security;
revoke all on table public.commercial_cnv_actions from public, anon;
grant select,insert,update,delete on table public.commercial_cnv_actions to authenticated;
create policy cnv_owner on public.commercial_cnv_actions for all to authenticated
using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create policy commercial_active_session on public.commercial_cnv_actions as restrictive for all to authenticated
using ((select commercial_security.session_allowed())) with check ((select commercial_security.session_allowed()));

-- Unit SQL suites do not provision native Storage. The real project does.
do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then return; end if;
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('commercial-cnv-regulations','commercial-cnv-regulations',false,20971520,array['application/pdf'])
    on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=array['application/pdf'];
  execute 'create policy cnv_regulations_owner on storage.objects for all to authenticated using (bucket_id=''commercial-cnv-regulations'' and split_part(name,''/'',1)=(select auth.uid())::text and name ~ ''^[0-9a-f-]{36}/[0-9a-f-]{36}/regulamento\.pdf$'') with check (bucket_id=''commercial-cnv-regulations'' and split_part(name,''/'',1)=(select auth.uid())::text and name ~ ''^[0-9a-f-]{36}/[0-9a-f-]{36}/regulamento\.pdf$'')';
  -- These restrictions also compose safely with any broader existing bucket policy.
  execute 'create policy cnv_regulations_session on storage.objects as restrictive for all to authenticated using (bucket_id<>''commercial-cnv-regulations'' or ((select commercial_security.session_allowed()) and split_part(name,''/'',1)=(select auth.uid())::text and name ~ ''^[0-9a-f-]{36}/[0-9a-f-]{36}/regulamento\.pdf$'')) with check (bucket_id<>''commercial-cnv-regulations'' or ((select commercial_security.session_allowed()) and split_part(name,''/'',1)=(select auth.uid())::text and name ~ ''^[0-9a-f-]{36}/[0-9a-f-]{36}/regulamento\.pdf$''))';
  execute 'create policy cnv_regulations_original_immutable on storage.objects as restrictive for update to authenticated using (bucket_id<>''commercial-cnv-regulations'') with check (bucket_id<>''commercial-cnv-regulations'')';
  execute 'create policy cnv_regulations_no_anon on storage.objects as restrictive for all to anon using (bucket_id<>''commercial-cnv-regulations'') with check (bucket_id<>''commercial-cnv-regulations'')';
end; $storage$;
