import { analyze, MONTHS } from './analytics.mjs';
import { entityFromAnalysis } from './portfolio-communication.mjs';

/** Reuse a previously selected cohort. Never aggregate parents and children or
 * reapply a status/search filter independently to the three horizons. */
export function buildUnitScenarioMatrix({ rows, year, month, metric }) {
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 0 || month > 11)
    throw new Error('Selecione um ano e um mês de referência válidos para a matriz.');
  if (!Array.isArray(rows)) throw new Error('Selecione as unidades da matriz.');
  if (metric !== undefined && !['VN', 'AR'].includes(metric)) throw new Error('Selecione uma carteira válida para a matriz.');
  const source = rows[0]?.source ?? 'base', selectedMetric = metric ?? rows[0]?.metric ?? 'VN';
  if (rows.some(row => !row || !['base', 'cadence'].includes(row.source) || row.source !== source || row.metric !== selectedMetric)
    || source === 'cadence' && selectedMetric !== 'VN')
    throw new Error('Cada matriz deve usar uma única fonte e carteira. Separe Venda Nova, Arrecadação e cadência dos PAs.');
  if (rows.some(row => !String(row.cutoff).startsWith(`${year}-`) || row.cutoffMin && !String(row.cutoffMin).startsWith(`${year}-`)))
    throw new Error('As datas de corte das unidades devem pertencer ao ano da matriz.');
  const horizons = [
    { id: 'month', title: 'Mês de referência', label: `${MONTHS[month]}/${year}` },
    { id: 'quarter', title: 'Trimestre', label: `${Math.floor(month / 3) + 1}º trimestre · ${year}` },
    { id: 'annual', title: 'Ano', label: String(year) },
  ];
  const ids = new Set();
  const matrixRows = rows.map(row => {
    const id = entityFromAnalysis(row).id;
    if (ids.has(id)) throw new Error('Há unidades duplicadas na seleção da matriz. Confira a central e os códigos.');
    ids.add(id);
    const periods = Object.fromEntries(horizons.map(horizon => {
      const result = analyze(row, { year, month, period: horizon.id, uplift: 0 });
      const phase = result.annualConflict ? 'conflict' : result.cutoff < result.start ? 'future' : result.actual == null ? 'missing' : !result.complete ? 'incomplete' : result.phase === 'Fechado' ? 'closed' : 'partial';
      const phaseLabel = { conflict: 'Metas divergentes', future: 'Após o corte', missing: 'Sem realizado', incomplete: 'Dados incompletos', closed: 'Fechado', partial: 'Parcial' }[phase];
      return [horizon.id, { ...result, attainment: result.annualConflict ? null : result.attainment,
        projectedAttainment: result.annualConflict ? null : result.projectedAttainment, phaseKey: phase, phaseLabel }];
    }));
    return { id, key: row.key, unit: row, periods, cutoffMin: row.cutoffMin || row.cutoff, cutoff: row.cutoff };
  });
  return { year, month, source, metric: selectedMetric, horizons, rows: matrixRows };
}
