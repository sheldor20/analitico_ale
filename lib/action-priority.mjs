/** Validation comes first, then overdue commitments and monetary recovery. */
export function sortActionPriority(rows, actions={}, today='') {
 const rank=row=>!row.complete||row.annualConflict||row.target==null||row.target<=0?0:actions[row.key]?.status!=='Concluída'&&actions[row.key]?.due&&actions[row.key].due<today?1:row.gap>0?2:3;
 return [...rows].sort((a,b)=>rank(a)-rank(b)||(b.gap??0)-(a.gap??0)||String(a.name).localeCompare(String(b.name),'pt-BR',{numeric:true}));
}
