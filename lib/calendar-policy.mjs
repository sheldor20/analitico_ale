export function calendarDates(text,year){
 const dates=[...new Set(String(text).split(/[\s,;]+/).filter(Boolean))].sort();
 if(dates.length>366)throw new Error('Informe até 366 datas sem expediente.');
 for(const date of dates){const parsed=new Date(`${date}T12:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,4)!==String(year)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw new Error(`Data inválida para ${year}: ${date}. Use AAAA-MM-DD.`);}
 return dates;
}
export function calendarDescription(dates=[]){return dates.length?`Segunda a sexta, descontando ${dates.length} ${dates.length===1?'data sem expediente cadastrada':'datas sem expediente cadastradas'}.`:'Segunda a sexta, sem descontar feriados. Nenhum calendário adicional cadastrado.';}
