import {
  CENTRALS,
  MONTHS,
  PA_GROUP_TARGETS,
  actionFor,
  money,
  percent,
  sum,
  summarize,
} from "./analytics.mjs";

const finite = (value) => Number.isFinite(value);
const totalWhenComplete = (analyses, key) =>
  analyses.length && analyses.every((item) => finite(item[key]))
    ? sum(analyses.map((item) => item[key]))
    : null;

const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(new Date(`${value}T12:00:00Z`).getTime());
const dateLabel = (value) =>
  validDate(value)
    ? new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR", {
        timeZone: "UTC",
      })
    : "data não informada";

const needsValidation = (item) =>
  !item.complete ||
  !finite(item.target) ||
  item.target <= 0 ||
  item.annualConflict ||
  !finite(item.actual);
const analysisLevel = (item) => {
  const level = item.aggregateLevel || item.level || String(item.key || "").match(/:(central|cooperative):/)?.[1];
  if (level === "central" || level === "cooperative") return level;
  if (item.source === "base" && !item.cooperative) return "central";
  return item.source === "cadence" ? "pa" : "cooperative";
};
const identity = (item, source = item.source) =>
  analysisLevel(item) === "central"
    ? `${item.central ? `${item.central} · ` : ""}${item.centralName || item.name || CENTRALS[item.central] || "Central sem nome"}`
    : source === "cadence" && analysisLevel(item) === "pa"
    ? `${item.cooperativeName || item.cooperative || "Cooperativa sem nome"} · PA ${item.pa ?? "sem código"}${item.group ? ` · ${item.group}` : ""}`
    : `${item.cooperative ? `${item.cooperative} · ` : ""}${item.cooperativeName || item.name || "Cooperativa sem nome"}`;
const gapPriorities = (analyses) =>
  analyses
    .filter((item) => !needsValidation(item) && finite(item.gap) && item.gap > 0)
    .sort((a, b) => b.gap - a.gap || (a.attainment ?? 0) - (b.attainment ?? 0));

function cutoffDescription(analyses, fallback) {
  const dates = analyses
    .flatMap((item) => [item.cutoffMin, item.cutoff])
    .filter(validDate)
    .sort();
  if (!dates.length)
    return validDate(fallback)
      ? `com posição em ${dateLabel(fallback)}`
      : "com data de atualização não informada";
  const first = dates[0];
  const last = dates.at(-1);
  return first === last
    ? `com posição em ${dateLabel(first)}`
    : `com posições entre ${dateLabel(first)} e ${dateLabel(last)}. Os registros têm datas de corte diferentes; os totais não representam uma posição única`;
}

function targetDescription(analyses, source, level) {
  if (level === "central")
    return [
      "Metas consideradas: valores consolidados por central, respeitando a distribuição mensal e o período selecionado.",
    ];
  if (source === "base" || level === "cooperative")
    return [
      "Metas consideradas: cadastro das cooperativas, respeitando a distribuição mensal e o período selecionado.",
    ];
  const manual = analyses.filter((item) =>
    ["manual", "registry"].includes(item.targetRule),
  );
  const fixedGroups = [...new Set(
    analyses
      .filter((item) => !["manual", "registry"].includes(item.targetRule))
      .map((item) => item.group),
  )].filter((group) => PA_GROUP_TARGETS[group]).sort();
  const lines = [];
  if (fixedGroups.length)
    lines.push(`Metas fixas dos grupos selecionados: ${fixedGroups
      .map((group) => {
        const target = PA_GROUP_TARGETS[group];
        return `${group} ${money(target.monthly)}/mês (${money(target.annual)}/ano)`;
      })
      .join("; ")}.`);
  if (manual.length) {
    lines.push("Metas cadastradas individualmente (prevalecem sobre o padrão do grupo):");
    const grouped = new Map();
    for (const item of manual) {
      const key = JSON.stringify([item.group || "Sem grupo", item.target, item.annualTarget]);
      if (!grouped.has(key)) grouped.set(key, { item, count: 0 });
      grouped.get(key).count++;
    }
    const targetGroups = [...grouped.values()].sort((a, b) =>
      b.count - a.count || String(a.item.group || "").localeCompare(String(b.item.group || "")),
    );
    const shown = targetGroups.slice(0, 5);
    lines.push(...shown.map(({ item, count }) =>
      `• ${count === 1 ? identity(item, source) : `${count} PAs · ${item.group || "Sem grupo"}`}: ${money(item.target)} no período; ${money(item.annualTarget)} no ano${count > 1 ? " por PA" : ""}.`,
    ));
    const omitted = manual.length - sum(shown.map(({ count }) => count));
    if (omitted > 0)
      lines.push(`Outros ${omitted} ${omitted === 1 ? "PA tem metas específicas" : "PAs têm metas específicas"}, já incluídas no total da seleção. Consulte a exportação da análise para verificar todas as metas individuais.`);
  }
  if (!lines.length)
    lines.push("Metas do período conforme a seleção; os registros sem meta exigem cadastro antes da análise de atingimento.");
  return lines;
}

