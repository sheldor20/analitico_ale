import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicRequest,sameOrigin,securityHeaders } from '../lib/auth-policy.mjs';
import { LoginLimiter,readLoginBody } from '../lib/login-limiter.mjs';
test('default-deny covers exports, API, extension tricks, login prefixes, RSC and unknown routes',()=>{
  for(const path of ['/','/dashboard','/api/health','/api/auth/session','/api/data.json','/export.xlsx','/login/admin','/brand/private.xlsx','/private.png','/_next/image','/_next/static/../secrets','/_next/static/%2e%2e/secrets']) assert.equal(isPublicRequest(path),false,path);
  for(const path of ['/login','/robots.txt','/brand/sicoob-logo.svg','/_next/static/chunks/app.js']) assert.equal(isPublicRequest(path),true,path);
  assert.equal(isPublicRequest('/login','POST'),false); assert.equal(isPublicRequest('/api/auth/login','POST'),true);
  assert.equal(isPublicRequest('/api/auth/login','GET'),false);
});
test('CSRF rejects absent, null, cross-origin and sibling-subdomain origins',()=>{
  const url='https://app.example.com/api/auth/login';
  for(const origin of ['', 'null','https://attacker.example','https://other.example.com']) assert.equal(sameOrigin(new Request(url,{headers:origin?{origin}:{}})),false);
  assert.equal(sameOrigin(new Request(url,{headers:{origin:'https://app.example.com','sec-fetch-site':'same-origin'}})),true);
  assert.equal(sameOrigin(new Request(url,{headers:{origin:'https://app.example.com','sec-fetch-site':'cross-site'}})),false);
});
test('CSRF uses the destination Host behind a proxy, never an untrusted forwarded host',()=>{
  const url='http://localhost:3000/api/auth/login';
  const make=headers=>new Request(url,{headers});
  assert.equal(sameOrigin(make({host:'app.example.com',origin:'https://app.example.com'})),true);
  assert.equal(sameOrigin(make({host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'})),true);
  assert.equal(sameOrigin(make({host:'app.example.com',origin:'https://attacker.example','x-forwarded-host':'attacker.example'})),false);
  assert.equal(sameOrigin(make({host:'app.example.com',origin:'http://app.example.com'})),false);
  assert.equal(sameOrigin(make({host:'app.example.com',origin:'https://app.example.com/path'})),false);
  assert.equal(sameOrigin(make({host:'app.example.com',origin:'https://app.example.com:444'})),false);
  assert.equal(sameOrigin(make({host:'app.example.com',referer:'https://app.example.com/'})),false);
});
test('CSP uses request nonce, no inline scripts or eval in production, and sensitive responses are never cached',()=>{
  const h=securityHeaders('abc','https://project.supabase.co',true), c=h['Content-Security-Policy'];
  assert.match(c,/nonce-abc/); assert.match(c,/frame-ancestors 'none'/); assert.match(c,/script-src-attr 'none'/);
  assert.doesNotMatch(c.split(';').find(x=>x.trim().startsWith('script-src ')),/unsafe-inline|unsafe-eval/);
  assert.match(c,/connect-src 'self' https:\/\/project.supabase.co wss:\/\/project.supabase.co/);
  assert.match(h['Cache-Control'],/private, no-store/); assert.equal(h['Vercel-CDN-Cache-Control'],'no-store');
});
test('bounded supplemental login limiter blocks repeated guesses and expires without unbounded memory',()=>{
  const l=new LoginLimiter({limit:6,windowMs:60000,maxEntries:2});
  for(let i=0;i<6;i++) assert.equal(l.consume('one',0).allowed,true);
  for(let i=0;i<1000;i++) assert.equal(l.consume('one',1).allowed,false);
  assert.equal(l.consume('two',2).allowed,true); assert.equal(l.consume('three',2).allowed,false); assert.equal(l.entries.size,2);
  assert.equal(l.consume('one',60001).allowed,true);
});
test('login input rejects malformed, oversized and deceptive bodies before Auth is called',async()=>{
  const request=(body,headers={})=>new Request('https://app.example.com/api/auth/login',{method:'POST',body,headers:{'content-type':'application/json',...headers}});
  for(const body of ['{', 'null', '{}', JSON.stringify({email:'test@example.com',password:'x'.repeat(5000)}),JSON.stringify({email:[],password:'a'})]) await assert.rejects(()=>readLoginBody(request(body)));
  await assert.rejects(()=>readLoginBody(request('x'.repeat(5000),{'content-length':'1'})));
  assert.deepEqual(await readLoginBody(request(JSON.stringify({email:'  Test@Example.com  ',password:'space is valid '}))),{email:'test@example.com',password:'space is valid '});
});
