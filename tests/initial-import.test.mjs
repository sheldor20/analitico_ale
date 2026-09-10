import test from "node:test";
import assert from "node:assert/strict";
import { combineImports } from "../lib/importer.mjs";
import { createEmptyDataset, mergeProduction } from "../lib/registry.mjs";

const config = {
  year: 2026,
  vnCutoff: "2026-01-01",
  arCutoff: "2026-01-01",
  cadenceCutoff: "2026-01-01",
};
const actuals = [10, 20, 30, 40, 50, 60, 70, 80, 90, null, null, null];
const targets = Array(12).fill(100);

function row(changes = {}) {
  return {
    key: "base:1002:9999::VN",
    source: "base",
    central: "1002",
    cooperative: "9999",
    cooperativeName: "Cooperativa 9999",
    pa: null,
    group: "P1",
    name: "Cooperativa 9999",
    metric: "VN",
    targets,
    actuals,
    annualTarget: 1200,
    targetRule: "source",
    cutoff: "2026-01-01",
    sourceFile: "base.xlsx",
    sheet: "Base",
    sourceRow: 2,
    ...changes,
  };
}

function imported(rows) {
  return combineImports(
    [
      {
        source: "base",
        rows,
        issues: [],
        skipped: 0,
        filename: "base.xlsx",
      },
    ],
    config,
  );
}

test("fixed spreadsheet registration keeps targets and imports the initial realized values", () => {
  const combined = imported([row()]);
  assert.deepEqual(combined.rows[0].__importActuals, actuals);
  assert.match(combined.rows[0].__importCutoff, /^2026-\d{2}-\d{2}$/);

  // Mirrors the current dashboard fixed-registration preparation: the public
  // `actuals` field is cleared, while the transient import snapshot survives.
  const prepared = {
    ...combined,
    rows: combined.rows.map((item) => ({
      ...item,
      actuals: Array(12).fill(null),
    })),
  };
  const registered = mergeProduction(createEmptyDataset(2026), prepared, {
    goalsOnly: true,
  });

  assert.deepEqual(registered.rows[0].actuals, actuals);
  assert.deepEqual(registered.rows[0].targets, targets);
  assert.equal(registered.rows[0].annualTarget, 1200);
  assert.equal("__importActuals" in registered.rows[0], false);
  assert.equal("__importCutoff" in registered.rows[0], false);
});

test("later production-only uploads replace realized values without changing registered goals", () => {
  const combined = imported([row()]);
  const registered = mergeProduction(
    createEmptyDataset(2026),
    {
      ...combined,
      rows: combined.rows.map((item) => ({
        ...item,
        actuals: Array(12).fill(null),
      })),
    },
    { goalsOnly: true },
  );

  const nextActuals = [11, 22, 33, 44, 55, 66, 77, 88, 111, null, null, null];
  const updated = mergeProduction(registered, {
    ...imported([
      row({
        cutoff: "2026-09-11",
        targets: Array(12).fill(999),
        annualTarget: 11988,
        actuals: nextActuals,
      }),
    ]),
    rows: [
      row({
        cutoff: "2026-09-11",
        targets: Array(12).fill(999),
        annualTarget: 11988,
        actuals: nextActuals,
      }),
    ],
  });

  assert.deepEqual(updated.rows[0].actuals, nextActuals);
  assert.deepEqual(updated.rows[0].targets, targets);
  assert.equal(updated.rows[0].annualTarget, 1200);
});
