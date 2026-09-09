export const MONTHS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];
export const CENTRALS = {
  1002: "Sicoob Central Bahia",
  2007: "Sicoob Central Nordeste",
};
export const PA_GROUP_TARGETS = Object.freeze({
  P1: Object.freeze({ monthly: 450, annual: 5400 }),
  P2: Object.freeze({ monthly: 600, annual: 7200 }),
  P3: Object.freeze({ monthly: 750, annual: 9000 }),
  P4: Object.freeze({ monthly: 850, annual: 10200 }),
  P5: Object.freeze({ monthly: 1000, annual: 12000 }),
});
export const PA_TARGET_POLICY_VERSION = "2026.1";
export function paTargetForGroup(group) {
  return PA_GROUP_TARGETS[String(group ?? "").trim().toUpperCase()] ?? null;
}
export function targetPolicyFor(row) {
  if (row.source !== "cadence" || ["manual", "registry"].includes(row.targetRule))
    return { targets: row.targets, annualTarget: row.annualTarget };
  const fixed = paTargetForGroup(row.group);
  return fixed
    ? { targets: Array(12).fill(fixed.monthly), annualTarget: fixed.annual }
    : { targets: Array(12).fill(null), annualTarget: null };
}
export const money = (value) =>
  value == null || !Number.isFinite(value)
    ? "Não disponível"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      }).format(value);
