'use client';
import { useState } from 'react';

export type CommunicationChoice = { content: 'cooperative' | 'pa' | 'individual'; format: 'email' | 'image' | 'summary' };
export default function CommunicationStart({ level, scope, period, selectedCount, hasCooperatives, hasPas, onContinue }: {
  level: string; scope: string; period: string; selectedCount: number; hasCooperatives: boolean; hasPas: boolean; onContinue: (choice: CommunicationChoice) => void;
}) {
  const [content, setContent] = useState<CommunicationChoice['content']>(level === 'pa' ? 'pa' : 'cooperative');
  const [format, setFormat] = useState<CommunicationChoice['format']>('email');
  return <div className="communication-start">
    <p><strong>{scope}</strong><br />{period}</p>
    <fieldset><legend>Conteúdo</legend>
      {hasCooperatives && <label><input type="radio" name="communication-content" checked={content === 'cooperative'} onChange={() => setContent('cooperative')} /><span>Cooperativas da seleção</span></label>}
      {hasPas && <label><input aria-label="PAs da seleção" type="radio" name="communication-content" checked={content === 'pa'} onChange={() => setContent('pa')} /><span>PAs da seleção<small>Venda Nova · metas da cadência</small></span></label>}
      <label><input aria-label="Uma unidade" type="radio" name="communication-content" checked={content === 'individual'} onChange={() => setContent('individual')} /><span>Uma unidade<small>Escolha a central, cooperativa ou PA da lista atual.</small></span></label>
    </fieldset>
    <fieldset><legend>Formato</legend>
      {([['email', 'E-mail'], ['image', 'Imagem para WhatsApp'], ['summary', 'Painel resumido']] as const).map(([value, label]) => <label key={value}><input type="radio" name="communication-format" checked={format === value} onChange={() => setFormat(value)} /><span>{label}</span></label>)}
    </fieldset>
    <p className="helper">{selectedCount ? `${selectedCount} unidades selecionadas. Você poderá revisar a seleção e a ordem.` : 'Os filtros atuais serão usados. Você poderá revisar as unidades e a mensagem.'}</p>
    <button type="button" className="button primary" onClick={() => onContinue({content, format})}>Continuar</button>
  </div>;
}
