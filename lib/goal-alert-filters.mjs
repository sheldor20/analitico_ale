const order = (a, b) => a.central.localeCompare(b.central, 'pt-BR', { numeric: true })
  || String(a.cooperative ?? '').localeCompare(String(b.cooperative ?? ''), 'pt-BR', { numeric: true });
const cooperativeId = (entity) => `cooperative:${entity.central}:${entity.cooperative}`;

/** Include registered units even when they have no achievement in the chosen month. */
export function goalAlertFilterOptions(dataset) {
  const centrals = new Map(), cooperatives = new Map();
  const registry = dataset.registry?.entities;
  const entities = registry?.length ? registry : (dataset.rows || []).map((row) => ({
    kind: row.pa != null ? 'pa' : row.cooperative ? 'cooperative' : 'central',
    central: row.central, centralName: row.centralName,
    cooperative: row.cooperative, cooperativeName: row.cooperativeName,
    name: row.name,
  }));
  for (const entity of entities) {
    if (!entity.central) continue;
    if (!centrals.has(entity.central)) centrals.set(entity.central, { value: entity.central, central: entity.central, name: entity.centralName || `Central ${entity.central}` });
    if (entity.cooperative) {
      const value = cooperativeId(entity);
      if (!cooperatives.has(value)) cooperatives.set(value, { value, central: entity.central, cooperative: entity.cooperative, name: entity.cooperativeName || `Cooperativa ${entity.cooperative}` });
    }
  }
  for (const entity of entities) {
    if (entity.kind === 'central' && centrals.has(entity.central)) centrals.get(entity.central).name = entity.name;
    if (entity.kind === 'cooperative' && cooperatives.has(cooperativeId(entity))) cooperatives.get(cooperativeId(entity)).name = entity.name;
  }
  return { centrals: [...centrals.values()].sort(order), cooperatives: [...cooperatives.values()].sort(order) };
}

/** Cooperative IDs include their parent central; equal local codes never merge. */
export function filterGoalAlerts(alerts, { kind = 'all', central = 'all', cooperative = 'all' } = {}) {
  return alerts.filter(({ entity }) => (kind === 'all' || entity.kind === kind)
    && (central === 'all' || entity.central === central)
    && (cooperative === 'all' || (entity.kind !== 'central' && cooperativeId(entity) === cooperative)));
}
