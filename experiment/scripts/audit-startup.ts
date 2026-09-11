/** Build-time byte accounting: all emitted JS (including lazy chunks) plus requested font assets. */
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {gzipSync,brotliCompressSync} from 'node:zlib';
const size=(path:string)=>{const b=readFileSync(path);return {path,raw:b.length,gzip:gzipSync(b).length,brotli:brotliCompressSync(b).length};};
const report=[];
for(const renderer of ['sdf','msdf','slug']){
 const root=`experiment/dist/startup-${renderer}`;
 const files=readdirSync(`${root}/assets`).filter(f=>f.endsWith('.js')).map(f=>size(`${root}/assets/${f}`));
 const names=renderer==='slug'?['abel-metadata.json','abel-curves.bin','abel-bands.bin']:[`abel-${renderer}.json`,`abel-${renderer}.png`,'abel-metadata.json'];
 const assets=names.map(f=>size(`${root}/text-bench/${f}`));
 const sum=(xs:typeof files)=>Object.fromEntries(['raw','gzip','brotli'].map(k=>[k,xs.reduce((s,f)=>s+f[k as 'raw'],0)]));
 report.push({renderer,html:size(`${root}/startup.html`),javascript:sum(files),fontAssets:sum(assets),files,assets});
}
writeFileSync('experiment/results/startup-bytes.json',JSON.stringify({generatedAt:new Date().toISOString(),note:'Standalone experiment adapters plus measurement shell; font assets include current metadata dependency. Compression estimates, not measured HTTP transfer.',report},null,2));
const kb=(n:number)=>(n/1024).toFixed(2);
const lines=['# Startup payload audit','','KiB (1024 bytes). JS includes all lazy chunks and the measurement shell. Compression estimates use Node gzip/Brotli; actual HTTP transfer depends on server configuration.','','| Renderer | JS raw / gzip / Brotli | Font assets raw / gzip / Brotli |','| --- | ---: | ---: |',...report.map(r=>`| ${r.renderer} | ${kb(r.javascript.raw!)} / ${kb(r.javascript.gzip!)} / ${kb(r.javascript.brotli!)} | ${kb(r.fontAssets.raw!)} / ${kb(r.fontAssets.gzip!)} / ${kb(r.fontAssets.brotli!)} |`)];
writeFileSync('experiment/results/startup-bytes.md',lines.join('\n')+'\n');console.log(lines.join('\n'));
