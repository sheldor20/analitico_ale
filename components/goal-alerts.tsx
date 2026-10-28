'use client';
import { attainmentBand } from '@/lib/attainment.mjs';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Mail, MessageCircle, Trophy } from 'lucide-react';
import { money, percent } from '@/lib/analytics.mjs';
import { buildPeriodGoalAlerts, defaultGoalAlertMonth, type GoalAlert } from '@/lib/goal-alerts.mjs';
import { listGoalAlertStates, saveGoalAlertState, type GoalAlertState } from '@/lib/goal-alert-store';
import { listResponsibleContacts, type ResponsibleContact } from '@/lib/contact-store';
import { buildWhatsappLink, recipientsForContacts, whatsappNumber } from '@/lib/portfolio-communication.mjs';
import type { Dataset } from '@/lib/types';
import styles from './goal-alerts.module.css';
import { filterGoalAlerts, goalAlertFilterOptions } from '@/lib/goal-alert-filters.mjs';
import { buildGoalAlertPresentation, buildGoalAlertsDashboard } from '@/lib/goal-alert-presentation.mjs';
import DashboardImageCopy from './dashboard-image-copy';
import GoalAlertOutlook from './goal-alert-outlook';
import PeriodSelector, { usePeriodSelection } from './period-selector';
import { periodTitle } from '@/lib/periods.mjs';
type GoalPeriod = 'month' | 'quarter' | 'semester' | 'annual' | 'ytd';

const kindLabel = { central: 'Central', cooperative: 'Cooperativa', pa: 'PA' };
const date = (value: string) => value.split('-').reverse().join('/');

