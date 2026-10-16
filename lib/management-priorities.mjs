import { money, percent } from './analytics.mjs';

const finite = Number.isFinite;
const cents = value => Math.round(value * 100);
const total = values => values.reduce((sum, value) => sum + value, 0);
const dateLabel = value => value?.split('-').reverse().join('/') || 'Não informada';
const levelOf = row => /:central:/.test(row.key) || !row.cooperative ? 'central' : /:cooperative:/.test(row.key) || row.source === 'base' ? 'cooperative' : 'pa';
const position = row => row.end && row.cutoff > row.end ? row.end : row.cutoff;
const nameOrder = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { numeric: true }) || a.key.localeCompare(b.key);
const gapInCents = row => Math.max(0, cents(row.target) - cents(row.actual));
const unit = (row, detail) => ({
  key: row.key,
  name: row.name || (levelOf(row) === 'central' ? `Central ${row.central}` : levelOf(row) === 'pa' ? `PA ${row.pa}` : `Cooperativa ${row.cooperative}`),
  context: [row.central && `Central ${row.central}`, row.cooperative && `Cooperativa ${row.cooperative}`, levelOf(row) === 'pa' && `PA ${row.pa}`].filter(Boolean).join(' · '),
  cutoff: dateLabel(position(row)), detail,
});
const priority = (kind, title, detail, tone, rows, sortBy, notes = []) => ({
  kind, title, detail, tone, rows, notes,
  action: { kind, keys: rows.map(row => row.key), status: 'all', sortBy },
});

/**
 * Decision facts for the already-filtered population. Never add hierarchy levels,
 * infer causes, rank incomparable source dates, or use simulated projections.
 * Expected comes from analyze(): each month's own target × elapsed weekdays.
 * @param {import('./management-priorities.mjs').ManagementAnalysis[]} [analyses]
 */
