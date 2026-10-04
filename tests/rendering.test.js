import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function page(name) {
 const dom=new JSDOM(await readFile(`${name}.html`,'utf8'),{url:'https://www.pinitworld.com',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
 w.scrollTo=()=>{};w.requestAnimationFrame=()=>0;w.setInterval=()=>0;w.setTimeout=()=>0;
 w.fetch=async()=>({ok:true,json:async()=>({authenticated:false,country:'Unknown'})});
 const chain={select(){return this},eq(){return this},not(){return this},order(){return this},limit(){return this},maybeSingle(){return this},then(resolve){resolve({data:[],count:0});}};
 w.supabase={createClient:()=>({from:()=>Object.create(chain)})};
 let script=await readFile(`assets/${name}-source.js`,'utf8');
 if(name==='index') script=script.replace(/^import .*\r?\nvar supabase=\{createClient\};\r?\n/,'');
 w.eval(script); await new Promise(r=>setImmediate(r)); return dom;
}
test('public legacy hostile data cannot create executable attributes or markup',async()=>{
 const dom=await page('index');const w=dom.window;
 const hostile={id:'" onclick="window.pwned=1',color:'red" onmouseover="window.pwned=1',content:'<img src=x onerror="window.pwned=1">',alias:'<svg onload="bad()">',country:'<iframe>',mood:'<script>'};
 for(const render of [w.buildNotePopupHtml,w.renderArchiveCard,w.buildMapNoteCardHtml].filter(Boolean)){
  const node=w.document.createElement('div');node.innerHTML=render(hostile);
  assert.equal(node.querySelector('img,svg,iframe,script,[onclick],[onerror],[onmouseover],[onload]'),null);
  assert.equal(node.querySelector('[style]')?.style.background.includes('red'),false);
 }
 assert.equal(w.document.querySelectorAll('.color-opt').length,12);
 const color=w.document.querySelectorAll('.color-opt')[1];color.click();assert.equal(w.selectedColor,'#f4842a');
 w.localStorage.setItem('pinit_prelude_seen','1');
 w.document.getElementById('open-modal-btn').click();assert.equal(w.document.getElementById('overlay').classList.contains('open'),true);
 dom.window.close();
});
test('admin uses text nodes and working listeners for hostile stored notes',async()=>{
 const dom=await page('admin');const w=dom.window;
 w.renderTable([{id:'a',content:'<img src=x onerror="bad()"> " ` ${bad()}',alias:'<svg>',country:'<script>',color:'red" onclick="bad()',mood:'<iframe>',created_at:'invalid'}]);
 const tbody=w.document.getElementById('notes-tbody');assert.equal(tbody.querySelector('img,svg,iframe,script,[onclick]'),null);
 assert.match(tbody.textContent,/<img/);
 tbody.querySelector('.delete-btn').click();assert.match(w.document.getElementById('confirm-preview').textContent,/<img/);
 assert.equal(w.document.getElementById('confirm-overlay').classList.contains('open'),true);
 dom.window.close();
});
