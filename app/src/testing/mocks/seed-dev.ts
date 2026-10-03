// Demo data for `pnpm mock:api`, so a local sign-in has events to pick, and the demo event is
// mid-qualification (demo-event.ts). The admin demo generator (AD7a, FX-60) builds on it.
import { wireEnvelope, wireEvent, wireUser } from "../factories/wire"
import { seedDemoEvent } from "./demo-event"
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

/**
 * Local accounts, same password: alex is the team's admin, sam shows the scouter view, and admin is
 * a spare that is always an admin. Admin accounts here stay admins (owner): every start restores
 * their role, each request acts as admin, and the mock refuses to demote them.
 */
const DEV_ACCOUNTS = [
  {
    id: MOCK_USER_ID,
    username: "alex",
    displayName: "Alex Rivera",
    role: "admin",
  },
  {
    id: "01900000-0000-7000-8000-000000009001",
    username: "sam",
    displayName: "Sam Chen",
    role: "scouter",
  },
  {
    id: "01900000-0000-7000-8000-000000009002",
    username: "admin",
    displayName: "Dev Admin",
    role: "admin",
  },
] as const

export function seedDevData(): void {
  // no automatic sign-in: refresh works only after a login, like the real cookie; each device
  // keeps its own session (alex on one, sam on another, never mixed up)
  mockBackend.requireSignIn = true
  mockBackend.perDeviceSessions = true
  mockBackend.realClock = true
  for (const a of DEV_ACCOUNTS) {
    if (a.role === "admin") mockBackend.alwaysAdmin.add(a.id)
    const user = mockBackend.users.get(a.id)
    // a restored state keeps its users; a dev account only comes back if it's missing or demoted
    const fresh = !user || user.role !== a.role || user.active === false
    mockBackend.accounts.set(a.username, {
      ...a,
      password: MOCK_CREDENTIALS.password,
    })
    if (!fresh) continue
    const rev = (user?.rev ?? 0) + 1
    mockBackend.users.set(a.id, {
      id: a.id,
      rev,
      updatedAt: mockBackend.now(),
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
          rev,
          username: a.username,
          displayName: a.displayName,
          role: a.role,
        })
      )
    )
  }
  // sessions signed in before a role fix act as the account's real role
  for (const [sid, s] of mockBackend.sessions)
    if (mockBackend.alwaysAdmin.has(s.userId))
      mockBackend.sessions.set(sid, { ...s, role: "admin" })
  // a restored state (FX-61) already has the events
  if (mockBackend.log.some((e) => e.entity === "event")) return
  for (const e of EVENTS)
    mockBackend.append(
      "global",
      "event",
      wireEnvelope(
        "event",
        wireEvent({ ...e, gameId: "2026-rebuilt", year: 2026 })
      )
    )
  seedDemoEvent("2026chcmp")
}
