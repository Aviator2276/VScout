// A tiny in-page backend for e2e (Playwright route interception on /api/v1): enough of the HTTP
// contract for sign-in, /meta and the global event list. MQTT isn't served; the app keeps
// retrying in the background, which is the offline-tolerant path anyway.
import type { Page, Route } from "@playwright/test"

export const CREDENTIALS = { username: "alex", password: "correct horse 42" }
const USER_ID = "01900000-0000-7000-8000-000000009000"
const EVENT = {
  id: "2026casj",
  rev: 1,
  updatedAt: "2026-03-01T00:00:00.000Z",
  name: "Silicon Valley Regional",
  year: 2026,
  gameId: "2026-rebuilt",
  eventType: "regional",
  startDate: "2026-03-19",
  endDate: "2026-03-22",
  timezone: "America/Los_Angeles",
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString()

function session() {
  return {
    accessToken: "e2e-access-token",
    accessExpiresAt: iso(15 * 60_000),
    refreshExpiresAt: iso(7 * 86_400_000),
    user: {
      id: USER_ID,
      username: CREDENTIALS.username,
      displayName: "Alex",
      role: "scouter",
      teamNumber: 2276,
    },
  }
}

const problem = (route: Route, status: number, code: string) =>
  route.fulfill({
    status,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: `https://vscout.app/errors/${code}`,
      title: code,
      status,
      code,
    }),
  })

export async function mockApi(page: Page) {
  let signedIn = false
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/^.*\/api\/v1/, "")
    const json = (body: unknown) => route.fulfill({ json: body })

    if (path === "/meta")
      return json({
        apiVersion: 1,
        minClientVersion: "2.0.0-alpha.0",
        serverTime: iso(),
        activeGameId: "2026-rebuilt",
        gameSchemaVersions: { "2026-rebuilt": [1] },
        capabilities: { guestLogin: true },
      })
    if (path === "/auth/login") {
      const body = req.postDataJSON() as {
        username?: string
        password?: string
      }
      if (
        body.username !== CREDENTIALS.username ||
        body.password !== CREDENTIALS.password
      )
        return problem(route, 401, "invalid_credentials")
      signedIn = true
      return json(session())
    }
    if (path === "/auth/refresh")
      return signedIn ? json(session()) : problem(route, 401, "refresh_invalid")
    if (path === "/auth/logout") {
      signedIn = false
      return route.fulfill({ status: 204 })
    }
    if (path === "/me")
      return json({
        user: session().user,
        serverTime: iso(),
        refreshExpiresAt: session().refreshExpiresAt,
      })
    if (path === "/sync/changes") {
      const entities = (url.searchParams.get("entities") ?? "")
        .split(",")
        .filter(Boolean)
      const cursors = JSON.parse(
        url.searchParams.get("cursors") ?? "{}"
      ) as Record<string, string>
      const global = url.searchParams.get("scope") === "global"
      const changes =
        global && entities.includes("event") && !cursors.event
          ? [
              {
                v: 1,
                entity: "event",
                op: "upsert",
                id: EVENT.id,
                rev: 1,
                eventKey: null,
                ts: iso(),
                data: EVENT,
              },
            ]
          : []
      return json({
        changes,
        cursors: Object.fromEntries(
          entities.map((e) => [e, cursors[e] ?? (changes.length ? "1" : "0")])
        ),
        hasMore: false,
        serverTime: iso(),
      })
    }
    return problem(route, 404, "not_found")
  })
}
