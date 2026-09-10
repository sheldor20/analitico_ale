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

function cutoffText(section) {
  return section.cutoffMin !== section.cutoff ? `Posições entre ${dateLabel(section.cutoffMin)} e ${dateLabel(section.cutoff)}; cortes diferentes, sem posição única.` : `Posição em ${dateLabel(section.cutoff)}.`;
}
function scenarioLines(values, title) {
  return [
    title,
    `Meta: ${money(values.target)}. Realizado informado: ${money(values.actual)} (${values.phase}).`,
    `Atingimento: ${percent(values.attainment)}. Projeção de fechamento: ${money(values.projected)} (${percent(values.projectedAttainment)}).`,
    `Saldo para a meta: ${money(values.gap)}. Gap projetado: ${money(values.projectionGap)}.`,
    `Ritmo necessário: ${money(values.requiredDaily)}/dia útil e ${money(values.requiredMonthly)}/mês equivalente.`,
    `Situação: ${values.status}.`,
  ];
}
const method = "Projeções são estimativas, não resultados garantidos. Dias úteis: segunda a sexta, sem feriados. Mês equivalente considera o prazo restante. Dados ausentes não são zero.";
function warningText(section) {
  if (!section.current.complete || section.current.annualConflict) return "Há dados incompletos ou metas divergentes. Regularize a base antes de concluir o atingimento e a projeção.";
  return "";
}

const cell = (label, value) => `<td width="50%" valign="top" style="padding:14px;border:1px solid #dbe8e5;background:#f5faf8"><div style="font-size:12px;color:#435c60">${escapeHtml(label)}</div><strong style="display:block;font-size:20px;line-height:1.4;color:#003641">${escapeHtml(value)}</strong></td>`;
function cards(values) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed"><tr>${cell("Meta do período", money(values.target))}${cell("Realizado informado", money(values.actual))}</tr><tr>${cell("Atingimento", percent(values.attainment))}${cell("Projeção de fechamento", money(values.projected))}</tr><tr>${cell("Saldo para a meta", money(values.gap))}${cell("Necessário por dia útil", money(values.requiredDaily))}</tr></table>`;
}

