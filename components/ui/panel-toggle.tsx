import { ChevronDown } from 'lucide-react';

export default function PanelToggle({ expanded, onToggle, controls, label }: {
  expanded: boolean;
  onToggle: () => void;
  controls: string;
  label: string;
}) {
  const action = expanded ? 'Recolher' : 'Expandir';
  return <button type="button" className="panel-disclosure-toggle" aria-label={`${action} ${label}`}
    aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
    <span>{action}</span><ChevronDown size={16} aria-hidden="true" />
  </button>;
}
