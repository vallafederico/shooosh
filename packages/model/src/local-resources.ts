import { realpathSync, statSync } from "node:fs"
import { resolve, relative, isAbsolute } from "node:path"
/** Asset references may only read regular files inside their declared resource directory. */
export function localResource(base: string, reference: string) {
  const decoded = decodeURIComponent(reference).replace(/\\/g, "/")
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.includes("\0"))
    throw new Error("Non-local asset resource is not allowed")
  const root = realpathSync(base)
  const target = resolve(root, decoded)
  const inside = (path: string) => {
    const rel = relative(root, path)
    return !isAbsolute(rel) && rel !== ".." && !rel.startsWith("../")
  }
  if (!inside(target)) throw new Error("Asset resource escapes the model directory")
  const canonical = realpathSync(target)
  if (!inside(canonical))
    throw new Error("Asset resource symlink escapes the model directory")
  if (!statSync(canonical).isFile())
    throw new Error("Asset resource must be a regular file")
  return canonical
}
