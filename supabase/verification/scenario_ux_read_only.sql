-- UX-only release: read-only verification. No data or schema changes.
select jsonb_build_object(
  'invalid_annual_workspaces', (select count(*) from public.commercial_workspaces where not public.commercial_workspace_dataset_valid(dataset, year)),
  'duplicate_owner_years', (select count(*) from (select owner_id, year from public.commercial_workspaces group by owner_id, year having count(*) > 1) duplicates),
  'annual_workspaces', (select coalesce(jsonb_agg(jsonb_build_object('year', year, 'bases', bases) order by year), '[]'::jsonb) from (select year, count(*) as bases from public.commercial_workspaces group by year) years),
  'access_protection', (select jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity, 'policies', (select count(*) from pg_policy p where p.polrelid=c.oid), 'anonymous_select', has_table_privilege('anon', c.oid, 'select')) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('commercial_workspaces','commercial_message_templates','commercial_entity_contacts','commercial_communication_drafts'))
) as ux_verification;
