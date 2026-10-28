const order = (a, b) => a.central.localeCompare(b.central, 'pt-BR', { numeric: true })
  || String(a.cooperative ?? '').localeCompare(String(b.cooperative ?? ''), 'pt-BR', { numeric: true })
  || String(a.pa ?? '').localeCompare(String(b.pa ?? ''), 'pt-BR', { numeric: true });
const cooperativeId = (entity) => `cooperative:${entity.central}:${entity.cooperative}`;
const paId = (entity) => `pa:${entity.central}:${entity.cooperative}:${entity.pa}`;

/** Include registered units even when they have no achievement in the chosen period. */
export function goalAlertFilterOptions(dataset) {
  const centrals = new Map(), cooperatives = new Map(), pas = new Map();
  const registry = dataset.registry?.entities;
  const entities = registry?.length ? registry : (dataset.rows || []).map((row) => ({
    kind: row.pa != null ? 'pa' : row.cooperative ? 'cooperative' : 'central',
    central: row.central, centralName: row.centralName,
    cooperative: row.cooperative, cooperativeName: row.cooperativeName,
    pa:row.pa, name: row.name,
  }));
  for (const entity of entities) {
    if (!entity.central) continue;
    if (!centrals.has(entity.central)) centrals.set(entity.central, { value: entity.central, central: entity.central, name: entity.centralName || `Central ${entity.central}` });
    if (entity.cooperative) {
      const value = cooperativeId(entity);
      if (!cooperatives.has(value)) cooperatives.set(value, { value, central: entity.central, cooperative: entity.cooperative, name: entity.cooperativeName || `Cooperativa ${entity.cooperative}` });
      if (entity.kind === 'pa' && entity.pa != null) {
        const value = paId(entity);
        if (!pas.has(value)) pas.set(value,{value,central:entity.central,cooperative:entity.cooperative,pa:String(entity.pa),name:entity.name || `PA ${entity.pa}`});
      }
    }
  }
  for (const entity of entities) {
    if (entity.kind === 'central' && centrals.has(entity.central)) centrals.get(entity.central).name = entity.name;
    if (entity.kind === 'cooperative' && cooperatives.has(cooperativeId(entity))) cooperatives.get(cooperativeId(entity)).name = entity.name;
  }
  return { centrals: [...centrals.values()].sort(order), cooperatives: [...cooperatives.values()].sort(order), pas:[...pas.values()].sort(order) };
}

/** Composite IDs prevent equally numbered children under different parents from merging. */
export function filterGoalAlerts(alerts, { kind = 'all', central = 'all', cooperative = 'all', pa = 'all' } = {}) {
  return alerts.filter(({ entity }) => (kind === 'all' || entity.kind === kind)
    && (central === 'all' || entity.central === central)
    && (cooperative === 'all' || (entity.kind !== 'central' && cooperativeId(entity) === cooperative))
    && (pa === 'all' || (entity.kind === 'pa' && paId(entity) === pa)));
}
