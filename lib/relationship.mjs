export const CAPITAL_MODALITIES = ["Não informado", "Fixo", "Vinculado", "Variável", "Outro"];
export const APPOINTMENT_KINDS = { visit: "Visita", training: "Treinamento", meeting: "Reunião", call: "Ligação" };
export const APPOINTMENT_STATUSES = { scheduled: "Agendado", completed: "Concluído", cancelled: "Cancelado" };
export const RATE_UNITS = { percent: "% do capital", permille: "‰ do capital", brl: "R$" };
export const RATE_PERIODS = { monthly: "Ao mês", annual: "Ao ano", single: "Pagamento único" };
export const TIMEZONES = { "America/Sao_Paulo": "Brasília (UTC−3)", "America/Manaus": "Manaus (UTC−4)", "America/Rio_Branco": "Rio Branco (UTC−5)", "America/Noronha": "Fernando de Noronha (UTC−2)" };

const text = (value, label, max, required = false) => {
  if (typeof value !== "string") throw new Error(`${label}: informe um texto válido.`);
  const result = value.trim();
  if (required && !result) throw new Error(`Informe ${label.toLowerCase()}.`);
  if (result.length > max) throw new Error(`${label}: limite de ${max} caracteres.`);
  return result;
};
function dateOnly(value, label) {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new Error(`${label}: informe uma data válida.`);
  return value;
}
function choice(value, options, label) {
  if (!Object.hasOwn(options, value)) throw new Error(`${label}: selecione uma opção válida.`);
  return value;
}

/** A stored rate always keeps its unit and period; blank is never silently zero. */
export function validateProfile(input) {
  if (!CAPITAL_MODALITIES.includes(input.capitalModality)) throw new Error("Selecione a modalidade de capital.");
  if (!Array.isArray(input.rateTables) || input.rateTables.length > 30) throw new Error("Cadastre até 30 tabelas de taxas por unidade.");
  const identifiers = new Set();
  const rateTables = input.rateTables.map((row) => {
    const id = text(row.id, "Identificador da tabela", 80, true);
    if (identifiers.has(id)) throw new Error("Existem tabelas com identificador repetido.");
    identifiers.add(id);
    const name = text(row.name, "Nome da tabela", 160, true);
    const unit = choice(row.unit, RATE_UNITS, "Unidade da taxa");
    const period = choice(row.period, RATE_PERIODS, "Período da taxa");
    const raw = typeof row.rate === "number" ? String(row.rate) : String(row.rate ?? "").trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) throw new Error(`${name}: informe uma taxa válida, com até 6 casas decimais.`);
    const rate = Number(raw);
    const limit = unit === "percent" ? 100 : unit === "permille" ? 1000 : 1e12;
    if (!Number.isFinite(rate) || rate < 0 || rate > limit) throw new Error(`${name}: taxa fora do limite da unidade selecionada.`);
    const validFrom = dateOnly(row.validFrom, "Início da vigência");
    const validUntil = dateOnly(row.validUntil, "Fim da vigência");
    if (validUntil && validFrom && validUntil < validFrom) throw new Error(`${name}: fim da vigência deve ser igual ou posterior ao início.`);
    return { id, name, rate, unit, period, validFrom, validUntil, notes: text(row.notes, "Condições da tabela", 2000) };
  });
  return { capitalModality: input.capitalModality, capitalNotes: text(input.capitalNotes, "Condições do capital", 4000), rateTables,
    collectionNotes: text(input.collectionNotes, "Arrecadação", 4000), newSalesNotes: text(input.newSalesNotes, "Venda nova", 4000), generalNotes: text(input.generalNotes, "Observações", 4000) };
}

export function zonedDateTimeInput(iso, timezone = "America/Sao_Paulo") {
  choice(timezone, TIMEZONES, "Fuso horário");
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error("Data do compromisso inválida.");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Convert the explicit calendar timezone, independent of the browser/device zone. */
export function zonedDateTimeISO(value, timezone = "America/Sao_Paulo") {
  choice(timezone, TIMEZONES, "Fuso horário");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Informe data e horário do compromisso.");
  dateOnly(value.slice(0, 10), "Data do compromisso");
  const utc = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(utc)) throw new Error("Horário do compromisso inválido.");
  let timestamp = utc;
  for (let index = 0; index < 3; index++) {
    const displayed = zonedDateTimeInput(new Date(timestamp).toISOString(), timezone);
    timestamp += utc - Date.parse(`${displayed}:00Z`);
  }
  const result = new Date(timestamp).toISOString();
  if (zonedDateTimeInput(result, timezone) !== value) throw new Error("Horário não disponível no fuso selecionado.");
  return result;
}

/** No minimum notice: past, current and future appointments use the same checks.
 * Only the local workspace year and a positive duration of at most seven days apply.
 */
export function validateAppointment(input, year) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("Ano do cadastro inválido.");
  const title = text(input.title, "Título do compromisso", 160, true);
  const kind = choice(input.kind, APPOINTMENT_KINDS, "Tipo de compromisso");
  const status = choice(input.status, APPOINTMENT_STATUSES, "Situação");
  const timezone = choice(input.timezone, TIMEZONES, "Fuso horário");
  const start = new Date(input.startsAt); const end = new Date(input.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error("Informe início e fim do compromisso.");
  if (end <= start) throw new Error("O fim deve ser posterior ao início do compromisso.");
  if (end.getTime() - start.getTime() > 7 * 24 * 60 * 60 * 1000) throw new Error("Cada compromisso pode durar até 7 dias.");
  if (Number(zonedDateTimeInput(start.toISOString(), timezone).slice(0, 4)) !== year) throw new Error(`O compromisso deve começar no ano ${year}.`);
  return { title, kind, status, timezone, startsAt: start.toISOString(), endsAt: end.toISOString(), location: text(input.location, "Local ou link", 500), notes: text(input.notes, "Observações", 4000) };
}

export function relationshipHierarchy(entities, selected) {
  const central = entities.find((entity) => entity.kind === "central" && entity.central === selected.central);
  const cooperative = selected.kind !== "central" ? entities.find((entity) => entity.kind === "cooperative" && entity.central === selected.central && entity.cooperative === selected.cooperative) : null;
  const parents = [central, cooperative].filter((entity) => entity && entity.id !== selected.id);
  const children = entities.filter((entity) => selected.kind === "central"
    ? entity.kind === "cooperative" && entity.central === selected.central
    : selected.kind === "cooperative" && entity.kind === "pa" && entity.central === selected.central && entity.cooperative === selected.cooperative);
  return { parents, children: [...children].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true })) };
}

export function calendarDays(month) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) throw new Error("Mês do calendário inválido.");
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first); date.setUTCDate(index - offset + 1);
    return { date: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: date.toISOString().startsWith(month) };
  });
}
