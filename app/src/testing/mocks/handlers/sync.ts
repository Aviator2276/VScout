// GET /sync/changes over the mock change log (http-api-contract §3.1). Cursors are log indexes,
// opaque to the client.
import { http, HttpResponse } from "msw"
import { syncScope } from "@/lib/contracts/sync-changes"
import { mockBackend } from "../mock-backend"
import { problemResponse } from "./problem"

function parseCursors(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === "object" && value !== null
      ? (value as Record<string, string>)
      : {}
  } catch {
    return {}
  }
}

export const syncHandlers = [
  http.get("*/api/v1/sync/changes", ({ request }) => {
    const url = new URL(request.url)
    const scope = syncScope.safeParse(url.searchParams.get("scope"))
    if (!scope.success) return problemResponse(400, "validation_failed")
    const entities = (url.searchParams.get("entities") ?? "")
      .split(",")
      .filter(Boolean)
    const cursors = parseCursors(url.searchParams.get("cursors"))
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000)

    const nextCursors: Record<string, string> = {}
    const changes: Array<Record<string, unknown>> = []
    let hasMore = false
    for (const entity of entities) {
      const from = Number(cursors[entity] ?? 0)
      const rows = mockBackend.log
        .map((entry, index) => ({ entry, index }))
        .filter(
          ({ entry, index }) =>
            index >= from &&
            entry.scope === scope.data &&
            entry.entity === entity
        )
      const page = rows.slice(0, Math.max(0, limit - changes.length))
      if (page.length < rows.length) hasMore = true
      changes.push(...page.map(({ entry }) => entry.envelope))
      const last = page.at(-1)
      nextCursors[entity] = String(last ? last.index + 1 : from)
    }
    return HttpResponse.json({
      changes,
      cursors: nextCursors,
      hasMore,
      serverTime: mockBackend.at(),
    })
  }),
]
