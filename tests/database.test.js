import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migration closes anonymous authority and daily creation is atomic',async()=>{
 const db=new PGlite();
 await db.exec(await readFile('tests/fixture.sql','utf8'));
 await db.exec(await readFile('migrations/20261004_hardening.sql','utf8'));
 await db.exec('SET ROLE anon');
 assert.equal((await db.query('SELECT id,content,color FROM notes')).rows.length,1);
 for(const sql of ["SELECT * FROM notes","SELECT * FROM submissions","SELECT * FROM reports","SELECT * FROM admin_sessions","INSERT INTO notes(content) VALUES ('bypass')","SELECT public.take_rate_limit('abc',1,1)","SELECT * FROM pinit_private.daily_notes"]) await assert.rejects(db.exec(sql));
 await db.exec('RESET ROLE');
 const key='a'.repeat(64), key2='b'.repeat(64);
 const args=[key,new Date().toISOString().slice(0,10),'A kind little thought','Alice','#e63946',null,'Unknown',''];
 const create='SELECT * FROM public.create_daily_note($1,$2,$3,$4,$5,$6,$7,$8)';
 const results=await Promise.allSettled([db.query(create,args),db.query(create,args)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected')[0].reason.code,'23505');
 await assert.rejects(db.query(create,[key2,...args.slice(1,4),'red" onmouseover="bad()',...args.slice(5)]));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM pinit_private.daily_notes WHERE limiter_key=$1',[key2])).rows[0].n,0);
 for(const patch of [{3:'bad<script>'},{2:'two words'},{5:'evil'},{6:'<bad>'},{7:'XYZ'}]){
   const invalid=[key2,...args.slice(1)]; for(const [i,v] of Object.entries(patch)) invalid[Number(i)]=v;
   await assert.rejects(db.query(create,invalid));
 }
 assert.equal((await db.query(create,[key2,...args.slice(1)])).rows.length,1);
 await assert.rejects(db.query(create,['d'.repeat(64),'2000-01-01',...args.slice(2)]));
 for (const [index,alias] of ['José','محمد','Cafe\u0301','O’Connor'].entries()) {
   await db.query(create,[(index+1).toString().repeat(64),...args.slice(1,3),alias,...args.slice(4)]);
 }
 await db.exec('SET ROLE service_role');
 const rates=await Promise.all(Array.from({length:7},()=>db.query('SELECT take_rate_limit($1,5,900) AS allowed',['c'.repeat(64)])));
 assert.equal(rates.filter(r=>r.rows[0].allowed).length,5);
 await db.close();
});

test('empty staging bootstrap matches production timestamp type and refuses existing tables',async()=>{
 const db=new PGlite();
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');
 const staging=await readFile('migrations/staging_base.sql','utf8');
 await db.exec(staging);
 await assert.rejects(db.exec(staging),/Refusing existing Pinit database/);
 await db.exec('ROLLBACK');
 await db.exec(await readFile('migrations/20261004_hardening.sql','utf8'));
 await db.exec("SET TIME ZONE 'Pacific/Honolulu'; SET ROLE service_role");
 const row=(await db.query('SELECT * FROM create_daily_note($1,$2,$3,$4,$5,$6,$7,$8)',
   ['e'.repeat(64),new Date().toISOString().slice(0,10),'A kind little thought','Alice','#e63946',null,'Unknown',''])).rows[0];
 assert(Math.abs(new Date(row.created_at).getTime()-Date.now())<10000);
 await db.close();
});