/**
 * Decision support uses only the selected population and never treats unknowns as zero.
 * @param {any[]} [analyses]
 * @returns {{title: string, detail: string, tone: "positive" | "warning" | "neutral"}[]}
 */
export function buildDecisionInsights(analyses = []) {
  if (!analyses.length)
    return [{ title: "Sem registros", detail: "Ajuste os filtros ou cadastre a base para iniciar a análise.", tone: "neutral" }];
  const sources = new Set(analyses.map((item) => item.source).filter(Boolean));
  const metrics = new Set(analyses.map((item) => item.metric).filter(Boolean));
  if (sources.size > 1 || metrics.size > 1)
    return [{ title: "Seleção com bases diferentes", detail: "Analise cooperativas e PAs separadamente e selecione um único indicador para evitar dupla contagem.", tone: "warning" }];

  const insights = [];
  const pending = analyses.filter(needsValidation);
  const eligible = analyses.filter((item) => !needsValidation(item));
  const priorities = gapPriorities(analyses);
  if (pending.length)
    insights.push({
      title: "Regularizar informações",
      detail: `${pending.length} de ${analyses.length} registros têm realizado incompleto, meta ausente ou metas divergentes. Atualize esses cadastros antes de concluir o atingimento consolidado.`,
      tone: "warning",
    });

  const individualGap = sum(priorities.map((item) => item.gap));
  if (priorities.length) {
    const largest = priorities.slice(0, 3);
    const concentrated = sum(largest.map((item) => item.gap));
    insights.push({
      title: "Concentração do saldo",
      detail: `${largest.map((item) => identity(item)).join("; ")} concentram ${percent(concentrated / individualGap)} do saldo individual (${money(concentrated)})${pending.length ? " entre registros válidos" : ""}. Priorize o acompanhamento desses responsáveis.`,
      tone: "warning",
    });
  }

  const inactive = eligible.filter((item) => item.actual === 0 && item.remainingDays > 0 && item.phase === "Parcial");
  if (inactive.length)
    insights.push({
      title: "Ativar produção",
      detail: `${inactive.length} ${inactive.length === 1 ? "registro com meta e período em andamento ainda tem" : "registros com meta e período em andamento ainda têm"} realizado zero. Retome oportunidades e defina responsáveis pela primeira produção.`,
      tone: "warning",
    });

  if (eligible.length) {
    const target = sum(eligible.map((item) => item.target));
    const actual = sum(eligible.map((item) => item.actual));
    const attainment = target > 0 ? actual / target : null;
    insights.push({
      title: pending.length ? "Atingimento dos registros válidos" : "Atingimento ponderado",
      detail: `${money(actual)} realizados de ${money(target)} em metas: ${percent(attainment)}. O percentual usa a soma de valores${pending.length ? ` dos ${eligible.length} registros válidos` : " da seleção"}, sem média simples de percentuais.${attainment >= 1 && priorities.length ? " A superação consolidada ainda deixa unidades com saldo individual." : ""}`,
      tone: attainment >= 1 && !priorities.length ? "positive" : "neutral",
    });
  }

  const activePriorities = priorities.filter((item) => item.remainingDays > 0);
  const monthly = totalWhenComplete(activePriorities, "requiredMonthly");
  if (monthly != null && monthly > 0)
    insights.push({
      title: "Esforço de recuperação",
      detail: `${activePriorities.length === 1 ? "A unidade com saldo e prazo aberto precisa produzir" : `As ${activePriorities.length} unidades com saldo e prazo aberto precisam somar`} ${money(monthly)} por mês equivalente, conforme o prazo restante de cada registro. Distribua esse esforço entre os responsáveis.`,
      tone: "neutral",
    });
  return insights;
}

/**
 * @param {object} options
 * @param {any[]} [options.analyses]
 * @param {number} options.year
 * @param {number} options.month
 * @param {string} [options.periodLabel]
 * @param {string} [options.scopeLabel]
 * @param {string} [options.cutoff]
 * @param {string} [options.group]
 * @param {number} [options.uplift]
 * @param {"base" | "cadence"} [options.source]
 * @param {string} [options.metric]
 */
