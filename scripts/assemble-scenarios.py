from pathlib import Path
p=Path('components/dashboard.tsx');s=p.read_text()
old='''      setDataset(next); setWorkspaceRevision(saved?.revision ?? null); setConfig(next.config);
      setHistorical(false); setDatasetId(null); setSelected(null); setActions({}); resetFilters();'''
new='''      sessionYears.current.set(next.year, next);
      setDataset(next); setWorkspaceRevision(saved?.revision ?? null); setConfig(next.config);
      if (owner) refreshWorkspaces(owner);
      setHistorical(false); setDatasetId(null); setSelected(null); setActions({}); resetFilters();'''
if new not in s:
    if old not in s: raise RuntimeError('Workspace reload anchor missing')
    s=s.replace(old,new)
old='''    search,
    level,
  ]);'''
new='''    search,
    level,
    sortBy,
    statusFilter,
  ]);'''
if new not in s:
    if old not in s: raise RuntimeError('Pagination reset anchor missing')
    s=s.replace(old,new)
p.write_text(s)
print('Annual workspace reload refreshes available historical years; sorting resets pagination.')
