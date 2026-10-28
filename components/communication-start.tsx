"use client";
import { useId, useState } from 'react';
import { Mail, ImageIcon, LayoutDashboard, ArrowRight } from 'lucide-react';

export type CommunicationChoice = { content: 'central' | 'cooperative' | 'pa'; format: 'email' | 'image' | 'summary'; showProjection: boolean };
export default function CommunicationStart({ level, scope, period, onCancel, onContinue }: {
  level: string; scope: string; period: string; onCancel: () => void; onContinue: (choice: CommunicationChoice) => void;
}) {
  const formatName = useId();
  const [showProjection, setShowProjection] = useState(false);
  const [format, setFormat] = useState<CommunicationChoice['format']>('email');
  return <div className="communication-start">
    <div className="share-start-context"><strong>{scope}</strong><span>{period}</span></div>
    <fieldset><legend>Canal de compartilhamento</legend>
      {([['image', 'WhatsApp', ImageIcon], ['email', 'E-mail', Mail], ['summary', 'Painel resumido', LayoutDashboard]] as const).map(([value, label, Icon]) => <label key={value}><input type="radio" name={formatName} checked={format === value} onChange={() => setFormat(value)} /><Icon size={20} aria-hidden="true" /><span>{label}</span></label>)}
    </fieldset>
    <label className="share-start-projection"><input aria-label="Incluir projeção de produção" type="checkbox" checked={showProjection} onChange={event => setShowProjection(event.target.checked)} /><span>Incluir projeção de produção</span></label>
    <footer className="share-start-footer"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button>
    <button type="button" className="button primary" onClick={() => onContinue({content:level === 'central' ? 'central' : level === 'pa' ? 'pa' : 'cooperative', format, showProjection})}>Ver prévia<ArrowRight size={16} aria-hidden="true" /></button></footer>
  </div>;
}
