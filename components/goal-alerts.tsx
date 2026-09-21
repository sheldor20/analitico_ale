'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, Mail, MessageCircle, Trophy } from 'lucide-react';
import { money, percent, MONTHS } from '@/lib/analytics.mjs';
import { buildMonthlyGoalAlerts, defaultGoalAlertMonth, type GoalAlert } from '@/lib/goal-alerts.mjs';
import { listGoalAlertStates, saveGoalAlertState, type GoalAlertState } from '@/lib/goal-alert-store';
import { listResponsibleContacts, type ResponsibleContact } from '@/lib/contact-store';
import { buildWhatsappLink, recipientsForContacts, whatsappNumber } from '@/lib/portfolio-communication.mjs';
import type { Dataset } from '@/lib/types';
import styles from './goal-alerts.module.css';
import { filterGoalAlerts, goalAlertFilterOptions } from '@/lib/goal-alert-filters.mjs';
import { buildGoalAlertPresentation, buildGoalAlertsDashboard } from '@/lib/goal-alert-presentation.mjs';
import DashboardImageCopy from './dashboard-image-copy';
import GoalAlertOutlook from './goal-alert-outlook';

const kindLabel = { central: 'Central', cooperative: 'Cooperativa', pa: 'PA' };
const date = (value: string) => value.split('-').reverse().join('/');

