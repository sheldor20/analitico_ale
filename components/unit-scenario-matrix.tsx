'use client';

import { Fragment, useMemo, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, History, Mail } from 'lucide-react';
import { money, percent } from '@/lib/analytics.mjs';
import { attainmentBand } from '@/lib/attainment.mjs';
import type { CurrentViewRow } from '@/lib/current-view.mjs';
import { buildUnitScenarioMatrix, type MatrixHorizon, type UnitScenarioMatrixPeriod } from '@/lib/unit-scenario-matrix.mjs';
import type { Metric } from '@/lib/types';

export type UnitScenarioMatrixProps = {
  rows: CurrentViewRow[];
  year: number;
  month: number;
  metric?: Metric;
  onAnalyze?: (row: CurrentViewRow) => void;
  onHistory?: (row: CurrentViewRow) => void;
  onShare?: (row: CurrentViewRow) => void;
  onAction?: (row: CurrentViewRow) => void;
  onExpand?: (row: CurrentViewRow) => void;
  expandedKeys?: string[];
  selectedKeys?: string[];
  onSelect?: (key: string) => void;
  renderExpanded?: (row: CurrentViewRow) => ReactNode;
};

const dateLabel = (date: string) => date?.split('-').reverse().join('/') || 'Sem corte';
const actionLabel = (row: CurrentViewRow) => row.source === 'cadence' ? 'Analisar PA' : row.cooperative ? 'Analisar cooperativa' : 'Analisar central';
const identityLabel = (row: CurrentViewRow) => row.pa != null ? `PA ${row.pa} · ${row.name}` : `${row.cooperative || row.central} · ${row.name}`;

function Attainment({ values }: { values: UnitScenarioMatrixPeriod }) {
  const available = values.complete && !values.annualConflict && values.target != null && values.target > 0;
  const label = values.annualConflict ? 'Revisar meta' : values.target == null ? 'Sem meta' : values.target === 0 ? 'Meta zero' : values.phaseKey === 'future' ? 'Futuro' : values.phaseKey === 'missing' ? 'Sem dado' : !values.complete ? 'Incompleto' : percent(values.attainment);
  return <span className="matrix-attainment" data-attainment={attainmentBand(available ? values.attainment : null).key} title={`${values.phaseLabel}${available ? ` · ${percent(values.attainment)} da meta deste período` : ' · sem avaliação percentual'}`}>{label}</span>;
}

function PeriodCells({ values, horizon }: { values: UnitScenarioMatrixPeriod; horizon: MatrixHorizon }) {
  return <>
    <td className="numeric matrix-value matrix-period-start" data-horizon={horizon} data-field="target" data-phase={values.phaseKey} title={values.target == null ? 'Meta não informada' : `Meta do período · ${values.phaseLabel}`}><span className="matrix-money">{values.target == null ? '—' : money(values.target)}</span></td>
    <td className="numeric matrix-value" data-horizon={horizon} data-field="actual" data-phase={values.phaseKey} title={`${values.phaseLabel}${values.actual === 0 ? ' · zero informado' : ''}`}><span className="matrix-money">{values.actual == null ? '—' : money(values.actual)}</span></td>
    <td className="numeric matrix-percentage" data-horizon={horizon} data-field="attainment" data-phase={values.phaseKey}><Attainment values={values} /></td>
  </>;
}

