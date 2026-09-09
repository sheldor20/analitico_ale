import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseWorkbook, combineImports, number } from "../lib/importer.mjs";
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
} = {}) {
  const book = new ExcelJS.Workbook(),
    s = book.addWorksheet("Cadência");
  s.addRow([
    "GRUPO",
    "Nº CENTRAL",
    "CENTRAL",
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
    "P1",
    1002,
    "CENTRAL BA",
    9999,
    "COOP TESTE",
    code,
    `9999-${code}`,
    { error: "#N/A" },
    450,
    5400,
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
    9998,
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
  return book.xlsx.writeBuffer();
}
test("Brazilian numeric conversion preserves missing/zero/negative", () => {
  assert.equal(number("1.234,56"), 1234.56);
  assert.equal(number(0), 0);
  assert.equal(number(null), null);
  assert.equal(number("#N/A"), null);
  assert.equal(number("-1.234,56"), -1234.56);
});
test("imports source months, excludes unrelated centrals and preserves PA 0 with erroneous name", async () => {
  const d = await parseWorkbook(await fixture(), "cadencia.xlsx", config);
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
    /inválido/,
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
  assert.equal(d.rows.length, 1);
  assert.equal(d.version, 1);
});
