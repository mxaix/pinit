import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';
await mkdir('dist/assets', { recursive: true });
for (const file of ['index.html','admin.html','manifest.json','service-worker.js','favicon.svg','og-image.svg','og-image.png','robots.txt','sitemap.xml','icons']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
await cp('assets/index.css','dist/assets/index.css');
await cp('assets/admin.css','dist/assets/admin.css');
await build({ entryPoints: {index:'assets/index-source.js',admin:'assets/admin-source.js'}, bundle:true, minify:true, outdir:'dist/assets', format:'iife', target:'es2020',external:['/assets/*'] });
await build({ entryPoints:{map:'assets/map-source.js',globe:'assets/globe-source.js'}, bundle:true, minify:true, outdir:'dist/assets',format:'esm',target:'es2020',loader:{'.png':'file'},assetNames:'[name]-[hash]' });
