begin;

-- Share the workspace lock with the importer so ordinary contact edits cannot
-- race an import's identity check. Workspace cascades may already have removed
-- the parent row: a missing parent here is harmless and the existing FK applies.
create function public.commercial_contacts_lock_workspace()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  contact_owner uuid;
  contact_year integer;
begin
  if tg_op = 'DELETE' then
    contact_owner := old.owner_id;
    contact_year := old.workspace_year;
  else
    contact_owner := new.owner_id;
    contact_year := new.workspace_year;
  end if;
  perform 1 from public.commercial_workspaces
    where owner_id = contact_owner and year = contact_year
    for update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.commercial_contacts_lock_workspace() from public, anon, authenticated;
create trigger commercial_contacts_lock_workspace
  before insert or update or delete on public.commercial_entity_contacts
  for each row execute function public.commercial_contacts_lock_workspace();

-- Keep channel matching consistent with the communication phone parser. Invalid
-- legacy phone text returns NULL, so an unchanged manual value can be preserved.
create function public.commercial_contact_import_phone(value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  raw text := btrim(coalesce(value, ''));
  digits text;
begin
  if raw = '' then return ''; end if;
  if char_length(raw) > 40 or raw !~ '^\+?[0-9[:space:]().-]+$' then return null; end if;
  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  if left(raw, 1) <> '+' and char_length(digits) < 10 then return null; end if;
  if left(raw, 1) <> '+' and char_length(digits) in (10,11) then digits := '55' || digits; end if;
  if digits !~ '^[1-9][0-9]{7,14}$'
    or (left(digits, 2) = '55' and char_length(digits) not in (12,13)) then return null; end if;
  return '+' || digits;
end;
$$;
revoke all on function public.commercial_contact_import_phone(text) from public, anon;
grant execute on function public.commercial_contact_import_phone(text) to authenticated;

-- A single RPC is a transaction: every selected row succeeds, or none is saved.
-- The caller supplies the reviewed owner/revision, never an owner for the writes.
create function public.import_commercial_contacts(
  p_year integer,
  p_items jsonb,
  p_expected_owner uuid,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  workspace public.commercial_workspaces%rowtype;
  saved_contact public.commercial_entity_contacts%rowtype;
  matched_contact public.commercial_entity_contacts%rowtype;
  registry_by_id jsonb;
  entities jsonb;
  entity jsonb;
  item jsonb;
  entity_id_value text;
  name_value text;
  identity_value text;
  seen_identities text[] := array[]::text[];
  field_name text;
  job_title_value text;
  teams_value text;
  whatsapp_value text;
  phone_identity text;
  emails_value text[];
  merged_emails text[];
  email_value jsonb;
  normalized_email text;
  contact_id_value uuid;
  expected_timestamp timestamptz;
  matches integer;
  created_count integer := 0;
  updated_count integer := 0;
  unchanged_count integer := 0;
begin
  if caller is null or p_expected_owner is distinct from caller
    or not public.commercial_session_allowed() then
    raise exception 'Sua sessão mudou ou expirou. Entre novamente e revise a importação.' using errcode = '42501';
  end if;
  if p_year is null or p_year not between 2020 and 2100
    or p_expected_revision is null or p_expected_revision < 1
    or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Os parâmetros da importação são inválidos.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 1000
    or octet_length(p_items::text) > 4000000 then
    raise exception 'Selecione entre 1 e 1.000 responsáveis por importação.' using errcode = '22023';
  end if;

  select * into workspace from public.commercial_workspaces
    where owner_id = caller and year = p_year for update;
  if not found then
    raise exception 'Salve o cadastro deste ano antes de importar os responsáveis.' using errcode = '40001';
  end if;
  if workspace.revision <> p_expected_revision then
    raise exception 'O cadastro mudou. Recarregue e revise a importação.' using errcode = '40001';
  end if;

  -- Build the lookup once, retaining duplicates so ambiguous registries fail.
  select coalesce(jsonb_object_agg(id, entries), '{}'::jsonb) into registry_by_id
  from (
    select value ->> 'id' as id, jsonb_agg(value) as entries
    from jsonb_array_elements(coalesce(workspace.dataset -> 'registry' -> 'entities', '[]'::jsonb))
    group by value ->> 'id'
  ) registry;

  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Há um responsável inválido na seleção.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(item) as supplied(key)
      where key not in ('entity_id','name','job_title','teams','whatsapp','emails','contact_id','expected_updated_at')) then
      raise exception 'Há campos não permitidos na importação.' using errcode = '22023';
    end if;
    if jsonb_typeof(item -> 'entity_id') is distinct from 'string'
      or jsonb_typeof(item -> 'name') is distinct from 'string' then
      raise exception 'Informe a cooperativa e o nome de cada responsável.' using errcode = '22023';
    end if;
    entity_id_value := item ->> 'entity_id';
    name_value := btrim(regexp_replace(item ->> 'name', '[[:space:]]+', ' ', 'g'));
    if char_length(entity_id_value) not between 1 and 240 or char_length(name_value) not between 1 and 160 then
      raise exception 'O nome do responsável ou a cooperativa é inválido.' using errcode = '22023';
    end if;
    identity_value := entity_id_value || chr(31) || lower(name_value);
    if identity_value = any(seen_identities) then
      raise exception 'O mesmo responsável aparece mais de uma vez na seleção.' using errcode = '22023';
    end if;
    seen_identities := array_append(seen_identities, identity_value);

    entities := registry_by_id -> entity_id_value;
    if entities is null or jsonb_array_length(entities) <> 1 then
      raise exception 'A cooperativa não está no cadastro salvo ou está duplicada. Revise a importação.' using errcode = '40001';
    end if;
    entity := entities -> 0;
    if entity ->> 'kind' is distinct from 'cooperative'
      or coalesce(entity ->> 'central', '') !~ '^[0-9]{1,12}$'
      or coalesce(entity ->> 'cooperative', '') !~ '^[0-9]{1,12}$'
      or entity_id_value <> 'cooperative:' || (entity ->> 'central') || ':' || (entity ->> 'cooperative') then
      raise exception 'A importação aceita apenas cooperativas válidas do cadastro salvo.' using errcode = '22023';
    end if;

    foreach field_name in array array['job_title','teams','whatsapp','contact_id','expected_updated_at'] loop
      if item ? field_name and jsonb_typeof(item -> field_name) not in ('string','null') then
        raise exception 'Há um campo de contato inválido na importação.' using errcode = '22023';
      end if;
    end loop;
    job_title_value := btrim(coalesce(item ->> 'job_title', ''));
    teams_value := btrim(coalesce(item ->> 'teams', ''));
    whatsapp_value := btrim(coalesce(item ->> 'whatsapp', ''));
    if char_length(job_title_value) > 160 or char_length(teams_value) > 300 or char_length(whatsapp_value) > 40 then
      raise exception 'Um campo de contato excede o tamanho permitido.' using errcode = '22023';
    end if;
    emails_value := array[]::text[];
    if item ? 'emails' and jsonb_typeof(item -> 'emails') <> 'null' then
      if jsonb_typeof(item -> 'emails') <> 'array' then
        raise exception 'A lista de e-mails é inválida.' using errcode = '22023';
      end if;
      if jsonb_array_length(item -> 'emails') > 10 then
        raise exception 'Cada responsável pode ter no máximo 10 e-mails.' using errcode = '22023';
      end if;
      for email_value in select value from jsonb_array_elements(item -> 'emails') loop
        if jsonb_typeof(email_value) <> 'string' then
          raise exception 'Há um e-mail inválido na importação.' using errcode = '22023';
        end if;
        normalized_email := lower(btrim(email_value #>> '{}'));
        if normalized_email <> '' and not normalized_email = any(emails_value) then
          emails_value := array_append(emails_value, normalized_email);
        end if;
      end loop;
    end if;
    if not public.commercial_contact_emails_valid(emails_value) then
      raise exception 'Há um e-mail inválido na importação.' using errcode = '22023';
    end if;

    contact_id_value := nullif(item ->> 'contact_id', '')::uuid;
    expected_timestamp := nullif(item ->> 'expected_updated_at', '')::timestamptz;
    if (contact_id_value is null) <> (expected_timestamp is null) then
      raise exception 'Revise os responsáveis existentes antes de importar.' using errcode = '40001';
    end if;
    matches := 0;
    saved_contact := null;
    for matched_contact in select * from public.commercial_entity_contacts c
      where c.owner_id = caller and c.workspace_year = p_year and c.entity_id = entity_id_value
        and lower(btrim(regexp_replace(c.name, '[[:space:]]+', ' ', 'g'))) = lower(name_value)
      for update loop
      matches := matches + 1;
      saved_contact := matched_contact;
    end loop;
    if matches > 1 then
      raise exception 'Há responsáveis com o mesmo nome nesta cooperativa. Revise o cadastro antes de importar.' using errcode = '40001';
    end if;
    if contact_id_value is null and matches > 0 then
      raise exception 'Um responsável foi cadastrado após a prévia. Recarregue e revise a importação.' using errcode = '40001';
    end if;
    if contact_id_value is not null and (matches <> 1 or saved_contact.id is distinct from contact_id_value
      or saved_contact.updated_at is distinct from expected_timestamp
      or saved_contact.entity_kind <> 'cooperative'
      or saved_contact.central is distinct from entity ->> 'central'
      or saved_contact.cooperative is distinct from entity ->> 'cooperative'
      or saved_contact.pa is not null) then
      raise exception 'Um responsável mudou após a prévia. Recarregue e revise a importação.' using errcode = '40001';
    end if;

    if whatsapp_value <> '' and (contact_id_value is null or whatsapp_value is distinct from saved_contact.whatsapp) then
      phone_identity := public.commercial_contact_import_phone(whatsapp_value);
      if phone_identity is null then
        raise exception 'Confira o telefone: informe um único número com DDD e, para outro país, +DDI.' using errcode = '22023';
      end if;
      whatsapp_value := phone_identity;
    end if;
    merged_emails := emails_value;
    if contact_id_value is not null then
      job_title_value := coalesce(nullif(job_title_value, ''), saved_contact.job_title);
      teams_value := coalesce(nullif(teams_value, ''), saved_contact.teams);
      whatsapp_value := coalesce(nullif(whatsapp_value, ''), saved_contact.whatsapp);
      merged_emails := saved_contact.emails;
      if cardinality(emails_value) > 0 then
        select array_agg(email order by first_position) into merged_emails from (
          select lower(btrim(value)) as email, min(position) as first_position
          from unnest(saved_contact.emails || emails_value) with ordinality as all_emails(value, position)
          group by lower(btrim(value))
        ) unique_emails;
      end if;
    end if;
    if not public.commercial_contact_emails_valid(merged_emails) then
      raise exception 'A união dos e-mails ultrapassa 10 endereços. Revise o contato antes de importar.' using errcode = '22023';
    end if;
    if cardinality(merged_emails) = 0 and whatsapp_value = '' then
      raise exception 'Informe pelo menos um e-mail ou telefone para o contato.' using errcode = '22023';
    end if;
    phone_identity := public.commercial_contact_import_phone(whatsapp_value);
    if exists (
      select 1 from public.commercial_entity_contacts c
      where c.owner_id = caller and c.workspace_year = p_year and c.entity_id = entity_id_value
        and c.id is distinct from contact_id_value
        and (
          exists (select 1 from unnest(c.emails) as saved_email
            where lower(btrim(saved_email)) = any(merged_emails))
          or (phone_identity <> '' and public.commercial_contact_import_phone(c.whatsapp) = phone_identity)
        )
    ) then
      raise exception 'E-mail ou telefone associado a outro responsável nesta cooperativa. Recarregue e revise a importação.' using errcode = '40001';
    end if;

    if contact_id_value is null then
      insert into public.commercial_entity_contacts(owner_id, workspace_year, entity_id, entity_kind, central, cooperative, pa, name, job_title, teams, whatsapp, emails)
      values (caller, p_year, entity_id_value, 'cooperative', entity ->> 'central', entity ->> 'cooperative', null, name_value, job_title_value, teams_value, whatsapp_value, emails_value);
      created_count := created_count + 1;
    else
      if row(saved_contact.name, saved_contact.job_title, saved_contact.teams, saved_contact.whatsapp, saved_contact.emails)
        is distinct from row(name_value, job_title_value, teams_value, whatsapp_value, merged_emails) then
        update public.commercial_entity_contacts
          set name = name_value, job_title = job_title_value, teams = teams_value, whatsapp = whatsapp_value, emails = merged_emails
          where id = contact_id_value and owner_id = caller and workspace_year = p_year;
        updated_count := updated_count + 1;
      else
        unchanged_count := unchanged_count + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('created', created_count, 'updated', updated_count, 'unchanged', unchanged_count);
end;
$$;
revoke all on function public.import_commercial_contacts(integer,jsonb,uuid,integer) from public, anon;
grant execute on function public.import_commercial_contacts(integer,jsonb,uuid,integer) to authenticated;
comment on function public.import_commercial_contacts(integer,jsonb,uuid,integer) is
  'Atomic reviewed cooperative contact import. Uses saved owner/year registry, expected revision and contact timestamps, preserves blank fields and unions email addresses; existing ownership and active-session RLS remain in force.';

commit;
