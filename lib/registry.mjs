import { aggregate, CENTRALS, PA_GROUP_TARGETS, PA_TARGET_POLICY_VERSION, paTargetForGroup, reconcile, targetPolicyFor } from "./analytics.mjs";

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const cents = (value) => Math.round((value + Number.EPSILON) * 100);
const total = (values) => values.every((v) => v != null)
  ? values.reduce((sum, value) => sum + cents(value), 0) / 100 : null;
const rowKey = (row) => `${row.source}:${row.central}:${row.cooperative || ""}:${row.pa ?? ""}:${row.metric}`;
export const entityId = (entity) => entity.kind === "central" ? `central:${entity.central}`
  : entity.kind === "cooperative" ? `cooperative:${entity.central}:${entity.cooperative}`
    : `pa:${entity.central}:${entity.cooperative}:${entity.pa}`;

function validYear(year) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    throw new Error("Informe um ano de metas entre 2020 e 2100.");
}
function validDate(value, year) {
  const date = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() !== year)
    throw new Error(`Informe uma data de corte válida no ano ${year}.`);
  return value;
}
function defaultCutoff(year) {
  const today = now().slice(0, 10);
  return today < `${year}-01-01` ? `${year}-01-01`
    : today > `${year}-12-31` ? `${year}-12-31` : today;
}
function cutoffOrDefault(value, year) {
  try { return validDate(value, year); }
  catch { return defaultCutoff(year); }
}
function normalizedCode(value, label) {
  const code = String(value ?? "").trim();
  if (!/^\d{1,12}$/.test(code)) throw new Error(`${label}: informe um código numérico de até 12 dígitos.`);
  return String(Number(code));
}
function financial(value, label, negative = false) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e12 || (!negative && value < 0))
    throw new Error(`${label}: informe um valor válido${negative ? "" : " maior ou igual a zero"}.`);
  return cents(value) / 100;
}
function months(values, label, negative = false) {
  if (!Array.isArray(values) || values.length !== 12)
    throw new Error(`${label}: informe os 12 meses do ano.`);
  return values.map((value) => financial(value, label, negative));
}
/** Distribute money with the largest-remainder method so every cent is preserved. */
export function distributeAmount(amount, weights = Array(12).fill(1)) {
  if (amount === null) return weights.map(() => null);
  financial(amount, "Valor para rateio", true);
  if (!weights.length) return [];
  const safe = weights.map((w) => Number.isFinite(w) && w > 0 ? w : 0);
  const denominator = safe.reduce((a, b) => a + b, 0);
  const effective = denominator > 0 ? safe : weights.map(() => 1);
  const divisor = denominator || weights.length;
  const unit = Math.abs(cents(amount));
  const shares = effective.map((weight, index) => {
    const exact = unit * weight / divisor;
    return { index, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let residual = unit - shares.reduce((sum, item) => sum + item.value, 0);
  const priority = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < residual; i++) priority[i % priority.length].value++;
  return shares.map((item) => (amount < 0 ? -item.value : item.value) / 100);
}

export function createEmptyDataset(year) {
  validYear(year);
  const cutoff = defaultCutoff(year);
  return { version: 2, year, importedAt: now(),
    config: { year, vnCutoff: cutoff, arCutoff: cutoff, cadenceCutoff: cutoff },
    paTargetPolicy: { version: PA_TARGET_POLICY_VERSION, groups: PA_GROUP_TARGETS },
    registry: { version: 1, entities: [], updatedAt: now() }, rows: [], issues: [], sources: [] };
}

function finish(dataset) {
  dataset.version = 2;
  dataset.paTargetPolicy ||= { version: PA_TARGET_POLICY_VERSION, groups: PA_GROUP_TARGETS };
  dataset.config ||= {};
  dataset.config.year = dataset.year;
  const entities = new Map(dataset.registry.entities.map((entity) => [entity.id, entity]));
  dataset.rows = dataset.rows.map((row) => {
    const central = entities.get(`central:${row.central}`);
    const cooperative = entities.get(`cooperative:${row.central}:${row.cooperative}`);
    const pa = row.pa == null ? null : entities.get(`pa:${row.central}:${row.cooperative}:${row.pa}`);
    return { ...row, key: rowKey(row), centralName: central?.name || row.centralName || CENTRALS[row.central] || `Central ${row.central}`,
      cooperativeName: cooperative?.name || row.cooperativeName || "",
      name: pa?.name || cooperative?.name || central?.name || row.name,
      group: pa?.group || cooperative?.group || row.group || "" };
  });
  const datesFor = (source, metric) => dataset.rows.filter((r) => r.source === source && r.metric === metric).map((r) => r.cutoff).sort();
  for (const [key, source, metric] of [["vnCutoff", "base", "VN"], ["arCutoff", "base", "AR"], ["cadenceCutoff", "cadence", "VN"]]) {
    const dates = datesFor(source, metric);
    dataset.config[key] = cutoffOrDefault(dates.length ? dates.at(-1) : dataset.config[key], dataset.year);
  }
  dataset.config.allowedCentrals = dataset.registry.entities.filter((entity) => entity.kind === "central").map((entity) => entity.central);
  dataset.sources = [...new Set(dataset.rows.map((row) => row.source))].map((type) => ({
    filename: [...(dataset.sources || [])].reverse().find((source) => source.type === type)?.filename || "Cadastro manual",
    type, rows: dataset.rows.filter((row) => row.source === type).length,
    skipped: [...(dataset.sources || [])].reverse().find((source) => source.type === type)?.skipped || 0,
  }));
  // Rebuild mutable consistency checks after every edit; source diagnostics retain provenance.
  const retained = (dataset.issues || []).filter((issue) => !["reconciliation", "registry"].includes(issue.kind));
  const consistency = dataset.rows.filter((row) => row.annualTarget != null && total(row.targets) != null &&
      Math.abs(row.annualTarget - total(row.targets)) > 0.011)
    .map((row) => ({ kind: "registry", central: row.central, cooperative: row.cooperative,
      message: `${row.name}: a meta anual diverge da soma dos meses. Confira a distribuição para liberar a projeção anual.` }));
  dataset.issues = [...retained, ...consistency, ...reconcile(dataset.rows)];
  dataset.registry.updatedAt = now();
  return dataset;
}

/** Upgrade an immutable import/snapshot into a fixed registry without changing version 2. */
export function initializeRegistry(input) {
  const dataset = clone(input);
  validYear(dataset.year);
  const entities = new Map((dataset.registry?.entities || []).map((entity) => [entity.id, entity]));
  for (const row of dataset.rows) {
    const central = { kind: "central", central: row.central,
      name: row.centralName || CENTRALS[row.central] || `Central ${row.central}` };
    central.id = entityId(central);
    if (!entities.has(central.id)) entities.set(central.id, central);
    if (row.cooperative) {
      const cooperative = { kind: "cooperative", central: row.central, cooperative: row.cooperative,
        name: row.cooperativeName || `Cooperativa ${row.cooperative}`, group: row.source === "base" ? row.group || "" : "" };
      cooperative.id = entityId(cooperative);
      if (!entities.has(cooperative.id)) entities.set(cooperative.id, cooperative);
    }
    if (row.pa != null) {
      const pa = { kind: "pa", central: row.central, cooperative: row.cooperative,
        pa: row.pa, name: row.name || `PA ${row.pa}`, group: row.group || "" };
      pa.id = entityId(pa);
      if (!entities.has(pa.id)) entities.set(pa.id, pa);
    }
    const policy = targetPolicyFor(row);
    row.targets = [...policy.targets];
    row.annualTarget = policy.annualTarget;
    row.targetRule = row.targetRule === "manual" ? "manual" : "registry";
  }
  dataset.registry = { version: 1, entities: [...entities.values()], updatedAt: dataset.registry?.updatedAt || now() };
  return finish(dataset);
}

function transientActualImport(row, year) {
  if (!Array.isArray(row.__importActuals) || row.__importActuals.length !== 12 || !row.__importCutoff)
    return null;
  validDate(row.__importCutoff, year);
  return { actuals: [...row.__importActuals], cutoff: row.__importCutoff };
}
function stripTransientActualImport(row) {
  const { __importActuals, __importCutoff, ...clean } = row;
  return clean;
}
function mergeObservedActuals(previous, actuals, cutoff, sourceRow) {
  if (cutoff < previous.cutoff) return;
  const newer = cutoff > previous.cutoff;
  const last = Number(cutoff.slice(5, 7)) - 1;
  const manual = new Set(previous.manualActualMonths || []);
  previous.actuals = previous.actuals.map((value, month) => {
    if (month > last || actuals[month] == null || (!newer && manual.has(month))) return value;
    manual.delete(month);
    return actuals[month];
  });
  previous.manualActualMonths = [...manual];
  previous.cutoff = cutoff;
  previous.sourceFile = sourceRow.sourceFile;
  previous.sheet = sourceRow.sheet;
  previous.sourceRow = sourceRow.sourceRow;
}

export function mergeProduction(current, incoming, { goalsOnly = false } = {}) {
  if (!current) {
    const initial = initializeRegistry(incoming);
    if (goalsOnly) initial.rows.forEach((row) => {
      const imported = transientActualImport(row, initial.year);
      if (!imported) {
        row.actuals = Array(12).fill(null);
        return;
      }
      const last = Number(imported.cutoff.slice(5, 7)) - 1;
      row.actuals = imported.actuals.map((value, month) => month <= last ? value : null);
      row.cutoff = imported.cutoff;
    });
    initial.rows = initial.rows.map(stripTransientActualImport);
    return finish(initial);
  }
  if (current.year !== incoming.year)
    throw new Error(`A base fixa é de ${current.year}. Abra um cadastro de ${incoming.year} antes de importar outro ano.`);
  const dataset = initializeRegistry(current);
  const update = initializeRegistry(incoming);
  const records = new Map(dataset.rows.map((row) => [rowKey(row), row]));
  const seen = new Set();
  for (const next of update.rows) {
    validDate(next.cutoff, dataset.year);
    const key = rowKey(next);
    if (seen.has(key)) throw new Error(`Registro duplicado na atualização: ${key}.`);
    seen.add(key);
    const previous = records.get(key);
    if (previous && !goalsOnly && next.cutoff < previous.cutoff)
      throw new Error(`${previous.name} (${previous.metric}): corte ${next.cutoff} anterior ao já salvo (${previous.cutoff}). Atualize a data ou utilize uma base mais recente.`);
    if (!previous) {
      const imported = goalsOnly ? transientActualImport(next, dataset.year) : null;
      const cutoff = imported?.cutoff ?? next.cutoff;
      const actuals = imported?.actuals ?? next.actuals;
      const last = Number(cutoff.slice(5, 7)) - 1;
      next.cutoff = cutoff;
      next.actuals = actuals.map((value, month) => (!goalsOnly || imported) && month <= last ? value : null);
      records.set(key, next);
      continue;
    }
    if (goalsOnly) {
      // A production-first unit may not have an annual plan yet. Fill only absent
      // goals; existing monthly distribution and annual decisions remain fixed.
      previous.targets = previous.targets.map((value, month) => value ?? next.targets[month] ?? null);
      previous.annualTarget ??= next.annualTarget;
      const imported = transientActualImport(next, dataset.year);
      if (imported) mergeObservedActuals(previous, imported.actuals, imported.cutoff, next);
      continue;
    }
    const newer = next.cutoff > previous.cutoff;
    const last = Number(next.cutoff.slice(5, 7)) - 1;
    const manual = new Set(previous.manualActualMonths || []);
    previous.actuals = previous.actuals.map((value, month) => {
      if (month > last || next.actuals[month] == null || (!newer && manual.has(month))) return value;
      manual.delete(month);
      return next.actuals[month];
    });
    previous.manualActualMonths = [...manual];
    previous.cutoff = next.cutoff;
    previous.sourceFile = next.sourceFile;
    previous.sheet = next.sheet;
    previous.sourceRow = next.sourceRow;
  }
  dataset.rows = [...records.values()].map(stripTransientActualImport);
  const entities = new Map(dataset.registry.entities.map((entity) => [entity.id, entity]));
  for (const entity of update.registry.entities) if (!entities.has(entity.id)) entities.set(entity.id, entity);
  dataset.registry.entities = [...entities.values()];
  dataset.sources = [...dataset.sources, ...update.sources].filter((source, index, all) =>
    all.findIndex((item) => item.filename === source.filename && item.type === source.type) === index);
  const issues = [...dataset.issues, ...update.issues];
  const issueKeys = new Set();
  dataset.issues = issues.filter((issue) => {
    const key = `${issue.kind}:${issue.message}`;
    if (issueKeys.has(key)) return false;
    issueKeys.add(key);
    return true;
  });
  dataset.importedAt = update.importedAt;
  return finish(dataset);
}

function isInside(entity, root) {
  if (entity.central !== root.central) return false;
  if (root.kind === "central") return true;
  if (entity.cooperative !== root.cooperative || entity.kind === "central") return false;
  return root.kind === "cooperative" || (entity.kind === "pa" && entity.pa === root.pa);
}
function rowInside(row, entity) {
  return row.central === entity.central && (entity.kind === "central" ||
    (row.cooperative === entity.cooperative && (entity.kind === "cooperative" || row.pa === entity.pa)));
}

export function upsertEntity(input, candidate, previousId) {
  const dataset = initializeRegistry(input);
  if (!["central", "cooperative", "pa"].includes(candidate.kind)) throw new Error("Tipo de cadastro inválido.");
  const entity = { ...candidate, central: normalizedCode(candidate.central, "Central"), name: String(candidate.name || "").trim() };
  if (!entity.name || entity.name.length > 160) throw new Error("Informe um nome com 1 a 160 caracteres.");
  if (entity.kind !== "central") entity.cooperative = normalizedCode(candidate.cooperative, "Cooperativa");
  else { delete entity.cooperative; delete entity.pa; delete entity.group; }
  if (entity.kind === "pa") {
    entity.pa = normalizedCode(candidate.pa, "PA");
    entity.group = String(candidate.group || "").trim().toUpperCase();
    if (!paTargetForGroup(entity.group)) throw new Error("Selecione o grupo do PA: P1, P2, P3, P4 ou P5.");
  } else delete entity.pa;
  entity.id = entityId(entity);
  const previous = dataset.registry.entities.find((item) => item.id === (previousId || candidate.id));
  if ((previousId || candidate.id) && !previous) throw new Error("Cadastro original não encontrado. Atualize a tela.");
  if (previous && previous.kind !== entity.kind) throw new Error("O tipo do cadastro não pode ser alterado.");
  const collision = dataset.registry.entities.find((item) => item.id === entity.id && item.id !== previous?.id);
  if (collision) throw new Error("Este código já está cadastrado nesta hierarquia.");
  if (entity.kind !== "central" && !dataset.registry.entities.some((item) => item.id === `central:${entity.central}`))
    throw new Error("Cadastre a central antes de vincular uma cooperativa ou PA.");
  if (entity.kind === "pa" && !dataset.registry.entities.some((item) => item.id === `cooperative:${entity.central}:${entity.cooperative}`))
    throw new Error("Cadastre a cooperativa antes de vincular o PA.");
  if (previous) {
    dataset.registry.entities = dataset.registry.entities.map((item) => {
      if (item.id === previous.id) return entity;
      if (!isInside(item, previous)) return item;
      const changed = { ...item, central: entity.central };
      if (previous.kind !== "central") changed.cooperative = entity.cooperative;
      changed.id = entityId(changed);
      return changed;
    });
    if (new Set(dataset.registry.entities.map((item) => item.id)).size !== dataset.registry.entities.length)
      throw new Error("A mudança conflita com um cadastro filho existente.");
    dataset.rows = dataset.rows.map((row) => {
      if (!rowInside(row, previous)) return row;
      const changed = { ...row, central: entity.central };
      if (previous.kind !== "central") changed.cooperative = entity.cooperative;
      if (previous.kind === "pa") {
        changed.pa = entity.pa;
        changed.group = entity.group;
        if (changed.targetRule !== "manual" && previous.group !== entity.group) {
          const policy = paTargetForGroup(entity.group);
          changed.targets = Array(12).fill(policy.monthly);
          changed.annualTarget = policy.annual;
        }
      }
      return changed;
    });
  } else dataset.registry.entities.push(entity);
  // Move a standalone central balance into its first cooperative, preserving every value.
  if (entity.kind === "cooperative") dataset.rows = dataset.rows.map((row) =>
    row.source === "base" && row.central === entity.central && !row.cooperative
      ? { ...row, cooperative: entity.cooperative } : row);
  return finish(dataset);
}

export function deleteEntity(input, id) {
  const dataset = initializeRegistry(input);
  const entity = dataset.registry.entities.find((item) => item.id === id);
  if (!entity) throw new Error("Cadastro não encontrado.");
  const removed = dataset.registry.entities.filter((item) => isInside(item, entity));
  dataset.registry.entities = dataset.registry.entities.filter((item) => !isInside(item, entity));
  dataset.rows = dataset.rows.filter((row) => !rowInside(row, entity));
  dataset.issues = dataset.issues.filter((issue) => !removed.some((item) =>
    issue.central === item.central && (item.kind === "central" || issue.cooperative === item.cooperative)));
  return finish(dataset);
}

function rowMatches(row, entity, metric) {
  return row.metric === metric && row.central === entity.central && (entity.kind === "pa"
    ? row.source === "cadence" && row.cooperative === entity.cooperative && row.pa === entity.pa
    : row.source === "base" && row.cooperative === (entity.cooperative || "") && row.pa == null);
}
export function getPlanRow(dataset, id, metric = "VN") {
  const entity = dataset.registry?.entities.find((item) => item.id === id);
  if (!entity) return null;
  if (entity.kind === "central") {
    const rows = dataset.rows.filter((row) => row.source === "base" && row.central === entity.central && row.metric === metric);
    return rows.length ? aggregate(rows, "central")[0] : null;
  }
  return dataset.rows.find((row) => rowMatches(row, entity, metric)) || null;
}

/** Include every registered unit in analytical views, without persisting invented balances. */
export function analysisRows(dataset) {
  const rows = [...dataset.rows];
  const keys = new Set(rows.map(rowKey));
  const entities = new Map((dataset.registry?.entities || []).map((entity) => [entity.id, entity]));
  const withCooperatives = new Set([...entities.values()].filter((entity) => entity.kind === "cooperative").map((entity) => entity.central));
  for (const entity of dataset.registry?.entities || []) {
    if (entity.kind === "central" && withCooperatives.has(entity.central)) continue;
    for (const metric of entity.kind === "pa" ? ["VN"] : ["VN", "AR"]) {
      const key = `${entity.kind === "pa" ? "cadence" : "base"}:${entity.central}:${entity.cooperative || ""}:${entity.pa ?? ""}:${metric}`;
      if (keys.has(key)) continue;
      const row = emptyRow(dataset, entity, metric);
      row.centralName = entities.get(`central:${entity.central}`)?.name;
      row.cooperativeName = entities.get(`cooperative:${entity.central}:${entity.cooperative}`)?.name || "";
      keys.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function emptyRow(dataset, entity, metric) {
  const pa = entity.kind === "pa";
  const policy = paTargetForGroup(entity.group);
  const configuredCutoff = pa ? dataset.config?.cadenceCutoff : metric === "VN" ? dataset.config?.vnCutoff : dataset.config?.arCutoff;
  const cutoff = cutoffOrDefault(configuredCutoff, dataset.year);
  const row = { source: pa ? "cadence" : "base", central: entity.central,
    cooperative: entity.cooperative || "", cooperativeName: entity.kind === "cooperative" ? entity.name : "",
    pa: pa ? entity.pa : null, group: entity.group || "", name: entity.name, metric,
    targets: Array(12).fill(pa && policy ? policy.monthly : null), actuals: Array(12).fill(null),
    annualTarget: pa && policy ? policy.annual : null, targetRule: "registry", cutoff,
    sourceFile: "Cadastro manual", sheet: "Cadastro", sourceRow: 0 };
  row.key = rowKey(row);
  return row;
}

function saveRow(dataset, entity, metric, edit) {
  let row = dataset.rows.find((item) => rowMatches(item, entity, metric));
  if (!row) { row = emptyRow(dataset, entity, metric); dataset.rows.push(row); }
  if (edit.cutoff && edit.cutoff < row.cutoff && row.actuals.some((value) => value != null))
    throw new Error(`${entity.name}: a data de corte não pode retroceder de ${row.cutoff}.`);
  const cutoff = edit.cutoff || row.cutoff;
  validDate(cutoff, dataset.year);
  if (has(edit, "targets")) {
    row.targets = months(edit.targets, "Metas mensais");
    row.annualTarget = has(edit, "annualTarget") ? financial(edit.annualTarget, "Meta anual") : total(row.targets);
    row.targetRule = "manual";
  } else if (has(edit, "annualTarget")) {
    row.annualTarget = financial(edit.annualTarget, "Meta anual");
    row.targets = distributeAmount(row.annualTarget);
    row.targetRule = "manual";
  }
  if (has(edit, "actuals")) {
    const actuals = months(edit.actuals, "Realizado mensal", true);
    const last = Number(cutoff.slice(5, 7)) - 1;
    const manual = new Set(row.manualActualMonths || []);
    for (let month = 0; month < 12; month++) {
      if (actuals[month] === row.actuals[month]) continue;
      if (month > last && actuals[month] != null)
        throw new Error(`${entity.name}: o realizado de um mês posterior à data de corte exige atualizar o corte.`);
      manual.add(month);
    }
    row.actuals = actuals;
    row.manualActualMonths = [...manual].sort((a, b) => a - b);
  }
  row.cutoff = cutoff;
}

export function upsertPlanRow(input, edit) {
  const dataset = initializeRegistry(input);
  const entity = dataset.registry.entities.find((item) => item.id === edit.entityId);
  if (!entity) throw new Error("Selecione um cadastro existente para definir metas e realizado.");
  if (!["VN", "AR"].includes(edit.metric)) throw new Error("Selecione Venda Nova ou Arrecadação.");
  if (entity.kind === "pa" && edit.metric !== "VN") throw new Error("O acompanhamento dos PAs utiliza Venda Nova.");
  if (edit.cutoff) validDate(edit.cutoff, dataset.year);
  if (has(edit, "targets")) months(edit.targets, "Metas mensais");
  if (has(edit, "actuals")) months(edit.actuals, "Realizado mensal", true);
  if (has(edit, "annualTarget")) financial(edit.annualTarget, "Meta anual");
  const children = entity.kind === "central" ? dataset.registry.entities.filter((item) => item.kind === "cooperative" && item.central === entity.central) : [];
  if (!children.length) saveRow(dataset, entity, edit.metric, edit);
  else {
    const existing = children.map((child) => dataset.rows.find((row) => rowMatches(row, child, edit.metric)) || emptyRow(dataset, child, edit.metric));
    const patches = children.map(() => ({ cutoff: edit.cutoff }));
    const monthTargets = has(edit, "targets") ? edit.targets : has(edit, "annualTarget") ? distributeAmount(edit.annualTarget) : null;
    if (monthTargets) {
      const shares = monthTargets.map((amount, month) => {
        const previous = existing.map((row) => row.targets[month]);
        return amount === total(previous) ? previous : distributeAmount(amount, previous);
      });
      patches.forEach((patch, index) => { patch.targets = shares.map((month) => month[index]); patch.annualTarget = total(patch.targets); });
      if (has(edit, "annualTarget") && edit.annualTarget !== total(monthTargets))
        throw new Error("A meta anual da central deve corresponder à soma dos 12 meses antes do rateio.");
    }
    if (has(edit, "actuals")) {
      const shares = edit.actuals.map((amount, month) => {
        const previous = existing.map((row) => row.actuals[month]);
        return amount === total(previous) ? previous : distributeAmount(amount, existing.map((row) => row.targets[month]));
      });
      patches.forEach((patch, index) => { patch.actuals = shares.map((month) => month[index]); });
    }
    children.forEach((child, index) => saveRow(dataset, child, edit.metric, patches[index]));
    dataset.rows = dataset.rows.filter((row) => !(row.source === "base" && row.central === entity.central && !row.cooperative && row.metric === edit.metric));
  }
  return finish(dataset);
}
