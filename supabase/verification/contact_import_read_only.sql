-- Run after the contact import migration. This checks catalogs and a denied RPC
-- only: no real contact rows are read, created, updated or deleted.
begin;
set transaction read only;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
do $$
declare denied boolean := false;
begin
  begin
    perform public.import_commercial_contacts(2026, '[]'::jsonb, null, 1);
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then
    raise exception 'Verification failed: missing session was not rejected.';
  end if;
  perform set_config('commercial_import_verification.denied', 'true', true);
end;
$$;
reset role;
select jsonb_build_object(
  'missing_session_rejected', current_setting('commercial_import_verification.denied', true) = 'true',
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'security_invoker', not p.prosecdef,
      'fixed_search_path', coalesce(p.proconfig @> array['search_path=""'], false),
      'anonymous_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'commercial_contacts_lock_workspace', 'commercial_contact_import_phone', 'import_commercial_contacts'
    )
  ),
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'rls', c.relrowsecurity,
      'anonymous_select', has_table_privilege('anon', c.oid, 'SELECT'),
      'anonymous_insert', has_table_privilege('anon', c.oid, 'INSERT'),
      'active_session_restrictive', exists (
        select 1 from pg_policy p where p.polrelid = c.oid
          and p.polname = 'commercial_active_session' and not p.polpermissive
      )
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('commercial_entity_contacts', 'commercial_workspaces')
  ),
  'workspace_lock_trigger_enabled', exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.commercial_entity_contacts'::regclass
      and t.tgname = 'commercial_contacts_lock_workspace'
      and not t.tgisinternal and t.tgenabled = 'O'
  )
) as contact_import_verification;
rollback;
