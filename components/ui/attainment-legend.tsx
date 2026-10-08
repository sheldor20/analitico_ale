import { attainmentBand } from '@/lib/attainment.mjs';

export default function AttainmentLegend() {
  return <div className="attainment-legend" aria-label="Legenda de atingimento realizado">
    <span>Atingimento realizado:</span>
    {[0, 0.7, 1, null].map(value => {
      const band = attainmentBand(value);
      return <span key={band.key} data-attainment={band.key}><i aria-hidden="true" />{band.label}</span>;
    })}
  </div>;
}
