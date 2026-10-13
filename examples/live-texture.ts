import { createCompute, loadTexture, type CanvasScene, type ComputeSession, type TextureLoaderResult } from "shooosh"

/** The texture type the queue copies into (not exported by name). */
type QueueTexture = Parameters<NonNullable<ComputeSession["device"]["queue"]["copyExternalImageToTexture"]>>[1]["texture"]

/**
 * A video or animated canvas on an object (a TV, a phone, a monitor): each frame is drawn
 * into a fixed-size canvas and written into the same GPU texture the object was created
 * with. Copy set and limits: live-texture.md.
 *
 * `loadTexture` snapshots its source, and objects can't swap maps after creation, but the
 * handle's texture is public and created with `COPY_DST`, so writing into it in place
 * works on both backends: `copyExternalImageToTexture` on WebGPU (the device from
 * `createCompute`), `texSubImage2D` on WebGL2.
 */
export type LiveSource = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageBitmap

function isGpuTexture(value: unknown): value is QueueTexture {
  return !!value && typeof value === "object" && "createView" in value
}

export class LiveTexture {
  readonly texture: TextureLoaderResult
  readonly width: number
  readonly height: number
  #canvas: HTMLCanvasElement
  #context: CanvasRenderingContext2D | null
  #scene: CanvasScene
  #source: LiveSource | null = null
  #device: ReturnType<typeof createCompute> | undefined

  private constructor(scene: CanvasScene, canvas: HTMLCanvasElement, texture: TextureLoaderResult) {
    this.#scene = scene
    this.#canvas = canvas
    this.#context = canvas.getContext("2d")
    this.texture = texture
    this.width = canvas.width
    this.height = canvas.height
  }

  /**
   * After the scene's `init()`. Pass `texture` as the object's `maskMap` (or `envMap`).
   * No mipmaps: re-uploading level 0 wouldn't refresh them.
   */
  static async create(scene: CanvasScene, width = 640, height = 480) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (context) {
      context.fillStyle = "#000"
      context.fillRect(0, 0, width, height)
    }
    return new LiveTexture(scene, canvas, await loadTexture(canvas))
  }

  get playing() {
    return !!this.#source
  }

  set(source: LiveSource | null) {
    this.#source = source
  }

  /**
   * Call every frame you draw (e.g. the object's `onFrame`, or your frame loop), and keep
   * the loop awake while something plays: Shooosh idles when nothing changes.
   */
  update() {
    const source = this.#source
    const context = this.#context
    if (!source || !context) return
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height
    if (!width || !height) return
    const cover = Math.max(this.width / width, this.height / height)
    context.drawImage(source, (this.width - width * cover) / 2, (this.height - height * cover) / 2, width * cover, height * cover)
    this.#upload()
  }

  #upload() {
    const handle = this.texture.texture
    if (handle.backend === "webgpu") {
      if (this.#device === undefined) {
        const engine = this.#scene.getEngine()
        this.#device = engine ? createCompute(engine) : null
      }
      const queue = this.#device?.device.queue
      if (queue?.copyExternalImageToTexture && isGpuTexture(handle.texture)) {
        queue.copyExternalImageToTexture({ source: this.#canvas }, { texture: handle.texture, premultipliedAlpha: true }, { width: this.width, height: this.height })
      }
      return
    }
    const gl = handle.gl
    if (!gl || !(handle.texture instanceof WebGLTexture)) return
    gl.bindTexture(gl.TEXTURE_2D, handle.texture)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.#canvas)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }
}

/** A muted, looping, inline video, ready for `LiveTexture.set`. */
export function videoSource(url: string): HTMLVideoElement {
  const video = document.createElement("video")
  video.src = url
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.crossOrigin = "anonymous"
  void video.play()
  return video
}