export const percent = (value) =>
  value == null || !Number.isFinite(value)
    ? "Sem base"
    : new Intl.NumberFormat("pt-BR", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
export const sum = (values) => values.reduce((a, b) => a + (b ?? 0), 0);
export const iso = (date) => date.toISOString().slice(0, 10);
export const day = (value) => new Date(`${value}T12:00:00Z`);
const daysCache = new Map();
export function businessDays(start, end) {
  const cacheKey = `${start}:${end}`;
  if (daysCache.has(cacheKey)) return daysCache.get(cacheKey);
  let n = 0;
  for (let d = day(start); d <= day(end); d.setUTCDate(d.getUTCDate() + 1))
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++;
  if (daysCache.size > 4000) daysCache.clear();
  daysCache.set(cacheKey, n);
  return n;
}
const bounds = (year, month) => [
  iso(new Date(Date.UTC(year, month, 1, 12))),
  iso(new Date(Date.UTC(year, month + 1, 0, 12))),
];
export function periodBounds(year, month, type) {
  let first = month,
    last = month;
  if (type === "quarter") {
    first = Math.floor(month / 3) * 3;
    last = first + 2;
  }
  if (type === "semester") {
    first = Math.floor(month / 6) * 6;
    last = first + 5;
  }
  if (type === "annual") {
    first = 0;
    last = 11;
  }
  if (type === "ytd") first = 0;
  return {
    first,
    last,
    start: bounds(year, first)[0],
    end: bounds(year, last)[1],
  };
}
export function analyze(row, { year, month, period = "month", uplift = 0 }) {
  // Daily source values do not exist in the supplied workbooks. Daily work is a monthly effort view.
  const range = periodBounds(year, month, period);
  const policy = targetPolicyFor(row),
    targets = policy.targets,
    annualTarget = policy.annualTarget;
  const cut = day(row.cutoff),
    cutMonth = cut.getUTCMonth();
  const cutoff = row.cutoff < range.end ? row.cutoff : range.end;
  const prior = row.cutoff < range.start;
  const targetValues = targets.slice(range.first, range.last + 1);
  const monthlyTarget = targetValues.every((v) => v !== null)
    ? sum(targetValues)
    : null;
  const target =
    period === "annual" ? (annualTarget ?? null) : monthlyTarget;
  const annualConflict =
    period === "annual" &&
    target != null &&
    monthlyTarget != null &&
    Math.abs(target - monthlyTarget) > 0.011;
  let actual = 0,
    expected = 0,
    missing = false,
    observed = false;
  for (let m = range.first; m <= range.last; m++) {
    if (m > cutMonth || prior) continue;
    const [start, end] = bounds(year, m);
    const elapsed = businessDays(start, cutoff < end ? cutoff : end);
    const fraction = elapsed / businessDays(start, end);
    if (row.actuals[m] == null) missing = true;
    else {
      actual += row.actuals[m];
      observed = true;
    }
    if (targets[m] == null) missing = true;
    else expected += targets[m] * fraction;
  }
  const actualValue = observed ? actual : null;
  // A partially closed aggregate with different source dates has no comparable pace.
  if (row.cutoffMin && row.cutoffMin < cutoff && row.cutoffMin < range.end)
    missing = true;
  const complete = observed && !missing;
  const pace = complete && expected > 0 ? actual / expected : null;
  const remainingTarget =
    target == null ? null : Math.max(0, target - expected);
  // Preserve negative adjustments; cap only FUTURE production at zero.
  const projected = annualConflict
    ? null
    : complete && remainingTarget != null && pace != null
      ? actual + remainingTarget * Math.max(0, pace) * (1 + uplift / 100)
      : complete && cutoff >= range.end
        ? actual
        : null;
  const gap =
    complete && target != null && actualValue != null
      ? Math.max(0, target - actual)
      : null;
  const projectionGap =
    target != null && projected != null
      ? Math.max(0, target - projected)
      : null;
  const next = day(cutoff);
  next.setUTCDate(next.getUTCDate() + 1);
  const remainingDays = businessDays(
    iso(next) > range.start ? iso(next) : range.start,
    range.end,
  );
  let remainingMonths = 0;
  for (let m = range.first; m <= range.last; m++) {
    const [start, end] = bounds(year, m);
    remainingMonths +=
      businessDays(iso(next) > start ? iso(next) : start, end) /
      businessDays(start, end);
  }
  const requiredDaily =
    complete && gap != null && remainingDays > 0
      ? gap / remainingDays
      : gap === 0
        ? 0
        : null;
  const requiredMonthly =
    complete && gap != null && remainingMonths > 0
      ? gap / remainingMonths
      : gap === 0
        ? 0
        : null;
  const acceleration =
    complete && gap != null && projected != null && projected > actual
      ? Math.max(0, gap / (projected - actual) - 1)
      : null;
  const attainment =
    complete && target != null && target > 0 ? actual / target : null;
  const projectedAttainment =
    projected != null && target != null && target > 0
      ? projected / target
      : null;
  const status = !observed
    ? "Sem realizado"
    : missing
      ? "Dados incompletos"
      : target == null || target <= 0
        ? "Sem meta"
        : annualConflict
          ? "Metas divergentes"
          : actual >= target
            ? "Meta atingida"
            : cutoff >= range.end
              ? "Prazo encerrado"
              : projected != null && projected >= target
                ? "Em rota"
                : "Atenção";
  return {
    ...row,
    ...range,
    target,
    actual: actualValue,
    expected,
    pace,
    projected,
    gap,
    projectionGap,
    requiredDaily,
    requiredMonthly,
    remainingDays,
    remainingMonths,
    acceleration,
    attainment,
    projectedAttainment,
    status,
    complete,
    annualConflict,
    phase: !observed
      ? "Sem realizado"
      : missing
        ? "Dados incompletos"
        : cutoff >= range.end
          ? "Fechado"
          : "Parcial",
    dailyActual: null,
    dailyTarget:
      targets[month] == null
        ? null
        : targets[month] / businessDays(...bounds(year, month)),
  };
}
export function aggregate(rows, level) {
  const groups = new Map();
  // A direct central plan is a fallback until cooperative plans exist; never add both.
  const covered = new Set(rows.filter((r) => r.source === "base" && r.cooperative)
    .map((r) => `${r.central}:${r.metric}`));
  for (const row of rows.filter((r) => !(r.source === "base" && !r.cooperative && covered.has(`${r.central}:${r.metric}`)))) {
    const key =
      level === "central"
        ? `${row.source}:${row.metric}:central:${row.central}`
        : level === "cooperative"
          ? `${row.source}:${row.metric}:cooperative:${row.central}:${row.cooperative}`
          : row.key;
    if (!groups.has(key))
      groups.set(key, {
        ...row,
        key,
        name:
          level === "central"
            ? row.centralName || CENTRALS[row.central] || `Central ${row.central}`
            : level === "cooperative"
              ? row.cooperativeName || row.name || row.centralName || CENTRALS[row.central] || `Central ${row.central}`
              : row.name,
        targets: Array(12).fill(0),
        actuals: Array(12).fill(0),
        annualTarget: 0,
        targetRule: "registry",
        cutoffMin: row.cutoffMin || row.cutoff,
        members: 0,
      });
    const g = groups.get(key);
    const policy = targetPolicyFor(row);
    g.cutoffMin = [g.cutoffMin, row.cutoffMin || row.cutoff].sort()[0];
    g.cutoff = [g.cutoff, row.cutoff].sort().at(-1);
    g.members++;
    g.annualTarget =
      g.annualTarget == null || policy.annualTarget == null
        ? null
        : g.annualTarget + policy.annualTarget;
    // Null propagates so partial coverage is never silently reported as complete.
    for (let m = 0; m < 12; m++) {
      g.targets[m] =
        g.targets[m] == null || policy.targets[m] == null
          ? null
          : g.targets[m] + policy.targets[m];
      g.actuals[m] =
        g.actuals[m] == null || row.actuals[m] == null || m > day(row.cutoff).getUTCMonth()
          ? null
          : g.actuals[m] + row.actuals[m];
    }
  }
  return [...groups.values()];
}
export function summarize(analyses) {
  const total = (key) =>
    analyses.length && analyses.every((a) => a[key] != null)
      ? sum(analyses.map((a) => a[key]))
      : null;
  const target = total("target"),
    actual = total("actual"),
    projected = total("projected");
  const complete = analyses.length > 0 && analyses.every((a) => a.complete);
  return {
    target,
    actual,
    projected,
    attainment:
      complete && target > 0 && actual != null ? actual / target : null,
    projectedAttainment:
      complete && target > 0 && projected != null ? projected / target : null,
    gap:
      complete && target != null && actual != null
        ? Math.max(0, target - actual)
        : null,
    requiredDaily: total("requiredDaily"),
    dailyTarget: total("dailyTarget"),
    individualGap: complete ? total("gap") : null,
    attention: analyses.filter((a) =>
      [
        "Atenção",
        "Prazo encerrado",
        "Dados incompletos",
        "Sem meta",
        "Sem realizado",
        "Metas divergentes",
      ].includes(a.status),
    ).length,
    onTrack: analyses.filter((a) =>
      ["Meta atingida", "Em rota"].includes(a.status),
    ).length,
  };
}
export function actionFor(row) {
  if (!row.complete)
    return {
      priority: "Validar base",
      text: "Atualizar o realizado e conferir os meses sem informação antes de estabelecer o plano de produção.",
    };
  if (row.annualConflict)
    return {
      priority: "Validar metas",
      text: "A meta anual informada diverge da distribuição mensal. Reconciliar as metas para liberar a projeção anual; a meta oficial foi preservada.",
    };
  if (row.target == null || row.target <= 0)
    return {
      priority: "Definir meta",
      text: "Validar a meta deste período com a cooperativa para mensurar o esforço necessário.",
    };
  if (row.gap === 0)
    return {
      priority: "Sustentar",
      text: "Meta alcançada. Manter o acompanhamento e compartilhar as práticas que trouxeram resultado.",
    };
  if (row.remainingDays === 0)
    return {
      priority: "Replanejar",
      text: `Período encerrado com diferença de ${money(row.gap)}. Revisar causas e distribuir a recuperação pelos períodos seguintes.`,
    };
  const effort = `Buscar ${money(row.requiredDaily)} por dia útil (${money(row.requiredMonthly)} por mês equivalente) para cobrir ${money(row.gap)}.`;
  if (row.actual === 0)
    return {
      priority: "Ativar",
      text: `${effort} Ativar a oferta nos PAs sem produção e revisar a lista de oportunidades com o responsável.`,
    };
  if (row.status === "Em rota")
    return {
      priority: "Acompanhar",
      text: `${effort} Sustentar o ritmo e revisar a evolução semanalmente.`,
    };
  return {
    priority: "Recuperar",
    text: `${effort} ${row.metric === "AR" ? "Verificar parcelas pendentes, cancelamentos e retenção da carteira." : "Revisar propostas pendentes, retomar oportunidades e acompanhar a oferta de seguro de vida."}`,
  };
}
export function reconcile(rows) {
  const notes = [];
  const pas = new Map();
  for (const row of rows.filter((r) => r.source === "cadence" && r.metric === "VN")) {
    const key = `${row.central}:${row.cooperative}`;
    if (!pas.has(key)) pas.set(key, []);
    pas.get(key).push(row);
  }
  for (const coop of rows.filter(
    (r) => r.source === "base" && r.metric === "VN",
  )) {
    const children = pas.get(`${coop.central}:${coop.cooperative}`) || [];
    if (!children.length) continue;
    const limit = Math.min(
      day(coop.cutoff).getUTCMonth(),
      ...children.map((row) => day(row.cutoff).getUTCMonth()),
    );
    const differentCuts = children.some((row) => row.cutoff !== coop.cutoff);
    for (let m = 0; m <= limit; m++) {
      if (coop.actuals[m] == null || children.some((p) => p.actuals[m] == null))
        continue;
      const value = sum(children.map((p) => p.actuals[m])) - coop.actuals[m];
      if (Math.abs(value) > 0.011)
        notes.push({
          kind: "reconciliation",
          message: `${coop.cooperative} · ${MONTHS[m]}: PAs menos cooperativa = ${money(value)}${differentCuts ? " (fontes com cortes diferentes)" : ""}.`,
          central: coop.central,
          cooperative: coop.cooperative,
          month: m,
          difference: value,
        });
    }
  }
  return notes;
}
