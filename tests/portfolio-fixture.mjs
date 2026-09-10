import { createEmptyDataset, upsertEntity, upsertPlanRow } from '../lib/registry.mjs';
export function portfolioFixture() {
  let dataset = createEmptyDataset(2026);
  const units = [
    { kind: 'central', central: '1002', name: 'Central Bahia teste' },
    { kind: 'central', central: '2007', name: 'Central Nordeste teste' },
    { kind: 'cooperative', central: '1002', cooperative: '3017', name: 'Cooperativa Alfa' },
    { kind: 'cooperative', central: '1002', cooperative: '3025', name: 'Cooperativa Beta' },
    { kind: 'cooperative', central: '2007', cooperative: '3017', name: 'Outra central' },
    { kind: 'pa', central: '1002', cooperative: '3017', pa: '0', name: 'PA Alfa zero', group: 'P1' },
    { kind: 'pa', central: '1002', cooperative: '3025', pa: '0', name: 'PA Beta zero', group: 'P1' },
  ];
  for (const entry of units) dataset = upsertEntity(dataset, entry);
  for (const [id, metric, monthly, actual] of [
    ['cooperative:1002:3017', 'VN', 100, 50],
    ['cooperative:1002:3025', 'VN', 100, 150],
    ['cooperative:2007:3017', 'VN', 9999, 9999],
    ['cooperative:1002:3017', 'AR', 1000, 700],
    ['pa:1002:3017:0', 'VN', 450, 225],
    ['pa:1002:3025:0', 'VN', 450, 100],
  ]) dataset = upsertPlanRow(dataset, { entityId: id, metric, targets: Array(12).fill(monthly), annualTarget: monthly * 12, actuals: [...Array(8).fill(actual), null, null, null, null], cutoff: '2026-08-31' });
  return dataset;
}
export const unit = (dataset, id) => dataset.registry.entities.find((entity) => entity.id === id);
