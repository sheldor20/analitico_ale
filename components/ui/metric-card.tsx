import type { ReactNode } from 'react';
/** Actuals, targets and estimates share typography, never their meaning. */
export default function MetricCard({ title, value, sub, icon, accent = false, progress }: {
  title: string; value: string; sub: string; icon: ReactNode; accent?: boolean; progress?: number | null;
}) {
  const measurable = typeof progress === 'number' && Number.isFinite(progress);
  return <article className={`kpi panel ${accent ? 'accent' : ''}`} aria-label={title}>
    <div className="kpi-heading"><span>{title}</span><span aria-hidden="true">{icon}</span></div>
    <strong className="kpi-value">{value}</strong>
    <p>{sub}</p>
    {measurable && <div className="metric-progress" role="meter" aria-label="Atingimento da meta"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(100, progress * 100))}
      aria-valuetext={`${(progress * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da meta`}>
      <span style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
    </div>}
  </article>;
}
