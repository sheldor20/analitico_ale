-- Versioned snapshot contract for two-source imports and fixed PA targets.
begin;

alter table public.commercial_imports
  drop constraint if exists commercial_imports_dataset_check;
-- PGlite and some restored PostgreSQL schemas may use the shorter generated name.
alter table public.commercial_imports
  drop constraint if exists commercial_imports_check;

alter table public.commercial_imports
  add constraint commercial_imports_dataset_check check (
    jsonb_typeof(dataset) = 'object'
    and (dataset ->> 'version')::integer in (1, 2)
    and dataset ?& array['rows', 'year', 'config', 'sources']
    and (dataset ->> 'year')::integer = year
    and jsonb_typeof(dataset -> 'rows') = 'array'
    and jsonb_array_length(dataset -> 'rows') between 1 and 50000
    and jsonb_typeof(dataset -> 'sources') = 'array'
    and jsonb_array_length(dataset -> 'sources') between 1 and 2
    and octet_length(dataset::text) <= 20000000
    and (
      (dataset ->> 'version')::integer = 1
      or (
        coalesce(jsonb_typeof(dataset -> 'paTargetPolicy') = 'object', false)
        and dataset -> 'paTargetPolicy' @> '{
          "version": "2026.1",
          "groups": {
            "P1": {"monthly": 450, "annual": 5400},
            "P2": {"monthly": 600, "annual": 7200},
            "P3": {"monthly": 750, "annual": 9000},
            "P4": {"monthly": 850, "annual": 10200},
            "P5": {"monthly": 1000, "annual": 12000}
          }
        }'::jsonb
      )
    )
  );

alter table public.commercial_imports
  add column if not exists source_count smallint
  generated always as (jsonb_array_length(dataset -> 'sources')) stored;

alter table public.commercial_imports
  add column if not exists has_cooperative_base boolean
  generated always as (
    dataset -> 'sources' @> '[{"type":"base"}]'::jsonb
  ) stored;

alter table public.commercial_imports
  add column if not exists has_pa_cadence boolean
  generated always as (
    dataset -> 'sources' @> '[{"type":"cadence"}]'::jsonb
  ) stored;

comment on column public.commercial_imports.source_count is
  'Number of imported source files in the immutable snapshot (one or two).';
comment on column public.commercial_imports.has_cooperative_base is
  'True when the snapshot contains the cooperative/central source.';
comment on column public.commercial_imports.has_pa_cadence is
  'True when the snapshot contains the PA cadence source.';

create index if not exists commercial_actions_import_owner_idx
  on public.commercial_actions(import_id, owner_id);

commit;
