import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isMainThread, workerData } from "node:worker_threads"
/** A model worker's entire scratch tree is owned and cleaned by its parent. */
export function processingTemp(prefix: string) {
  const base =
    !isMainThread && workerData?.modelConversion ? workerData.tempRoot : tmpdir()
  return mkdtemp(join(base, prefix))
}
