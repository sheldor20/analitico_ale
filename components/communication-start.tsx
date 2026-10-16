"use client";
import { useId, useState } from 'react';

export type CommunicationChoice = { content: 'central' | 'cooperative' | 'pa'; format: 'email' | 'image' | 'summary'; showProjection: boolean };
export default function CommunicationStart({ level, scope, period, onContinue }: {
  level: string; scope: string; period: string; onContinue: (choice: CommunicationChoice) => void;
}) {
  const formatName = useId();
  const [showProjection, setShowProjection] = useState(false);
  const [format, setFormat] = useState<CommunicationChoice['format']>('email');
  return <div className="communication-start">
    <p><strong>{scope}</strong><br />{period}</p>
    <fieldset><legend>Formato</legend>
      {([['email', 'E-mail'], ['image', 'Imagem para WhatsApp'], ['summary', 'Painel resumido']] as const).map(([value, label]) => <label key={value}><input type="radio" name={formatName} checked={format === value} onChange={() => setFormat(value)} /><span>{label}</span></label>)}
    </fieldset>
    <label><input aria-label="Incluir projeção de produção" type="checkbox" checked={showProjection} onChange={event => setShowProjection(event.target.checked)} /><span>Incluir projeção de produção</span></label>
    <p className="helper">Confira a prévia antes de gerar a saída. Filtros, ordem e todas as unidades selecionadas acompanham o cenário.</p>
    <button type="button" className="button primary" onClick={() => onContinue({content:level === 'central' ? 'central' : level === 'pa' ? 'pa' : 'cooperative', format, showProjection})}>Continuar</button>
  </div>;
}
