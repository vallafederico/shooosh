import { readFileSync } from "node:fs"
import { resolve, dirname, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const documents = ["llms.txt", "agents.md", "docs/agent-usage.md", "docs/rig.md", "packages/model/llms.txt", "packages/model/agents.md", "packages/model/README.md"]
export function getStaticPaths() {
  return documents.map(agentDoc => ({ params: { agentDoc } }))
}
export function GET({ params }: { params: { agentDoc?: string } }) {
  const name = params.agentDoc!
  if (!documents.includes(name)) return new Response("Not found", { status: 404 })
  const content = readFileSync(resolve(root, name), "utf8").replace(/\]\((\.{1,2}\/[^)]+)\)/g, (_, target: string) => {
    const path = relative(root, resolve(root, dirname(name), target)).split(sep).join("/")
    return `](https://github.com/vallafederico/shooosh/blob/main/${path})`
  })
  return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
