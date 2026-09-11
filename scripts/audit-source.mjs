// Lightweight guardrails, not a substitute for a full secret-scanning service.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const findings=[];
const patterns=[['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['Supabase secret',/sb_secret_[A-Za-z0-9_-]{20,}/],['GitHub token',/(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/]];
for(const path of files){
  if(/^public\//.test(path)&&/\.(?:xlsx?|csv|sql|json|map|zip|pdf)$/i.test(path))findings.push({path,type:'sensitive artifact in public/'});
  if(/(?:^|\/)\.env(?:\.|$)/.test(path)&&!path.endsWith('.example'))findings.push({path,type:'environment file tracked'});
  if(!/\.(?:m?[jt]sx?|sql|md|ya?ml|json)$/.test(path)&&!path.includes('.env'))continue;
  const text=readFileSync(path,'utf8');
  for(const [type,pattern] of patterns)if(pattern.test(text))findings.push({path,type});
  for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
    try{if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url')).role==='service_role')findings.push({path,type:'privileged JWT'});}catch{}
  }
}
console.log(JSON.stringify({filesChecked:files.length,findings},null,2));
if(findings.length)process.exitCode=1;
