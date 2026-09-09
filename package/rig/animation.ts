/** Explicit-time glTF TRS animation sampler. No clock, listeners, RAF or automatic updates. */
import type { Rig } from "./rig"
import type { RigClip, RigTransform } from "./types"
import { numbers, quaternion, slerp } from "./math"
export function createRigAnimator(rig: Rig, definitions: readonly RigClip[]) {
  const clips = definitions.map((clip, id) => {
    const seen = new Set<string>()
    const tracks = clip.tracks.map((track) => {
      const node = rig.node(track.node)
      if (node.isStaticMatrix) throw new Error("Animation cannot target a matrix node")
      if (!["translation", "rotation", "scale"].includes(track.path))
        throw new Error("Unsupported animation target")
      const target = `${track.node}/${track.path}`
      if (seen.has(target)) throw new Error("Duplicate animation channel")
      seen.add(target)
      const interpolation = track.interpolation ?? "LINEAR"
      if (!["STEP", "LINEAR", "CUBICSPLINE"].includes(interpolation))
        throw new Error("Unsupported interpolation")
      const times = numbers(track.times, track.times.length, "key times")
      if (!times.length || times.some((t, i) => t < 0 || (i > 0 && t <= times[i - 1])))
        throw new Error("Key times must increase strictly and be non-negative")
      if (interpolation === "CUBICSPLINE" && times.length < 2)
        throw new Error("Cubic interpolation requires two keys")
      const size = track.path === "rotation" ? 4 : 3
      const stride = size * (interpolation === "CUBICSPLINE" ? 3 : 1)
      const values = numbers(track.values, times.length * stride, "key values")
      if (track.path === "rotation")
        for (let i = 0; i < times.length; i++) {
          const start = i * stride + (interpolation === "CUBICSPLINE" ? size : 0)
          quaternion(values.slice(start, start + size))
        }
      return {
        node: track.node,
        path: track.path,
        interpolation,
        times,
        values,
        size,
        stride,
      }
    })
    return {
      id,
      key: clip.key ?? `clip__${id}`,
      name: clip.name ?? "",
      duration: tracks.reduce((m, t) => Math.max(m, t.times[t.times.length - 1]), 0),
      tracks,
    }
  })
  if (new Set(clips.map((c) => c.key)).size !== clips.length)
    throw new Error("Duplicate clip key")
  function resolve(ref: number | string) {
    if (typeof ref === "number") {
      if (!Number.isInteger(ref) || !clips[ref]) throw new Error("Unknown animation clip")
      return clips[ref]
    }
    const key = clips.find((c) => c.key === ref)
    if (key) return key
    const named = clips.filter((c) => c.name === ref)
    if (named.length !== 1)
      throw new Error("Unknown or ambiguous animation clip; use a key")
    return named[0]
  }
  function sample(
    ref: number | string,
    seconds: number,
    options: { loop?: boolean; reset?: boolean } = {},
  ) {
    if (!Number.isFinite(seconds)) throw new Error("Non-finite animation time")
    const clip = resolve(ref)
    const time =
      options.loop && clip.duration > 0
        ? ((seconds % clip.duration) + clip.duration) % clip.duration
        : Math.max(0, Math.min(clip.duration, seconds))
    const patches = new Map<number, RigTransform>()
    for (const track of clip.tracks) {
      const { times, values, size, stride, interpolation } = track
      const valueAt = (index: number) =>
        values.slice(
          index * stride + (interpolation === "CUBICSPLINE" ? size : 0),
          index * stride + (interpolation === "CUBICSPLINE" ? size : 0) + size,
        )
      let value: number[]
      if (time <= times[0]) value = valueAt(0)
      else if (time >= times[times.length - 1]) value = valueAt(times.length - 1)
      else {
        let lo = 0,
          hi = times.length - 1
        while (hi - lo > 1) {
          const mid = (lo + hi) >>> 1
          if (times[mid] <= time) lo = mid
          else hi = mid
        }
        const a = valueAt(lo),
          b = valueAt(hi),
          dt = times[hi] - times[lo],
          t = (time - times[lo]) / dt
        if (interpolation === "STEP") value = a
        else if (interpolation === "CUBICSPLINE") {
          const t2 = t * t,
            t3 = t2 * t
          value = a.map(
            (v, i) =>
              (2 * t3 - 3 * t2 + 1) * v +
              (t3 - 2 * t2 + t) * dt * values[lo * stride + 2 * size + i] +
              (-2 * t3 + 3 * t2) * b[i] +
              (t3 - t2) * dt * values[hi * stride + i],
          )
        } else
          value =
            track.path === "rotation"
              ? slerp(quaternion(a), quaternion(b), t)
              : a.map((v, i) => v + (b[i] - v) * t)
      }
      if (track.path === "rotation") value = quaternion(value)
      else if (value.some((v) => !Number.isFinite(v)))
        throw new Error("Animation interpolation overflow")
      if (!patches.has(track.node)) patches.set(track.node, {})
      patches.get(track.node)![track.path] = value
    }
    rig.setPose(
      [...patches].map(([node, transform]) => ({ node, transform })),
      { reset: options.reset ?? true },
    )
    return time
  }
  return {
    clips: Object.freeze(
      clips.map(({ tracks, ...info }) =>
        Object.freeze({ ...info, channels: tracks.length }),
      ),
    ),
    sample,
  }
}