export function GoalAlerts({ dataset, userId }: { dataset: Dataset; userId: string }) {
  const selection = usePeriodSelection('month', defaultGoalAlertMonth(dataset));
  const [selectionYear, setSelectionYear] = useState(dataset.year);
  const period = selection.period as GoalPeriod;
  const month = selectionYear === dataset.year ? selection.month : defaultGoalAlertMonth(dataset);
  const alerts = useMemo(() => buildPeriodGoalAlerts(dataset, { period, month }), [dataset, period, month]);
  const periodLabel = periodTitle(period, month, dataset.year);
  const scope = `${userId}:${dataset.year}:${period}:${month}`;
  useEffect(() => {
    if (selectionYear !== dataset.year) {
      selection.setMonth(defaultGoalAlertMonth(dataset));
      setSelectionYear(dataset.year);
    }
  }, [dataset, selectionYear, selection.setMonth]);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const contactRequest = useRef(0);
  const [saved, setSaved] = useState<{ scope: string; rows: GoalAlertState[] }>({ scope: '', rows: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [kind, setKind] = useState('all');
  const [order, setOrder] = useState('attainment-desc');
  const hierarchyScope = `${userId}:${dataset.year}`;
  const [hierarchy, setHierarchy] = useState({ scope: hierarchyScope, central: 'all', cooperative: 'all', pa: 'all' });
  const hierarchyOptions = useMemo(() => goalAlertFilterOptions(dataset), [dataset]);
  const selectedHierarchy = hierarchy.scope === hierarchyScope ? hierarchy : { central: 'all', cooperative: 'all', pa: 'all' };
  const central = hierarchyOptions.centrals.some((item) => item.value === selectedHierarchy.central) ? selectedHierarchy.central : 'all';
  const cooperativeOptions = hierarchyOptions.cooperatives.filter((item) => central !== 'all' && item.central === central);
  const cooperative = kind !== 'central' && cooperativeOptions.some((item) => item.value === selectedHierarchy.cooperative) ? selectedHierarchy.cooperative : 'all';
  const paOptions = hierarchyOptions.pas.filter((item) => central !== 'all' && cooperative !== 'all' && item.central === central && `cooperative:${item.central}:${item.cooperative}` === cooperative);
  const pa = (kind === 'all' || kind === 'pa') && paOptions.some(item => item.value === selectedHierarchy.pa) ? selectedHierarchy.pa : 'all';
  const paOption = paOptions.find(item => item.value === pa);
  const centralOption = hierarchyOptions.centrals.find((item) => item.value === central);
  const cooperativeOption = cooperativeOptions.find((item) => item.value === cooperative);
  const selectionLabel = [kind === 'all' ? 'Todas as unidades' : kind === 'pa' ? 'PAs' : kind === 'cooperative' ? 'Cooperativas' : 'Centrais',
    centralOption ? `Central ${centralOption.central} · ${centralOption.name}` : cooperativeOption ? `Central ${cooperativeOption.central}` : 'Todas as centrais',
    ...(cooperativeOption ? [`Cooperativa ${cooperativeOption.cooperative} · ${cooperativeOption.name}`] : []),
    ...(paOption ? [`PA ${paOption.pa} · ${paOption.name}`] : []),
  ].join(' / ');
  const [clipboardVersion, setClipboardVersion] = useState(0);
  const [emailPanel, setEmailPanel] = useState<{ view: string; key: string } | null>(null);
  const invalidateClipboard = () => setClipboardVersion((value) => value + 1);
  const [onlyNew, setOnlyNew] = useState(false);
  const [contactPanel, setContactPanel] = useState<{ scope: string; key: string; contacts: ResponsibleContact[]; selected: string } | null>(null);
  const states = saved.scope === scope ? saved.rows : [];
  const stateMap = new Map(states.map((state) => [state.alertKey, state]));
  const scopedAlerts = filterGoalAlerts(alerts, { kind, central, cooperative, pa });
  const newCount = scopedAlerts.filter((alert) => !stateMap.get(alert.key)?.readAt).length;
  const visible = scopedAlerts.filter((alert) => !onlyNew || !stateMap.get(alert.key)?.readAt).sort((left, right) => {
    const difference = order === 'production' ? right.actual - left.actual : order === 'attainment' ? left.attainment - right.attainment : order === 'name' ? 0 : right.attainment - left.attainment;
    return difference || left.entity.name.localeCompare(right.entity.name, 'pt-BR', { numeric: true }) || left.key.localeCompare(right.key);
  });
  const visibleSnapshot = JSON.stringify(visible);
  const exportView = `${scope}:${kind}:${central}:${cooperative}:${pa}:${onlyNew}:${visibleSnapshot}`;

  useEffect(() => {
    let active = true; contactRequest.current++; setLoading(true); setError(''); setContactPanel(null); setEmailPanel(null); setBusy(''); setClipboardVersion(value => value + 1);
    listGoalAlertStates(dataset.year, month, userId, period).then((rows) => { if (active) setSaved({ scope, rows }); })
      .catch(() => { if (active) setError('Não foi possível carregar os registros de leitura. Os resultados abaixo continuam atualizados; tente recarregar a página.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, dataset.year, month, userId, period]);

  function clearCommunication() {
    contactRequest.current++; setContactPanel(null); setEmailPanel(null); setBusy(''); invalidateClipboard();
  }
  function changeCentral(value: string) {
    clearCommunication(); setHierarchy({ scope: hierarchyScope, central: value, cooperative: 'all', pa: 'all' });
  }
  function changeCooperative(value: string) {
    clearCommunication(); setHierarchy({ scope: hierarchyScope, central, cooperative: value, pa: 'all' });
  }
  function changeKind(value: string) {
    clearCommunication(); setKind(value);
    if (value === 'central') setHierarchy({ scope: hierarchyScope, central, cooperative: 'all', pa: 'all' });
    else if (value === 'cooperative') setHierarchy({ scope: hierarchyScope, central, cooperative, pa: 'all' });
  }
  function changePa(value: string) {
    clearCommunication(); setHierarchy({ scope: hierarchyScope, central, cooperative, pa: value });
  }
  function changePeriod(value: string) { clearCommunication(); selection.setPeriod(value); }
  function changeMonth(value: number) { clearCommunication(); selection.setMonth(value); }
  function clearFilters() {
    clearCommunication(); setHierarchy({ scope: hierarchyScope, central: 'all', cooperative: 'all', pa: 'all' }); setKind('all'); setOnlyNew(false); setOrder('attainment-desc');
  }

  async function mark(alert: GoalAlert, action: 'read' | 'notified') {
    const requestScope = scope; setBusy(alert.key); setError('');
    try {
      const state = await saveGoalAlertState(alert, action, userId);
      if (scopeRef.current === requestScope) setSaved((previous) => ({ scope: requestScope, rows: [...(previous.scope === requestScope ? previous.rows.filter((row) => row.alertKey !== state.alertKey) : []), state] }));
    } catch { if (scopeRef.current === requestScope) setError('Não foi possível salvar o status. Tente novamente.'); }
    finally { if (scopeRef.current === requestScope) setBusy(''); }
  }

  async function prepareContact(alert: GoalAlert) {
    const requestScope = scope; const requestId = ++contactRequest.current; setBusy(alert.key); setError(''); setEmailPanel(null);
    try {
      const savedContacts = await listResponsibleContacts(dataset.year, alert.entity.id);
      const contacts = recipientsForContacts(savedContacts, dataset.year, alert.entity).filter((contact: ResponsibleContact) => {
        if (contact.ownerId !== userId) return false;
        try { return !!whatsappNumber(contact.whatsapp); } catch { return false; }
      });
      if (scopeRef.current === requestScope && contactRequest.current === requestId) setContactPanel({ scope: requestScope, key: alert.key, contacts, selected: contacts[0]?.id || '' });
    } catch { if (scopeRef.current === requestScope && contactRequest.current === requestId) setError('Não foi possível carregar os responsáveis desta unidade. Confira a ficha cadastral.'); }
    finally { if (scopeRef.current === requestScope && contactRequest.current === requestId) setBusy(''); }
  }

  return <section className={styles.section} aria-labelledby="goal-alerts-title">
    <h2 id="goal-alerts-title" className={styles.srOnly}>Metas atingidas por período</h2>
    <section className={styles.primaryFilters} aria-label="Filtros das metas atingidas">
      <label>Central<select aria-label="Central" value={central} onChange={(event) => changeCentral(event.target.value)}><option value="all">Todas as centrais</option>{hierarchyOptions.centrals.map((item) => <option key={item.value} value={item.value}>{item.central} · {item.name}</option>)}</select></label>
      <label>Cooperativa<select aria-label="Cooperativa" value={cooperative} disabled={central === 'all' || kind === 'central'} onChange={(event) => changeCooperative(event.target.value)}><option value="all">{central === 'all' ? 'Selecione uma central' : 'Todas as cooperativas'}</option>{cooperativeOptions.map((item) => <option key={item.value} value={item.value}>{item.cooperative} · {item.name}</option>)}</select></label>
      <label>PA<select aria-label="PA" value={pa} disabled={cooperative === 'all' || kind === 'central' || kind === 'cooperative'} onChange={event => changePa(event.target.value)}><option value="all">{cooperative === 'all' ? 'Selecione uma cooperativa' : 'Todos os PAs'}</option>{paOptions.map(item => <option key={item.value} value={item.value}>{item.central} / {item.cooperative} · PA {item.pa} · {item.name}</option>)}</select></label>
      <PeriodSelector followCurrentMonth={selection.followCurrentMonth} period={period} month={month} year={dataset.year} showCoverage={false} onPeriodChange={changePeriod} onMonthChange={changeMonth} />
    </section>
    <div className={styles.summary}><Trophy size={24} aria-hidden="true" /><div><strong>{scopedAlerts.length} {scopedAlerts.length === 1 ? 'meta atingida' : 'metas atingidas'}</strong><span>{periodLabel} · {loading ? 'Carregando registros de leitura…' : `${newCount} para reconhecer`}</span></div></div>
    <div className={styles.filters} aria-label="Filtros complementares">
      <label>Tipo de unidade<select aria-label="Tipo de unidade" value={kind} onChange={(event) => changeKind(event.target.value)}><option value="all">Todas as unidades</option><option value="central">Centrais</option><option value="cooperative">Cooperativas</option><option value="pa">PAs</option></select></label>
      <label>Ordenar por<select aria-label="Ordem das metas atingidas" value={order} onChange={(event) => { clearCommunication(); setOrder(event.target.value); }}><option value="attainment-desc">Maior atingimento</option><option value="attainment">Menor atingimento</option><option value="production">Maior produção</option><option value="name">Nome da unidade</option></select></label>
      <label className={styles.checkbox}><input type="checkbox" checked={onlyNew} onChange={(event) => { clearCommunication(); setOnlyNew(event.target.checked); }} />Somente não lidas</label>
      <button type="button" className="button secondary" onClick={clearFilters} disabled={central === 'all' && cooperative === 'all' && pa === 'all' && kind === 'all' && !onlyNew && order === 'attainment-desc'}>Limpar filtros</button>
    </div>
    {!!visible.length && <div className={styles.exportToolbar}><p>{visible.length} {visible.length === 1 ? 'resultado no filtro' : 'resultados no filtro'}</p><DashboardImageCopy key={scope} disabled={onlyNew && loading} snapshot={exportView} label="Copiar painel filtrado como imagem" filename={`metas-${dataset.year}-${period}-${month + 1}-${kind}-${central}-${cooperative === 'all' ? 'todas' : cooperative.replaceAll(':', '-')}.png`} onClipboardChange={invalidateClipboard} buildModel={() => buildGoalAlertsDashboard(visible, { year: dataset.year, month, period, kindLabel: selectionLabel })} /></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!visible.length ? <div className={styles.empty}><Trophy size={30} aria-hidden="true" /><h3>{alerts.length ? 'Nenhum alerta neste filtro' : 'Nenhuma meta atingida neste período'}</h3><p>{alerts.length ? 'Altere o filtro para consultar os demais resultados.' : 'Os alertas aparecem quando há meta positiva no período, produção suficiente e dados completos para a unidade.'}</p></div> : <div className={styles.grid}>{visible.map((alert) => {
      const state = stateMap.get(alert.key);
      const panel = contactPanel?.scope === scope && contactPanel.key === alert.key ? contactPanel : null;
      const contact = panel?.contacts.find((item) => item.id === panel.selected);
      const link = contact ? buildWhatsappLink({ phone: contact.whatsapp, body: buildGoalAlertPresentation(alert).text }).url : '';
      return <article key={alert.key} className={styles.card}>
        <div className={styles.cardTop}><span>{kindLabel[alert.entity.kind]} · {alert.metricLabel}</span><span className={styles.badge}>{state?.readAt ? <><Check size={14} /> Lida</> : 'Nova'}</span></div>
        <h3>{alert.entity.name}</h3><p className={styles.path}>Central {alert.entity.central}{alert.entity.cooperative && ` · Cooperativa ${alert.entity.cooperative}`}{alert.entity.pa != null && ` · PA ${alert.entity.pa}`}</p>
        <div className={styles.amount} data-attainment={attainmentBand(alert.attainment).key}><strong>{percent(alert.attainment)}</strong><span>da meta · {alert.periodLabel || periodLabel}</span></div>
        <dl><div><dt>Meta do período</dt><dd>{money(alert.target)}</dd></div><div><dt>Realizado</dt><dd>{money(alert.actual)}</dd></div></dl>
        <p className={styles.cutoff}>Dados até {date(alert.cutoff)}{state?.notifiedAt && ` · Comunicação registrada em ${new Date(state.notifiedAt).toLocaleDateString('pt-BR')}`}</p>
        <div className={styles.actions}>{!state?.readAt && <button className="button secondary" disabled={busy === alert.key || loading} onClick={() => mark(alert, 'read')}><Check size={16} />Marcar como lida</button>}<button className="button secondary" disabled={busy === alert.key} onClick={() => prepareContact(alert)}><MessageCircle size={16} />Preparar WhatsApp</button><button type="button" className="button secondary" aria-expanded={emailPanel?.view === exportView && emailPanel.key === alert.key} onClick={() => { contactRequest.current++; setBusy(''); setContactPanel(null); setEmailPanel((current) => current?.view === exportView && current.key === alert.key ? null : { view: exportView, key: alert.key }); }}><Mail size={16} aria-hidden="true" />Preparar Outlook</button><DashboardImageCopy key={`${userId}:${alert.key}`} snapshot={JSON.stringify(alert)} filename={`meta-${alert.entity.id.replace(/[^a-zA-Z0-9_-]/g, '-')}-${alert.metric}-${alert.year}-${alert.period || 'month'}-${alert.month + 1}.png`} onClipboardChange={invalidateClipboard} buildModel={() => buildGoalAlertPresentation(alert).dashboard} /></div>
        {emailPanel?.view === exportView && emailPanel.key === alert.key && <GoalAlertOutlook key={`${exportView}:${alert.key}`} alert={alert} userId={userId} clipboardVersion={clipboardVersion} notifiedAt={state?.notifiedAt} marking={busy === alert.key || loading} onMarkSent={() => void mark(alert, 'notified')} onClose={() => setEmailPanel(null)} />}
        {panel && <div className={styles.contact}>{panel.contacts.length ? <><label>Responsável da unidade<select aria-label="Responsável da unidade" value={panel.selected} onChange={(event) => setContactPanel({ ...panel, selected: event.target.value })}>{panel.contacts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.whatsapp}</option>)}</select></label><p>A mensagem será aberta para você revisar e enviar no WhatsApp.</p><a className={styles.send} href={link} target="_blank" rel="noopener noreferrer">Abrir mensagem no WhatsApp</a><button className="button secondary" disabled={busy === alert.key || loading || !!state?.notifiedAt} onClick={() => mark(alert, 'notified')}>{state?.notifiedAt ? 'Comunicação registrada' : 'Já enviei: registrar comunicação'}</button></> : <p>Cadastre um responsável com WhatsApp válido na ficha desta unidade para preparar a mensagem.</p>}</div>}
      </article>;
    })}</div>}
  </section>;
}

export default GoalAlerts;
