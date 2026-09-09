import test from "node:test";
import assert from "node:assert/strict";
import { analyze, aggregate, summarize } from "../lib/analytics.mjs";
import { analysisRows, createEmptyDataset, deleteEntity, distributeAmount, getPlanRow, initializeRegistry, mergeProduction, upsertEntity, upsertPlanRow } from "../lib/registry.mjs";

const central = { kind: "central", central: "1002", name: "Central Bahia" };
const cooperative = { kind: "cooperative", central: "1002", cooperative: "9999", name: "Cooperativa 9999" };
const pa = { kind: "pa", central: "1002", cooperative: "9999", pa: "0", name: "PA Centro", group: "P3" };
const opts = { year: 2026, month: 8, period: "month" };
const newRow = (changes = {}) => ({ key: "base:1002:9999::VN", source: "base", central: "1002", cooperative: "9999", cooperativeName: "Fonte Cooperativa", pa: null,
  group: "P1", name: "Fonte Cooperativa", metric: "VN", targets: Array(12).fill(100), actuals: Array(12).fill(0), annualTarget: 1200,
  targetRule: "source", cutoff: "2026-09-08", sourceFile: "base.xlsx", sheet: "Fonte", sourceRow: 2, ...changes });
const dataset = (rows = [newRow()], changes = {}) => ({ ...createEmptyDataset(2026), rows,
  sources: [{ filename: "base.xlsx", type: "base", rows: rows.length, skipped: 0 }], ...changes });
function hierarchy() {
  let data = upsertEntity(createEmptyDataset(2026), central);
  data = upsertEntity(data, cooperative);
  return upsertEntity(data, pa);
}

test("initialization freezes official goals, derives every parent and leaves input untouched", () => {
  const input = dataset([newRow({ source: "cadence", pa: "0", targetRule: "group-fixed", group: "P3", annualTarget: 12, targets: Array(12).fill(1) })]);
  const result = initializeRegistry(input);
  assert.equal(result.version, 2);
  assert.equal(result.registry.entities.length, 3);
  assert.equal(result.rows[0].annualTarget, 9000);
  assert.equal(result.rows[0].targetRule, "registry");
  assert.equal(input.rows[0].annualTarget, 12);
});

test("production merge preserves goals/names, observed months, other rows/sources and handles zero and negative adjustments", () => {
  const base = newRow({ actuals: [10, 20, 30, 40, 50, 60, 70, 80, 90, null, null, null] });
  const cadence = newRow({ key: "cadence:1002:9999:0:VN", source: "cadence", pa: "0", group: "P3" });
  let fixed = initializeRegistry(dataset([base, cadence]));
  fixed = upsertEntity(fixed, { ...cooperative, name: "Nome oficial" }, "cooperative:1002:9999");
  const result = mergeProduction(fixed, dataset([newRow({ annualTarget: 9999, targets: Array(12).fill(999), cutoff: "2026-09-09",
    actuals: [null, 0, -7, null, null, null, null, null, 125, 900, 0, 0] })]));
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0].actuals, [10, 0, -7, 40, 50, 60, 70, 80, 125, null, null, null]);
  assert.equal(result.rows[0].annualTarget, 1200);
  assert.equal(result.rows[0].name, "Nome oficial");
  assert.equal(result.rows[1].source, "cadence");
  assert.equal(fixed.rows[0].actuals[8], 90);
  assert.equal(result.sources.length, 2);
});

test("an earlier per-row date or another year fails atomically, even when source-wide dates differ", () => {
  const original = initializeRegistry(dataset());
  assert.throws(() => mergeProduction(original, dataset([newRow({ cutoff: "2026-09-07" })])), /anterior ao já salvo/);
  assert.throws(() => mergeProduction(original, dataset([newRow()], { year: 2027 })), /Abra um cadastro de 2027/);
  assert.equal(original.rows[0].cutoff, "2026-09-08");
  assert.throws(() => upsertPlanRow(original, { entityId: "cooperative:1002:9999", metric: "VN", cutoff: "2025-12-31" }), /ano 2026/);
});

test("fixed-only upload adds new plans but never resets current production or rejects older goal dates", () => {
  const existing = initializeRegistry(dataset());
  const incoming = dataset([newRow({ cutoff: "2026-01-01", actuals: Array(12).fill(90), targets: Array(12).fill(999) }),
    newRow({ cooperative: "8888", cutoff: "2026-01-01", actuals: Array(12).fill(90) })]);
  const result = mergeProduction(existing, incoming, { goalsOnly: true });
  assert.equal(result.rows[0].cutoff, "2026-09-08");
  assert.equal(result.rows[0].targets[0], 100);
  assert.equal(result.rows[0].actuals[0], 0);
  assert.deepEqual(result.rows[1].actuals, Array(12).fill(null));
});

