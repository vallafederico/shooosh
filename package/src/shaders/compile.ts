/**
 * compileProgramAsync — non-blocking WebGL2 compile/link.
 *
 * How to use: submit, then poll() on later frames. Failed compile/link must
 * keep the last good program and surface the log — never blank the page.
 *
 * Compiling then immediately reading COMPILE_STATUS blocks the main thread
 * (large shaders can stall for hundreds of ms). This helper submits without
 * querying, then lets the caller poll(). With KHR_parallel_shader_compile the
 * poll is cheap; without it the blocking query is at least deferred a frame.
 */

type KhrParallelExt = { COMPLETION_STATUS_KHR: GLenum };

const khrExtByGl = new WeakMap<WebGL2RenderingContext, KhrParallelExt | null>();

function getKhrExt(gl: WebGL2RenderingContext): KhrParallelExt | null {
  if (khrExtByGl.has(gl)) return khrExtByGl.get(gl) ?? null;
  const ext = gl.getExtension(
    "KHR_parallel_shader_compile",
  ) as KhrParallelExt | null;
  khrExtByGl.set(gl, ext);
  return ext;
}

export type AsyncProgram = {
  /**
   * Returns the linked WebGLProgram once it is ready, or null while it is still
   * compiling. Returns null permanently if linking failed (after logging once).
   */
  poll: () => WebGLProgram | null;
  /**
   * Current compile state. Stays "compiling" until poll() observes the driver
   * result, so call poll() first when polling each frame.
   */
  status: () => "compiling" | "ready" | "failed";
  destroy: () => void;
};

export function compileProgramAsync(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label = "program",
): AsyncProgram {
  const program = gl.createProgram();
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!program || !vs || !fs) {
    throw new Error("Failed to create WebGL shader objects.");
  }
  gl.shaderSource(vs, vertexSource);
  gl.compileShader(vs);
  gl.shaderSource(fs, fragmentSource);
  gl.compileShader(fs);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // Deliberately NOT querying status here — that would block the main thread.

  const ext = getKhrExt(gl);
  let state: "compiling" | "ready" | "failed" = "compiling";
  let shadersDeleted = false;

  const deleteShaders = () => {
    if (shadersDeleted) return;
    shadersDeleted = true;
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  };

  return {
    poll() {
      if (state === "ready") return program;
      if (state === "failed") return null;

      // With the extension, this is a cheap non-blocking check.
      if (ext && !gl.getProgramParameter(program, ext.COMPLETION_STATUS_KHR)) {
        return null;
      }

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) ?? "";
        const vsInfo = gl.getShaderInfoLog(vs) ?? "";
        const fsInfo = gl.getShaderInfoLog(fs) ?? "";
        console.warn(
          `[shader] "${label}" failed to link:`,
          info,
          vsInfo,
          fsInfo,
        );
        deleteShaders();
        gl.deleteProgram(program);
        state = "failed";
        return null;
      }

      deleteShaders();
      state = "ready";
      return program;
    },
    status() {
      return state;
    },
    destroy() {
      deleteShaders();
      if (state !== "failed") {
        gl.deleteProgram(program);
      }
    },
  };
}
