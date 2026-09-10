drop policy if exists "No client access to administrator allowlist"
  on public.commercial_admin_allowlist;

create policy "No client access to administrator allowlist"
on public.commercial_admin_allowlist
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
