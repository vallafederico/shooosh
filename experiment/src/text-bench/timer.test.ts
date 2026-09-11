import {test,expect} from 'bun:test';
import {gpuTimer} from './timer';
function fixture(supported=true){
 let disjoint=false,deleted=0;
 const gl={getExtension:()=>supported?{TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2}:null,createQuery:()=>({}),beginQuery(){},endQuery(){},getParameter:()=>disjoint,
 QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getQueryParameter:(_:unknown,p:number)=>p===3?true:250000,deleteQuery(){deleted++;}};
 return{timer:gpuTimer(gl as unknown as WebGL2RenderingContext),disjoint:()=>{disjoint=true;},deleted:()=>deleted};
}
test('GPU queries exclude warmup, convert nanoseconds and release resources',()=>{
 const f=fixture();expect(f.timer.begin()).toBeNull();f.timer.start();const q=f.timer.begin();expect(q).not.toBeNull();f.timer.end(q);
 expect(f.timer.collect()).toEqual([.25]);expect(f.deleted()).toBe(1);f.timer.destroy();expect(f.deleted()).toBe(1);
});
test('disjoint measurements and unsupported timers produce null, never a zero result',()=>{
 const f=fixture();f.timer.start();f.timer.end(f.timer.begin());f.disjoint();expect(f.timer.collect()).toBeNull();expect(f.timer.begin()).toBeNull();expect(f.deleted()).toBe(1);
 const absent=fixture(false);absent.timer.start();expect(absent.timer.begin()).toBeNull();expect(absent.timer.collect()).toBeNull();absent.timer.destroy();
});
