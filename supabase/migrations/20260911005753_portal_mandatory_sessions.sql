-- Source for the CLI-generated migration. No accounts, passwords or customer data.
-- A verified login is necessary but is not itself permission to use this private application.
create schema if not exists commercial_security;
revoke all on schema commercial_security from public, anon;
grant usage on schema commercial_security to authenticated;

create or replace function commercial_security.session_allowed()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    join auth.sessions s on s.user_id = u.id
    where u.id = (select auth.uid())
      and s.id::text = (select auth.jwt() ->> 'session_id')
      and (s.not_after is null or s.not_after > now())
      and not coalesce(u.is_anonymous, false)
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and (u.raw_app_meta_data @> '{"commercial_access":true}'::jsonb
        or u.raw_app_meta_data @> '{"commercial_admin":true}'::jsonb)
  );
$$;
revoke all on function commercial_security.session_allowed() from public, anon;
grant execute on function commercial_security.session_allowed() to authenticated;

-- Exposed RPC reveals only the caller's boolean, never auth.users/auth.sessions contents.
create or replace function public.commercial_session_allowed()
returns boolean language sql stable security invoker
set search_path = ''
as $$ select commercial_security.session_allowed(); $$;
revoke all on function public.commercial_session_allowed() from public, anon;
grant execute on function public.commercial_session_allowed() to authenticated;

-- RESTRICTIVE composes with, rather than replaces, each existing owner_id policy.
do $$
declare target text;
begin
  foreach target in array array['commercial_imports','commercial_actions','commercial_workspaces','commercial_entity_contacts','commercial_communication_drafts','commercial_message_templates'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('revoke all on table public.%I from anon', target);
    execute format('drop policy if exists commercial_active_session on public.%I', target);
    execute format('create policy commercial_active_session on public.%I as restrictive for all to authenticated using ((select commercial_security.session_allowed())) with check ((select commercial_security.session_allowed()))', target);
  end loop;
end;
$$;

-- Trigger functions are not a client RPC surface.
revoke all on function public.commercial_touch_action() from public, anon, authenticated;
comment on function public.commercial_session_allowed() is 'Private commercial application: verified email, active session and server-managed approval. User-editable metadata is never authorization.';
