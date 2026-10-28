import { cents, roundMoney } from './money.mjs';
import { initializeRegistry } from './registry.mjs';

/** Describe the effective write, including blank cells and protected corrections. */
export function productionChanges(existing, incoming) {
 const previous=new Map(existing.map(row=>[row.key,row]));
 return incoming.flatMap(row=>{
  const before=previous.get(row.key);const last=Number(row.cutoff.slice(5,7))-1;
  return row.actuals.flatMap((value,month)=>{
   if(value==null||month>last||before?.cutoff===row.cutoff&&before.manualActualMonths?.includes(month))return [];
   const old=before?.actuals[month]??null;
   if(old!=null&&cents(old)===cents(value))return [];
   return [{key:row.key,central:row.central,cooperative:row.cooperative,pa:row.pa,name:row.name,metric:row.metric,month,before:old,after:roundMoney(value),delta:old==null?null:roundMoney(value-old)}];
  });
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
