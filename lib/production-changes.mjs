import { cents, roundMoney, sumMoney } from './money.mjs';
import { initializeRegistry } from './registry.mjs';

const manualAtSameCutoff = (saved, row, month) => saved?.cutoff === row.cutoff && saved.manualActualMonths?.includes(month);

/** Describe the effective write, including blank cells and protected corrections. */
export function productionChanges(existing, incoming) {
 const previous=new Map(existing.map(row=>[row.key,row]));
 return incoming.flatMap(row=>{
  const before=previous.get(row.key);const last=Number(row.cutoff.slice(5,7))-1;
  return row.actuals.flatMap((value,month)=>{
   if(value==null||month>last||manualAtSameCutoff(before,row,month))return [];
   const old=before?.actuals[month]??null;
   if(old!=null&&cents(old)===cents(value))return [];
   return [{key:row.key,central:row.central,cooperative:row.cooperative,pa:row.pa,name:row.name,metric:row.metric,month,before:old,after:roundMoney(value),delta:old==null?null:roundMoney(value-old)}];
  });
 });
}

export function vnAccumulatedDifferences(existing, incoming, reportedTotals) {
  const previous = new Map(existing.map(row => [row.key, row]));
  return incoming.flatMap(row => {
    const reported = reportedTotals[row.key];
    if (reported == null) return [];
    const saved = previous.get(row.key);
    const end = Number(row.cutoff.slice(5, 7));
    const values = row.actuals.slice(0, end).map((value, month) => manualAtSameCutoff(saved, row, month) ? saved.actuals[month] : value);
    if (values.some(value => value == null)) return [];
    const actual = sumMoney(values);
    return actual === roundMoney(reported) ? [] : [{ key: row.key, central: row.central, cooperative: row.cooperative, name: saved?.name ?? row.name, reported, actual }];
  });
}

/** Restore observed production only. Current goals, membership and contacts stay intact. */
export function restoreProduction(current, snapshot) {
 if(current.year!==snapshot.year)throw new Error('A versão pertence a outro ano.');
 const old=new Map(snapshot.rows.map(row=>[row.key,row]));
 const result=structuredClone(current);
 result.rows=result.rows.map(row=>{
  const prior=old.get(row.key);
  return {...row,actuals:prior?[...prior.actuals]:Array(12).fill(null),cutoff:prior?.cutoff||row.cutoff,manualActualMonths:prior?.manualActualMonths||[],sourceFile:prior?.sourceFile||row.sourceFile,sheet:prior?.sheet||row.sheet,sourceRow:prior?.sourceRow??row.sourceRow};
 });
 result.importedAt=new Date().toISOString();
 return initializeRegistry(result);
}