export function GoalAlerts({ dataset, userId }: { dataset: Dataset; userId: string }) {
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const month = selectedMonth?.year === dataset.year ? selectedMonth.month : defaultGoalAlertMonth(dataset);
  const alerts = useMemo(() => buildMonthlyGoalAlerts(dataset, month), [dataset, month]);
  const scope = `${userId}:${dataset.year}:${month}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const contactRequest = useRef(0);
  const [saved, setSaved] = useState<{ scope: string; rows: GoalAlertState[] }>({ scope: '', rows: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [kind, setKind] = useState('all');
  const hierarchyScope = `${userId}:${dataset.year}`;
  const [hierarchy, setHierarchy] = useState({ scope: hierarchyScope, central: 'all', cooperative: 'all' });
  const hierarchyOptions = useMemo(() => goalAlertFilterOptions(dataset), [dataset]);
  const selectedHierarchy = hierarchy.scope === hierarchyScope ? hierarchy : { central: 'all', cooperative: 'all' };
  const central = hierarchyOptions.centrals.some((item) => item.value === selectedHierarchy.central) ? selectedHierarchy.central : 'all';
  const cooperativeOptions = hierarchyOptions.cooperatives.filter((item) => central === 'all' || item.central === central);
  const cooperative = kind !== 'central' && cooperativeOptions.some((item) => item.value === selectedHierarchy.cooperative) ? selectedHierarchy.cooperative : 'all';
  const centralOption = hierarchyOptions.centrals.find((item) => item.value === central);
  const cooperativeOption = cooperativeOptions.find((item) => item.value === cooperative);
  const selectionLabel = [kind === 'all' ? 'Todas as unidades' : kind === 'pa' ? 'PAs' : kind === 'cooperative' ? 'Cooperativas' : 'Centrais',
    centralOption ? `Central ${centralOption.central} · ${centralOption.name}` : cooperativeOption ? `Central ${cooperativeOption.central}` : 'Todas as centrais',
    ...(cooperativeOption ? [`Cooperativa ${cooperativeOption.cooperative} · ${cooperativeOption.name}`] : []),
  ].join(' / ');
  const [clipboardVersion, setClipboardVersion] = useState(0);
  const [emailPanel, setEmailPanel] = useState<{ view: string; key: string } | null>(null);
  const invalidateClipboard = () => setClipboardVersion((value) => value + 1);
  const [onlyNew, setOnlyNew] = useState(false);
  const [contactPanel, setContactPanel] = useState<{ scope: string; key: string; contacts: ResponsibleContact[]; selected: string } | null>(null);
  const states = saved.scope === scope ? saved.rows : [];
  const stateMap = new Map(states.map((state) => [state.alertKey, state]));
  const scopedAlerts = filterGoalAlerts(alerts, { kind, central, cooperative });
  const newCount = scopedAlerts.filter((alert) => !stateMap.get(alert.key)?.readAt).length;
  const visible = scopedAlerts.filter((alert) => !onlyNew || !stateMap.get(alert.key)?.readAt);
  const visibleSnapshot = JSON.stringify(visible);
  const exportView = `${scope}:${kind}:${central}:${cooperative}:${onlyNew}:${visibleSnapshot}`;

  useEffect(() => {
    let active = true; contactRequest.current++; setLoading(true); setError(''); setContactPanel(null); setBusy('');
    listGoalAlertStates(dataset.year, month, userId).then((rows) => { if (active) setSaved({ scope, rows }); })
      .catch(() => { if (active) setError('Não foi possível carregar os registros de leitura. Os resultados abaixo continuam atualizados; tente recarregar a página.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, dataset.year, month, userId]);

  function clearCommunication() {
    contactRequest.current++; setContactPanel(null); setEmailPanel(null); setBusy(''); invalidateClipboard();
  }
  function changeCentral(value: string) {
    clearCommunication(); setHierarchy({ scope: hierarchyScope, central: value, cooperative: 'all' });
  }
  function changeCooperative(value: string) {
    clearCommunication(); setHierarchy({ scope: hierarchyScope, central, cooperative: value });
  }
  function changeKind(value: string) {
    clearCommunication(); setKind(value);
    if (value === 'central') setHierarchy({ scope: hierarchyScope, central, cooperative: 'all' });
  }
  function clearFilters() {
    clearCommunication(); setHierarchy({ scope: hierarchyScope, central: 'all', cooperative: 'all' }); setKind('all'); setOnlyNew(false);
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
    <div className={styles.heading}><div><h2 id="goal-alerts-title">Metas atingidas no mês</h2><p>Centrais, cooperativas e PAs que já realizaram 100% ou mais da meta mensal.</p></div><label>Mês de referência<select aria-label="Mês de referência" value={month} onChange={(event) => setSelectedMonth({ year: dataset.year, month: Number(event.target.value) })}>{MONTHS.map((label: string, index: number) => <option key={label} value={index}>{label}/{dataset.year}</option>)}</select></label></div>
    <div className={styles.summary}><Trophy size={24} aria-hidden="true" /><div><strong>{scopedAlerts.length} {scopedAlerts.length === 1 ? 'meta atingida' : 'metas atingidas'}</strong><span>{loading ? 'Carregando registros de leitura…' : `${newCount} para reconhecer`} · Venda nova e arrecadação</span></div></div>
    <div className={styles.filters}>
      <label>Central<select aria-label="Central" value={central} onChange={(event) => changeCentral(event.target.value)}><option value="all">Todas as centrais</option>{hierarchyOptions.centrals.map((item) => <option key={item.value} value={item.value}>{item.central} · {item.name}</option>)}</select></label>
      <label>Cooperativa<select aria-label="Cooperativa" value={cooperative} disabled={kind === 'central'} onChange={(event) => changeCooperative(event.target.value)}><option value="all">Todas as cooperativas</option>{cooperativeOptions.map((item) => <option key={item.value} value={item.value}>{item.central} / {item.cooperative} · {item.name}</option>)}</select></label>
      <label>Tipo de unidade<select aria-label="Tipo de unidade" value={kind} onChange={(event) => changeKind(event.target.value)}><option value="all">Todas as unidades</option><option value="central">Centrais</option><option value="cooperative">Cooperativas</option><option value="pa">PAs</option></select></label>
      <label className={styles.checkbox}><input type="checkbox" checked={onlyNew} onChange={(event) => { clearCommunication(); setOnlyNew(event.target.checked); }} />Somente não lidas</label>
      <button type="button" className="button secondary" onClick={clearFilters} disabled={central === 'all' && cooperative === 'all' && kind === 'all' && !onlyNew}>Limpar filtros</button>
    </div>
    {!!visible.length && <div className={styles.exportToolbar}><p>{visible.length} {visible.length === 1 ? 'resultado no filtro' : 'resultados no filtro'}</p><DashboardImageCopy key={scope} disabled={onlyNew && loading} snapshot={exportView} label="Copiar painel filtrado como imagem" filename={`metas-${dataset.year}-${month + 1}-${kind}-${central}-${cooperative === 'all' ? 'todas' : cooperative.replaceAll(':', '-')}.png`} onClipboardChange={invalidateClipboard} buildModel={() => buildGoalAlertsDashboard(visible, { year: dataset.year, month, kindLabel: selectionLabel })} /></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!visible.length ? <div className={styles.empty}><Trophy size={30} aria-hidden="true" /><h3>{alerts.length ? 'Nenhum alerta neste filtro' : 'Nenhuma meta atingida neste mês'}</h3><p>{alerts.length ? 'Altere o filtro para consultar os demais resultados.' : 'Os alertas aparecem quando há meta mensal positiva, produção suficiente e dados completos para a unidade.'}</p></div> : <div className={styles.grid}>{visible.map((alert) => {
      const state = stateMap.get(alert.key);
      const panel = contactPanel?.scope === scope && contactPanel.key === alert.key ? contactPanel : null;
      const contact = panel?.contacts.find((item) => item.id === panel.selected);
      const link = contact ? buildWhatsappLink({ phone: contact.whatsapp, body: buildGoalAlertPresentation(alert).text }).url : '';
      return <article key={alert.key} className={styles.card}>
        <div className={styles.cardTop}><span>{kindLabel[alert.entity.kind]} · {alert.metricLabel}</span><span className={styles.badge}>{state?.readAt ? <><Check size={14} /> Lida</> : 'Nova'}</span></div>
        <h3>{alert.entity.name}</h3><p className={styles.path}>Central {alert.entity.central}{alert.entity.cooperative && ` · Cooperativa ${alert.entity.cooperative}`}{alert.entity.pa != null && ` · PA ${alert.entity.pa}`}</p>
        <div className={styles.amount}><strong>{percent(alert.attainment)}</strong><span>da meta de {MONTHS[month]}/{dataset.year}</span></div>
        <dl><div><dt>Meta do mês</dt><dd>{money(alert.target)}</dd></div><div><dt>Realizado</dt><dd>{money(alert.actual)}</dd></div></dl>
        <p className={styles.cutoff}>Dados até {date(alert.cutoff)}{state?.notifiedAt && ` · Comunicação registrada em ${new Date(state.notifiedAt).toLocaleDateString('pt-BR')}`}</p>
        <div className={styles.actions}>{!state?.readAt && <button className="button secondary" disabled={busy === alert.key || loading} onClick={() => mark(alert, 'read')}><Check size={16} />Marcar como lida</button>}<button className="button secondary" disabled={busy === alert.key} onClick={() => prepareContact(alert)}><MessageCircle size={16} />Preparar WhatsApp</button><button type="button" className="button secondary" aria-expanded={emailPanel?.view === exportView && emailPanel.key === alert.key} onClick={() => { contactRequest.current++; setBusy(''); setContactPanel(null); setEmailPanel((current) => current?.view === exportView && current.key === alert.key ? null : { view: exportView, key: alert.key }); }}><Mail size={16} aria-hidden="true" />Preparar Outlook</button><DashboardImageCopy key={`${userId}:${alert.key}`} snapshot={JSON.stringify(alert)} filename={`meta-${alert.entity.id.replace(/[^a-zA-Z0-9_-]/g, '-')}-${alert.metric}-${alert.year}-${alert.month + 1}.png`} onClipboardChange={invalidateClipboard} buildModel={() => buildGoalAlertPresentation(alert).dashboard} /></div>
        {emailPanel?.view === exportView && emailPanel.key === alert.key && <GoalAlertOutlook key={`${exportView}:${alert.key}`} alert={alert} userId={userId} clipboardVersion={clipboardVersion} notifiedAt={state?.notifiedAt} marking={busy === alert.key || loading} onMarkSent={() => void mark(alert, 'notified')} onClose={() => setEmailPanel(null)} />}
        {panel && <div className={styles.contact}>{panel.contacts.length ? <><label>Responsável da unidade<select aria-label="Responsável da unidade" value={panel.selected} onChange={(event) => setContactPanel({ ...panel, selected: event.target.value })}>{panel.contacts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.whatsapp}</option>)}</select></label><p>A mensagem será aberta para você revisar e enviar no WhatsApp.</p><a className={styles.send} href={link} target="_blank" rel="noopener noreferrer">Abrir mensagem no WhatsApp</a><button className="button secondary" disabled={busy === alert.key || loading || !!state?.notifiedAt} onClick={() => mark(alert, 'notified')}>{state?.notifiedAt ? 'Comunicação registrada' : 'Já enviei: registrar comunicação'}</button></> : <p>Cadastre um responsável com WhatsApp válido na ficha desta unidade para preparar a mensagem.</p>}</div>}
      </article>;
    })}</div>}
  </section>;
}

export default GoalAlerts;
