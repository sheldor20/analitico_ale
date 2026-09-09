import test from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  aggregate,
  summarize,
  periodBounds,
  businessDays,
  actionFor,
  reconcile,
} from "../lib/analytics.mjs";
const row = (changes = {}) => ({
  key: "base:1002:9999::VN",
  source: "base",
  central: "1002",
  cooperative: "9999",
  cooperativeName: "Cooperativa de teste",
  name: "Cooperativa de teste",
  pa: null,
  metric: "VN",
  targets: Array(12).fill(2200),
  annualTarget: 26400,
  actuals: Array(12).fill(0),
  cutoff: "2026-09-07",
  ...changes,
});
const options = { year: 2026, month: 8, period: "month" };
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.000001, `${a} != ${b}`);
test("partial month: 5 of 22 weekdays, 250 actual, 2200 target", () => {
  const r = row();
  r.actuals[8] = 250;
  const a = analyze(r, options);
  assert.equal(businessDays("2026-09-01", "2026-09-30"), 22);
  near(a.expected, 500);
  near(a.projected, 1100);
  near(a.gap, 1950);
  near(a.requiredDaily, 1950 / 17);
  assert.equal(a.phase, "Parcial");
});
test("closed period preserves actual and has no future effort when below target", () => {
  const r = row({ cutoff: "2026-09-30" });
  r.actuals[8] = 500;
  const a = analyze(r, options);
  assert.equal(a.projected, 500);
  assert.equal(a.requiredDaily, null);
  assert.equal(a.requiredMonthly, null);
  assert.equal(a.status, "Prazo encerrado");
});
test("percentage is weighted by targets, not average of percentages", () => {
  const a = row({
    targets: Array(12).fill(100),
    actuals: Array(12).fill(90),
    cutoff: "2026-09-30",
  });
  const b = row({
    key: "b",
    cooperative: "9998",
    targets: Array(12).fill(1000),
    actuals: Array(12).fill(10),
    cutoff: "2026-09-30",
  });
  const s = summarize([analyze(a, options), analyze(b, options)]);
  near(s.attainment, 100 / 1100);
});
test("surplus never hides the sum of gaps needed for every entity to reach 100%", () => {
  const a = analyze(
    row({ targets: Array(12).fill(100), actuals: Array(12).fill(200) }),
    options,
  );
  const b = analyze(
    row({ key: "b", targets: Array(12).fill(100), actuals: Array(12).fill(0) }),
    options,
  );
  const s = summarize([a, b]);
  assert.equal(s.gap, 0);
  assert.equal(s.individualGap, 100);
  assert.equal(a.requiredDaily, 0);
});
test("missing differs from known zero and blocks projection", () => {
  const unknown = row();
  unknown.actuals[8] = null;
  assert.equal(analyze(unknown, options).actual, null);
  assert.equal(analyze(unknown, options).projected, null);
  const zero = analyze(row(), options);
  assert.equal(zero.actual, 0);
  assert.equal(zero.projected, 0);
  assert.equal(actionFor(zero).priority, "Ativar");
});
test("a hole inside YTD blocks attainment/projection and all-entity claim", () => {
  const r = row({ actuals: Array(12).fill(100) });
  r.actuals[4] = null;
  const a = analyze(r, { ...options, period: "ytd" });
  assert.equal(a.complete, false);
  assert.equal(a.projected, null);
  assert.equal(a.attainment, null);
  assert.equal(summarize([a]).individualGap, null);
});
test("negative adjustments are not discarded", () => {
  const r = row({ cutoff: "2026-07-31" });
  r.actuals[6] = -100;
  const a = analyze(r, { ...options, month: 6 });
  assert.equal(a.actual, -100);
  assert.equal(a.gap, 2300);
  assert.equal(a.attainment, -100 / 2200);
});
test("future zero placeholders are unavailable after source cutoff", () => {
  const a = analyze(row({ cutoff: "2026-07-31" }), options);
  assert.equal(a.actual, null);
  assert.equal(a.projected, null);
  assert.equal(a.phase, "Sem realizado");
});
test("zero meta gives no percentage or false success", () => {
  const a = analyze(
    row({ targets: Array(12).fill(0), actuals: Array(12).fill(100) }),
    options,
  );
  assert.equal(a.attainment, null);
  assert.equal(a.status, "Sem meta");
});
test("quarter, semester, annual and YTD boundaries are inclusive", () => {
  assert.deepEqual(periodBounds(2026, 8, "quarter"), {
    first: 6,
    last: 8,
    start: "2026-07-01",
    end: "2026-09-30",
  });
  assert.equal(periodBounds(2026, 8, "semester").start, "2026-07-01");
  assert.equal(periodBounds(2026, 8, "semester").end, "2026-12-31");
  assert.equal(periodBounds(2026, 8, "annual").start, "2026-01-01");
  assert.equal(periodBounds(2026, 8, "ytd").end, "2026-09-30");
});
test("daily view never fabricates daily realized and reports derived goal", () => {
  const a = analyze(row(), { ...options, period: "daily" });
  assert.equal(a.dailyActual, null);
  assert.equal(a.dailyTarget, 100);
});
test("PA group targets drive monthly, quarterly, semester and annual scenarios", () => {
  const cadence = row({
    source: "cadence",
    key: "cadence:1002:9999:1:VN",
    pa: "1",
    group: "P3",
    targets: Array(12).fill(1),
    annualTarget: 12,
    actuals: Array(12).fill(0),
  });
  assert.equal(analyze(cadence, options).target, 750);
  assert.equal(
    analyze(cadence, { ...options, period: "quarter" }).target,
    2250,
  );
  assert.equal(
    analyze(cadence, { ...options, period: "semester" }).target,
    4500,
  );
  const annual = analyze(cadence, { ...options, period: "annual" });
  assert.equal(annual.target, 9000);
  assert.equal(annual.annualConflict, false);
});
test("seasonal projection uses future monthly targets and scenario changes future only", () => {
  const r = row({
    targets: Array(12).fill(100),
    annualTarget: 1300,
    actuals: Array(12).fill(50),
    cutoff: "2026-06-30",
  });
  r.targets[11] = 200;
  const a = analyze(r, { ...options, period: "annual" }),
    b = analyze(r, { ...options, period: "annual", uplift: 100 });
  assert.equal(a.actual, 300);
  assert.equal(a.target, 1300);
  assert.equal(a.projected, 650);
  assert.equal(b.actual, 300);
  assert.equal(b.projected, 1000);
});
test("aggregation preserves unknowns, central isolation and source/métrica identity", () => {
  const base = row(),
    ar = row({ metric: "AR" }),
    pa = row({ source: "cadence", pa: "0", key: "pa" });
  base.actuals[1] = null;
  assert.equal(aggregate([base, ar, pa], "central").length, 3);
  assert.equal(
    aggregate([base, row({ cooperative: "9998" })], "central")[0].actuals[1],
    null,
  );
});
test("reconciliation lists differences without adding PAs to cooperative values", () => {
  const base = row({ actuals: Array(12).fill(100) }),
    pa = row({ source: "cadence", pa: "0", actuals: Array(12).fill(110) });
  const notes = reconcile([base, pa]);
  assert.equal(notes.length, 9);
  assert.equal(notes[0].difference, 10);
  assert.equal(base.actuals[0], 100);
});
test("weekend only interval has zero days, no divide by zero", () => {
  assert.equal(businessDays("2026-09-05", "2026-09-06"), 0);
  const a = analyze(row({ cutoff: "2026-09-30" }), options);
  assert.equal(a.remainingDays, 0);
  assert.equal(a.acceleration, null);
});
test("annual goal is official even when distribution differs; projection is suspended", () => {
  const a = analyze(row({ annualTarget: 1000, targets: Array(12).fill(100) }), {
    ...options,
    period: "annual",
  });
  assert.equal(a.target, 1000);
  assert.equal(a.projected, null);
  assert.equal(a.status, "Metas divergentes");
});
test("a closed month with no actual is not labeled closed", () => {
  const r = row();
  r.actuals[0] = null;
  const a = analyze(r, { ...options, month: 0 });
  assert.equal(a.phase, "Sem realizado");
  assert.equal(a.gap, null);
});
