// Demo data for `pnpm mock:api`, so a local sign-in has events to pick. Replaced by the admin demo
// generator (AD7a) when it exists.
import { wireEnvelope, wireEvent, wireUser } from "../factories/wire"
import { MOCK_CREDENTIALS, MOCK_USER_ID, mockBackend } from "./mock-backend"

const EVENTS = [
  {
    id: "2026casj",
    name: "Silicon Valley Regional",
    startDate: "2026-03-19",
    endDate: "2026-03-22",
  },
  {
    id: "2026cafr",
    name: "Central Valley Regional",
    startDate: "2026-03-26",
    endDate: "2026-03-29",
  },
  {
    id: "2026chcmp",
    name: "Chezy Champs",
    startDate: "2026-10-01",
    endDate: "2026-10-04",
    isDemo: true,
  },
]

/** Local accounts: alex is the team's admin; sam shows the scouter view. Same password. */
const DEV_ACCOUNTS = [
  { id: MOCK_USER_ID, username: "alex", displayName: "Alex", role: "admin" },
  {
    id: "01900000-0000-7000-8000-000000009001",
    username: "sam",
    displayName: "Sam",
    role: "scouter",
  },
] as const

export function seedDevData(): void {
  if (mockBackend.log.length > 0) return
  // no automatic sign-in: refresh works only after a login, like the real cookie
  mockBackend.requireSignIn = true
  for (const a of DEV_ACCOUNTS) {
    mockBackend.accounts.set(a.username, {
      ...a,
      password: MOCK_CREDENTIALS.password,
    })
    mockBackend.users.set(a.id, {
      id: a.id,
      rev: 1,
      updatedAt: "2026-03-20T15:00:00.000Z",
      username: a.username,
      displayName: a.displayName,
      role: a.role,
      active: true,
    })
    mockBackend.append(
      "user",
      "user",
      wireEnvelope(
        "user",
        wireUser({
          id: a.id,
          username: a.username,
          displayName: a.displayName,
          role: a.role,
        })
      )
    )
  }
  for (const e of EVENTS)
    mockBackend.append(
      "global",
      "event",
      wireEnvelope(
        "event",
        wireEvent({ ...e, gameId: "2026-rebuilt", year: 2026 })
      )
    )
}
