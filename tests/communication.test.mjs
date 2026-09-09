import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../lib/analytics.mjs";
import { buildDecisionInsights, buildPartialCommunication } from "../lib/communication.mjs";

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
  assert.match(plainBody, /P2 R\$ 600,00\/mês/);
  assert.match(plainBody, /P4 R\$ 850,00\/mês/);
  assert.doesNotMatch(plainBody, /P1 R\$|P3 R\$|P5 R\$/);
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

const draftFor = (rows, options = {}) => buildPartialCommunication({
  analyses: rows.map((row) => analyze(row, { year: 2026, month: 8, period: "month" })),
  year: 2026,
  month: 8,
  periodLabel: "Mensal",
  scopeLabel: "Seleção",
  cutoff: "2026-09-08",
  ...options,
});
const plain = (value) => value.replaceAll("\u00a0", " ");

test("a selection without actuals is incomplete, never closed or all met", () => {
  const draft = draftFor([pa({ actuals: Array(12).fill(null) })]);
  assert.equal(draft.isIncomplete, true);
  assert.equal(draft.missingDataCount, 1);
  assert.match(draft.subject, /dados incompletos/);
  assert.doesNotMatch(draft.subject, /fechado/);
  assert.doesNotMatch(draft.body, /Todos os PAs da seleção estão com a meta atingida/);
  assert.match(draft.body, /Cadastros a validar/);
  assert.match(draft.body, /Atualizar o realizado/);
});

test("missing targets never produce a success claim even alongside a met target", () => {
  const reached = pa({ actuals: Array(12).fill(900) });
  const missing = pa({ pa: "2", group: "desconhecido" });
  const draft = draftFor([reached, missing]);
  assert.equal(draft.isIncomplete, true);
  assert.doesNotMatch(draft.body, /Todos os PAs da seleção estão com a meta atingida/);
  assert.match(draft.body, /Pendências de informação: 1 registro/);
});

test("manual and registry PA targets are shown instead of unused group defaults", () => {
  for (const targetRule of ["manual", "registry"]) {
    const draft = draftFor([pa({
      targetRule,
      targets: Array(12).fill(1234),
      annualTarget: 14808,
    })]);
    assert.match(plain(draft.body), /R\$ 1\.234,00 no período; R\$ 14\.808,00 no ano/);
    assert.doesNotMatch(plain(draft.body), /P2 R\$ 600,00\/mês/);
    assert.match(draft.body, /prevalecem sobre o padrão do grupo/);
  }
});

test("large registry selections group equivalent targets and keep communication concise", () => {
  const rows = Array.from({ length: 600 }, (_, index) => pa({
    pa: String(index + 1),
    targetRule: "registry",
    targets: Array(12).fill(1234),
    annualTarget: 14808,
  }));
  const draft = draftFor(rows);
  assert.match(plain(draft.body), /600 PAs · P2: R\$ 1\.234,00 no período; R\$ 14\.808,00 no ano por PA/);
  assert.ok(draft.body.length < 6000, `Body has ${draft.body.length} characters`);
  assert.equal(draft.summary.target, 600 * 1234);
});

test("different manual target exceptions are capped without losing their consolidated value", () => {
  const rows = Array.from({ length: 20 }, (_, index) => pa({
    pa: String(index + 1),
    targetRule: "manual",
    targets: Array(12).fill(1000 + index),
    annualTarget: (1000 + index) * 12,
  }));
  const draft = draftFor(rows);
  assert.match(draft.body, /Outros 15 PAs têm metas específicas, já incluídas no total da seleção/);
  assert.equal(draft.summary.target, 20190);
  assert.ok(draft.body.length < 6000);
});

test("cooperative AR communication excludes PA/VN rows and uses cooperative labels", () => {
  const cooperative = pa({
    source: "base",
    metric: "AR",
    pa: undefined,
    targets: Array(12).fill(1000),
    annualTarget: 12000,
    actuals: Array(12).fill(300),
  });
  const draft = draftFor([cooperative, pa()], { source: "base", metric: "AR" });
  assert.equal(draft.summary.target, 1000);
  assert.equal(draft.summary.actual, 300);
  assert.match(draft.subject, /Cooperativas · Arrecadação/);
  assert.match(draft.body, /todas as cooperativas atinjam 100%/);
  assert.doesNotMatch(draft.body, /Cadência Comercial dos PAs|PA undefined|Metas fixas dos grupos/);
});

