import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseWorkbook, combineImports, number } from "../lib/importer.mjs";
import { MONTHS } from "../lib/analytics.mjs";
import { createEmptyDataset, initializeRegistry, mergeProduction, upsertEntity } from "../lib/registry.mjs";
import { sizedXlsx } from "./helpers/sized-xlsx.mjs";
const config = {
  year: 2026,
  vnCutoff: "2026-09-08",
  arCutoff: "2026-07-31",
  cadenceCutoff: "2026-09-08",
};
async function fixture({
  duplicate = false,
  blank = false,
  negative = false,
  code = 0,
  group = "P1",
  sourceMonthly = 450,
  sourceAnnual = 5400,
  central = 1002,
  centralLabel = "CENTRAL BA",
  centralHeader = "CENTRAL",
  otherCentral = 9998,
  footer = false,
  byteLength,
} = {}) {
  const book = new ExcelJS.Workbook(),
    s = book.addWorksheet("Cadência");
  s.addRow([
    "GRUPO",
    "Nº CENTRAL",
    centralHeader,
    "Nº COOP",
    "NOME COOP",
    "Nº PA",
    "CPA",
    "NOME DO PA",
    "MÊS",
    "ANO",
    "REAL JAN",
    "REAL FEV",
    "REAL MAR",
    "ABR",
    "MAI",
    "JUN",
    "JUL",
    "AGO",
    "SET",
  ]);
  const values = [
    group,
    central,
    centralLabel,
    9999,
    "COOP TESTE",
    code,
    `9999-${code}`,
    { error: "#N/A" },
    sourceMonthly,
    sourceAnnual,
    negative ? -100 : 123,
    0,
    0,
    0,
    0,
    blank ? null : 0,
    0,
    0,
    0,
  ];
  s.addRow(values);
  if (duplicate) s.addRow(values);
  s.addRow([
    "P1",
    otherCentral,
    "OUTRA CENTRAL",
    9997,
    "OUTRA COOP",
    1,
    "9997-1",
    "OUTRO PA",
    450,
    5400,
    888,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  if (footer) s.addRow([null, "TOTAL", null, null]);
  return byteLength ? sizedXlsx(book, byteLength) : book.xlsx.writeBuffer();
}
test("a real 40 MiB XLSX imports with the same results as a small workbook", async () => {
  const options = { central: 3456, centralLabel: "Central Exemplo", negative: true, blank: true };
  const expected = await parseWorkbook(await fixture(options), "cadencia.xlsx", config);
  const large = await fixture({ ...options, byteLength: 40 * 1024 * 1024 });
  const actual = await parseWorkbook(large, "cadencia.xlsx", config);
  assert.deepEqual(actual.rows, expected.rows);
  assert.deepEqual(actual.issues, expected.issues);
  assert.equal(actual.skipped, expected.skipped);
  assert.equal(actual.rows[0].actuals[0], -100);
  assert.equal(actual.rows[0].actuals[5], null);
});
test("workbook parsing rejects one byte over 40 MiB before parsing an invalid ZIP", async () => {
  await assert.rejects(
    () => parseWorkbook(new Uint8Array(40 * 1024 * 1024 + 1), "cadencia.xlsx", config),
    /40 MB/,
  );
});
test("Brazilian numeric conversion preserves missing/zero/negative", () => {
  assert.equal(number("1.234,56"), 1234.56);
  assert.equal(number(0), 0);
  assert.equal(number(null), null);
  assert.equal(number("#N/A"), null);
  assert.equal(number("-1.234,56"), -1234.56);
});
test("an explicit central scope preserves source months and PA 0 while excluding unrelated centrals", async () => {
  const d = await parseWorkbook(await fixture(), "cadencia.xlsx", { ...config, allowedCentrals: ["1002"] });
  assert.equal(d.rows.length, 1);
  assert.equal(d.skipped, 1);
  assert.equal(d.rows[0].pa, "0");
  assert.equal(d.rows[0].targets[0], 450);
  assert.equal(d.rows[0].annualTarget, 5400);
  assert.equal(d.rows[0].actuals[9], null);
  assert.match(d.rows[0].name, /nome não informado/);
  assert.equal(d.rows[0].actuals[0], 123);
});
test("PA 97 is included", async () => {
  const d = await parseWorkbook(
    await fixture({ code: 97 }),
    "cadencia.xlsx",
    config,
  );
  assert.equal(d.rows[0].pa, "97");
});
test("cadence always applies the fixed P1-P5 target policy", async () => {
  const d = await parseWorkbook(
    await fixture({ group: "P4", sourceMonthly: 999, sourceAnnual: 9999 }),
    "cadencia.xlsx",
    config,
  );
  assert.deepEqual(d.rows[0].targets, Array(12).fill(850));
  assert.equal(d.rows[0].annualTarget, 10200);
  assert.equal(d.rows[0].sourceMonthlyTarget, 999);
  assert.equal(d.rows[0].sourceAnnualTarget, 9999);
  assert.equal(d.rows[0].targetRule, "group-fixed");
  assert.equal(
    d.issues.filter((issue) => /regra fixa foi aplicada/.test(issue.message))
      .length,
    2,
  );
});
test("cadence rejects groups outside P1-P5", async () => {
  await assert.rejects(
    async () =>
      parseWorkbook(
        await fixture({ group: "P6" }),
        "cadencia.xlsx",
        config,
      ),
    /grupo do PA inválido/,
  );
});
test("duplicate business rows fail instead of doubling production", async () => {
  await assert.rejects(() => parseWorkbook(fixture(), "x.xlsx", config));
  await assert.rejects(
    async () =>
      parseWorkbook(
        await fixture({ duplicate: true }),
        "cadencia.xlsx",
        config,
      ),
    /duplicado/,
  );
});
test("unknown past actual remains null, negative remains negative", async () => {
  const d = await parseWorkbook(
    await fixture({ blank: true, negative: true }),
    "cadencia.xlsx",
    config,
  );
  assert.equal(d.rows[0].actuals[5], null);
  assert.equal(d.rows[0].actuals[0], -100);
});
test("explicit valid source date required; invalid calendar dates rejected", async () => {
  await assert.rejects(
    async () =>
      parseWorkbook(await fixture(), "cadencia.xlsx", {
        ...config,
        cadenceCutoff: "",
      }),
    /corte/,
  );
  await assert.rejects(
    async () =>
      parseWorkbook(await fixture(), "cadencia.xlsx", {
        ...config,
        cadenceCutoff: "2026-02-31",
      }),
    /corte/,
  );
});
test("malformed or non-xlsx data fails clearly", async () => {
  await assert.rejects(
    () => parseWorkbook(new Uint8Array([1, 2, 3]).buffer, "test.xlsx", config),
    /inválid[ao]/,
  );
  await assert.rejects(
    () => parseWorkbook(new ArrayBuffer(1), "test.xls", config),
    /\.xlsx/,
  );
});
test("combined snapshot prevents two files from same source", async () => {
  const p = await parseWorkbook(await fixture(), "a.xlsx", config);
  assert.throws(() => combineImports([p, p], config), /apenas um/);
  const d = combineImports([p], config);
  assert.equal(d.rows.length, 2);
  assert.equal(d.version, 2);
  assert.equal(d.paTargetPolicy.groups.P5.monthly, 1000);
});
test("first import accepts new centrals without an allowlist, including an explicitly empty list", async () => {
  const workbook = await fixture({ central: 3456, otherCentral: 1002 });
  for (const scope of [{}, { allowedCentrals: [] }]) {
    const result = await parseWorkbook(workbook, "cadencia.xlsx", { ...config, ...scope });
    assert.deepEqual(result.rows.map(row => row.central), ["3456", "1002"]);
    assert.equal(result.skipped, 0);
    assert.equal(result.rows[0].actuals[0], 123);
    assert.equal(result.rows[0].pa, "0");
  }
});
test("the optional CENTRAL name reaches the new registry while registered names retain precedence", async () => {
  const part = await parseWorkbook(await fixture({ central: 3456, centralLabel: "  Sicoob Central Sudeste  " }), "cadencia.xlsx", config);
  assert.equal(part.rows[0].centralName, "Sicoob Central Sudeste");
  const incoming = combineImports([part], config);
  const first = initializeRegistry(incoming);
  assert.equal(first.registry.entities.find(entity => entity.id === "central:3456").name, "Sicoob Central Sudeste");
  const existing = upsertEntity(createEmptyDataset(2026), { kind: "central", central: "3456", name: "Nome oficial cadastrado" });
  const updated = mergeProduction(existing, incoming);
  assert.equal(updated.registry.entities.find(entity => entity.id === "central:3456").name, "Nome oficial cadastrado");
  assert.equal(updated.rows.find(row => row.central === "3456").centralName, "Nome oficial cadastrado");
  assert.equal(updated.rows.find(row => row.central === "3456").actuals[0], 123);
});
test("missing, blank or erroneous CENTRAL cells keep generic and historical name fallbacks", async () => {
  for (const overrides of [{ centralHeader: "" }, { centralLabel: "  " }, { centralLabel: { error: "#N/A" } }, { centralLabel: { formula: "NA()", result: { error: "#N/A" } } }]) {
    for (const [central, expected] of [[3456, "Central 3456"], [1002, "Sicoob Central Bahia"]]) {
      const part = await parseWorkbook(await fixture({ central, ...overrides }), "cadencia.xlsx", config);
      assert.equal(Object.hasOwn(part.rows[0], "centralName"), false);
      const dataset = initializeRegistry(combineImports([part], config));
      assert.equal(dataset.registry.entities.find(entity => entity.id === `central:${central}`).name, expected);
    }
  }
});
test("a cadence central name also labels an earlier unnamed base row without mutating the imported parts", async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Metas");
  sheet.addRow(["Nº CENTRAL", "CENTRAL", "Nº COOP", "SIGLA COOPERATIVA", "META", "G COOP", "META ANUAL"]);
  sheet.addRow([3456, "", 9999, "Cooperativa teste", "VENDA NOVA", "P1", 1200]);
  sheet.addRow([6789, "Central da base", 8888, "Outra cooperativa", "VENDA NOVA", "P1", 600]);
  const base = await parseWorkbook(await book.xlsx.writeBuffer(), "metas.xlsx", config);
  const cadence = await parseWorkbook(await fixture({ central: 3456, centralLabel: "Central da cadência" }), "cadencia.xlsx", config);
  const before = structuredClone([base, cadence]);
  assert.equal(base.rows[1].centralName, "Central da base");
  const combined = combineImports([base, cadence], config);
  assert.deepEqual([base, cadence], before);
  const dataset = initializeRegistry(combined);
  assert.equal(dataset.registry.entities.find(entity => entity.id === "central:3456").name, "Central da cadência");
  assert.equal(dataset.registry.entities.find(entity => entity.id === "central:6789").name, "Central da base");
  assert.ok(dataset.rows.filter(row => row.central === "3456").every(row => row.centralName === "Central da cadência"));
});
test("an explicit non-empty scope imports exactly its centrals without adding Bahia or Nordeste", async () => {
  for (const legacy of [1002, 2007]) {
    const result = await parseWorkbook(await fixture({ central: 3456, otherCentral: legacy }), "cadencia.xlsx", { ...config, allowedCentrals: ["003456"] });
    assert.deepEqual(result.rows.map(row => row.central), ["3456"]);
    assert.equal(result.skipped, 1);
  }
  const workbook = await fixture({ central: 1002, otherCentral: 2007 });
  await assert.rejects(() => parseWorkbook(workbook, "cadencia.xlsx", { ...config, allowedCentrals: ["3456"] }), /centrais permitidas \(3456\)/);
});
test("unrestricted imports reject malformed record codes but preserve blank and total-footer handling", async () => {
  for (const central of ["CENTRAL INVÁLIDA", "1234567890123"]) {
    await assert.rejects(async () => parseWorkbook(await fixture({ central }), "cadencia.xlsx", config), /central inválida/);
  }
  const result = await parseWorkbook(await fixture({ central: "", footer: true }), "cadencia.xlsx", config);
  assert.deepEqual(result.rows.map(row => row.central), ["9998"]);
  await assert.rejects(async () => parseWorkbook(await fixture(), "cadencia.xlsx", { ...config, allowedCentrals: ["inválida"] }), /lista de centrais permitidas/);
});
test("a fixed cooperative base can provide annual/monthly goals before any production columns exist", async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Metas");
  sheet.addRow(["Nº CENTRAL", "Nº COOP", "SIGLA COOPERATIVA", "META", "G COOP", "META ANUAL", ...MONTHS.map((month) => `META ${month}`)]);
  sheet.addRow([3456, 9999, "Cooperativa teste", "VENDA NOVA", "P1", 1200, ...Array(12).fill(100)]);
  const result = await parseWorkbook(await book.xlsx.writeBuffer(), "metas.xlsx", config);
  assert.equal(result.rows[0].central, "3456");
  assert.equal(result.rows[0].annualTarget, 1200);
  assert.deepEqual(result.rows[0].actuals, Array(12).fill(null));
});
test("annual-only fixed registry is distributed into monthly targets with exact cents", async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Metas anuais");
  sheet.addRow(["Nº CENTRAL", "Nº COOP", "SIGLA COOPERATIVA", "META", "G COOP", "META ANUAL"]);
  sheet.addRow([1002, 9999, "Cooperativa teste", "VENDA NOVA", "P1", 100]);
  const result = await parseWorkbook(await book.xlsx.writeBuffer(), "metas-anuais.xlsx", config);
  assert.equal(result.rows[0].annualTarget, 100);
  assert.equal(result.rows[0].targets.reduce((sum, value) => sum + Math.round(value * 100), 0), 10000);
  assert.deepEqual(result.rows[0].actuals, Array(12).fill(null));
});
