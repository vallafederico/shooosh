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

function compileProgramUncached(
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

type ProgramCacheEntry = { inner: AsyncProgram; refs: number };

/**
 * Per-context program cache — N planes with the same vs+fs share one link.
 * Keyed per WebGL2 context (WeakMap) so a second canvas / restored context
 * never sees another context's programs.
 */
const programCacheByGl = new WeakMap<
  WebGL2RenderingContext,
  Map<string, ProgramCacheEntry>
>();

export function compileProgramAsync(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label = "program",
): AsyncProgram {
  let cache = programCacheByGl.get(gl);
  if (!cache) {
    cache = new Map();
    programCacheByGl.set(gl, cache);
  }
  const key = `${vertexSource}\u0000${fragmentSource}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = { inner: compileProgramUncached(gl, vertexSource, fragmentSource, label), refs: 0 };
    cache.set(key, entry);
  }
  entry.refs += 1;
  const shared = entry;

  // Refcounted handle — the program is deleted only when the last user
  // releases it, so destroy() on one plane never blanks its twins.
  let released = false;
  return {
    poll() {
      if (released) return null;
      return shared.inner.poll();
    },
    status() {
      return shared.inner.status();
    },
    destroy() {
      if (released) return;
      released = true;
      shared.refs -= 1;
      if (shared.refs <= 0) {
        cache.delete(key);
        shared.inner.destroy();
      }
    },
  };
}
