import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import notes from '../api/notes.js';
import login from '../api/admin/login.js';
import logout from '../api/admin/logout.js';
import check from '../api/admin/check.js';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};}
function request(body){return {method:'POST',body,headers:{origin:'https://www.pinitworld.com','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}};}
test('notes API validates, moderates, derives trusted metadata and maps conflicts/failures',async()=>{
 process.env.LIMITER_SECRET='x'.repeat(32);delete process.env.VERCEL;
 const original=global.fetch;const calls=[];
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
 global.fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return new Response(JSON.stringify(url.endsWith('take_rate_limit') ? true:[{id:'new-note',note_date:new Date().toISOString().slice(0,10),country:'Unknown'}]),{status:200});};
 try {
  let res=response();await notes(request({content:'A kind little thought',alias:'Alice',color:'#e63946'}),res);
  assert.equal(res.code,201);assert.equal(res.headers['Cache-Control'],'no-store');
  const payload=calls[1].body;assert.equal(payload.p_country,'Unknown');assert.equal(payload.p_day,new Date().toISOString().slice(0,10));assert.match(payload.p_key,/^[a-f0-9]{64}$/);assert(!JSON.stringify(res.data).includes(payload.p_key));
  res=response();await notes(request({content:'A kind little thought',alias:'Alice',color:'#e63946',country:'Fake'}),res);assert.equal(res.code,400);assert.equal(calls.length,2);
  global.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('take_rate_limit')?true:{code:'23505',message:'duplicate'}),{status:url.endsWith('take_rate_limit')?200:409});
  res=response();await notes(request({content:'A kind little thought',alias:'Alice',color:'#e63946'}),res);assert.equal(res.code,409);
  global.fetch=async()=>{throw new Error('offline');};res=response();await notes(request({content:'A kind little thought',alias:'Alice',color:'#e63946'}),res);assert.equal(res.code,503);
 }finally{global.fetch=original;}
});
test('admin login issues only HttpOnly cookie, server sessions can be revoked, limiter fails closed',async()=>{
 const original=global.fetch;
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-key';
 process.env.LIMITER_SECRET='x'.repeat(32);process.env.ADMIN_SESSION_SECRET='y'.repeat(32);
 const password='disposable-local-test-password',salt='a'.repeat(32);
 process.env.ADMIN_PASSWORD_SCRYPT=`${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`;
 const sessions=new Map();let allowed=true;
 global.fetch=async(url,opts)=>{
  if(url.endsWith('take_rate_limit'))return new Response(JSON.stringify(allowed));
  if(opts.method==='POST'){const row=JSON.parse(opts.body);sessions.set(row.token_hash,row);return new Response('');}
  const hash=new URL(url).searchParams.get('token_hash')?.slice(3);
  if(opts.method==='DELETE'){sessions.delete(hash);return new Response('');}
  return new Response(JSON.stringify(sessions.has(hash)?[sessions.get(hash)]:[]));
 };
 try {
  let res=response();await login(request({password}),res);assert.equal(res.code,200);assert.deepEqual(res.data,{ok:true});
  const cookie=res.headers['Set-Cookie'];assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert.equal(sessions.size,1);
  let req={...request({}),method:'GET',headers:{cookie}};res=response();await check(req,res);assert.equal(res.data.authenticated,true);
  req=request({});req.headers.cookie=cookie;res=response();await logout(req,res);assert.equal(res.code,200);assert.equal(sessions.size,0);
  req.method='GET';res=response();await check(req,res);assert.equal(res.data.authenticated,false);
  allowed=false;res=response();await login(request({password}),res);assert.equal(res.code,429);
  global.fetch=async()=>{throw new Error('offline');};res=response();await login(request({password}),res);assert.equal(res.code,503);
 }finally{global.fetch=original;delete process.env.ADMIN_PASSWORD_SCRYPT;}
});
