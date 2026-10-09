import { assertSafeXlsx } from "./xlsx-safety.mjs";
import ExcelJS from "exceljs";
import { distributeAmount } from "./registry.mjs";
import {
  MONTHS,
  PA_GROUP_TARGETS,
  PA_TARGET_POLICY_VERSION,
  paTargetForGroup,
  sum,
  reconcile,
  day,
} from "./analytics.mjs";
export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
function scalar(cell) {
  const v = cell?.value;
  if (v == null) return null;
  if (typeof v !== "object") return v;
  if ("error" in v) return null;
  if ("formula" in v || "sharedFormula" in v) return v.result ?? null;
  if ("richText" in v) return v.richText.map((p) => p.text).join("");
  if ("text" in v) return v.text;
  return null;
}
export function number(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let v = String(value)
    .trim()
    .replace(/R\$|\s/g, "");
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}
function code(value) {
  const v = String(value ?? "").trim();
  return /^\d+$/.test(v) ? String(Number(v)) : v;
}
function requiredColumn(headers, names) {
  const index = headers.findIndex((h) => names.includes(h));
  if (index < 0) throw new Error(`Coluna obrigatória ausente: ${names[0]}.`);
  return index + 1;
}
function optionalColumn(headers, names) {
  const index = headers.findIndex((h) => names.includes(h));
  return index < 0 ? 0 : index + 1;
}
function validCutoff(cutoff, year) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(cutoff ?? "") &&
    !Number.isNaN(day(cutoff).getTime()) &&
    day(cutoff).toISOString().slice(0, 10) === cutoff &&
    day(cutoff).getUTCFullYear() === year
  );
}
function inferredActualCutoff(actuals, year) {
  const lastAvailable = actuals.reduce(
    (last, value, index) => (value != null ? index : last),
    -1,
  );
  if (lastAvailable < 0) return null;
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth();
  if (year > currentYear) return `${year}-01-01`;
  const effectiveMonth =
    year === currentYear ? Math.min(lastAvailable, currentMonth) : lastAvailable;
  if (year === currentYear && effectiveMonth === currentMonth)
    return today.toISOString().slice(0, 10);
  const lastDay = new Date(Date.UTC(year, effectiveMonth + 1, 0)).getUTCDate();
  return `${year}-${String(effectiveMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}
export async function parseWorkbook(buffer, filename, config) {
  if (
    !Number.isInteger(config.year) ||
    config.year < 2020 ||
    config.year > 2100
  )
    throw new Error("Informe um ano de metas entre 2020 e 2100.");
  if (!/\.xlsx$/i.test(filename))
    throw new Error("Selecione um arquivo .xlsx.");
  // Bound decompression before ExcelJS loads XML, protecting against small compressed ZIP bombs.
  await assertSafeXlsx(buffer);
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer);
  } catch {
    throw new Error(
      "Não foi possível ler a planilha. Verifique se o arquivo está íntegro e sem senha.",
    );
  }
  const rows = [],
    issues = [];
  // A new workspace has no central restriction. An explicit non-empty list is
  // the exact import scope; [] also means unrestricted, never legacy defaults.
  if (config.allowedCentrals != null && !Array.isArray(config.allowedCentrals))
    throw new Error("A lista de centrais permitidas é inválida.");
  const centralCodes = (config.allowedCentrals || []).map(code);
  if (centralCodes.some((central) => !/^\d{1,12}$/.test(central)))
    throw new Error("A lista de centrais permitidas deve conter códigos numéricos de até 12 dígitos.");
  const allowedCentrals = centralCodes.length ? new Set(centralCodes) : null;
  let kind = null,
    skipped = 0;
  const seen = new Set();
  for (const sheet of book.worksheets) {
    if (sheet.rowCount > 50000 || sheet.columnCount > 300)
      throw new Error(
        "A planilha excede o limite de 50 mil linhas ou 300 colunas.",
      );
    let headerRow = 0,
      headers = [];
    for (let n = 1; n <= Math.min(20, sheet.rowCount); n++) {
      const hs = Array.from({ length: sheet.columnCount }, (_, c) =>
        normalize(scalar(sheet.getRow(n).getCell(c + 1))),
      );
      if (hs.includes("NCENTRAL") && hs.includes("NCOOP")) {
        headerRow = n;
        headers = hs;
        break;
      }
    }
    if (!headerRow) continue;
    const cadence = headers.includes("NPA");
    const source = cadence ? "cadence" : "base";
    if (kind && kind !== source)
      throw new Error(
        "Envie a base de cooperativas e a cadência em arquivos separados.",
      );
    kind = source;
    const c = requiredColumn(headers, ["NCENTRAL"]),
      coop = requiredColumn(headers, ["NCOOP"]);
    const centralNameColumn = optionalColumn(headers, ["CENTRAL"]);
    const name = requiredColumn(
      headers,
      cadence ? ["NOMECOOP"] : ["SIGLACOOPERATIVA"],
    );
    const metricCol = cadence ? 0 : requiredColumn(headers, ["META"]);
    const group = requiredColumn(headers, cadence ? ["GRUPO"] : ["GCOOP"]);
    const pa = cadence ? requiredColumn(headers, ["NPA"]) : 0;
    const paName = cadence ? requiredColumn(headers, ["NOMEDOPA"]) : 0;
    const monthly = cadence ? optionalColumn(headers, ["MES"]) : 0;
    const annual = cadence
      ? optionalColumn(headers, ["ANO"])
      : requiredColumn(headers, ["METAANUAL"]);
    const targetColumns = MONTHS.map((m) => optionalColumn(headers, [`META${m}`]));
    const realColumns = MONTHS.map((m) => {
      const i = headers.findIndex(
        (h) => h === `REAL${m}` || (cadence && h === m),
      );
      return i < 0 ? 0 : i + 1;
    });
    // A fixed annual registry may contain only goals; absent production stays unknown.
    for (let n = headerRow + 1; n <= sheet.rowCount; n++) {
      const row = sheet.getRow(n),
        val = (col) => scalar(row.getCell(col));
      const central = code(val(c)), cooperative = code(val(coop));
      if (!central) continue;
      if (!/^\d{1,12}$/.test(central)) {
        // Spreadsheet footers such as TOTAL have no cooperative record.
        if (!cooperative) continue;
        throw new Error(`${sheet.name}, linha ${n}: central inválida. Informe um código numérico de até 12 dígitos.`);
      }
      if (allowedCentrals && !allowedCentrals.has(central)) {
        skipped++;
        continue;
      }
      if (!/^\d+$/.test(cooperative))
        throw new Error(`${sheet.name}, linha ${n}: cooperativa inválida.`);
      const groupValue = cadence
        ? normalize(val(group))
        : String(val(group) || "Sem grupo");
      const fixedPaTarget = cadence ? paTargetForGroup(groupValue) : null;
      if (cadence && !fixedPaTarget)
        throw new Error(
          `${sheet.name}, linha ${n}: grupo do PA inválido. Use P1, P2, P3, P4 ou P5.`,
        );
      const metric = cadence
        ? "VN"
        : normalize(val(metricCol)) === "VENDANOVA"
          ? "VN"
          : normalize(val(metricCol)) === "ARRECADACAO"
            ? "AR"
            : null;
      if (!metric)
        throw new Error(`${sheet.name}, linha ${n}: métrica não reconhecida.`);
      const paCode = cadence ? code(val(pa)) : null;
      if (cadence && !/^\d+$/.test(paCode))
        throw new Error(`${sheet.name}, linha ${n}: código do PA inválido.`);
      const key = `${source}:${central}:${cooperative}:${paCode ?? ""}:${metric}`;
      if (seen.has(key))
        throw new Error(
          `Registro duplicado na linha ${n}: ${cooperative}${cadence ? ` / PA ${paCode}` : ""}. Corrija a base para evitar dupla contagem.`,
        );
      seen.add(key);
      const cutoff = cadence
        ? config.cadenceCutoff
        : metric === "VN"
          ? config.vnCutoff
          : config.arCutoff;
      if (!validCutoff(cutoff, config.year))
        throw new Error(
          `Informe a data de corte de ${cadence ? "Cadência PA" : metric === "VN" ? "Venda Nova" : "Arrecadação"} no ano selecionado.`,
        );
      const sourceMonthlyTarget = cadence && monthly ? number(val(monthly)) : null;
      const sourceAnnualTarget = cadence && annual ? number(val(annual)) : null;
      const historicalPa = cadence && (config.paTargetMode === "source" || (config.year < 2026 && config.paTargetMode !== "group"));
      const historicalTargets = targetColumns.some(Boolean) ? targetColumns.map(col => col ? number(val(col)) : null) : sourceMonthlyTarget != null ? Array(12).fill(sourceMonthlyTarget) : distributeAmount(sourceAnnualTarget);
      const importedAnnualTarget = cadence ? historicalPa ? sourceAnnualTarget ?? (historicalTargets.every(value => value != null) ? sum(historicalTargets) : null) : fixedPaTarget.annual : number(val(annual));
      const annualOnly = !cadence && targetColumns.every((column) => !column);
      const targets = cadence
        ? historicalPa ? historicalTargets : Array(12).fill(fixedPaTarget.monthly)
        : annualOnly ? distributeAmount(importedAnnualTarget)
          : targetColumns.map((col) => col ? number(val(col)) : null);
      if (targets.some((v) => v != null && v < 0))
        throw new Error(`Linha ${n}: meta negativa. Verifique a origem.`);
      const actuals = realColumns.map((col) => (col ? number(val(col)) : null));
      const centralNameValue = centralNameColumn ? val(centralNameColumn) : null;
      const centralName = typeof centralNameValue === "string" ? centralNameValue.trim()
        : typeof centralNameValue === "number" && Number.isFinite(centralNameValue) ? String(centralNameValue) : "";
      const cooperativeName = String(val(name) || `Cooperativa ${cooperative}`);
      const displayName = cadence
        ? String(val(paName) || `PA ${paCode} — nome não informado`)
        : cooperativeName;
      const issue = (message) =>
        issues.push({
          kind: "source",
          message: `${filename} · ${sheet.name}:${n} · ${message}`,
          central,
          cooperative,
        });
      if (historicalPa) issue("Metas históricas da planilha preservadas. Metas ausentes permanecem sem informação; a regra P1–P5 de 2026 não foi aplicada.");
      if (cadence && !val(paName))
        issue(`Nome do PA ${paCode} ausente ou com erro; valores preservados.`);
      if (!cadence && targets.some((v) => v == null))
        issue("Meta ausente ou não numérica; não será tratada como zero.");
      if (annualOnly && importedAnnualTarget != null)
        issue("Base com meta anual: valor distribuído igualmente nos 12 meses, com ajuste de centavos. O cadastro permite ajustar a distribuição.");
      if (
        cadence && !historicalPa &&
        sourceMonthlyTarget != null &&
        Math.abs(sourceMonthlyTarget - fixedPaTarget.monthly) > 0.011
      )
        issue(
          `Meta mensal da fonte (${sourceMonthlyTarget}) difere da regra fixa de ${groupValue} (${fixedPaTarget.monthly}); a regra fixa foi aplicada.`,
        );
      if (
        cadence && !historicalPa &&
        sourceAnnualTarget != null &&
        Math.abs(sourceAnnualTarget - fixedPaTarget.annual) > 0.011
      )
        issue(
          `Meta anual da fonte (${sourceAnnualTarget}) difere da regra fixa de ${groupValue} (${fixedPaTarget.annual}); a regra fixa foi aplicada.`,
        );
      const last = day(cutoff).getUTCMonth();
      if (actuals.slice(0, last + 1).some((v) => v == null))
        issue("Há realizado ausente ou inválido antes do corte.");
      if (actuals.slice(last + 1).some((v) => v != null && v !== 0))
        issue(
          "Há valores após o corte informado; ficam fora dos indicadores até o corte ser atualizado.",
        );
      if (actuals.some((v) => v != null && v < 0))
        issue("Ajuste negativo preservado no realizado.");
      const annualTarget = importedAnnualTarget;
      if (!cadence && annualTarget == null)
        issue(
          "Meta anual ausente ou inválida; informe a meta oficial para a visão anual.",
        );
      if (annualTarget != null && annualTarget < 0)
        throw new Error(`Linha ${n}: meta anual negativa.`);
      if (
        annualTarget != null &&
        targets.every((v) => v != null) &&
        Math.abs(sum(targets) - annualTarget) > 0.011
      )
        issue(
          `Meta anual (${annualTarget}) difere da soma mensal (${sum(targets)}); meta anual preservada e projeção anual suspensa até conferência.`,
        );
      rows.push({
        key,
        source,
        central,
        ...(centralName ? { centralName } : {}),
        cooperative,
        cooperativeName,
        pa: paCode,
        group: groupValue,
        name: displayName,
        metric,
        targets,
        actuals,
        annualTarget,
        targetRule: cadence ? historicalPa ? "manual" : "group-fixed" : "source",
        sourceMonthlyTarget,
        sourceAnnualTarget,
        cutoff,
        sourceFile: filename,
        sheet: sheet.name,
        sourceRow: n,
      });
    }
  }
  if (!rows.length)
    throw new Error(
      allowedCentrals
        ? `Nenhum registro das centrais permitidas (${[...allowedCentrals].join(", ")}) foi encontrado no layout reconhecido.`
        : "Nenhum registro de central foi encontrado no layout reconhecido.",
    );
  issues.unshift({
    kind: "method",
    message:
      kind === "cadence"
        ? (config.paTargetMode === "source" || (config.year < 2026 && config.paTargetMode !== "group")) ? "Cadência PA: metas históricas da fonte, sem substituir pela política de 2026." : "Cadência PA: a meta fixa é definida pelo grupo (P1 a P5). MÊS e ANO são usados somente na conferência da regra e as metas dos PAs não substituem as metas das cooperativas."
        : "Base de cooperativas: totais e percentuais são recalculados dos meses; META_PER e REAL_PER não são usados.",
  });
  return { source: kind, rows, issues, skipped, filename };
}
export function combineImports(parts, config) {
  if (!parts.length || parts.length > 2)
    throw new Error("Selecione uma ou duas planilhas para a análise.");
  if (new Set(parts.map((p) => p.source)).size !== parts.length)
    throw new Error(
      "Selecione apenas um arquivo de cada tipo (base e cadência).",
    );
  const sourceRows = parts.flatMap((p) => p.rows);
  // A base row may precede the cadence row that supplies the central's name.
  // Fill absent names before registry initialization fixes the first identity.
  const centralNames = new Map();
  for (const row of sourceRows) {
    if (row.centralName && !centralNames.has(row.central)) centralNames.set(row.central, row.centralName);
  }
  const rows = sourceRows.map((row) => ({
    ...row,
    ...(!row.centralName && centralNames.has(row.central) ? { centralName: centralNames.get(row.central) } : {}),
    // The fixed-registration flow intentionally clears `actuals` in the UI before
    // merge. Keep the observed values transiently so registry.mjs can import the
    // initial realized amounts once, then discard these fields before persistence.
    __importActuals: [...row.actuals],
    __importCutoff: inferredActualCutoff(row.actuals, config.year),
  }));
  return {
    version: 2,
    year: config.year,
    importedAt: new Date().toISOString(),
    config,
    paTargetPolicy: {
      version: PA_TARGET_POLICY_VERSION,
      groups: PA_GROUP_TARGETS,
    },
    rows,
    issues: [...parts.flatMap((p) => p.issues), ...reconcile(rows)],
    sources: parts.map((p) => ({
      filename: p.filename,
      type: p.source,
      rows: p.rows.length,
      skipped: p.skipped,
    })),
  };
}
