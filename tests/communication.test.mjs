import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../lib/analytics.mjs";
import { buildPartialCommunication } from "../lib/communication.mjs";

const pa = (changes = {}) => ({
  key: "cadence:1002:3017:1:VN",
  source: "cadence",
  central: "1002",
  cooperative: "3017",
  cooperativeName: "SICOOB COOPERE",
  name: "PA TESTE",
  pa: "1",
  group: "P2",
  metric: "VN",
  targets: Array(12).fill(1),
  annualTarget: 12,
  actuals: Array(12).fill(0),
  cutoff: "2026-09-08",
  ...changes,
});

test("partial communication is generated from the filtered PA scenario", () => {
  const first = pa();
  first.actuals[8] = 100;
  const second = pa({
    key: "cadence:1002:3017:2:VN",
    pa: "2",
    group: "P4",
  });
  second.actuals[8] = 900;
  const analyses = [first, second].map((row) =>
    analyze(row, { year: 2026, month: 8, period: "month" }),
  );
  const draft = buildPartialCommunication({
    analyses,
    year: 2026,
    month: 8,
    periodLabel: "Mensal",
    scopeLabel: "3017 · SICOOB COOPERE",
    cutoff: "2026-09-08",
    group: "all",
  });
  const plainBody = draft.body.replaceAll("\u00a0", " ");
  assert.equal(draft.isPartial, true);
  assert.match(draft.subject, /Cenário parcial/);
  assert.match(plainBody, /posição em 08\/09\/2026/);
  assert.match(plainBody, /P1 R\$ 450,00\/mês/);
  assert.match(plainBody, /P5 R\$ 1\.000,00\/mês/);
  assert.match(plainBody, /PA 1 · P2/);
  assert.doesNotMatch(plainBody, /undefined|NaN/);
});

test("communication respects an active PA group filter", () => {
  const row = pa({ group: "P4" });
  row.actuals[8] = 0;
  const draft = buildPartialCommunication({
    analyses: [
      analyze(row, { year: 2026, month: 8, period: "annual" }),
    ],
    year: 2026,
    month: 8,
    periodLabel: "Anual",
    scopeLabel: "Grupo P4",
    cutoff: "2026-09-08",
    group: "P4",
  });
  const plainBody = draft.body.replaceAll("\u00a0", " ");
  assert.match(plainBody, /P4 R\$ 850,00\/mês \(R\$ 10\.200,00\/ano\)/);
  assert.doesNotMatch(plainBody, /P1 R\$/);
});
