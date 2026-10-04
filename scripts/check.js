import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
for(const dir of ['api','lib','assets','scripts','tests']) {
 async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})) {const p=`${path}/${entry.name}`;if(entry.isDirectory()) await walk(p);else if(p.endsWith('.js')) execFileSync(process.execPath,['--check',p],{stdio:'inherit'});}}
 await walk(dir);
}
for(const file of ['index.html','admin.html']) {
 const html=await readFile(file,'utf8');assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));assert(!/\son(?:click|change|input|keydown)\s*=/i.test(html));
}
const app=await readFile('assets/index-source.js','utf8');assert(!/from\('submissions'\)|\.insert\(|ip_hash|userIPHash|onclick=/.test(app));
const admin=await readFile('assets/admin-source.js','utf8');assert(!/sessionStorage|Bearer|onclick=|escJs/.test(admin));
const config=JSON.parse(await readFile('vercel.json','utf8'));const csp=config.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
assert(csp.includes("script-src 'self';"));assert(!/script-src[^;]*unsafe/.test(csp));
console.log('Syntax, anonymous write removal, cookie-only UI and script CSP checks passed.');
