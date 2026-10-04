import { build } from 'esbuild';
import { mkdir, cp, writeFile } from 'node:fs/promises';
await mkdir('dist/assets', { recursive: true });
const url = process.env.SUPABASE_URL;
const publicKey = process.env.SUPABASE_PUBLIC_KEY;
if (process.env.VERCEL === '1' && (!url || !publicKey)) throw new Error('Configure SUPABASE_URL and SUPABASE_PUBLIC_KEY for this Vercel environment');
if (publicKey) {
  const role = publicKey.startsWith('eyJ') ? JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role : null;
  if ((!publicKey.startsWith('sb_publishable_') && role !== 'anon') || publicKey === process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_PUBLIC_KEY must be a publishable or anon key, never a server secret');
}
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('SUPABASE_URL must be a hosted Supabase HTTPS project origin');
await writeFile('dist/assets/config.js', `window.PINIT_CONFIG=${JSON.stringify({url:url || 'https://local-test.supabase.co',publicKey:publicKey || 'local-test-public-key'})};\n`);
for (const file of ['index.html','admin.html','manifest.json','service-worker.js','favicon.svg','og-image.svg','og-image.png','robots.txt','sitemap.xml','icons']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
await cp('assets/index.css','dist/assets/index.css');
await cp('assets/admin.css','dist/assets/admin.css');
await build({ entryPoints: {index:'assets/index-source.js',admin:'assets/admin-source.js'}, bundle:true, minify:true, outdir:'dist/assets', format:'iife', target:'es2020',external:['/assets/*'] });
await build({ entryPoints:{map:'assets/map-source.js',globe:'assets/globe-source.js'}, bundle:true, minify:true, outdir:'dist/assets',format:'esm',target:'es2020',loader:{'.png':'file'},assetNames:'[name]-[hash]' });
