const choices={area:['overview','actions','audit','imports','registry','alerts','agenda','cnv'],tab:['overview','units','pas','periods','comparison','simulation'],source:['base','cadence'],metric:['VN','AR','both'],period:['month','quarter','semester','annual','ytd'],level:['central','cooperative','pa']};
export function readNavigation(search){
 const q=new URLSearchParams(search),result={};
 for(const [key,values] of Object.entries(choices))if(values.includes(q.get(key)))result[key]=q.get(key);
 for(const key of ['central','coop','pa']){const value=q.get(key);if(value==='all'||/^\d{1,12}(?::\d{1,12}){0,2}$/.test(value||''))result[key]=value;}
 if(/^P[1-5]$/.test(q.get('group')||'')||q.get('group')==='all')result.group=q.get('group');
 const year=Number(q.get('year')),month=Number(q.get('month'));
 if(q.has('year')&&Number.isInteger(year)&&year>=2020&&year<=2100)result.year=year;
 if(q.has('month')&&Number.isInteger(month)&&month>=0&&month<=11)result.month=month;
 return result;
}
export function navigationSearch(state){
 const q=new URLSearchParams();
 for(const key of [...Object.keys(choices),'year','month','central','coop','pa','group'])if(state[key]!=null)q.set(key,String(state[key]));
 return '?'+q.toString();
}
