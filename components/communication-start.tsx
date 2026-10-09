"use client";
import { useState } from 'react';

export type CommunicationChoice = { content: 'central' | 'cooperative' | 'pa'; format: 'email' | 'image' | 'summary'; showProjection: boolean };
export default function CommunicationStart({ level, scope, period, onContinue }: {
  level: string; scope: string; period: string; onContinue: (choice: CommunicationChoice) => void;
}) {
  const [showProjection, setShowProjection] = useState(false);
  const [format, setFormat] = useState<CommunicationChoice['format']>('email');
  return <div className="communication-start">
    <p><strong>{scope}</strong><br />{period}</p>
    <fieldset><legend>Formato</legend>
      {([['email', 'E-mail'], ['image', 'Imagem para WhatsApp'], ['summary', 'Painel resumido']] as const).map(([value, label]) => <label key={value}><input type="radio" name="communication-format" checked={format === value} onChange={() => setFormat(value)} /><span>{label}</span></label>)}
    </fieldset>
    <label><input aria-label="Incluir projeção de produção" type="checkbox" checked={showProjection} onChange={event => setShowProjection(event.target.checked)} /><span>Incluir projeção de produção</span></label>
    <p className="helper">A prévia usa os filtros e a ordem da visão atual.</p>
    <button type="button" className="button primary" onClick={() => onContinue({content:level === 'central' ? 'central' : level === 'pa' ? 'pa' : 'cooperative', format, showProjection})}>Continuar</button>
  </div>;
}
