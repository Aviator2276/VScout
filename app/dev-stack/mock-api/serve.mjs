// Mock HTTP API on http://localhost:8787 answering from the same MSW handlers the tests use
// (src/testing/mocks/handlers). Vite loads the TypeScript so the @/ alias works.
// Sign in as alex (admin) or sam (scouter), password "correct horse 42", or the guest code K7M2QX
// (src/testing/mocks/seed-dev.ts).
import { createServer as createHttpServer } from "node:http"
import { createServer as createViteServer } from "vite"
import { getResponse } from "msw"

const PORT = Number(process.env.MOCK_API_PORT ?? 8787)
const ORIGIN = process.env.MOCK_API_CORS_ORIGIN ?? "http://localhost:3000"

const vite = await createViteServer({
  configFile: "vite.config.ts",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
})

// demo events, so a local sign-in has something to pick (same module instance as the handlers)
const { seedDevData } = await vite.ssrLoadModule(
  "/src/testing/mocks/seed-dev.ts"
)
seedDevData()

async function loadHandlers() {
  const mod = await vite.ssrLoadModule(
    "/src/testing/mocks/handlers/handlers.ts"
  )
  return mod.handlers
}

function cors(headers) {
  headers.set("Access-Control-Allow-Origin", ORIGIN)
  headers.set("Access-Control-Allow-Credentials", "true")
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Idempotency-Key, If-Match, X-Client-Version"
  )
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  )
  return headers
}

createHttpServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`)
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method ?? "GET")
      ? undefined
      : Buffer.concat(chunks),
  })

  let response
  if (req.method === "OPTIONS") response = new Response(null, { status: 204 })
  else {
    // reloaded per request, so editing a handler needs no restart
    response =
      (await getResponse(await loadHandlers(), request)) ??
      Response.json(
        {
          code: "not_mocked",
          message: `No mock handler for ${req.method} ${url.pathname}`,
        },
        { status: 404 }
      )
  }
  const headers = cors(new Headers(response.headers))
  res.writeHead(response.status, Object.fromEntries(headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}).listen(PORT, () => {
  console.log(
    `[mock-api] http://localhost:${PORT} (MSW handlers, CORS for ${ORIGIN})`
  )
})
