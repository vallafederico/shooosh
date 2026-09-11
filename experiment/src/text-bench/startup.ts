export {};
/** Separate per-renderer build: performance observers and UI are experiment-only. */
declare const __TEXT_RENDERER__: 'sdf'|'msdf'|'slug';
const start=performance.now(),events:Record<string,unknown[]>={paint:[],longtask:[],event:[], 'largest-contentful-paint':[], 'layout-shift':[]};
const observers:PerformanceObserver[]=[];
for(const type of Object.keys(events))if(PerformanceObserver.supportedEntryTypes.includes(type)){
 const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())events[type]!.push(e.toJSON());});
 observer.observe({type,buffered:true,...(type==='event'?{durationThreshold:16}:{})});observers.push(observer);
}
const output=document.querySelector('#result')!,status=document.querySelector('#status')!;
const button=document.querySelector<HTMLButtonElement>('#edit')!,save=document.querySelector<HTMLButtonElement>('#save')!;
const canvas=document.querySelector('canvas')!;
let invalid=document.hidden;
document.addEventListener('visibilitychange',()=>{invalid=true;});
const present=()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
let report:Record<string,unknown>={};
let cleanup=()=>{};
const resources=()=>performance.getEntriesByType('resource').map(e=>{
 const r=e as PerformanceResourceTiming;
 return {url:r.name,initiator:r.initiatorType,ttfbMs:r.responseStart>0?r.responseStart-r.startTime:null,requestWaitMs:r.responseStart>0?r.responseStart-r.requestStart:null,
 durationMs:r.duration,downloadMs:r.responseStart>0?r.responseEnd-r.responseStart:null,transferBytes:r.transferSize,encodedBytes:r.encodedBodySize,decodedBytes:r.decodedBodySize};
});
const refresh=()=>{report={...report,visibilityInterrupted:invalid,resources:resources(),entries:events};output.textContent=JSON.stringify(report,null,2);};
try{
 const adapter=__TEXT_RENDERER__==='slug'?(await import('./slug')).slug:
   __TEXT_RENDERER__==='msdf'?(await import('./shooosh')).msdf:(await import('./shooosh')).shooosh;
 const imported=performance.now();
 const config={backend:'webgl2' as const,width:800,height:480,dpr:1,count:500,fontSize:16,text:'GPUtext9876543210'};
 const instance=await adapter.mount(canvas,config);
 cleanup=()=>instance.destroy();
 const ready=performance.now();instance.render();await present();const visible=performance.now();
 // Validate outside the startup milestone span.
 const probe=document.createElement('canvas');probe.width=800;probe.height=480;
 const ctx=probe.getContext('2d')!;instance.render();ctx.drawImage(canvas,0,0);
 const pixels=ctx.getImageData(0,0,800,480).data;
 if(!pixels.some((v,i)=>i%4===0&&v>20))throw new Error('Blank draw; startup measurements rejected');
 const navigation=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
 report={schema:1,renderer:adapter.name,config,userAgent:navigator.userAgent,recordedAt:new Date().toISOString(),
 navigation:navigation?.toJSON(),documentTtfbMs:navigation?navigation.responseStart-navigation.startTime:null,documentRequestWaitMs:navigation?navigation.responseStart-navigation.requestStart:null,
 moduleStartMs:start,rendererImportMs:imported-start,mountToFirstDrawMs:ready-imported,
 firstTextOpportunityMs:visible,initializationFromModuleMs:visible-start,interactions:[],
 caveats:['Localhost timings do not represent WAN/CDN TTFB','Cache state is not forced: use a fresh browser profile for cold tests; reload for warm tests',
 'First text opportunity is successful draw plus two RAF callbacks, not a compositor presentation timestamp',
 'LCP may exclude canvas text; event durations are samples, not an INP score','Resource transfer bytes reflect actual server compression; audit gzip/Brotli sizes are separate estimates']};
 status.textContent=`${adapter.name}: first text opportunity ${visible.toFixed(1)} ms`;button.disabled=false;save.disabled=false;refresh();
 let flip=false;
 button.onclick=async()=>{const t=performance.now();button.disabled=true;flip=!flip;instance.update(flip?'GPUtext0123456789':'GPUtext9876543210');instance.render();const submitted=performance.now();await present();
 (report.interactions as unknown[]).push({updateSubmitCpuMs:submitted-t,inputToFrameOpportunityMs:performance.now()-t});button.disabled=false;refresh();};
 window.addEventListener('pagehide',()=>{instance.destroy();observers.forEach(o=>o.disconnect());},{once:true});
 // Let buffered paint/navigation observations settle, with no persistent polling loop.
 setTimeout(refresh,1000);
}catch(e){cleanup();status.textContent=`Startup failed: ${String(e)}`;observers.forEach(o=>o.disconnect());}
save.onclick=()=>{refresh();const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`startup-${__TEXT_RENDERER__}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
