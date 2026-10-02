// Serves dist/client the way the nginx deploy does (deploy/nginx.conf): real files as-is, every
// other path gets the prerendered shell. `vite preview` can't stand in: with the Start plugin it
// server-renders unknown paths in Node, which a static SPA never does.
import { createReadStream, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../dist/client/", import.meta.url))
const PORT = Number(process.env.PORT ?? 4173)
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
}

function fileFor(pathname) {
  const path = normalize(join(ROOT, decodeURIComponent(pathname)))
  if (!path.startsWith(ROOT)) return null
  try {
    return statSync(path).isFile() ? path : null
  } catch {
    return null
  }
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost")
  const file =
    fileFor(pathname) ?? (extname(pathname) ? null : join(ROOT, "index.html"))
  if (!file) {
    res.writeHead(404).end("Not found")
    return
  }
  const headers = {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
  }
  if (
    file.endsWith("sw.js") ||
    file.endsWith(".html") ||
    file.endsWith("version.json")
  )
    headers["Cache-Control"] = "no-cache"
  res.writeHead(200, headers)
  createReadStream(file).pipe(res)
}).listen(PORT, () => console.log(`dist/client on http://localhost:${PORT}`))
