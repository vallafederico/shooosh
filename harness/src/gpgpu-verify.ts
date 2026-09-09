/** Real WebGL2 validation. Readback exists only here, never in the simulation loop. */
import { createWebglParticles } from '../../examples/gpgpu-webgl'
const output = document.querySelector('#result')!
const results: string[] = []
function assert(condition: unknown, message: string) { if (!condition) throw Error(message) }
try {
  for (const sphere of [false, true]) {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480
    document.body.append(canvas)
    const gl = canvas.getContext('webgl2')!
    assert(gl, 'WebGL2 required for this validation')
    const feedbackOutputs = new Map<WebGLTransformFeedback, WebGLBuffer>()
    let feedback: WebGLTransformFeedback | null = null, latest: WebGLBuffer | null = null
    const allocations: WebGLBuffer[] = []
    const resources = new Map<string, object[]>()
    const creators: Record<string,string> = { createShader:'isShader', createProgram:'isProgram', createVertexArray:'isVertexArray', createTransformFeedback:'isTransformFeedback', createTexture:'isTexture', createFramebuffer:'isFramebuffer' }
    const wrapped = new Proxy(gl, { get(target, key) {
      if (typeof key === 'string' && creators[key]) return (...args: unknown[]) => {
        const value = (target as any)[key](...args)
        if(value) resources.set(creators[key], [...(resources.get(creators[key]) ?? []),value])
        return value
      }
      if (key === 'createBuffer') return () => { const b = target.createBuffer()!; allocations.push(b); return b }
      if (key === 'bindTransformFeedback') return (type: number, value: WebGLTransformFeedback | null) => { feedback = value; target.bindTransformFeedback(type, value) }
      if (key === 'bindBufferBase') return (type: number, index: number, buffer: WebGLBuffer) => { if (feedback) feedbackOutputs.set(feedback, buffer); target.bindBufferBase(type, index, buffer) }
      if (key === 'beginTransformFeedback') return (mode: number) => { latest = feedbackOutputs.get(feedback!)!; target.beginTransformFeedback(mode) }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    const before = () => [gl.getParameter(gl.CURRENT_PROGRAM), gl.getParameter(gl.VERTEX_ARRAY_BINDING), gl.getParameter(gl.ARRAY_BUFFER_BINDING), gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING), gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING), gl.isEnabled(gl.BLEND), gl.isEnabled(gl.DEPTH_TEST), gl.isEnabled(gl.CULL_FACE), gl.isEnabled(gl.RASTERIZER_DISCARD), gl.getParameter(gl.DEPTH_FUNC), gl.getParameter(gl.DEPTH_WRITEMASK), gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING), gl.getParameter(gl.TEXTURE_BINDING_2D), gl.getParameter(gl.SAMPLER_BINDING), gl.getParameter(gl.DEPTH_CLEAR_VALUE), gl.isEnabled(gl.SCISSOR_TEST), ...gl.getParameter(gl.VIEWPORT)]
    gl.enable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.enable(gl.RASTERIZER_DISCARD); gl.depthFunc(gl.GREATER); gl.depthMask(false)
    const original = before()
    const sim = createWebglParticles(wrapped, sphere)
    assert(before().every((v,i) => v===original[i]), 'Setup leaked GL state')
    const values = new Float32Array([1/60,0,640/480,1,0,0,0,0.32,640,480,1,0])
    const draw = (advance: boolean) => {
      const state = before(); sim.render(values, advance)
      assert(before().every((v,i) => v===state[i]), 'Render leaked GL state')
      assert(gl.getError()===gl.NO_ERROR, 'WebGL error in simulation')
    }
    const read = () => {
      const array = new Float32Array(sim.count*8)
      gl.bindBuffer(gl.COPY_READ_BUFFER,latest); gl.getBufferSubData(gl.COPY_READ_BUFFER,0,array); gl.bindBuffer(gl.COPY_READ_BUFFER,null)
      assert(array.every(Number.isFinite),'Non-finite state')
      return array
    }
    draw(false)
    const initial = read()
    for (let i=0;i<sim.count;i++) {
      const p=initial.subarray(i*8,i*8+3)
      if(sphere) assert(Math.abs(Math.hypot(...p)-0.82)<0.00001,'Sphere initialization radius')
      else assert(Math.abs(p[0])<1.18 && Math.abs(p[1])<0.78,'Grid initialization bounds')
    }
    values[3]=0
    for(let frame=0;frame<120;frame++){values[1]+=1/60;draw(true)}
    const evolved = read()
    assert(evolved.some((v,i)=>Math.abs(v-initial[i])>0.001),'Compute did not move particles')
    draw(false); assert(read().every((v,i)=>v===evolved[i]),'Paused state changed')
    // Pointer should alter a reset trajectory after one update.
    values[3]=1;draw(false);values[3]=0; values[1]=0;values[6]=0;draw(true);const untouched=read()
    values[3]=1;draw(false);values[3]=0;values[6]=1;draw(true);const disturbed=read()
    assert(disturbed.some((v,i)=>Math.abs(v-untouched[i])>0.00001),'Pointer had no effect')
    values[3]=1;draw(false);assert(read().every((v,i)=>v===initial[i]),'Reset was not deterministic')
    if(sphere) {
      // Two separated sheets aligned with the light: visible receivers must be occluded.
      values[3]=0;values[1]=0;values[6]=0
      const fixture=new Float32Array(sim.count*8)
      const length=Math.hypot(0.9,0.65,0.6)
      for(let i=0;i<sim.count;i++) {
        const j=i%4096, offset=i>=4096?0.25:0
        fixture[i*8]=(j%64)*0.008-0.25+0.9/length*offset
        fixture[i*8+1]=Math.floor(j/64)*0.008-0.25+0.65/length*offset
        fixture[i*8+2]=0.45+0.6/length*offset
        fixture[i*8+3]=1
      }
      gl.bindBuffer(gl.COPY_WRITE_BUFFER,latest);gl.bufferSubData(gl.COPY_WRITE_BUFFER,0,fixture);gl.bindBuffer(gl.COPY_WRITE_BUFFER,null)
      const image = (disableShadow: number) => {
        values[3]=0;values[11]=disableShadow
        gl.disable(gl.RASTERIZER_DISCARD);gl.depthMask(true);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.depthMask(false);gl.enable(gl.RASTERIZER_DISCARD)
        draw(false)
        const pixels=new Uint8Array(canvas.width*canvas.height*4)
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels)
        assert(gl.getError()===gl.NO_ERROR,'Shadow image readback error')
        return pixels
      }
      // Freeze one pose and compare lighting with and without actual occlusion.
      const shadowed=image(0),unshadowed=image(1)
      let darkened=0,brighter=0
      for(let i=0;i<shadowed.length;i+=4) {
        const difference=unshadowed[i]+unshadowed[i+1]+unshadowed[i+2]-shadowed[i]-shadowed[i+1]-shadowed[i+2]
        if(difference>3) darkened++
        if(difference< -3) brighter++
      }
      assert(darkened>100,`Shadow pass: darkened=${darkened}, brighter=${brighter}, image sum=${shadowed.reduce((a,b,i)=>a+(i%4<3?b:0),0)}, unshadowed=${unshadowed.reduce((a,b,i)=>a+(i%4<3?b:0),0)}`)
      assert(brighter===0,'Shadows added light')
      results.push(`shadow A/B: PASS — ${darkened} occluded pixels darkened, ${brighter} brightened`)
    }
    sim.destroy();sim.destroy();assert(allocations.every(b=>!gl.isBuffer(b)),'Buffers leaked')
    assert(gl.getError()===gl.NO_ERROR,'Cleanup GL error')
    for(const [method, objects] of resources) assert(objects.every(value=>!(gl as any)[method](value)),method+' resource leak')
    // Allocation failure after one state buffer: all partial resources must unwind.
    const failureState=before();let attempts=0;let failed=false
    const failureGl = new Proxy(wrapped,{get(target,key){
      if(key==='createBuffer') return () => ++attempts===2 ? null : target.createBuffer()
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
    }})
    try{createWebglParticles(failureGl,sphere)}catch{failed=true}
    assert(failed,'Injected allocation failure did not fail')
    assert(allocations.every(b=>!gl.isBuffer(b)),'Partial buffer allocation leaked')
    for(const [method,objects] of resources) assert(objects.every(value=>!(gl as any)[method](value)),method+' partial allocation leak')
    assert(before().every((v,i)=>v===failureState[i]),'Failure leaked GL state')
    // Invalid GLSL must fail before activation and clean up shader/program objects.
    let compilationFailed=false
    const badShaderGl=new Proxy(wrapped,{get(target,key){
      if(key==='shaderSource') return (shader:WebGLShader) => target.shaderSource(shader,'#version 300 es\nnot valid GLSL')
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
    }})
    try{createWebglParticles(badShaderGl,sphere)}catch{compilationFailed=true}
    assert(compilationFailed,'Invalid shader was activated')
    for(const [method,objects] of resources) assert(objects.every(value=>!(gl as any)[method](value)),method+' compilation failure leak')
    assert(before().every((v,i)=>v===failureState[i]),'Compilation failure leaked GL state')
    results.push(`${sphere?'sphere':'field'}: PASS — initialization, 120 updates, finite state, pause, mouse, reset, GL state restoration, resource cleanup, allocation/compile failure`)
  }
  output.textContent = results.join('\n')+'\nALL CHECKS PASSED'
} catch(error) { output.textContent=results.join('\n')+'\nFAIL: '+String(error); console.error(error) }
