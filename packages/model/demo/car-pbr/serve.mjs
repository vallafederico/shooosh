import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { resolve, join, extname } from "node:path"
import { randomBytes } from "node:crypto"
const directory = resolve(process.argv[2] ?? ""),
  port = Number(process.argv[3] ?? 5190)
if (!process.argv[2] || !Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Usage: node serve.mjs <prepared-directory> [port]")
const files = [
  "index.html",
  "style.css",
  "viewer.js",
  "model.json",
  "shader.json",
  "vertices.bin",
  "indices.bin",
  "original.png",
  "webp.png",
  "ktx2.png",
]
const assets = new Map(
  await Promise.all(
    files.map(async (file) => [file, await readFile(join(directory, file))]),
  ),
)
const prefix = `/${randomBytes(16).toString("hex")}/`
const server = createServer((req, res) => {
  const name = req.url?.startsWith(prefix)
    ? req.url.slice(prefix.length) || "index.html"
    : ""
  const asset = assets.get(name)
  if (
    req.headers.host !== `127.0.0.1:${server.address().port}` ||
    req.method !== "GET" ||
    !asset
  ) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, {
    "Content-Type":
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
      }[extname(name)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'",
  })
  res.end(asset)
})
server.listen(port, "127.0.0.1", () =>
  console.log(`Car PBR showcase: http://127.0.0.1:${server.address().port}${prefix}`),
)
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.close(() => process.exit(0)))
