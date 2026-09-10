// Synthetic Auth provider for browser/SSR integration only. Never imported by application code.
import http from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
const host='127.0.0.1',port=4600, secret='synthetic-test-signing-key-not-a-production-secret';
const sessions=new Map();
const owner='00000000-0000-0000-0000-000000000001';
const user={id:owner,aud:'authenticated',role:'authenticated',email:'browser-test@example.com',email_confirmed_at:'2026-09-10T12:00:00Z',is_anonymous:false,app_metadata:{provider:'email',commercial_access:true},user_metadata:{},created_at:'2026-09-10T12:00:00Z'};
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(sessionId) {
  const head=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:owner,role:'authenticated',aud:'authenticated',session_id:sessionId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})}`;
  return `${head}.${createHmac('sha256',secret).update(head).digest('base64url')}`;
}
function claims(value) {
  try {
    const [h,p,s,...extra]=(value||'').replace(/^Bearer /,'').split('.');
    if(extra.length||!h||!p||!s)return null;
    const wanted=createHmac('sha256',secret).update(`${h}.${p}`).digest(); const got=Buffer.from(s,'base64url');
    if(got.length!==wanted.length||!timingSafeEqual(got,wanted))return null;
    const c=JSON.parse(Buffer.from(p,'base64url')); return c.exp>Date.now()/1000&&sessions.has(c.session_id)?c:null;
  } catch {return null;}
}
http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json'); res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3000');
  res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  const send=(status,value)=>{res.writeHead(status);res.end(JSON.stringify(value));};
  if(req.method==='OPTIONS')return send(204,{});
  const url=new URL(req.url,`http://${host}:${port}`),c=claims(req.headers.authorization);
  if(url.pathname==='/ready')return send(200,{ok:true});
  if(url.pathname==='/auth/v1/token'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return send(400,{error:'invalid_request'});}
    let payload;try{payload=JSON.parse(body);}catch{return send(400,{error:'invalid_request'});}
    let id;
    if(url.searchParams.get('grant_type')==='refresh_token') id=[...sessions].find(([,v])=>v===payload.refresh_token)?.[0];
    else if(payload.email===user.email&&payload.password==='Synthetic-only-password-123!') {id=randomUUID();sessions.set(id,randomUUID());}
    if(!id)return send(400,{error:'invalid_grant',code:'invalid_credentials',error_description:'Invalid login credentials'});
    return send(200,{access_token:token(id),refresh_token:sessions.get(id),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
  }
  if(url.pathname==='/auth/v1/user')return c?send(200,user):send(401,{code:'bad_jwt',message:'Invalid JWT'});
  if(url.pathname==='/auth/v1/logout'){if(c)sessions.delete(c.session_id);return send(200,{});}
  if(url.pathname==='/rest/v1/rpc/commercial_session_allowed')return c?send(200,true):send(401,{message:'Unauthorized'});
  return send(404,{message:'Test endpoint not found'});
}).listen(port,host,()=>console.log('Synthetic Auth listening on loopback'));
