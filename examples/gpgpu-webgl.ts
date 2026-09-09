/** Example-only WebGL2 transform-feedback GPGPU. No CPU integration or readback.
 * A vertex update pass writes interleaved position/velocity to the other buffer.
 * Draw reads the newly written buffer, then the next tick swaps source/target.
 */
import { updateVertex, displayVertex, discardFragment, displayFragment } from "./gpgpu-webgl-shaders"

export function createWebglParticles(gl: WebGL2RenderingContext, sphere: boolean) {
  const count = sphere ? 8192 : 16384
  const cleanups: (() => void)[] = []
  const destroy = () => { for (const cleanup of cleanups.splice(0).reverse()) cleanup() }
  const shader = (type: number, source: string) => {
    const value = gl.createShader(type)
    if (!value) throw new Error("Could not allocate a GPGPU shader")
    cleanups.push(() => gl.deleteShader(value))
    gl.shaderSource(value, source); gl.compileShader(value)
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(value) || "GPGPU shader compilation failed")
    return value
  }
  const program = (vertex: string, fragment: string, feedback = false) => {
    const value = gl.createProgram()
    if (!value) throw new Error("Could not allocate a GPGPU program")
    cleanups.push(() => gl.deleteProgram(value))
    gl.attachShader(value, shader(gl.VERTEX_SHADER, vertex))
    gl.attachShader(value, shader(gl.FRAGMENT_SHADER, fragment))
    if (feedback) gl.transformFeedbackVaryings(value, ["nextPosition", "nextVelocity"], gl.INTERLEAVED_ATTRIBS)
    gl.linkProgram(value)
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(value) || "GPGPU program linking failed")
    return { value, step: gl.getUniformLocation(value, "uStep"), pointer: gl.getUniformLocation(value, "uPointer"), viewport: gl.getUniformLocation(value, "uViewport"), count: gl.getUniformLocation(value, "uCount") }
  }
  const previousArray = gl.getParameter(gl.ARRAY_BUFFER_BINDING)
  const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING)
  const previousFeedbackBuffer = gl.getParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING)
  const previousFeedback = gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING)
  try {
    const update = program(updateVertex(sphere), discardFragment, true)
    const display = program(displayVertex(sphere), displayFragment(sphere))
    const buffers = [0, 1].map(() => {
      const buffer = gl.createBuffer()
      if (!buffer) throw new Error("Could not allocate particle state")
      cleanups.push(() => gl.deleteBuffer(buffer))
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, count * 32, gl.DYNAMIC_COPY)
      return buffer
    })
    const vaos = (divisor: number) => buffers.map(buffer => {
      const vao = gl.createVertexArray()
      if (!vao) throw new Error("Could not allocate particle attributes")
      cleanups.push(() => gl.deleteVertexArray(vao))
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      for (let i = 0; i < 2; i++) {
        gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 32, i * 16); gl.vertexAttribDivisor(i, divisor)
      }
      return vao
    })
    const updateVaos = vaos(0), displayVaos = vaos(1)
    const feedbacks = buffers.map(buffer => {
      const feedback = gl.createTransformFeedback()
      if (!feedback) throw new Error("Could not allocate particle feedback")
      cleanups.push(() => gl.deleteTransformFeedback(feedback))
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback)
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer)
      return feedback
    })
    let current = 0, initialized = false
    return {
      count, destroy,
      render(values: Float32Array, advance: boolean) {
        const state = {
          program: gl.getParameter(gl.CURRENT_PROGRAM), vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
          feedback: gl.getParameter(gl.TRANSFORM_FEEDBACK_BINDING),
          discard: gl.isEnabled(gl.RASTERIZER_DISCARD), blend: gl.isEnabled(gl.BLEND),
          depth: gl.isEnabled(gl.DEPTH_TEST), cull: gl.isEnabled(gl.CULL_FACE),
          depthMask: gl.getParameter(gl.DEPTH_WRITEMASK), depthFunc: gl.getParameter(gl.DEPTH_FUNC),
        }
        const bind = (p: typeof update) => {
          gl.useProgram(p.value)
          gl.uniform4fv(p.step, values, 0, 4); gl.uniform4fv(p.pointer, values, 4, 4)
          gl.uniform4fv(p.viewport, values, 8, 4); gl.uniform1i(p.count, count)
        }
        try {
          if (advance || values[3] > 0.5 || !initialized) {
            bind(update)
            gl.bindVertexArray(updateVaos[current])
            gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedbacks[1 - current])
            gl.enable(gl.RASTERIZER_DISCARD)
            gl.beginTransformFeedback(gl.POINTS)
            gl.drawArrays(gl.POINTS, 0, count)
            gl.endTransformFeedback()
            current = 1 - current; initialized = true
          }
          // Never leave an output binding on the buffer about to become a vertex input.
          gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
          gl.disable(gl.RASTERIZER_DISCARD); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE)
          if (sphere) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST)
          gl.depthMask(sphere); gl.depthFunc(gl.LESS)
          bind(display); gl.bindVertexArray(displayVaos[current])
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count)
        } finally {
          gl.bindVertexArray(state.vao); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, state.feedback)
          gl.useProgram(state.program); gl.depthMask(state.depthMask); gl.depthFunc(state.depthFunc)
          for (const [cap, enabled] of [[gl.RASTERIZER_DISCARD, state.discard], [gl.BLEND, state.blend], [gl.DEPTH_TEST, state.depth], [gl.CULL_FACE, state.cull]] as const) {
            if (enabled) gl.enable(cap); else gl.disable(cap)
          }
        }
      },
    }
  } catch (error) { destroy(); throw error }
  finally {
    gl.bindVertexArray(previousVao); gl.bindBuffer(gl.ARRAY_BUFFER, previousArray)
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, previousFeedback)
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, previousFeedbackBuffer)
  }
}
