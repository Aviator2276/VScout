// Turns what happens on this device into in-app notifications (features/notifications-center.md
// N2): new messages and announcements, matches coming up, our results, the schedule appearing, and
// system conditions (sign in again, sign-in expiring, update ready, sync conflicts). Reads Dexie
// only, so it works the same whether data came over MQTT or a delta pull. Renders nothing.
import { useEffect } from "react"
import {
  notify,
  prune,
  retract,
} from "@/features/notifications/api/notifications-store"
import type { NotifyInput } from "@/features/notifications/api/notifications-store"
import {
  matchResultNotifications,
  matchSoonNotifications,
  messageNotifications,
} from "@/features/notifications/utils/sources"
import type {
  SourceMatch,
  SourceMessage,
} from "@/features/notifications/utils/sources"
import { useOpenConflicts } from "@/hooks/use-conflicts"
import { useNow } from "@/hooks/use-now"
import { useOurTeam } from "@/hooks/use-our-team"
import { usePrefs } from "@/hooks/use-prefs"
import { useSession } from "@/hooks/use-session"
import { expiryState } from "@/lib/auth/auth-client"
import { getKv, setKv } from "@/lib/db/kv"
import { useDataRuntime } from "@/lib/db/react/data-runtime"
import { useLiveOr } from "@/lib/db/react/data-state-hooks"
import type { VScoutDB } from "@/lib/db/schema"
import type { MatchRecord } from "@/lib/db/types"
import { uuidIds } from "@/lib/ids"
import { longMatchLabel, parseMatchKey } from "@/utils/match-label"
import type { AppRuntime } from "./runtime"
import { useAppUpdate } from "./update-runtime"

const HOUR = 3_600_000
const LOADING = "loading" as const

async function store(
  db: VScoutDB,
  items: ReadonlyArray<NotifyInput>,
  refresh = false
): Promise<void> {
  for (const item of items)
    await notify(db, item, { now: Date.now(), ids: uuidIds, refresh })
}

function toSourceMatch(m: MatchRecord): SourceMatch {
  const id = parseMatchKey(m.key)
  return {
    key: m.key,
    label: id ? longMatchLabel(id) : m.key,
    teamNumbers: m.teamNumbers,
    redTeams: m.alliances.red.teamNumbers,
    startsAt: m.predictedTime ?? m.scheduledTime,
    played: m.status === "played",
    redScore: m.alliances.red.score ?? null,
    blueScore: m.alliances.blue.score ?? null,
  }
}

