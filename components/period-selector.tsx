"use client";

import { useEffect, useState } from 'react';
import { MONTHS } from '@/lib/analytics.mjs';
import { analysisMonth, currentCalendarMonth, PERIOD_OPTIONS, periodCoverage } from '@/lib/periods.mjs';
import styles from './period-selector.module.css';

/** One selection contract for analysis and outgoing communications. */
export function usePeriodSelection(initialPeriod = 'ytd', initialMonth?: number) {
  const [calendarMonth, setCalendarMonth] = useState(() => currentCalendarMonth());
  const [period, setPeriodValue] = useState(Object.hasOwn(PERIOD_OPTIONS, initialPeriod) ? initialPeriod : 'ytd');
  const [referenceMonth, setReferenceMonth] = useState(initialMonth ?? calendarMonth);
  useEffect(() => {
    const refresh = () => setCalendarMonth(currentCalendarMonth());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const month = analysisMonth(period, referenceMonth, calendarMonth);
  function setPeriod(value: string) {
    if (Object.hasOwn(PERIOD_OPTIONS, value)) setPeriodValue(value);
  }
  function setMonth(value: number) {
    if (Number.isInteger(value) && value >= 0 && value <= 11) setReferenceMonth(value);
  }
  return { period, month, setPeriod, setMonth };
}

type Props = {
  period: string; month: number; year: number;
  onPeriodChange: (value: string) => void; onMonthChange: (value: number) => void;
  label?: string;
};

export default function PeriodSelector({ period, month, year, onPeriodChange, onMonthChange, label = 'Período' }: Props) {
  return <>
    <label>{label}<select aria-label={label} value={period} onChange={event => onPeriodChange(event.target.value)}>
      {Object.entries(PERIOD_OPTIONS).map(([value, text]) => <option value={value} key={value}>{text}</option>)}
    </select></label>
    {period === 'month' && <label>Mês de referência<select aria-label="Mês de referência" value={month} onChange={event => onMonthChange(Number(event.target.value))}>
      {MONTHS.map((text, index) => <option value={index} key={text}>{text} / {year}</option>)}
    </select></label>}
    {period === 'quarter' && <label>Trimestre<select aria-label="Trimestre" value={Math.floor(month / 3) + 1} onChange={event => onMonthChange(Number(event.target.value) * 3 - 1)}>
      {[1, 2, 3, 4].map(value => <option value={value} key={value}>{value}º trimestre · {MONTHS[(value - 1) * 3]} a {MONTHS[value * 3 - 1]} / {year}</option>)}
    </select></label>}
    {period === 'semester' && <label>Semestre<select aria-label="Semestre" value={Math.floor(month / 6) + 1} onChange={event => onMonthChange(Number(event.target.value) * 6 - 1)}>
      {[1, 2].map(value => <option value={value} key={value}>{value}º semestre · {MONTHS[(value - 1) * 6]} a {MONTHS[value * 6 - 1]} / {year}</option>)}
    </select></label>}
    {(period === 'annual' || period === 'ytd') && <div className={styles.coverage} aria-live="polite" aria-label="Abrangência do período">
      <span>{period === 'annual' ? 'Ano completo' : 'Janeiro ao mês atual'}</span>
      <strong>{periodCoverage(period, month, year)}</strong>
      {period === 'ytd' && <small>Atualizado pelo calendário de Brasília.</small>}
    </div>}
  </>;
}
