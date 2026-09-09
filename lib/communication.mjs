import {
  MONTHS,
  PA_GROUP_TARGETS,
  actionFor,
  money,
  percent,
  sum,
  summarize,
} from "./analytics.mjs";

const totalWhenComplete = (analyses, key) =>
  analyses.length && analyses.every((item) => item[key] != null)
    ? sum(analyses.map((item) => item[key]))
    : null;

const dateLabel = (value) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
  });

export function buildPartialCommunication({
  analyses,
  year,
  month,
  periodLabel,
  scopeLabel,
  cutoff,
  group = "all",
  uplift = 0,
}) {
  if (!analyses.length)
    throw new Error("Não há PAs na seleção para gerar a comunicação.");

  const summary = summarize(analyses);
  const paLabel = analyses.length === 1 ? "PA" : "PAs";
  const attentionVerb = summary.attention === 1 ? "precisa" : "precisam";
  const expected = totalWhenComplete(analyses, "expected");
  const requiredMonthly = totalWhenComplete(analyses, "requiredMonthly");
  const isPartial = analyses.some((item) => item.phase === "Parcial");
  const scenarioName = isPartial ? "parcial" : "fechado";
  const priorities = analyses
    .filter((item) => (item.gap ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.projectionGap ?? b.gap ?? 0) -
        (a.projectionGap ?? a.gap ?? 0),
    )
    .slice(0, 5);
  const groups = Object.entries(PA_GROUP_TARGETS).filter(
    ([name]) => group === "all" || name === group,
  );

  const body = [
    "Prezados, bom dia!",
    "",
    `Segue o cenário ${scenarioName} da Cadência Comercial dos PAs, com posição em ${dateLabel(cutoff)}.`,
    `Abrangência: ${scopeLabel}.`,
    `Período analisado: ${periodLabel}.`,
    "",
    `Meta do período: ${money(summary.target)}.`,
    `Realizado até o corte: ${money(summary.actual)} (${percent(summary.attainment)} da meta).`,
    `Meta esperada até o corte: ${money(expected)}.`,
    `Projeção de fechamento: ${money(summary.projected)} (${percent(summary.projectedAttainment)} da meta${uplift ? `, com cenário de ritmo +${uplift}%` : ""}).`,
    `Saldo consolidado para a meta: ${money(summary.gap)}.`,
    `Saldo para que todos os PAs atinjam 100%: ${money(summary.individualGap)}.`,
    `Ritmo necessário: ${money(summary.requiredDaily)} por dia útil e ${money(requiredMonthly)} por mês equivalente.`,
    `Situação: ${summary.onTrack} de ${analyses.length} ${paLabel} com meta atingida ou em rota; ${summary.attention} ${attentionVerb} de atenção.`,
    "",
    "Prioridades de atuação:",
    ...(priorities.length
      ? priorities.map(
          (item, index) =>
            `${index + 1}. ${item.cooperativeName} · PA ${item.pa} · ${item.group}: saldo ${money(item.gap)}. ${actionFor(item).text}`,
        )
      : ["Todos os PAs da seleção estão com a meta atingida."]),
    "",
    `Metas fixas consideradas: ${groups
      .map(
        ([name, target]) =>
          `${name} ${money(target.monthly)}/mês (${money(target.annual)}/ano)`,
      )
      .join("; ")}.`,
    "",
    "Contamos com a atuação da cooperativa para manter o acompanhamento dos PAs e transformar as oportunidades em produção.",
  ].join("\n");

  return {
    subject: `Cenário ${scenarioName} · Cadência PA · ${scopeLabel} · ${MONTHS[month]}/${year}`,
    body,
    isPartial,
    summary,
    priorities,
  };
}
