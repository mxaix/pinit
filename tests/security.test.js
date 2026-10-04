import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateNote } from '../lib/noteValidation.js';
import { privateKey,getClientIp,country,sameOrigin } from '../lib/security.js';
import { getTokenFromRequest,verifySessionToken } from '../lib/adminAuth.js';
import { runPinitShield } from '../api/moderate.js';
test('strict note validation rejects injected and client-authority fields',()=>{
 const good={content:'A kind little thought',alias:'Alice',color:'#e63946',mood:null};
 assert.deepEqual(validateNote(good),good);
 for(const patch of [{ip_hash:'fake'},{note_date:'2000-01-01'},{country:'fake'},{color:'red" onclick="evil()'},{mood:'evil'},{alias:'<script>'},{content:'two words'},{content:'word '.repeat(61)},{content:'a '.repeat(400)},{content:'hello\u0000 kind world'}]) assert.throws(()=>validateNote({...good,...patch}));
 assert.equal(runPinitShield('A kind little thought').safe,true);
});
test('limiter keys are private, purpose/day separated and headers fail closed',()=>{
 process.env.LIMITER_SECRET='x'.repeat(32); process.env.VERCEL='1';
 const req={headers:{'x-forwarded-for':'203.0.113.4','x-vercel-ip-country':'US'}};
 assert.equal(getClientIp(req),'203.0.113.4');
 assert.notEqual(privateKey(req,'note','2026-10-04'),privateKey(req,'note','2026-10-05'));
 assert.notEqual(privateKey(req,'note'),privateKey(req,'report'));
 assert.deepEqual(country(req),{country:'United States',country_code:'US'});
 assert.throws(()=>getClientIp({headers:{'x-real-ip':'203.0.113.4'}}));
 delete process.env.VERCEL;
 assert.equal(getClientIp({headers:req.headers,socket:{remoteAddress:'127.0.0.1'}}),'127.0.0.1');
});
test('bearer and historical cookie sessions are rejected and cross-origin writes fail',async()=>{
 const token='a'.repeat(64);
 assert.equal(getTokenFromRequest({headers:{authorization:'Bearer '+token,cookie:'pinit_admin_session='+token}}),null);
 assert.equal(getTokenFromRequest({headers:{cookie:'__Host-pinit_admin_session='+token}}),token);
 assert.equal(await verifySessionToken('123.old_signature'),false);
 let status;
 const res={setHeader(){},status(s){status=s;return this;},json(){}};
 assert.equal(sameOrigin({headers:{origin:'https://evil.test'}},res),false);assert.equal(status,403);
});
