-- Compatibility audit, 2026-10-08. SELECT only, synthetic values only.
-- Does not read or modify a workspace, draft, contact, user or permission.
with kinds(kind, entity_id, source) as (
  values ('central', 'central:1002', 'base'),
    ('cooperative', 'cooperative:1002:3017', 'base'),
    ('pa', 'pa:1002:3017:0', 'cadence')
), periods(period) as (
  values ('month'), ('quarter'), ('semester'), ('annual')
), attainment_cases(label, attainment) as (
  values ('negative', -0.25::numeric), ('below_70', 0.6999::numeric),
    ('at_70', 0.7::numeric), ('below_100', 0.9999::numeric),
    ('at_100', 1::numeric), ('above_100', 1.5::numeric),
    ('unknown', null::numeric), ('legacy_without_metadata', null::numeric)
), variants as (
  select k.*, p.period, a.label, a.attainment, projection.enabled,
    jsonb_build_object('label', 'Realizado informado', 'value', 'R$ 70,00',
      'support', 'Atingimento sintético', 'accent', true)
    || case when a.label = 'legacy_without_metadata' then '{}'::jsonb
      else jsonb_build_object('attainment', a.attainment) end as actual_card
  from kinds k cross join periods p cross join attainment_cases a
    cross join (values (false), (true)) projection(enabled)
), models as (
  select v.*,
    jsonb_build_object('version', 1, 'year', 2026, 'month', 9,
      'period', period, 'source', source,
      'entity', jsonb_build_object('id', entity_id, 'kind', kind),
      'sections', '[]'::jsonb) as report,
    jsonb_build_object('version', 2, 'year', 2026, 'entityId', entity_id,
      'scope', 'Unidade sintética', 'hierarchy', 'Central 1002',
      'periodLabel', period || ' · 2026', 'period', period,
      'greeting', '', 'opening', '', 'footer', '', 'signature', '',
      'notes', '[]'::jsonb,
      'blocks', jsonb_build_array(jsonb_build_object('type', 'cards',
        'items', jsonb_build_array(
          jsonb_build_object('label', 'Meta', 'value', 'R$ 100,00'), actual_card,
          jsonb_build_object('label', 'GAP', 'value', 'R$ 30,00'))
        || case when enabled then jsonb_build_array(jsonb_build_object(
          'label', 'Projeção de fechamento', 'value', 'R$ 110,00',
          'support', '110% da meta · estimativa')
          || case when label = 'legacy_without_metadata' then '{}'::jsonb
            else jsonb_build_object('attainment', 1.1) end)
          else '[]'::jsonb end))) as dashboard
  from variants v
), checked as (
  select *, public.commercial_whatsapp_dashboard_valid(dashboard) as dashboard_valid,
    public.commercial_dashboard_card_metadata_valid(dashboard) as metadata_valid,
    dashboard->'year' = to_jsonb(2026)
      and dashboard->>'entityId' = entity_id
      and dashboard->>'period' = report->>'period' as presentation_identity_valid,
    report->'version' = '1'::jsonb and report->'year' = to_jsonb(2026)
      and report->'entity'->>'id' = entity_id
      and report->'entity'->>'kind' = kind
      and report->>'source' = case when kind = 'pa' then 'cadence' else 'base' end
      and report->>'period' in ('month','quarter','semester','annual')
      and report->'month' = '9'::jsonb
      and jsonb_typeof(report->'sections') = 'array'
      and octet_length(report::text) <= 200000 as report_identity_valid
  from models
), sample as (
  select dashboard from models
  where kind = 'cooperative' and period = 'month' and label = 'at_70' and enabled
), guards as (
  select
    not public.commercial_whatsapp_dashboard_valid(jsonb_set(dashboard,
      '{blocks,0,items}', (select jsonb_agg(jsonb_build_object('label','Meta','value','100'))
        from generate_series(1, 9)))) as nine_cards_rejected,
    not public.commercial_dashboard_card_metadata_valid(jsonb_set(dashboard,
      '{blocks,0,items,1,accent}', '"true"'::jsonb)) as non_boolean_accent_rejected,
    not public.commercial_whatsapp_dashboard_valid(jsonb_set(dashboard,
      '{blocks}', '[{"type":"table","title":"Teste","headers":["1","2","3","4","5"],"rows":[]}]'::jsonb)) as five_column_table_rejected,
    public.commercial_whatsapp_dashboard_valid(jsonb_set(dashboard,
      '{blocks,0,items,1,attainment}', '"invalid"'::jsonb))
      and public.commercial_dashboard_card_metadata_valid(jsonb_set(dashboard,
        '{blocks,0,items,1,attainment}', '"invalid"'::jsonb)) as attainment_requires_application_validation
  from sample
)
select jsonb_build_object(
  'synthetic_models', count(*),
  'compatible_models', count(*) filter (where dashboard_valid and metadata_valid
    and presentation_identity_valid and report_identity_valid),
  'legacy_compatible', count(*) filter (where label = 'legacy_without_metadata'
    and dashboard_valid and metadata_valid),
  'projection_disabled_compatible', count(*) filter (where not enabled
    and dashboard_valid and metadata_valid),
  'projection_enabled_compatible', count(*) filter (where enabled
    and dashboard_valid and metadata_valid),
  'guards', (select to_jsonb(guards) from guards)
) as verification
from checked;
