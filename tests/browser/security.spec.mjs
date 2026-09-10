import { test, expect } from '@playwright/test';
const origin='http://127.0.0.1:3000';
const loginData={email:'browser-test@example.com',password:'Synthetic-only-password-123!'};
const post=(request,data=loginData,headers={})=>request.post('/api/auth/login',{data,headers:{origin,...headers}});
test('unauthenticated routes fail closed, including API, RSC and extension-spoofed links',async({request})=>{
  for(const path of ['/','/dashboard','/imports','/registry','/relatorio.xlsx','/private.png','/login/admin','/brand/private.pdf']){
    const r=await request.get(path,{maxRedirects:0});expect(r.status(),path).toBe(307);expect(r.headers().location).toBe(`${origin}/login`);
  }
  for(const path of ['/api/health','/api/auth/session','/api/unknown','/api/data.json']){
    const r=await request.get(path,{maxRedirects:0});expect(r.status(),path).toBe(401);expect(await r.json()).toEqual({error:'Autenticação necessária.'});
  }
  for(const headers of [{RSC:'1'},{'x-user-id':'admin','x-authenticated-user':'admin'},{'x-middleware-subrequest':'proxy:proxy:proxy:proxy:proxy'}]){
    const r=await request.get('/',{headers,maxRedirects:0});expect([307,401,403]).toContain(r.status());expect(await r.text()).not.toContain('Começar pelo cadastro manual');
  }
});
test('login renders on desktop and mobile without data, inline-script exceptions or horizontal overflow',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const r=await page.goto('/');await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading',{name:'Entre na sua conta'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Importar base',exact:true})).toHaveCount(0);
  const csp=r.headers()['content-security-policy'];expect(csp).toContain("frame-ancestors 'none'");expect(csp).toMatch(/nonce-[A-Za-z0-9+/=]+/);
  expect(csp.split(';').find(x=>x.trim().startsWith('script-src '))).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(r.headers()['cache-control']).toContain('no-store');
  await page.screenshot({path:testInfo.outputPath('login-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('login-mobile.png'),fullPage:true});
  expect(errors).toEqual([]);
});
test('malformed and forged cookies cannot open the dashboard or APIs',async({request})=>{
  for(const value of ['invalid','base64-eyJ1c2VyIjp7ImlkIjoiYWRtaW4ifX0',encodeURIComponent(JSON.stringify({access_token:'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.',user:{id:'admin'}}))]){
    const headers={cookie:`sb-127-auth-token=${value}`};
    expect((await request.get('/',{headers,maxRedirects:0})).status()).toBe(307);
    expect((await request.get('/api/auth/session',{headers})).status()).toBe(401);
  }
});
test('CSRF, unsupported content and oversized credential payloads are rejected',async({request})=>{
  expect((await post(request,loginData,{origin:'https://attacker.invalid'})).status()).toBe(403);
  expect((await request.post('/api/auth/login',{data:loginData})).status()).toBe(403);
  expect((await post(request,{email:'x@example.com',password:'x'.repeat(5000)})).status()).toBe(400);
  expect((await request.post('/api/auth/login',{data:'{',headers:{origin,'content-type':'application/json'}})).status()).toBe(400);
});
test('correct login uses server cookies; logout invalidates replay of the old session',async({request})=>{
  const r=await post(request);expect(r.status()).toBe(200);expect(await r.json()).toEqual({ok:true});
  const cookies=(await request.storageState()).cookies;expect(cookies.some(c=>c.name.startsWith('sb-')&&c.secure&&c.sameSite==='Lax')).toBe(true);
  const session=await request.get('/api/auth/session');expect(session.status()).toBe(200);expect((await session.json()).userId).toBe('00000000-0000-0000-0000-000000000001');
  expect((await request.get('/',{maxRedirects:0})).status()).toBe(200);
  // Extract this synthetic token only to exercise provider revocation. Never print it or use production accounts.
  const chunks=cookies.filter(c=>/^sb-127-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name));
  const packed=decodeURIComponent(chunks.map(c=>c.value).join(''));
  const payload=JSON.parse(packed.startsWith('base64-')?Buffer.from(packed.slice(7),'base64url').toString():packed);
  const revoke=await request.post('http://127.0.0.1:4600/auth/v1/logout',{headers:{authorization:`Bearer ${payload.access_token}`}});expect(revoke.status()).toBe(200);
  expect((await request.get('/api/auth/session')).status()).toBe(401);
  expect((await request.get('/',{maxRedirects:0})).status()).toBe(307);
});
test('controlled password guessing is throttled without locking a real account',async({request})=>{
  const data={email:'invalid-only-test@example.com',password:'not-a-real-password'};
  for(let i=0;i<6;i++)expect((await post(request,data)).status()).toBe(401);
  for(let i=0;i<3;i++){const r=await post(request,data);expect(r.status()).toBe(429);expect(Number(r.headers()['retry-after'])).toBeGreaterThan(0);}
});
test('bounded local concurrency: 60 unauthenticated requests remain blocked, without production load',async({request})=>{
  for(let batch=0;batch<12;batch++){
    const results=await Promise.all(Array.from({length:5},()=>request.get('/api/health')));
    expect(results.every(r=>r.status()===401)).toBe(true);
  }
});
