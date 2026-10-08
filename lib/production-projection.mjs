/** Presentation only: production estimates always come from the shared analysis. */
export function projectionDetails(values, uplift = 0) {
  const available = values.complete && !values.annualConflict && Number.isFinite(values.projected);
  const value = available ? values.projected : null;
  const attainment = available && Number.isFinite(values.projectedAttainment) ? values.projectedAttainment : null;
  const phase = values.phase || (available ? 'Parcial' : 'Sem estimativa');
  const assumption = !available ? 'Sem estimativa: dados insuficientes ou metas divergentes.'
    : phase === 'Fechado' ? 'Período encerrado: a estimativa coincide com o realizado.'
    : `Estimativa pelo ritmo observado até o corte e pelas metas restantes; considera dias úteis, sem descontar feriados.${uplift > 0 ? ` Simulação de ritmo +${uplift}% somente na produção futura.` : ''}`;
  return { value, attainment, phase, assumption };
}
