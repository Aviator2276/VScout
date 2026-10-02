// Demo data for `pnpm mock:api`, so a local sign-in has events to pick. Replaced by the admin demo
// generator (AD7a) when it exists.
import { wireEnvelope, wireEvent } from "../factories/wire"
import { mockBackend } from "./mock-backend"

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

export function seedDevData(): void {
  if (mockBackend.log.length > 0) return
  // no automatic sign-in: refresh works only after a login, like the real cookie
  mockBackend.requireSignIn = true
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