export function renderPortfolioCommunication(report, { names = [], intro = "", signature = "", subject = "" } = {}) {
  const entity = report.entity;
  const scope = `${KIND_LABELS[entity.kind]} ${entity.kind === "central" ? entity.central : entity.kind === "cooperative" ? entity.cooperative : entity.pa} · ${entity.name}`;
  const hierarchy = `Central ${entity.central}${entity.cooperative ? ` · Cooperativa ${entity.cooperative}` : ""}${entity.kind === "pa" ? ` · PA ${entity.pa}${entity.group ? ` · ${entity.group}` : ""}` : ""}`;
  const people = names.map(plainName).filter(Boolean);
  const greeting = people.length === 1 ? `Olá, ${people[0]}!` : "Olá, equipe!";
  const opening = intro.trim() || `Segue o cenário da carteira de ${scope}, para acompanhamento das metas e definição das próximas ações.`;
  const title = subject.trim() || `Cenário da carteira | ${scope} | ${report.periodLabel} · ${MONTHS[report.month]}/${report.year}`;
  const header = [greeting, "", opening, hierarchy, `Período: ${report.periodLabel} · referência ${MONTHS[report.month]}/${report.year}.`];
  if (report.uplift) header.push(`Simulação: aumento de ritmo de ${report.uplift}% aplicado somente à produção futura; não altera metas ou realizado.`);
  if (report.period === "daily") header.push("A fonte é mensal: este é um cenário de esforço diário. Não há realizado diário disponível.");
  const sections = report.sections.flatMap((section) => {
    if (!section.available) return ["", section.label, "Sem dados cadastrados para este indicador nesta unidade."];
    const current = section.current;
    return ["", section.label, cutoffText(section), ...scenarioLines(current, `${report.periodLabel}: ${dateLabel(current.start)} a ${dateLabel(current.end)}`),
      ...(report.period !== "annual" ? ["", ...scenarioLines(section.annual, `Cenário anual de ${report.year} (separado do período selecionado)`)] : []),
      ...(entity.kind === "central" && section.childCount > 1 ? [`Saldo para que todas as ${section.childCount} cooperativas atinjam 100%: ${money(section.individualGap)} (não compensado pela superação de outras unidades).`, ...section.priorities.map((item) => `Prioridade: ${item.name} — saldo ${money(item.gap)}.`)] : []),
      ...(warningText(section) ? [warningText(section)] : []),
      `Próxima ação: ${section.action}`];
  });
  const text = [...header, ...sections, "", method, ...(signature.trim() ? ["", signature.trim()] : [])].join("\n");
  const whatsapp = [greeting, "", `*Cenário da carteira — ${plainName(scope)}*`, hierarchy, `*${report.periodLabel} · ${MONTHS[report.month]}/${report.year}*`, opening, ...header.slice(5), ...sections.map((line) => report.sections.some((section) => section.label === line) ? `*${line}*` : line), "", method, ...(signature.trim() ? ["", signature.trim()] : [])].join("\n");
  const paragraphs = (lines) => lines.filter(Boolean).map((line) => `<p style="margin:8px 0;line-height:1.6">${escapeHtml(line).replace(/\n/g, "<br>")}</p>`).join("");
  const panels = report.sections.map((section) => {
    if (!section.available) return `<h2>${escapeHtml(section.label)}</h2><p>Sem dados cadastrados para este indicador nesta unidade.</p>`;
    const values = section.current;
    const monthlyRows = section.monthly.map((month) => `<tr><td style="padding:8px;border-bottom:1px solid #dbe8e5">${month.label}</td><td align="right" style="padding:8px;border-bottom:1px solid #dbe8e5">${escapeHtml(money(month.target))}</td><td align="right" style="padding:8px;border-bottom:1px solid #dbe8e5">${escapeHtml(money(month.actual))}</td><td style="padding:8px;border-bottom:1px solid #dbe8e5">${escapeHtml(month.phase)}</td></tr>`).join("");
    return `<h2 style="font-size:22px;margin:26px 0 8px;color:#003641">${escapeHtml(section.label)}</h2>${paragraphs([cutoffText(section), `${report.periodLabel}: ${dateLabel(values.start)} a ${dateLabel(values.end)} · ${values.status}`])}${cards(values)}${paragraphs([`Projeção: ${percent(values.projectedAttainment)} da meta. Gap projetado: ${money(values.projectionGap)}.`, `Ritmo necessário: ${money(values.requiredMonthly)}/mês equivalente. Realizado: ${values.phase}.`])}${report.period !== "annual" ? `<h3 style="margin:20px 0 8px;color:#003641">Cenário anual · ${report.year}</h3>${paragraphs(scenarioLines(section.annual, ""))}` : ""}${entity.kind === "central" && section.childCount > 1 ? paragraphs([`Saldo individual para todas as ${section.childCount} cooperativas atingirem 100%: ${money(section.individualGap)}.`, ...section.priorities.map((item) => `Prioridade: ${item.name} — saldo ${money(item.gap)}.`)]) : ""}${paragraphs([warningText(section), `Próxima ação: ${section.action}`])}<h3 style="margin:20px 0 8px;color:#003641">Evolução mensal · ${report.year}</h3><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px"><thead><tr style="background:#003641;color:#fff"><th align="left" style="padding:8px">Mês</th><th align="right" style="padding:8px">Meta</th><th align="right" style="padding:8px">Realizado</th><th align="left" style="padding:8px">Posição</th></tr></thead><tbody>${monthlyRows}</tbody></table>`;
  }).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f5faf8;font-family:Arial,Tahoma,sans-serif;color:#003641"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:12px"><table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#fff"><tr><td style="padding:24px;background:#003641;color:#fff;border-top:6px solid #00ae9d"><div style="font-size:12px;letter-spacing:1px">GESTÃO COMERCIAL · CENÁRIO DA CARTEIRA</div><h1 style="font-size:24px;line-height:1.35;margin:12px 0">${escapeHtml(scope)}</h1><div>${escapeHtml(report.periodLabel)} · ${MONTHS[report.month]}/${report.year}</div></td></tr><tr><td style="padding:24px;font-size:14px">${paragraphs(header)}${panels}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #dbe8e5;font-size:12px">${paragraphs([method, signature.trim()])}</div></td></tr></table></td></tr></table></body></html>`;
  return { subject: title, text, whatsapp, html };
}

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
