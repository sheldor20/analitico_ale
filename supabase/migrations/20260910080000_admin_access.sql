-- Pre-authorize the initial commercial administrator without storing the
-- administrator e-mail or password in source control. Supabase Auth continues
-- to own password hashing, confirmation and session lifecycle.

create table if not exists public.commercial_admin_allowlist (
  email_sha256 text primary key
    check (email_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.commercial_admin_allowlist enable row level security;
revoke all on table public.commercial_admin_allowlist from anon, authenticated;

insert into public.commercial_admin_allowlist (email_sha256)
values ('1eea4fcc8e8eff612238e7db4796a5b456b408c677022de218a41e8b04d94cce')
on conflict (email_sha256) do nothing;

create or replace function public.apply_commercial_admin_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_hash text;
  was_commercial_admin boolean;
begin
  if new.email is null then
    return new;
  end if;

  email_hash := encode(
    extensions.digest(convert_to(lower(trim(new.email)), 'UTF8'), 'sha256'),
    'hex'
  );
  was_commercial_admin := coalesce(
    (new.raw_app_meta_data ->> 'commercial_admin')::boolean,
    false
  );

  if exists (
    select 1
    from public.commercial_admin_allowlist allowed
    where allowed.email_sha256 = email_hash
  ) then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || '{"role":"admin","commercial_admin":true}'::jsonb;
  elsif was_commercial_admin then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      - 'commercial_admin'
      - 'role';
  end if;

  return new;
end;
$$;

revoke all on function public.apply_commercial_admin_claim() from public, anon, authenticated;

drop trigger if exists apply_commercial_admin_claim on auth.users;
create trigger apply_commercial_admin_claim
before insert or update of email on auth.users
for each row
execute function public.apply_commercial_admin_claim();

comment on table public.commercial_admin_allowlist is
  'SHA-256 allowlist for commercial administrator accounts. Plain e-mails and passwords are never stored here.';
comment on function public.apply_commercial_admin_claim() is
  'Adds the trusted commercial administrator claim during Supabase Auth user creation or e-mail change.';
