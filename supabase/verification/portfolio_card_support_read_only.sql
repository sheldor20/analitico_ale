-- Read-only verification of the already applied migration 20260911020542.
-- Does not read business content, change records or grant permissions.
select jsonb_build_object(
 'migration',(select jsonb_build_object('version',version,'name',name) from supabase_migrations.schema_migrations where name='portfolio_card_support' order by version desc limit 1),
 'constraint_validated',(select convalidated from pg_constraint where conname='commercial_dashboard_card_metadata_check' and conrelid='public.commercial_communication_drafts'::regclass),
 'session_policies',(select count(*) from pg_policies where schemaname='public' and policyname='commercial_active_session' and permissive='RESTRICTIVE'),
 'anonymous_read',has_table_privilege('anon','public.commercial_communication_drafts','SELECT'),
 'legacy_valid',public.commercial_dashboard_card_metadata_valid('{"blocks":[{"type":"cards","items":[{"label":"Meta","value":"100"}]}]}'::jsonb),
 'new_valid',public.commercial_dashboard_card_metadata_valid('{"blocks":[{"type":"cards","items":[{"label":"Realizado","value":"150","support":"150% da meta","accent":true}]}]}'::jsonb),
 'invalid_rejected',not public.commercial_dashboard_card_metadata_valid('{"blocks":[{"type":"cards","items":[{"label":"Realizado","value":"150","accent":"true"}]}]}'::jsonb)
) as verification;
