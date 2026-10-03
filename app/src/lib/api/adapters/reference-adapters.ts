// Server-owned reference data: event, team, eventTeam, match, user.
import type { EntityAdapter } from "./entity-adapter"
import { serverMeta } from "./entity-adapter"
import { isoToMsOrNull } from "./time"

export const eventAdapter: EntityAdapter<"event"> = {
  toDomain: (w) => {
    const { id: _i, rev: _r, updatedAt: _u, isDemo, ...rest } = w
    return { ...rest, ...serverMeta(w), key: w.id, isDemo: isDemo ?? false }
  },
}

export const teamAdapter: EntityAdapter<"team"> = {
  toDomain: (w) => {
    const { id: _i, rev: _r, updatedAt: _u, ...rest } = w
    return { ...rest, ...serverMeta(w) }
  },
}

export const eventTeamAdapter: EntityAdapter<"eventTeam"> = {
  toDomain: (w) => {
    const { id: _i, rev: _r, updatedAt: _u, statsUpdatedAt, ...rest } = w
    return {
      ...rest,
      ...serverMeta(w),
      rank: w.rank ?? null,
      rankingPoints: w.rankingPoints ?? null,
      pitLocation: w.pitLocation ?? null,
      statsUpdatedAt: isoToMsOrNull(statsUpdatedAt),
    }
  },
}

export const matchAdapter: EntityAdapter<"match"> = {
  toDomain: (w) => {
    const {
      id: _i,
      rev: _r,
      updatedAt: _u,
      scheduledTime,
      predictedTime,
      predictedAt,
      actualTime,
      winningAlliance,
      ...rest
    } = w
    return {
      ...rest,
      ...serverMeta(w),
      key: w.id,
      scheduledTime: isoToMsOrNull(scheduledTime),
      predictedTime: isoToMsOrNull(predictedTime),
      predictedAt: isoToMsOrNull(predictedAt),
      actualTime: isoToMsOrNull(actualTime),
      winningAlliance: winningAlliance ?? null,
      teamNumbers: [
        ...w.alliances.red.teamNumbers,
        ...w.alliances.blue.teamNumbers,
      ],
    }
  },
}

export const userAdapter: EntityAdapter<"user"> = {
  toDomain: (w) => {
    const { id: _i, rev: _r, updatedAt: _u, ...rest } = w
    return { ...rest, ...serverMeta(w) }
  },
}