export function NotificationProducers({
  app,
  eventKey,
}: {
  app: AppRuntime
  eventKey: string
}) {
  const { db } = useDataRuntime()
  const session = useSession(app.auth)
  const me = session?.userId ?? null
  const prefs = usePrefs().notifications
  const watchedTeams = usePrefs().watchedTeams
  const ourTeam = useOurTeam()
  const now = useNow(30_000)

  useEffect(() => {
    void prune(db, Date.now())
  }, [db])

  // The watermark: only records newer than the moment this device started watching notify.
  const since = useLiveOr<number | null | typeof LOADING>(
    async () => (await getKv(db, `notifySince:${eventKey}`)) ?? null,
    [db, eventKey],
    LOADING
  )
  useEffect(() => {
    if (since === null) void setKv(db, `notifySince:${eventKey}`, Date.now())
  }, [db, eventKey, since])
  const watermark = typeof since === "number" ? since : null

  // ---- messages and announcements ----
  const fresh = useLiveOr(
    async (): Promise<Array<SourceMessage>> =>
      watermark === null
        ? []
        : (
            await db.messages
              .where("eventKey")
              .equals(eventKey)
              .filter((m) => m.createdAt > watermark)
              .toArray()
          ).map((m) => ({
            id: m.id,
            channelId: m.channelId,
            kind: m.kind,
            priority: m.priority,
            authorId: m.authorId,
            body: m.body,
            createdAt: m.createdAt,
          })),
    [db, eventKey, watermark],
    []
  )
  const names = useLiveOr(
    async () =>
      new Map((await db.users.toArray()).map((u) => [u.id, u.displayName])),
    [db],
    new Map<string, string>()
  )
  const myName = me ? (names.get(me) ?? session?.displayName ?? "") : ""
  useEffect(() => {
    if (!me || fresh.length === 0) return
    const items = messageNotifications(fresh, {
      me,
      myName,
      prefs,
      authorName: (id) => names.get(id) ?? "Someone",
      eventKey,
    })
    const newest = Math.max(...fresh.map((m) => m.createdAt))
    // advance the watermark, so a deleted notification never comes back for the same message
    void store(db, items).then(() =>
      setKv(db, `notifySince:${eventKey}`, newest)
    )
  }, [db, me, myName, fresh, names, prefs, eventKey])

  // ---- matches ----
  const matches = useLiveOr(
    async () =>
      (await db.matches.where("eventKey").equals(eventKey).toArray()).map(
        (m) => ({ source: toSourceMatch(m), updatedAt: m.updatedAt })
      ),
    [db, eventKey],
    []
  )
  useEffect(() => {
    const list = matches.map((m) => m.source)
    void store(
      db,
      matchSoonNotifications(list, {
        ourTeam,
        watched: watchedTeams,
        prefs,
        now,
      })
    )
  }, [db, matches, ourTeam, watchedTeams, prefs, now])
  useEffect(() => {
    if (watermark === null) return
    void store(
      db,
      matchResultNotifications(
        matches.map((m) => m.source),
        { ourTeam, since: watermark, prefs }
      )
    )
  }, [db, matches, ourTeam, prefs, watermark])
  useEffect(() => {
    if (watermark === null || matches.length === 0) return
    void (async () => {
      if (await getKv(db, `notifySchedule:${eventKey}`)) return
      await setKv(db, `notifySchedule:${eventKey}`, true)
      // a schedule that was already here when watching began isn't news
      if (Math.min(...matches.map((m) => m.updatedAt)) <= watermark) return
      await store(db, [
        {
          key: `schedule:${eventKey}`,
          category: "events",
          priority: "normal",
          title: "The match schedule is out",
          body: `${matches.length} matches. See when your team plays.`,
          href: "/matches",
        },
      ])
    })()
  }, [db, eventKey, matches, watermark])

  // ---- system ----
  const needsReauth = session?.status === "needs-reauth"
  useEffect(() => {
    if (!needsReauth) {
      void retract(db, "system:reauth")
      return
    }
    void store(
      db,
      [
        {
          key: "system:reauth",
          category: "system",
          priority: "critical",
          title: "Sign in again to sync",
          body: "Your work is saved on this device. Sign in to send it.",
          href: "/login?reauth=true",
        },
      ],
      true
    )
  }, [db, needsReauth])

  const expiry = needsReauth ? "ok" : expiryState(session, now)
  const hoursLeft = session
    ? Math.max(1, Math.round((session.refreshExpiresAt - now) / HOUR))
    : 0
  useEffect(() => {
    if (expiry !== "warn" && expiry !== "urgent") {
      void retract(db, "system:expiry")
      return
    }
    void store(
      db,
      [
        {
          key: "system:expiry",
          category: "system",
          priority: expiry === "urgent" ? "critical" : "high",
          title: `Your sign-in expires in ${hoursLeft} ${hoursLeft === 1 ? "hour" : "hours"}`,
          body: "Sign in again to keep syncing.",
          href: "/login?reauth=true",
        },
      ],
      true
    )
  }, [db, expiry, hoursLeft])

  const update = useAppUpdate()
  useEffect(() => {
    if (update.ready === null) {
      void retract(db, "system:update")
      return
    }
    void store(
      db,
      [
        {
          key: "system:update",
          category: "system",
          priority: "normal",
          title: update.ready
            ? `VScout ${update.ready} is ready`
            : "An update is ready",
          body: "Tap to update now. It takes a few seconds.",
          action: "update",
        },
      ],
      true
    )
  }, [db, update.ready])

  const conflicts = useOpenConflicts()
  const conflictCount =
    conflicts.status === "success" ? conflicts.data.length : 0
  useEffect(() => {
    if (conflicts.status === "loading") return
    if (conflictCount === 0) {
      void retract(db, "system:conflicts")
      return
    }
    void store(
      db,
      [
        {
          key: "system:conflicts",
          category: "system",
          priority: "high",
          title:
            conflictCount === 1
              ? "1 change needs your decision"
              : `${conflictCount} changes need your decision`,
          body: "Someone else edited the same record. Choose which version to keep.",
          href: "/settings/conflicts",
        },
      ],
      true
    )
  }, [db, conflicts.status, conflictCount])

  return null
}
