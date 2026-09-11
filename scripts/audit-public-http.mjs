// Read-only, bounded HEAD requests to the exact user-authorized application.
// Never downloads a document, attempts a password, follows a redirect or prints body/cookies.
import { writeFile } from 'node:fs/promises';
const origin='https://analitico-ale.vercel.app';
const paths=['/','/login','/api/health','/api/auth/session','/robots.txt','/.env','/.git/config','/export.xlsx','/dashboard','/registry'];
const results=[];
for(const path of paths){
  try{
    const r=await fetch(origin+path,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(10000)});
    const location=r.headers.get('location');
    results.push({path,status:r.status,redirect:location?new URL(location,origin).pathname:null,csp:Boolean(r.headers.get('content-security-policy')),frameDeny:r.headers.get('x-frame-options')==='DENY',noStore:(r.headers.get('cache-control')||'').includes('no-store'),hsts:Boolean(r.headers.get('strict-transport-security'))});
  }catch{results.push({path,error:'network request failed; no HTTP conclusion'});}
  await new Promise(resolve=>setTimeout(resolve,300));
}
const report={scope:'production read-only snapshot; PR is not deployed by this check',observedAt:new Date().toISOString(),method:'HEAD, no credentials, no redirects followed',results};
console.log(JSON.stringify(report,null,2));await writeFile('production-http-audit.json',JSON.stringify(report,null,2));