export default function UnitScenarioMatrix({ rows, year, month, metric, onAnalyze, onHistory, onShare, onAction, onExpand, expandedKeys = [], selectedKeys = [], onSelect, renderExpanded }: UnitScenarioMatrixProps) {
  const result = useMemo(() => {
    try { return { model: buildUnitScenarioMatrix({ rows, year, month, metric }), error: '' }; }
    catch (reason) { return { model: null, error: reason instanceof Error ? reason.message : 'Não foi possível preparar a matriz das unidades.' }; }
  }, [rows, year, month, metric]);
  const model = result.model;
  if (!model) return <p role="alert" className="empty">{result.error}</p>;
  return <section className="unit-scenario-matrix" aria-label="Matriz das unidades">
    <div className="table-scroll unit-scenario-matrix-scroll"><table aria-label="Metas e resultados por horizonte">
      <caption className="sr-only">{model.metric === 'AR' ? 'Arrecadação' : 'Venda Nova'} · mesmas {model.rows.length} unidades no mês de referência, trimestre correspondente e ano de {model.year}. Realizado até o corte de cada unidade.</caption>
      <colgroup><col className="matrix-unit-column" />{model.horizons.flatMap(horizon => [<col className="matrix-money-column" key={`${horizon.id}-target`} />, <col className="matrix-money-column" key={`${horizon.id}-actual`} />, <col className="matrix-percentage-column" key={`${horizon.id}-attainment`} />])}<col className="matrix-cutoff-column" /><col className="matrix-actions-column" /></colgroup>
      <thead>
        <tr><th scope="col" rowSpan={2} className="matrix-unit-heading">Unidade</th>{model.horizons.map(horizon => <th key={horizon.id} scope="colgroup" role="columnheader" colSpan={3} className="matrix-period-heading" data-horizon={horizon.id}><strong>{horizon.title}</strong><span>{horizon.label}{model.rows.some(item=>item.periods[horizon.id].phaseKey==='partial')?' · Parcial':''}</span></th>)}<th scope="col" rowSpan={2}>Corte</th><th scope="col" rowSpan={2}>Ações</th></tr>
        <tr>{model.horizons.map(horizon => <Fragment key={horizon.id}><th scope="col" className="numeric matrix-period-start" data-horizon={horizon.id}>Meta</th><th scope="col" className="numeric" data-horizon={horizon.id}>Realizado</th><th scope="col" className="numeric" data-horizon={horizon.id}>%</th></Fragment>)}</tr>
      </thead>
      <tbody>{model.rows.map(item => {
        const row = item.unit, expanded = expandedKeys.includes(row.key), selected = selectedKeys.includes(row.key);
        const canExpand = onExpand && row.source === 'base' && row.cooperative && row.pa == null;
        const hasActions = onAnalyze || onHistory || onShare || onAction || canExpand;
        return <Fragment key={item.id}>
          <tr className={`unit-matrix-row${selected ? ' selected-result' : ''}`} data-unit-id={item.id} data-row-key={item.key} data-source={row.source} data-metric={row.metric}>
            <th scope="row" className="matrix-unit"><div className="matrix-unit-content">{onSelect && <input type="checkbox" className="row-selector" aria-label={`Selecionar ${row.name}`} checked={selected} onChange={() => onSelect(row.key)} />}<div>{onAnalyze ? <button type="button" className="entity-button" aria-label={`${actionLabel(row)} ${row.name}`} title={identityLabel(row)} onClick={() => onAnalyze(row)}><strong>{identityLabel(row)}</strong></button> : <strong>{identityLabel(row)}</strong>}<small>Central {row.central}{row.pa != null ? ` · Coop. ${row.cooperative}${row.group ? ` · ${row.group}` : ''}` : ''}{row.source === 'cadence' ? ' · Cadência PA' : ''}</small></div></div></th>
            {model.horizons.map(horizon => <PeriodCells key={horizon.id} values={item.periods[horizon.id]} horizon={horizon.id} />)}
            <td className="matrix-cutoff" data-field="cutoff" title={item.cutoffMin !== item.cutoff ? 'Datas de corte diferentes entre as unidades agregadas; avaliações parciais podem ficar indisponíveis' : 'Data de corte da produção desta unidade'}>{item.cutoffMin !== item.cutoff ? <><span>{dateLabel(item.cutoffMin)}</span><span>a {dateLabel(item.cutoff)}</span></> : <span>{dateLabel(item.cutoff)}</span>}</td>
            <td className="matrix-actions"><div>{canExpand && <button type="button" className="icon-button" aria-label={`${expanded ? 'Recolher' : 'Ver'} PAs de ${row.name}`} title={expanded ? 'Recolher PAs' : 'Ver PAs'} aria-expanded={expanded} onClick={() => onExpand(row)}><ChevronDown size={16} className={expanded ? 'rotated' : undefined} aria-hidden="true" /></button>}{onHistory && <button type="button" className="icon-button" aria-label={`Ver histórico de ${row.name}`} title="Ver histórico" onClick={() => onHistory(row)}><History size={16} aria-hidden="true" /></button>}{onShare && <button type="button" className="icon-button" aria-label={`Compartilhar cenário de ${row.name}`} title="Compartilhar cenário" onClick={() => onShare(row)}><Mail size={16} aria-hidden="true" /></button>}{onAction && <button type="button" className="icon-button" aria-label={`Registrar ação de ${row.name}`} title="Registrar ação" onClick={() => onAction(row)}><ChevronRight size={16} aria-hidden="true" /></button>}{!hasActions && <span>—</span>}</div></td>
          </tr>
          {expanded && renderExpanded && <tr className="expanded-unit matrix-expanded-unit"><td colSpan={12}>{renderExpanded(row)}</td></tr>}
        </Fragment>;
      })}</tbody>
    </table></div>
    {!model.rows.length && <p className="empty">Nenhuma unidade corresponde aos filtros.</p>}
  </section>;
}
