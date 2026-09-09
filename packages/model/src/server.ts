import { attributionHtml, type AssetAttribution } from "./attribution.js"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { prepareModel } from "./node.js"
/** Serves only a prepared model and bundled workbench; no filesystem browsing or writes. */
export async function serveModel(
  input: string,
  port = 0,
  options: { attribution?: AssetAttribution } = {},
) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port")
  const { prepared, binary } = await prepareModel(input, { textures: true })
  const [html, javascript, css] = await Promise.all(
    ["viewer.html", "viewer.js", "viewer.css"].map((name) =>
      readFile(new URL(`./viewer/${name}`, import.meta.url)),
    ),
  )
  prepared.binary = "model.bin"
  const assets = new Map<string, { type: string; body: string | Uint8Array }>([
    [
      "",
      { type: "text/html", body: attributionHtml(html.toString(), options.attribution) },
    ],
    ["viewer.js", { type: "text/javascript", body: javascript }],
    ["viewer.css", { type: "text/css", body: css }],
    ["model.json", { type: "application/json", body: JSON.stringify(prepared) }],
    ["model.bin", { type: "application/octet-stream", body: binary }],
  ])
  return serveAssets(assets, port)
}
export async function serveAssets(
  assets: Map<string, { type: string; body: string | Uint8Array }>,
  port = 0,
) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port")
  const prefix = `/${randomBytes(18).toString("hex")}/`
  const server = createServer((request, response) => {
    const address = server.address()
    const expectedHost =
      typeof address === "object" && address ? `127.0.0.1:${address.port}` : ""
    const pathname = request.url?.split("?")[0] ?? ""
    const asset = pathname.startsWith(prefix)
      ? assets.get(pathname.slice(prefix.length))
      : undefined
    if (request.headers.host !== expectedHost || request.method !== "GET" || !asset) {
      response.writeHead(404)
      response.end("Not found")
      return
    }
    response.writeHead(200, {
      "Content-Type": asset.type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; frame-ancestors 'none'",
    })
    response.end(asset.body)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
  const address = server.address()
  if (typeof address !== "object" || !address) throw new Error("Server failed to bind")
  return {
    url: `http://127.0.0.1:${address.port}${prefix}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  }
}
