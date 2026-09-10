from pathlib import Path
import re
p=Path('components/dashboard.tsx');s=p.read_text()
# Explicit column scopes preserve table semantics in the accessibility tree.
s=re.sub(r'<th(?=[\s>])(?![^>]*\bscope=)', '<th scope="col"', s)
s=s.replace('    level,\n  ]);','    level,\n    sortBy,\n    statusFilter,\n  ]);',1)
p.write_text(s)
p=Path('components/dashboard-ux.css');s=p.read_text()
if '/* Bounded checkbox' not in s:
 s+='\n/* Bounded checkbox overrides the generic full-width form input rule. */\n.workspace-content .table-controls .indicator-toggle input[type="checkbox"]{width:18px;height:18px;min-height:18px;padding:0;flex:0 0 18px;margin:0;accent-color:var(--sicoob-dark)}\n'
p.write_text(s)
p=Path('components/scenario-panels.module.css');s=p.read_text()
if '/* Bounded checkbox' not in s:
 s+='\n/* Bounded checkbox overrides the generic full-width form input rule. */\n.section .controls .check input[type="checkbox"]{width:18px;height:18px;min-height:18px;padding:0;flex:0 0 18px;margin:0;accent-color:var(--sicoob-dark)}\n.section .controls .check{gap:8px;font-size:13px;max-width:360px}\n'
p.write_text(s)
