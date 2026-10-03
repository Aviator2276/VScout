// Mock HTTP API on http://localhost:8787 answering from the same MSW handlers the tests use
// (src/testing/mocks/handlers). Vite loads the TypeScript so the @/ alias works.
// Sign in as alex (admin) or sam (scouter), password "correct horse 42", or the guest code K7M2QX
// (src/testing/mocks/seed-dev.ts).
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createServer as createHttpServer } from "node:http"
import { resolve } from "node:path"
import { createServer as createViteServer } from "vite"
import { getResponse } from "msw"

const PORT = Number(process.env.MOCK_API_PORT ?? 8787)
const ORIGIN = process.env.MOCK_API_CORS_ORIGIN ?? "http://localhost:3000"

const vite = await createViteServer({
  configFile: "vite.config.ts",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
})

// The mock's state survives restarts (FX-61): sessions, scouting, chat and demo events are saved to
// STATE_FILE after every change. `make mock-reset` (pnpm mock:reset) deletes it for a fresh start.
const STATE_FILE = resolve(
  process.env.MOCK_API_STATE ?? "dev-stack/mock-api/.state.json"
)
const { mockBackend } = await vite.ssrLoadModule(
  "/src/testing/mocks/mock-backend.ts"
)
if (existsSync(STATE_FILE)) {
  try {
    if (mockBackend.restore(JSON.parse(readFileSync(STATE_FILE, "utf8"))))
      console.log(`[mock-api] restored ${STATE_FILE}`)
  } catch (error) {
    console.warn(
      `[mock-api] couldn't read ${STATE_FILE}, starting fresh`,
      error
    )
  }
}
let saveTimer = null
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      writeFileSync(STATE_FILE, JSON.stringify(mockBackend.snapshot()))
    } catch (error) {
      console.warn(`[mock-api] couldn't save ${STATE_FILE}`, error)
    }
  }, 500)
}
mockBackend.appendListeners.add(scheduleSave)

// demo events, so a local sign-in has something to pick (same module instance as the handlers)
const { seedDevData } = await vite.ssrLoadModule(
  "/src/testing/mocks/seed-dev.ts"
)
seedDevData()
scheduleSave()

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

// GET /api/v1/sync/stream: Server-Sent Events of change envelopes (capabilities.changeStream), so
// HTTP-only clients see messages at once. Same scopes as /sync/changes; `access_token` names the
// device's session. Comments every 20 s keep proxies from closing it.

function serveStream(req, res, url) {
  const token = url.searchParams.get("access_token") ?? ""
  const session = token.startsWith("mock-access.")
    ? mockBackend.sessions.get(token.slice("mock-access.".length))
    : undefined
  const headers = cors(new Headers())
  if (!session) {
    headers.set("Content-Type", "application/json")
    res.writeHead(401, Object.fromEntries(headers))
    res.end(JSON.stringify({ code: "token_invalid" }))
    return
  }
  const scopes = new Set(
    (url.searchParams.get("scopes") ?? "").split(",").filter(Boolean)
  )
  headers.set("Content-Type", "text/event-stream")
  headers.set("Cache-Control", "no-cache")
  headers.set("Connection", "keep-alive")
  res.writeHead(200, Object.fromEntries(headers))
  res.write("retry: 2000\n\n")
  const listener = (entry) => {
    if (!scopes.has(entry.scope)) return
    // the user scope is personal: only this user's own records
    if (entry.scope === "user") {
      const data = entry.envelope.data ?? {}
      const owner = data.userId ?? entry.envelope.id
      if (owner !== session.userId) return
    }
    res.write(`data: ${JSON.stringify(entry.envelope)}\n\n`)
  }
  mockBackend.appendListeners.add(listener)
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000)
  req.on("close", () => {
    clearInterval(ping)
    mockBackend.appendListeners.delete(listener)
  })
}

createHttpServer(async (req, res) => {
  const streamUrl = new URL(req.url ?? "/", `http://localhost:${PORT}`)
  if (req.method === "GET" && streamUrl.pathname === "/api/v1/sync/stream") {
    serveStream(req, res, streamUrl)
    return
  }
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
  // sign-ins, sessions and writes change state without a change-log entry
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method ?? "GET")) scheduleSave()
  const headers = cors(new Headers(response.headers))
  res.writeHead(response.status, Object.fromEntries(headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}).listen(PORT, () => {
  console.log(
    `[mock-api] http://localhost:${PORT} (MSW handlers, CORS for ${ORIGIN})`
  )
})