test("different cutoff dates show their range and never imply the fallback is universal", () => {
  const draft = draftFor([
    pa({ cutoff: "2026-09-02" }),
    pa({ pa: "2", cutoff: "2026-09-07" }),
  ]);
  assert.match(draft.body, /posições entre 02\/09\/2026 e 07\/09\/2026/);
  assert.match(draft.body, /datas de corte diferentes/);
  assert.doesNotMatch(draft.body, /posição em 08\/09\/2026/);
});

test("aggregate cutoffMin is retained in the communication range", () => {
  const draft = draftFor([pa({ cutoffMin: "2026-09-01", cutoff: "2026-09-08" })]);
  assert.match(draft.body, /posições entre 01\/09\/2026 e 08\/09\/2026/);
  assert.equal(draft.isIncomplete, true);
});

test("complete closed selections are labeled closed and rank largest actual gaps first", () => {
  const draft = draftFor([
    pa({ pa: "1", cutoff: "2026-10-01", actuals: Array(12).fill(550) }),
    pa({ pa: "2", cutoff: "2026-10-01", actuals: Array(12).fill(100) }),
  ]);
  assert.match(draft.subject, /Cenário fechado/);
  assert.equal(draft.isPartial, false);
  assert.equal(draft.priorities[0].pa, "2");
  assert.equal(draft.priorities[1].pa, "1");
  assert.match(draft.body, /Revisar causas/);
});

test("insights weight attainment by targets and preserve gaps despite consolidated success", () => {
  const analyses = [
    pa({ pa: "1", targetRule: "manual", targets: Array(12).fill(100), annualTarget: 1200, actuals: Array(12).fill(500) }),
    pa({ pa: "2", targetRule: "manual", targets: Array(12).fill(900), annualTarget: 10800, actuals: Array(12).fill(600) }),
  ].map((row) => analyze(row, { year: 2026, month: 8, period: "month" }));
  const insights = buildDecisionInsights(analyses);
  const weighted = insights.find((item) => item.title === "Atingimento ponderado");
  assert.match(weighted.detail, /110%/);
  assert.match(weighted.detail, /ainda deixa unidades com saldo individual/);
  assert.equal(weighted.tone, "neutral");
  assert.match(insights.find((item) => item.title === "Concentração do saldo").detail, /PA 2/);
});

test("insights flag actual zero only in observed active periods", () => {
  const analyses = [
    pa({ pa: "1" }),
    pa({ pa: "2", actuals: Array(12).fill(null) }),
    pa({ pa: "3", cutoff: "2026-10-01" }),
  ].map((row) => analyze(row, { year: 2026, month: 8, period: "month" }));
  const insights = buildDecisionInsights(analyses);
  assert.match(insights[0].detail, /1 de 3 registros/);
  assert.match(insights.find((item) => item.title === "Ativar produção").detail, /1 registro com meta/);
  assert.ok(insights.every((item) => !/NaN|undefined/.test(item.detail)));
});

test("insights show the top three share of the individual gap", () => {
  const analyses = [100, 200, 300, 400].map((actual, index) =>
    analyze(pa({ pa: String(index + 1), actuals: Array(12).fill(actual) }), { year: 2026, month: 8, period: "month" }),
  );
  const gapInsight = buildDecisionInsights(analyses).find((item) => item.title === "Concentração do saldo");
  assert.match(gapInsight.detail, /85,7%/);
  assert.doesNotMatch(gapInsight.detail, /PA 4/);
});

test("insights do not add overlapping PA and cooperative populations", () => {
  const insights = buildDecisionInsights([pa(), pa({ source: "base" })]);
  assert.equal(insights.length, 1);
  assert.equal(insights[0].tone, "warning");
  assert.match(insights[0].detail, /evitar dupla contagem/);
  assert.equal(buildDecisionInsights([])[0].title, "Sem registros");
});
