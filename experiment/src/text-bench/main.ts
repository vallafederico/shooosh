import { slug } from './slug';
import { capacity, assets } from './assets';
import { stats, textAt, type Adapter, type Config } from "./contract";
import { shooosh, msdf } from "./shooosh";
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const value = (id: string) => el<HTMLInputElement>(id).value;
const next = () => new Promise<number>(r => requestAnimationFrame(r));
let report: unknown;
const controls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')];
el('run').onclick = async () => {
  const run = el<HTMLButtonElement>('run'); run.disabled = true;
  controls.forEach(control => { control.disabled = true; });
  el<HTMLButtonElement>('save').disabled = true; report = undefined; el('results').textContent = ''; el('summary').textContent = ''; el('captures').replaceChildren();
  let interrupted = document.hidden;
  const invalidate = () => { interrupted = true; };
  document.addEventListener('visibilitychange', invalidate); window.addEventListener('resize', invalidate);
  try {
    let adapter: Adapter = value('adapter') === 'slug' ? slug : value('adapter') === 'msdf' ? msdf : shooosh;
    if (value('adapter') === 'external') {
      const url = new URL(value('module'), location.href);
      if (url.origin !== location.origin) throw new Error('Use a trusted local, same-origin adapter module.');
      adapter = (await import(/* @vite-ignore */ url.href)).default;
      if (!adapter?.name || !adapter.version || !adapter.fontIdentity || typeof adapter.mount !== 'function') throw new Error('Invalid adapter contract');
    }
    const config: Config = { backend: value('backend') as Config['backend'], width: 800, height: 480,
      dpr: Number(value('dpr')), count: Number(value('count')), fontSize: Number(value('size')), text: textAt(0) };
    const maxCount = capacity(config);
    if (!Number.isInteger(config.count) || config.count < 1 || config.count > maxCount) throw new Error(`Choose 1–${maxCount} glyphs so every glyph stays visible.`);
    const rows: {adapter:string;scenario:string;gpuMs:ReturnType<typeof stats>|null;[key:string]:unknown}[] = [];
    if(value('adapter').startsWith('both')&&config.backend!=='webgl2')throw new Error('Select WebGL2 for the matched Slug comparison.');
    const baseline=value('adapter')==='both-msdf'?msdf:shooosh;
    const adapters = value('adapter').startsWith('both') ? [baseline, slug, slug, baseline] : [adapter];
    const fontHash = (await assets("slug")).slug.sha256;
    el('captures').replaceChildren();
    for (const current of adapters) { adapter = current;
    for (const scenario of ['static', 'changing'] as const) {
      const canvas = document.createElement('canvas'); canvas.width = config.width * config.dpr; canvas.height = config.height * config.dpr;
      el('fixture').replaceChildren(canvas);
      const started = performance.now(); const instance = await adapter.mount(canvas, config);
      const initializationMs = performance.now() - started;
      try {
        const update: number[] = [], submit: number[] = [], intervals: number[] = [];
        let previous = await next();
        for (let i = 0; i < 240; i++) {
          if (interrupted) throw new Error('Run invalidated by visibility or viewport change. Keep this tab visible and retry.');
          const now = await next();
          if (i === 60) instance.startMeasurement?.();
          const a = performance.now(); if (scenario === 'changing') instance.update(textAt(i));
          const b = performance.now(); instance.render(); const c = performance.now();
          if (i >= 60) { update.push(b - a); submit.push(c - b); intervals.push(now - previous); }
          previous = now;
          if (i % 60 === 0) el('status').textContent = `${adapter.name}: ${scenario}, ${i}/240 frames`;
        }
        await instance.settle();
        if (interrupted) throw new Error('Run invalidated by visibility or viewport change.');
        const gpu = instance.gpuSamples?.();
        instance.render();
        const probe=document.createElement('canvas');probe.width=canvas.width;probe.height=canvas.height;
        const ctx=probe.getContext('2d')!;ctx.drawImage(canvas,0,0);
        const pixels=ctx.getImageData(0,0,probe.width,probe.height).data;let litPixels=0;
        for(let p=0;p<pixels.length;p+=4)if(pixels[p]!>20&&pixels[p+3]!>20)litPixels++;
        if(!litPixels)throw new Error(`${adapter.name}: blank output; timings rejected`);
        const img=document.createElement('img');img.src=canvas.toDataURL();img.alt=`${adapter.name} ${scenario}`;img.width=800;
        const figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=img.alt;figure.append(caption,img);el('captures').append(figure);
        rows.push({ adapter:adapter.name, version:adapter.version, fontHash, scenario, litPixels, initializationMs, updateCpuMs: stats(update), submitCpuMs: stats(submit), rafIntervalMs: stats(intervals), gpuMs: gpu?.length ? stats(gpu) : null });
      } finally { instance.destroy(); }
    }
    }
    report = { schema: 2, date: new Date().toISOString(), adapters: adapters.map(a=>({name:a.name,version:a.version,fontIdentity:a.fontIdentity})),
      config, environment: { userAgent: navigator.userAgent, devicePixelRatio, viewport: [innerWidth, innerHeight] },
      caveats: ['CPU submission is not GPU execution', 'RAF is refresh-rate capped', 'Sub-resolution CPU measurements may round to zero', 'Matched Abel font and em placement; quad padding and renderer overhead differ', 'Includes layout/update only when adapter.update performs it'], rows };
    el('summary').textContent = rows.map(r=>`${r.adapter} · ${r.scenario}: GPU median ${r.gpuMs ? r.gpuMs.median.toFixed(3)+' ms ('+r.gpuMs.samples+' samples)' : 'unavailable'}`).join('\n');
    el('results').textContent = JSON.stringify(report, null, 2); el('status').textContent = 'Complete. Matched-font results and captures below; compare GPU medians, not refresh-capped RAF.';
    el<HTMLButtonElement>('save').disabled = false;
  } catch (e) { el('status').textContent = `Unavailable / invalid run: ${String(e)}`; }
  finally { run.disabled = false; controls.forEach(control => { control.disabled = false; }); document.removeEventListener('visibilitychange', invalidate); window.removeEventListener('resize', invalidate); }
};
el('save').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'text-benchmark.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
