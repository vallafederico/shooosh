import { createEngine, createMsdfGlyphs, loadTexture } from 'shooosh';
import { getGpuInternals } from '../../../package/src/engine/gpu-internals';
import { assets, identity, position } from './assets';
import {gpuTimer} from './timer';
import type { Adapter } from './contract';
function atlasAdapter(kind: "msdf"|"sdf"): Adapter { return {
 name:`shooosh baked ${kind.toUpperCase()}`,version:'checkout',fontIdentity:identity,
 async mount(canvas,c){
  const {msdf:a}=await assets(kind);
  const engine=await createEngine(canvas,{backend:c.backend,dpr:{max:c.dpr,scale:c.dpr/devicePixelRatio}});
  const timer=engine.gl?gpuTimer(engine.gl):null;
  let glyphs:ReturnType<typeof createMsdfGlyphs>|undefined,texture:Awaited<ReturnType<typeof loadTexture>>|undefined;
  let drawn=false,failure:unknown;
  const destroy=()=>{timer?.destroy();glyphs?.destroy();texture?.destroy();engine.destroy();};
  try{
   texture=await loadTexture(`/text-bench/abel-${kind}.png`,{engine,data:true});
   const data=new Float32Array(c.count*8),scale=c.fontSize/a.info.size;
   const glyphById=new Map(a.chars.map(g=>[g.id,g]));
   const pack=(text:string)=>{
    for(let i=0;i<c.count;i++){
     const g=glyphById.get(text.charCodeAt(i%text.length));if(!g)throw new Error('Missing glyph');
     const [x,y]=position(i,c);const l=x!+g.xoffset*scale,t=y!+(g.yoffset-a.common.base)*scale;
     data.set([l/c.width,t/c.height,(l+g.width*scale)/c.width,(t+g.height*scale)/c.height,g.x/a.common.scaleW,g.y/a.common.scaleH,(g.x+g.width)/a.common.scaleW,(g.y+g.height)/a.common.scaleH],i*8);
    }
    return data;
   };
   glyphs=createMsdfGlyphs(canvas,{engine,texture,glyphData:pack(c.text),glyphCount:c.count,distanceRange:8,atlasWidth:a.common.scaleW,color:[1,1,1],alpha:1,boxAspect:c.width/c.height,uni:{value2:c.width,value4:c.height},onDraw:()=>{drawn=true;},onError:e=>{failure=e;}});
   const settle=async()=>{if(engine.gl)engine.gl.finish();const q=getGpuInternals(engine)?.device.queue as unknown as {onSubmittedWorkDone():Promise<void>}|undefined;if(q)await q.onSubmittedWorkDone();};
   const deadline=performance.now()+10000;
   while(!drawn){if(failure)throw failure;if(performance.now()>deadline)throw new Error('Glyph draw timed out');engine.render();await new Promise(r=>requestAnimationFrame(r));}
   await settle();
   return{update:text=>glyphs!.setGlyphData(pack(text),c.count),render:()=>{if(failure)throw failure;const q=timer?.begin()??null;engine.render();timer?.end(q);timer?.collect();},startMeasurement:()=>timer?.start(),gpuSamples:()=>timer?.collect()??null,settle,destroy};
  }catch(e){destroy();throw e;}
 }
};
}
export const shooosh=atlasAdapter("sdf");
export const msdf=atlasAdapter("msdf");
