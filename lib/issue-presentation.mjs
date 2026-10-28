/** Provenance is preserved; only current actionable issues drive the menu badge. */
export function issueCategory(issue) {
 if(issue.kind==='method')return 'method';
 if(['reconciliation','registry'].includes(issue.kind))return 'attention';
 if(issue.kind==='source' && /nome.*ausente|com erro|código.*ausente|não reconhecid/i.test(issue.message))return 'attention';
 if(issue.kind==='source' && /preservad|após o corte|apos o corte|históric|historici|ajuste negativo|regra P[1-5]/i.test(issue.message))return 'information';
 return 'attention';
}
export const actionableIssueCount = issues => issues.filter(issue=>issueCategory(issue)==='attention').length;
export function groupIssues(issues) {
 const groups=new Map();
 for(const issue of issues){const category=issueCategory(issue);const pattern=String(issue.message).replace(/\b\d{1,6}\b/g,'#');const key=category==='attention'?`${category}:${issue.message}`:`${category}:${pattern}`;
  if(!groups.has(key))groups.set(key,{...issue,category,count:0,occurrences:[]});groups.get(key).count++;groups.get(key).occurrences.push(issue);
 }
 return [...groups.values()];
}
