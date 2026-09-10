import { aggregate, analyze, actionFor, money, percent, MONTHS, summarize } from "./analytics.mjs";
import { analysisRows, entityId } from "./registry.mjs";
import { normalizeContactEmails } from "./contact-utils.mjs";

export const PERIOD_LABELS = Object.freeze({ daily: "Diário · esforço mensal", month: "Mensal", quarter: "Trimestral", semester: "Semestral", annual: "Anual", ytd: "Acumulado no ano" });
export const KIND_LABELS = Object.freeze({ central: "Central", cooperative: "Cooperativa", pa: "PA" });
export const LINK_BUDGET = 8000; // Application guard, not a promise about every browser/client.
const metricLabel = (metric) => metric === "AR" ? "Arrecadação" : "Venda Nova";
const numeric = (value) => Number.isFinite(value) ? value : null;
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const dateLabel = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value.split("-").reverse().join("/") : "não informada";
const plainName = (value) => String(value ?? "").replace(/[\r\n*_~`]/g, " ").trim();

export function entityFromAnalysis(row) {
  const kind = row.kind || row.aggregateLevel || row.level || String(row.key ?? "").match(/:(central|cooperative):/)?.[1] || (row.source === "cadence" ? "pa" : row.cooperative ? "cooperative" : "central");
  const entity = { kind, central: String(row.central), name: row.name || row.cooperativeName || `Central ${row.central}` };
  if (kind !== "central") entity.cooperative = String(row.cooperative);
  if (kind === "pa") { entity.pa = String(row.pa); entity.group = row.group || ""; }
  return { ...entity, id: entityId(entity) };
}

export function recipientsForContacts(contacts, year, entity) {
  return contacts.filter((contact) => contact.workspaceYear === year && contact.entityId === entity.id && contact.entityKind === entity.kind && contact.central === entity.central && (entity.kind === "central" || contact.cooperative === entity.cooperative) && (entity.kind !== "pa" || contact.pa === entity.pa));
}

export function normalizeRecipients(values) {
  const entries = typeof values === "string" ? values.split(/[;,\n]+/) : values;
  if (!Array.isArray(entries) || entries.length > 1000) throw new Error("Informe até 100 e-mails nesta comunicação.");
  const emails = entries.flatMap((value) => normalizeContactEmails([value]));
  const unique = [...new Set(emails)];
  if (unique.length > 100) throw new Error("Informe até 100 e-mails nesta comunicação.");
  return unique;
}

export function whatsappNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.length > 40 || !/^\+?[\d\s().-]+$/.test(raw)) throw new Error("WhatsApp inválido. Use DDD e número; para outro país, inclua +DDI.");
  let digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+") && digits.length < 10) throw new Error("Informe o DDD e o número do WhatsApp.");
  if (!raw.startsWith("+") && [10, 11].includes(digits.length)) digits = `55${digits}`;
  if (!/^[1-9]\d{7,14}$/.test(digits) || (digits.startsWith("55") && ![12, 13].includes(digits.length))) throw new Error("Confira o DDI, DDD e número do WhatsApp.");
  return digits;
}

function snapshot(analysis) {
  const values = {};
  for (const key of ["target", "actual", "attainment", "projected", "projectedAttainment", "gap", "projectionGap", "requiredDaily", "requiredMonthly", "remainingDays", "dailyTarget"]) values[key] = numeric(analysis[key]);
  return { ...values, complete: analysis.complete, phase: analysis.phase, status: analysis.status, annualConflict: analysis.annualConflict, start: analysis.start, end: analysis.end };
}

/** Only the exact selected unit and source contribute. Reuses the existing calculation engine. */
export function buildPortfolioReport({ dataset, entity, metric = "VN", includeBoth = false, month = 0, period = "ytd", uplift = 0 }) {
  if (!dataset || !Number.isInteger(dataset.year) || !Number.isInteger(month) || month < 0 || month > 11 || !Object.hasOwn(PERIOD_LABELS, period) || !["VN", "AR"].includes(metric) || !Number.isFinite(uplift) || uplift < 0 || uplift > 1000) throw new Error("Seleção de análise inválida.");
  if (!entity || !Object.hasOwn(KIND_LABELS, entity.kind) || entity.id !== entityId(entity)) throw new Error("Selecione uma unidade válida.");
  if (entity.kind !== "central" && !entity.cooperative || entity.kind === "pa" && entity.pa == null) throw new Error("O vínculo da unidade está incompleto.");
  const source = entity.kind === "pa" ? "cadence" : "base";
  const metrics = source === "cadence" ? ["VN"] : includeBoth ? ["VN", "AR"] : [metric];
  const selectedRows = analysisRows(dataset).filter((row) => row.source === source && row.central === entity.central && (entity.kind === "central" || row.cooperative === entity.cooperative) && (entity.kind !== "pa" || String(row.pa) === entity.pa));
  const sections = metrics.map((code) => {
    const rows = selectedRows.filter((row) => row.metric === code);
    const row = aggregate(rows, entity.kind)[0];
    if (!row) return { metric: code, label: metricLabel(code), available: false };
    const current = analyze(row, { year: dataset.year, month, period, uplift });
    const annual = analyze(row, { year: dataset.year, month, period: "annual", uplift });
    const children = aggregate(rows, entity.kind === "central" ? "cooperative" : entity.kind).map((child) => analyze(child, { year: dataset.year, month, period, uplift }));
    const childSummary = summarize(children);
    return {
      metric: code, label: metricLabel(code), available: true, cutoff: row.cutoff, cutoffMin: row.cutoffMin || row.cutoff,
      current: snapshot(current), annual: snapshot(annual),
      individualGap: numeric(childSummary.individualGap), childCount: children.length,
      action: actionFor(current).text,
      priorities: entity.kind === "central" ? children.filter((child) => child.complete && child.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 3).map((child) => ({ name: `${child.cooperative} · ${child.name}`, gap: child.gap })) : [],
      monthly: MONTHS.map((label, index) => ({ label, ...snapshot(analyze(row, { year: dataset.year, month: index, period: "month", uplift })) })),
    };
  });
  return { version: 1, year: dataset.year, month, period, periodLabel: PERIOD_LABELS[period], source, uplift, entity: { ...entity }, sections };
}

export { buildPortfolioPresentation as renderPortfolioCommunication } from "./portfolio-presentation.mjs";

function safeSubject(value) {
  const subject = String(value ?? "").trim();
  if (!subject || subject.length > 300 || /[\r\n]/.test(subject)) throw new Error("Informe um assunto com até 300 caracteres e sem quebras de linha.");
  return subject;
}
export function buildOutlookLink({ recipients = [], subject, body = "", personal = false }) {
  const emails = normalizeRecipients(recipients);
  const base = personal ? "https://outlook.live.com/mail/0/deeplink/compose" : "https://outlook.office.com/mail/deeplink/compose";
  const head = `${base}?to=${encodeURIComponent(emails.join(";"))}&subject=${encodeURIComponent(safeSubject(subject))}`;
  if (head.length > LINK_BUDGET) throw new Error("Muitos destinatários para um link. Reduza a seleção ou baixe o arquivo de e-mail.");
  const full = `${head}&body=${encodeURIComponent(body)}`;
  return { url: full.length <= LINK_BUDGET ? full : head, requiresPaste: full.length > LINK_BUDGET };
}
export function buildWhatsappLink({ phone = "", body = "" }) {
  const base = `https://wa.me/${whatsappNumber(phone)}`;
  const full = `${base}?text=${encodeURIComponent(body)}`;
  return { url: full.length <= LINK_BUDGET ? full : base, requiresPaste: full.length > LINK_BUDGET };
}
export { buildEmailFile } from "./email-export.mjs";