test("manual corrections survive an identical-date upload; newer observed values replace them", () => {
  const fixed = initializeRegistry(dataset());
  const actuals = [...fixed.rows[0].actuals]; actuals[8] = 15;
  const corrected = upsertPlanRow(fixed, { entityId: "cooperative:1002:9999", metric: "VN", actuals });
  const same = mergeProduction(corrected, dataset());
  assert.equal(same.rows[0].actuals[8], 15);
  const next = mergeProduction(same, dataset([newRow({ cutoff: "2026-09-09" })]));
  assert.equal(next.rows[0].actuals[8], 0);
  assert.deepEqual(next.rows[0].manualActualMonths, []);
});

test("manual annual PA goals survive group policy, group edit, all periods and aggregate analysis", () => {
  let data = upsertPlanRow(hierarchy(), { entityId: "pa:1002:9999:0", metric: "VN", annualTarget: 1200, cutoff: "2026-09-09" });
  data = upsertEntity(data, { ...pa, group: "P5" }, "pa:1002:9999:0");
  const row = getPlanRow(data, "pa:1002:9999:0");
  for (const [period, target] of [["daily", 100], ["month", 100], ["quarter", 300], ["semester", 600], ["annual", 1200], ["ytd", 900]])
    assert.equal(analyze(row, { ...opts, period }).target, target);
  assert.equal(analyze(aggregate([row, { ...row, key: "pa2", pa: "2" }], "cooperative")[0], opts).target, 200);
});

test("default PA group changes recalculate its fixed goals", () => {
  let data = upsertPlanRow(hierarchy(), { entityId: "pa:1002:9999:0", metric: "VN" });
  data = upsertEntity(data, { ...pa, group: "P5" }, "pa:1002:9999:0");
  assert.equal(getPlanRow(data, "pa:1002:9999:0").annualTarget, 12000);
});

test("hierarchy code/name updates cascade into descendants, row identities and central aggregate name", () => {
  let data = upsertPlanRow(hierarchy(), { entityId: "pa:1002:9999:0", metric: "VN" });
  data = upsertEntity(data, { ...central, central: "7777", name: "Central cadastrada" }, "central:1002");
  assert.ok(data.registry.entities.find((entity) => entity.id === "pa:7777:9999:0"));
  assert.equal(data.rows[0].key, "cadence:7777:9999:0:VN");
  assert.equal(aggregate(data.rows, "central")[0].name, "Central cadastrada");
  assert.throws(() => upsertEntity(data, { ...cooperative, central: "7777" }), /já está cadastrado/);
  assert.throws(() => upsertEntity(data, { ...cooperative, central: "1111" }), /Cadastre a central/);
});

test("deletion removes descendant production and recalculates totals without double-counting PA/base", () => {
  let data = initializeRegistry(dataset([newRow({ actuals: Array(12).fill(200) }),
    newRow({ cooperative: "8888", actuals: Array(12).fill(300) }),
    newRow({ source: "cadence", pa: "0", actuals: Array(12).fill(50) })]));
  data = deleteEntity(data, "cooperative:1002:9999");
  assert.equal(data.rows.length, 1);
  assert.equal(data.registry.entities.length, 2);
  assert.equal(analyze(aggregate(data.rows, "central")[0], opts).actual, 300);
  data = deleteEntity(data, "central:1002");
  assert.equal(data.rows.length, 0);
  assert.equal(data.registry.entities.length, 0);
});

test("new units appear as unknown balances until registered values exist", () => {
  const fixed = hierarchy();
  assert.equal(fixed.rows.length, 0);
  const rows = analysisRows(fixed);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.source === "base").length, 2);
  assert.equal(analyze(rows.find((row) => row.source === "cadence"), opts).target, 750);
  assert.ok(rows.every((row) => row.actuals.every((value) => value === null)));
  assert.equal(summarize(rows.map((row) => analyze(row, opts))).actual, null);
});

test("annual and proportional allocation preserve all cents, including negative realized", () => {
  assert.equal(distributeAmount(100).reduce((sum, value) => sum + Math.round(value * 100), 0), 10000);
  assert.deepEqual(distributeAmount(0.01, [1, 1, 1]), [0.01, 0, 0]);
  assert.deepEqual(distributeAmount(-0.05, [1, 1]), [-0.03, -0.02]);
  let data = upsertEntity(upsertEntity(createEmptyDataset(2026), central), cooperative);
  data = upsertEntity(data, { ...cooperative, cooperative: "8888", name: "Outra cooperativa" });
  data = upsertPlanRow(data, { entityId: "central:1002", metric: "VN", annualTarget: 100 });
  assert.equal(getPlanRow(data, "central:1002").annualTarget, 100);
  assert.equal(data.rows.flatMap((row) => row.targets).reduce((sum, value) => sum + Math.round(value * 100), 0), 10000);
});

