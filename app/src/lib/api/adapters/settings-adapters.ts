// Singletons and shared boards: userSettings, teamSettings, eventSettings, allianceBoard.
import type { EntityAdapter } from "./entity-adapter"
import { serverMeta } from "./entity-adapter"
import { isoToMs, isoToMsOrNull } from "./time"

export const userSettingsAdapter: EntityAdapter<"userSettings"> = {
  toDomain: (w) => {
    const { id: _i, rev: _r, updatedAt: _u, ...rest } = w
    return { ...rest, ...serverMeta(w), syncState: "synced" }
  },
}

export const teamSettingsAdapter: EntityAdapter<"teamSettings"> = {
  toDomain: (w) => ({
    ...serverMeta(w),
    id: "team",
    teamNumber: w.teamNumber ?? null,
    syncState: "synced",
  }),
}

export const eventSettingsAdapter: EntityAdapter<"eventSettings"> = {
  toDomain: (w) => {
    const { id: _i, rev: _r, updatedAt: _u, guestAccess, ...rest } = w
    return {
      ...rest,
      ...serverMeta(w),
      guestAccess: {
        enabled: guestAccess.enabled,
        code: guestAccess.code,
        rotatedAt: isoToMsOrNull(guestAccess.rotatedAt),
      },
      syncState: "synced",
    }
  },
}

export const allianceBoardAdapter: EntityAdapter<"allianceBoard"> = {
  toDomain: (w) => {
    const { id: _i, rev: _r, updatedAt: _u, lockedAt, history, ...rest } = w
    return {
      ...rest,
      ...serverMeta(w),
      lockedAt: isoToMsOrNull(lockedAt),
      history: history.map((h) => ({ ...h, at: isoToMs(h.at) })),
    }
  },
}