export function buildManagementPriorities(analyses = []) {
  const empty = message => ({ items: [], additional: [], review: null, notes: [], empty: message });
  if (!analyses.length) return empty('Nenhuma unidade na seleção. Ajuste os filtros para ver as prioridades.');
  const contexts = new Set(analyses.map(row => [row.source, row.metric, levelOf(row), row.start, row.end].join('|')));
  if (contexts.size > 1 || new Set(analyses.map(row => row.key)).size !== analyses.length)
    return empty('Selecione uma carteira, um nível de unidades e um período para comparar os resultados sem dupla contagem.');

  const active = analyses.filter(row => row.cutoff >= row.start);
  if (!active.length) return empty('O período selecionado ainda não tem posição de produção.');
  const comparable = row => row.complete && !row.annualConflict && finite(row.actual) && finite(row.target) && row.target > 0;
  const eligible = active.filter(comparable);
  const items = [];
  const additional = [];
  const notes = [];
  const reviewRows = active.map(row => {
    const reasons = [];
    if (!finite(row.actual)) reasons.push('Realizado não informado');
    else if (!row.complete) reasons.push('Dados incompletos');
    if (!finite(row.target)) reasons.push('Meta não informada');
    else if (row.target <= 0) reasons.push(row.target === 0 ? 'Meta zero · sem base percentual' : 'Meta negativa · conferir cadastro');
    if (row.annualConflict) reasons.push('Meta anual diverge da soma mensal');
    if (row.cutoffMin && row.cutoffMin < position(row)) reasons.push('Datas de corte diferentes nesta unidade');
    if (finite(row.actual) && row.actual < 0) reasons.push(`Realizado negativo: ${money(row.actual)}`);
    return reasons.length ? unit(row, reasons.join(' · ')) : null;
  }).filter(Boolean);
  const review = reviewRows.length ? priority('review', 'Conferir registros', `${reviewRows.length} ${reviewRows.length === 1 ? 'unidade com informação a conferir' : 'unidades com informações a conferir'}.`, 'warning', reviewRows, 'name', [
    'Ausência de informação não significa produção zero. Resultados negativos são preservados; a base não informa sua causa.',
  ]) : null;

  const dates = new Set(active.map(position));
  const samePosition = dates.size === 1 && active.every(row => !row.cutoffMin || row.cutoffMin >= position(row));
  const behind = eligible.filter(row => finite(row.expected) && row.expected > 0 && cents(row.actual) < cents(row.expected) && cents(row.actual) < cents(row.target));
  if (behind.length) {
    const ordered = [...behind].sort(samePosition ? (a, b) => (b.expected - b.actual) - (a.expected - a.actual) || nameOrder(a, b) : nameOrder);
    const closed = behind.every(row => row.phase === 'Fechado');
    const deficit = total(behind.map(row => Math.max(0, cents(row.expected) - cents(row.actual)))) / 100;
    items.push(priority('pace', 'Recuperar ritmo',
      `${behind.length} ${behind.length === 1 ? 'unidade abaixo' : 'unidades abaixo'} ${closed ? 'da meta no período fechado' : 'do ritmo até o corte'}${samePosition ? ` · ${money(deficit)} ${closed ? 'de GAP' : 'para recuperar o ritmo'}` : ', cada uma avaliada na própria data'}.`,
      'warning', ordered.map(row => unit(row, `${money(Math.max(0, cents(row.expected) - cents(row.actual)) / 100)} ${row.phase === 'Fechado' ? 'de GAP' : 'abaixo do ritmo'} · ${percent(row.actual / row.expected)} ${row.phase === 'Fechado' ? 'da meta' : 'da meta até o corte'}`)), samePosition ? 'gap' : 'name', [
        closed ? 'Prazo encerrado: os valores descrevem o resultado fechado; não há cobrança de produção futura neste período.' : 'Ritmo esperado = meta de cada mês × fração dos dias úteis transcorridos até o corte, sem descontar feriados. Estar abaixo de 100% da meta inteira não significa estar atrasado.',
        'A superação de outras unidades não compensa estas diferenças. A projeção é uma estimativa separada e não altera esta prioridade.',
      ]));
  }

  const near = eligible.filter(row => row.remainingDays > 0 && cents(row.actual) >= cents(row.target) * 0.9 && cents(row.actual) < cents(row.target));
  if (near.length) {
    const ordered = [...near].sort(samePosition ? (a, b) => b.actual / b.target - a.actual / a.target || nameOrder(a, b) : nameOrder);
    const remaining = total(near.map(gapInCents)) / 100;
    items.push(priority('near-goal', 'Concluir metas próximas', `${near.length} ${near.length === 1 ? 'unidade entre' : 'unidades entre'} 90% e menos de 100% da meta${samePosition ? ` · faltam ${money(remaining)}` : ''}.`, 'positive',
      ordered.map(row => unit(row, `${percent(row.actual / row.target)} da meta · faltam ${money(gapInCents(row) / 100)}`)), samePosition ? 'attainment-desc' : 'name', ['Prazo aberto. A proximidade usa realizado ÷ meta do período; projeção não conta como conquista.']));
  }

  const deficits = eligible.filter(row => gapInCents(row) > 0);
  if (deficits.length) {
    const ordered = [...deficits].sort(samePosition ? (a, b) => gapInCents(b) - gapInCents(a) || nameOrder(a, b) : nameOrder);
    const deficitTotal = total(deficits.map(gapInCents));
    const gap = priority('gap', 'Maiores déficits', `${deficits.length} ${deficits.length === 1 ? 'unidade abaixo' : 'unidades abaixo'} da meta${samePosition ? ` · ${money(deficitTotal / 100)} em déficits` : ', cada uma avaliada na própria data'}.`, 'neutral',
      ordered.map(row => unit(row, `${money(gapInCents(row) / 100)} de déficit${samePosition ? ` · ${percent(gapInCents(row) / deficitTotal)} dos déficits` : ''}`)), samePosition ? 'gap' : 'name', [
        'Déficits das unidades = soma de máx(meta − realizado, 0). Unidades acima da meta não reduzem essa soma.',
        'GAP consolidado = máx(soma das metas − soma do realizado, 0). A superação de outras unidades reduz o GAP consolidado. As bases devem usar as mesmas unidades e o mesmo período.',
        ...(eligible.length < active.length ? [`${active.length - eligible.length} unidade(s) sem avaliação válida não entram neste cálculo de déficits.`] : []),
      ]);
    if (samePosition) {
      const leaders = ordered.slice(0, 3);
      gap.concentration = { names: leaders.map(row => unit(row, '').name), count: leaders.length, totalUnits: deficits.length,
        share: total(leaders.map(gapInCents)) / deficitTotal };
      if (eligible.length === active.length) {
        const actual = total(eligible.map(row => cents(row.actual)));
        const target = total(eligible.map(row => cents(row.target)));
        gap.reconciliation = { consolidated: Math.max(0, target - actual) / 100, deficits: deficitTotal / 100,
          surplus: total(eligible.map(row => Math.max(0, cents(row.actual) - cents(row.target)))) / 100 };
      }
    }
    items.push(gap);
  }

  // Kept as a secondary fact for integrations; it never occupies a priority block.
  const produced = active.filter(row => row.complete && finite(row.actual) && row.actual > 0);
  if (samePosition && produced.length > 1) {
    const ordered = [...produced].sort((a, b) => b.actual - a.actual || nameOrder(a, b));
    const positiveTotal = total(produced.map(row => cents(row.actual))) / 100;
    const leader = ordered[0];
    additional.push(priority('production', 'Maior contribuição', `${leader.name || unit(leader, '').name}: ${percent(leader.actual / positiveTotal)} da produção positiva informada.`, 'neutral',
      ordered.map(row => unit(row, `${money(row.actual)} · ${percent(row.actual / positiveTotal)} da produção positiva`)), 'production', [
        'Participação entre as unidades com realizado completo e positivo na mesma posição. Não mede atingimento nem explica a causa do resultado.',
        'Valores negativos e informações incompletas ficam fora dessa base de participação; permanecem nos indicadores e na lista de unidades.',
      ]));
  }
  if (!samePosition) notes.push('Cortes diferentes: cada unidade usa sua posição. A contribuição e os valores de atraso entre unidades não são consolidados nem classificados por valor.');
  if (active.length < analyses.length) notes.push(`${analyses.length - active.length} unidade(s) ainda sem posição no período; não avaliadas como atraso.`);
  return { items, additional, review, notes,
    empty: items.length ? '' : 'Nenhuma prioridade comercial pelos critérios atuais de ritmo, proximidade ou déficit.' };
}
