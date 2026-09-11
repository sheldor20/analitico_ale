// Test-only Auth model. Existing ownership suites use sub=id and session_id=id.
// Production never imports this helper or grants approval on registration.
export async function installAuthFixture(db) {
  await db.exec(`
    alter table auth.users add column if not exists email_confirmed_at timestamptz default now();
    alter table auth.users add column if not exists is_anonymous boolean default false;
    alter table auth.users add column if not exists banned_until timestamptz;
    alter table auth.users add column if not exists raw_app_meta_data jsonb default '{"commercial_access":true}'::jsonb;
    alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb;
    create table if not exists auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
    insert into auth.sessions(id,user_id) select id,id from auth.users on conflict do nothing;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('session_id',current_setting('request.jwt.claim.sub',true),'role','authenticated')
        || coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
    $$;
    grant execute on function auth.jwt() to authenticated,anon;
  `);
}
