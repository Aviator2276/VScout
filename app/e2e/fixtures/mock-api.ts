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

export const iso = (offsetMs = 0) =>
  new Date(Date.now() + offsetMs).toISOString()

// ---------- event data: 40 teams, 80 quals (32 played, Q33 on the field) ----------

const NAMES: Record<number, string> = {
  254: "The Cheesy Poofs",
  1678: "Citrus Circuits",
  2276: "Demo Robotics",
  971: "Spartan Robotics",
}
export const TEAMS = [
  254,
  1678,
  2276,
  971,
  ...Array.from({ length: 36 }, (_, i) => 3000 + i * 7),
]
export const MATCH_COUNT = 80
export const PLAYED = 32

const change = (
  entity: string,
  id: string,
  eventKey: string | null,
  data: Record<string, unknown>
) => ({ v: 1, entity, op: "upsert", id, rev: 1, eventKey, ts: iso(), data })

export function buildData(): Record<string, Array<unknown>> {
  const meta = { rev: 1, updatedAt: "2026-03-01T00:00:00.000Z" }
  const teams = TEAMS.map((n) =>
    change("team", String(n), null, {
      ...meta,
      id: String(n),
      teamNumber: n,
      nickname: NAMES[n] ?? `Team ${n} Robotics`,
    })
  )
  const eventTeams = TEAMS.map((n, i) =>
    change("eventTeam", `${EVENT.id}_${n}`, EVENT.id, {
      ...meta,
      id: `${EVENT.id}_${n}`,
      eventKey: EVENT.id,
      teamNumber: n,
      // the last two haven't played a ranked match yet
      rank: i < TEAMS.length - 2 ? i + 1 : null,
    })
  )
  const start = Date.now() - (PLAYED + 1) * 7 * 60_000
  const matches = Array.from({ length: MATCH_COUNT }, (_, i) => {
    const n = i + 1
    const pick = (k: number) => TEAMS[(i * 6 + k) % TEAMS.length] ?? 254
    const played = n <= PLAYED
    const key = `${EVENT.id}_qm${n}`
    return change("match", key, EVENT.id, {
      ...meta,
      id: key,
      eventKey: EVENT.id,
      compLevel: "qm",
      setNumber: 1,
      matchNumber: n,
      scheduledTime: new Date(start + n * 7 * 60_000).toISOString(),
      alliances: {
        red: {
          teamNumbers: [pick(0), pick(1), pick(2)],
          score: played ? 60 + n : null,
        },
        blue: {
          teamNumbers: [pick(3), pick(4), pick(5)],
          score: played ? 50 + (n % 20) : null,
        },
      },
      status: played ? "played" : n === PLAYED + 1 ? "onField" : "scheduled",
      winningAlliance: played
        ? 60 + n > 50 + (n % 20)
          ? "red"
          : "blue"
        : null,
    })
  })
  return {
    "global|event": [change("event", EVENT.id, null, EVENT)],
    "global|team": teams,
    "global|teamSettings": [
      change("teamSettings", "team", null, {
        ...meta,
        id: "team",
        teamNumber: 2276,
      }),
    ],
    [`event:${EVENT.id}|eventTeam`]: eventTeams,
    [`event:${EVENT.id}|match`]: matches,
  }
}
const DATA = buildData()

export function session() {
  return {
    accessToken: "e2e-access-token",
    accessExpiresAt: iso(15 * 60_000),
    refreshExpiresAt: iso(7 * 86_400_000),
    user: {
      id: USER_ID,
      username: CREDENTIALS.username,
      displayName: "Alex",
      // e2e only: specs that need an admin call seedBackend("admin"); the dev mock's alex is
      // always an admin (src/testing/mocks/seed-dev.ts)
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
      const scope = url.searchParams.get("scope") ?? ""
      const changes = entities.flatMap((e) =>
        cursors[e] ? [] : (DATA[`${scope}|${e}`] ?? [])
      )
      return json({
        changes,
        cursors: Object.fromEntries(
          entities.map((e) => [
            e,
            cursors[e] ?? (DATA[`${scope}|${e}`]?.length ? "1" : "0"),
          ])
        ),
        hasMore: false,
        serverTime: iso(),
      })
    }
    return problem(route, 404, "not_found")
  })
}
