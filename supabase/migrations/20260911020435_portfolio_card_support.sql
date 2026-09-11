-- Optional display metadata for KPI cards. Old snapshots without it remain valid.
-- No change to business rows, ownership policies or active-session requirements.
create or replace function public.commercial_dashboard_card_metadata_valid(value jsonb)
returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare block jsonb; item jsonb;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) is distinct from 'object' or jsonb_typeof(value->'blocks') is distinct from 'array' then return false; end if;
  for block in select * from jsonb_array_elements(value->'blocks') loop
    if block->>'type' = 'cards' then
      if jsonb_typeof(block->'items') is distinct from 'array' then return false; end if;
      for item in select * from jsonb_array_elements(block->'items') loop
        if jsonb_typeof(item) is distinct from 'object' then return false; end if;
        if item ? 'support' and (jsonb_typeof(item->'support') is distinct from 'string' or char_length(item->>'support') > 400) then return false; end if;
        if item ? 'accent' and jsonb_typeof(item->'accent') is distinct from 'boolean' then return false; end if;
      end loop;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.commercial_dashboard_card_metadata_valid(jsonb) from public, anon;
grant execute on function public.commercial_dashboard_card_metadata_valid(jsonb) to authenticated;
alter table public.commercial_communication_drafts
  add constraint commercial_dashboard_card_metadata_check
  check (public.commercial_dashboard_card_metadata_valid(whatsapp_dashboard)) not valid;
alter table public.commercial_communication_drafts validate constraint commercial_dashboard_card_metadata_check;
comment on function public.commercial_dashboard_card_metadata_valid(jsonb) is 'Validates optional support text (400 characters) and realized highlight; compatible with legacy private dashboard snapshots.';