test("central edit only redistributes changed months, preserving cooperative history", () => {
  let data = initializeRegistry(dataset([newRow({ actuals: Array(12).fill(20) }), newRow({ cooperative: "8888", actuals: Array(12).fill(80) })]));
  const actuals = [...getPlanRow(data, "central:1002").actuals]; actuals[8] = 120;
  data = upsertPlanRow(data, { entityId: "central:1002", metric: "VN", actuals });
  assert.equal(data.rows[0].actuals[0], 20);
  assert.equal(data.rows[1].actuals[0], 80);
  assert.equal(data.rows[0].actuals[8], 60);
  assert.equal(data.rows[1].actuals[8], 60);
});

test("central-only plan migrates unchanged to first cooperative and never duplicates aggregates", () => {
  let data = upsertEntity(createEmptyDataset(2026), central);
  const synthetic = analysisRows(data).filter((row) => row.metric === "VN");
  assert.equal(synthetic.length, 1);
  assert.equal(aggregate(synthetic, "cooperative")[0].name, "Central Bahia");
  data = upsertPlanRow(data, { entityId: "central:1002", metric: "VN", annualTarget: 1200 });
  assert.equal(data.rows[0].cooperative, "");
  const planned = analysisRows(data).filter((row) => row.metric === "VN");
  assert.equal(planned.length, 1);
  assert.equal(aggregate(planned, "cooperative")[0].name, "Central Bahia");
  assert.equal(aggregate(planned, "cooperative")[0].annualTarget, 1200);
  data = upsertEntity(data, cooperative);
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].cooperative, "9999");
  assert.equal(getPlanRow(data, "central:1002").annualTarget, 1200);
});

test("mixed cutoffs block partial projections, but a common closed month remains comparable", () => {
  const rows = [newRow({ actuals: Array(12).fill(30), cutoff: "2026-09-08" }),
    newRow({ cooperative: "8888", actuals: Array(12).fill(60), cutoff: "2026-09-09" })];
  const row = aggregate(rows, "central")[0];
  assert.equal(analyze(row, opts).projected, null);
  assert.equal(analyze(row, { ...opts, month: 7 }).actual, 90);
  assert.equal(analyze(row, { ...opts, month: 7 }).complete, true);
});

test("invalid manual values and future production fail without changing the dataset", () => {
  const data = hierarchy();
  assert.throws(() => upsertPlanRow(data, { entityId: "pa:1002:9999:0", metric: "VN", annualTarget: -1 }), /valor válido/);
  assert.throws(() => upsertPlanRow(data, { entityId: "pa:1002:9999:0", metric: "AR" }), /Venda Nova/);
  assert.throws(() => upsertPlanRow(data, { entityId: "pa:1002:9999:0", metric: "VN", actuals: Array(12).fill(1), cutoff: "2026-09-09" }), /posterior/);
  assert.equal(data.rows.length, 0);
});
test("a source-only import supplies valid fallback cutoffs for missing source/metric plans", () => {
  const sourceOnly = dataset([newRow()], { config: { year: 2026, vnCutoff: "2026-09-08", arCutoff: "", cadenceCutoff: "" } });
  let data = initializeRegistry(sourceOnly);
  assert.match(data.config.arCutoff, /^2026-\d{2}-\d{2}$/);
  assert.match(data.config.cadenceCutoff, /^2026-\d{2}-\d{2}$/);
  data = upsertEntity(data, pa);
  const rows = analysisRows(data);
  assert.doesNotThrow(() => rows.map((row) => analyze(row, opts)));
  data = upsertPlanRow(data, { entityId: "pa:1002:9999:0", metric: "VN", annualTarget: 1200 });
  data = upsertPlanRow(data, { entityId: "cooperative:1002:9999", metric: "AR", annualTarget: 2400 });
  assert.ok(data.rows.every((row) => Number.isFinite(new Date(`${row.cutoff}T12:00:00Z`).getTime())));
  // The read helper also works for an already-registered legacy dataset before normalization.
  const legacy = { ...data, config: { ...data.config, cadenceCutoff: "" }, rows: data.rows.filter((row) => row.source !== "cadence") };
  assert.doesNotThrow(() => analysisRows(legacy).map((row) => analyze(row, opts)));
});
