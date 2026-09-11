/** Asynchronous WebGL2 elapsed-time queries, never finish() inside a measured frame. */
export function gpuTimer(gl:WebGL2RenderingContext) {
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let active=false, invalid=false; const pending:WebGLQuery[]=[]; const samples:number[]=[];
  return {
    start(){active=true;},
    begin(){ if(!ext||!active||invalid||pending.length>=32)return null; const q=gl.createQuery()!;gl.beginQuery(ext.TIME_ELAPSED_EXT,q);return q;},
    end(q:WebGLQuery|null){if(q){gl.endQuery(ext!.TIME_ELAPSED_EXT);pending.push(q);} },
    collect(){
      if(!ext)return null;
      if(gl.getParameter(ext.GPU_DISJOINT_EXT)){invalid=true;samples.length=0;}
      while(pending.length&&gl.getQueryParameter(pending[0]!,gl.QUERY_RESULT_AVAILABLE)){
        const q=pending.shift()!;if(!invalid)samples.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);
      }
      return invalid?null:[...samples];
    },
    destroy(){pending.forEach(q=>gl.deleteQuery(q));pending.length=0;},
  };
}