export function buildPartialCommunication({
  analyses = [],
  year,
  month,
  periodLabel,
  scopeLabel,
  cutoff,
  group = "all",
  uplift = 0,
  source = "cadence",
  metric = "VN",
}) {
  // The two source populations can overlap; do not combine them in a total.
  analyses = analyses.filter((item) =>
    (!item.source || item.source === source) &&
    (!item.metric || item.metric === metric) &&
    (source !== "cadence" || group === "all" || item.group === group),
  );
  if (!analyses.length)
    throw new Error(`Não há ${source === "cadence" ? "PAs" : "cooperativas"} na seleção para gerar a comunicação.`);

  const summary = summarize(analyses);
  const selectedLevels = new Set(analyses.map(analysisLevel));
  const level = selectedLevels.size === 1 ? analysisLevel(analyses[0]) : "unit";
  const isPA = level === "pa";
  const isCentral = level === "central";
  const unit = isPA ? "PA" : isCentral ? "central" : level === "cooperative" ? "cooperativa" : "unidade";
  const units = isPA ? "PAs" : isCentral ? "centrais" : level === "cooperative" ? "cooperativas" : "unidades";
  const allUnits = isPA ? "todos os PAs" : `todas as ${units}`;
  const capitalUnits = isPA ? "Cadência PA" : units[0].toUpperCase() + units.slice(1);
  const entityLabel = analyses.length === 1 ? unit : units;
  const selectedScope = scopeLabel || "Seleção atual";
  const pending = analyses.filter(needsValidation);
  const isIncomplete = pending.length > 0;
  const isPartial = analyses.some((item) => item.phase === "Parcial");
  const allClosed = analyses.every((item) => item.phase === "Fechado");
  const scenarioName = isIncomplete
    ? `${isPartial ? "parcial " : ""}com dados incompletos`
    : allClosed ? "fechado" : "parcial";
  const expected = isIncomplete ? null : totalWhenComplete(analyses, "expected");
  const requiredMonthly = totalWhenComplete(analyses, "requiredMonthly");
  const priorities = gapPriorities(analyses).slice(0, 5);
  const allMet = !isIncomplete && analyses.every((item) => item.gap === 0 && item.actual >= item.target);
  const metricLabel = metric === "AR" ? "Arrecadação" : "Venda Nova";
  const populationLabel = isPA ? "Cadência Comercial dos PAs" : `Acompanhamento das ${capitalUnits}`;
  const body = [
    "Prezados, bom dia!",
    "",
    `Segue o cenário ${scenarioName} de ${metricLabel} — ${populationLabel}, ${cutoffDescription(analyses, cutoff)}.`,
    `Abrangência: ${selectedScope}.`,
    `Período analisado: ${periodLabel || "Período selecionado"}.`,
    `Objetivo: priorizar a atuação comercial e acompanhar a evolução das metas de ${units}.`,
    "",
    `Meta do período: ${money(summary.target)}.`,
    `Realizado informado: ${money(summary.actual)} (${percent(summary.attainment)} da meta; percentual ponderado pela soma das metas).`,
    `Meta esperada até as datas de corte: ${money(expected)}.`,
    `Projeção de fechamento: ${money(summary.projected)} (${percent(summary.projectedAttainment)} da meta${uplift ? `, com cenário de ritmo +${uplift}%` : ""}).`,
    `Saldo consolidado para a meta: ${money(summary.gap)}.`,
    `Saldo para que ${allUnits} atinjam 100%: ${money(summary.individualGap)}.`,
    `Soma do ritmo necessário por registro: ${money(summary.requiredDaily)} por dia útil e ${money(requiredMonthly)} por mês equivalente, respeitando o prazo restante de cada registro.`,
    `Situação: ${summary.onTrack} de ${analyses.length} ${entityLabel} com meta atingida ou em rota; ${summary.attention} ${summary.attention === 1 ? "precisa" : "precisam"} de atenção.`,
    ...(isIncomplete ? [
      `Pendências de informação: ${pending.length} ${pending.length === 1 ? "registro" : "registros"}. Não é possível confirmar o atingimento de toda a seleção enquanto houver realizado incompleto, meta ausente ou divergência de metas.`,
    ] : []),
    "",
    "Prioridades de atuação (maior saldo individual primeiro):",
    ...(priorities.length
      ? priorities.map((item, index) =>
          `${index + 1}. ${identity(item, source)}: saldo ${money(item.gap)}. ${actionFor(item).text}`,
        )
      : [allMet
          ? `${allUnits[0].toUpperCase() + allUnits.slice(1)} da seleção estão com a meta atingida.`
          : "Não há prioridades de produção calculáveis com os dados atuais. Regularize as informações pendentes antes de definir o plano de produção."]),
    ...(isIncomplete ? [
      "",
      "Cadastros a validar:",
      ...pending.slice(0, 5).map((item) => `• ${identity(item, source)}: ${actionFor(item).text}`),
      ...(pending.length > 5 ? [`Há mais ${pending.length - 5} registros com pendências; consulte a seleção completa no painel.`] : []),
    ] : []),
    "",
    ...targetDescription(analyses, source, level),
    "",
    "Os resultados parciais e as projeções dependem da atualização e da confirmação da produção; não substituem o fechamento oficial.",
    `Contamos com a atuação dos responsáveis para acompanhar ${isPA ? "os PAs" : `as ${units}`} e transformar as oportunidades em produção.`,
  ].join("\n");

  return {
    subject: `Cenário ${scenarioName} · ${capitalUnits} · ${metricLabel} · ${selectedScope} · ${MONTHS[month] || "Período"}/${year}`,
    body,
    isPartial: isPartial || (!allClosed && !isIncomplete),
    isIncomplete,
    summary,
    priorities,
    missingDataCount: pending.length,
  };
}
