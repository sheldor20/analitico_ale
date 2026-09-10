begin;

-- Presentation snapshots only. Do not rewrite historical drafts or financial data.
create function public.commercial_whatsapp_dashboard_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare b jsonb; item jsonb; field text; line jsonb;
begin
  if value is null or jsonb_typeof(value) <> 'object' or value -> 'version' is distinct from '2'::jsonb
    or octet_length(value::text) > 180000 then return false; end if;
  foreach field in array array['entityId','scope','hierarchy','periodLabel','greeting','opening','footer','signature','period'] loop
    if jsonb_typeof(value -> field) is distinct from 'string' or char_length(value ->> field) > 5000 then return false; end if;
  end loop;
  if jsonb_typeof(value -> 'notes') is distinct from 'array' or jsonb_typeof(value -> 'blocks') is distinct from 'array' then return false; end if;
  if jsonb_array_length(value -> 'notes') > 8 or jsonb_array_length(value -> 'blocks') > 80 then return false; end if;
  for item in select jsonb_array_elements(value -> 'notes') loop
    if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 5000 then return false; end if;
  end loop;
  for b in select jsonb_array_elements(value -> 'blocks') loop
    if jsonb_typeof(b) <> 'object' or not (b ? 'type') then return false; end if;
    if b ->> 'type' in ('heading','text') then
      if jsonb_typeof(b -> 'text') is distinct from 'string' or char_length(b ->> 'text') > 5000 then return false; end if;
      if b ->> 'type' = 'text' and coalesce(b ->> 'tone', '') not in ('body','muted','action','warning') then return false; end if;
    elsif b ->> 'type' = 'cards' then
      if jsonb_typeof(b -> 'items') is distinct from 'array' then return false; end if;
      if jsonb_array_length(b -> 'items') not between 1 and 8 then return false; end if;
      for item in select jsonb_array_elements(b -> 'items') loop
        if jsonb_typeof(item -> 'label') is distinct from 'string' or jsonb_typeof(item -> 'value') is distinct from 'string'
          or char_length(item ->> 'label') > 200 or char_length(item ->> 'value') > 400 then return false; end if;
      end loop;
    elsif b ->> 'type' = 'secondary' then
      if value ->> 'period' = 'annual' or jsonb_typeof(b -> 'title') is distinct from 'string' or char_length(b ->> 'title') > 400
        or jsonb_typeof(b -> 'lines') is distinct from 'array' then return false; end if;
      if jsonb_array_length(b -> 'lines') > 2 then return false; end if;
      for item in select jsonb_array_elements(b -> 'lines') loop
        if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 5000 then return false; end if;
      end loop;
    elsif b ->> 'type' = 'table' then
      if jsonb_typeof(b -> 'title') is distinct from 'string' or char_length(b ->> 'title') > 400
        or jsonb_typeof(b -> 'headers') is distinct from 'array' or jsonb_typeof(b -> 'rows') is distinct from 'array' then return false; end if;
      if jsonb_array_length(b -> 'headers') <> 4 or jsonb_array_length(b -> 'rows') > 12 then return false; end if;
      for item in select jsonb_array_elements(b -> 'headers') loop
        if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 200 then return false; end if;
      end loop;
      for line in select jsonb_array_elements(b -> 'rows') loop
        if jsonb_typeof(line) <> 'array' then return false; end if;
        if jsonb_array_length(line) <> 4 then return false; end if;
        for item in select jsonb_array_elements(line) loop
          if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 400 then return false; end if;
        end loop;
      end loop;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.commercial_whatsapp_dashboard_valid(jsonb) from public, anon;
grant execute on function public.commercial_whatsapp_dashboard_valid(jsonb) to authenticated;

alter table public.commercial_communication_drafts
  add column presentation_version smallint not null default 1,
  add column whatsapp_dashboard jsonb,
  add constraint commercial_communication_presentation_check check (coalesce(
    (presentation_version = 1 and whatsapp_dashboard is null)
    or (presentation_version = 2 and public.commercial_whatsapp_dashboard_valid(whatsapp_dashboard)
      and whatsapp_dashboard -> 'year' = to_jsonb(year)
      and whatsapp_dashboard ->> 'entityId' = entity_id
      and whatsapp_dashboard ->> 'period' = report ->> 'period'), false));

comment on column public.commercial_communication_drafts.presentation_version is
  '1 = legacy unchanged draft; 2 = selected period first, compact annual support and WhatsApp dashboard model.';
comment on column public.commercial_communication_drafts.whatsapp_dashboard is
  'Private structured text-only dashboard snapshot for local PNG rendering. No uploaded image or public link. Treat stored data as untrusted; validate before rendering. Existing RLS and immutability remain unchanged.';
commit;
