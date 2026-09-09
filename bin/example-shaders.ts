/** Regenerate composed authoring sources; --check detects drift in CI. */
import { diffuseFragment, sheenFragment, fragment } from '../examples/materials/fabric-variants'
for (const [name,source] of [['diffuse',diffuseFragment],['sheen',sheenFragment],['coat',fragment]]) {
  const path = `${import.meta.dir}/../examples/fabric-${name}.wgsl`
  if (process.argv.includes('--check')) {
    if (await Bun.file(path).text() !== source) throw Error(`Stale ${path}; run bun bin/example-shaders.ts`)
  } else await Bun.write(path,source!)
}
