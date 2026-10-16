// Wires every component together. Tests build it with fakes (clock, push sender, fetch, no MQTT).
import { join } from "node:path"
import type { Config } from "./config.js"
import { Db } from "./db/db.js"
import { AuthService } from "./auth/auth-service.js"
import { Guard } from "./auth/guard.js"
import { Sessions } from "./auth/sessions.js"
import { TokenService } from "./auth/tokens.js"
import { AllianceBoard } from "./domain/board.js"
import { Bus } from "./domain/bus.js"
import { GameRegistry } from "./domain/games.js"
import { Idempotency } from "./domain/idempotency.js"
import { Settings } from "./domain/settings.js"
import { Store } from "./domain/store.js"
import { SyncReader } from "./domain/sync.js"
import { Users } from "./domain/users.js"
import { Writes } from "./domain/writes.js"
import { CachedFetcher } from "./imports/http-cache.js"
import type { Fetcher } from "./imports/http-cache.js"
import { Importer } from "./imports/importer.js"
import { pruneChangeLog } from "./jobs/maintenance.js"
import { Scheduler } from "./jobs/scheduler.js"
import type { Clock } from "./lib/clock.js"
import { iso, systemClock } from "./lib/clock.js"
import { MatchScheduler } from "./push/match-scheduler.js"
import { PushService } from "./push/push-service.js"
import type { PushSender } from "./push/push-service.js"
import { createWebPushSender, generateVapidKeys } from "./push/web-push-sender.js"
import { Publisher } from "./realtime/publisher.js"
import { SseHub } from "./realtime/sse.js"

export interface ServiceOverrides {
  clock?: Clock
  pushSender?: PushSender | null
  fetcher?: Fetcher
  log?: (msg: string, data?: unknown) => void
}

export type Services = ReturnType<typeof createServices>

export function createServices(config: Config, o: ServiceOverrides = {}) {
  const clock = o.clock ?? systemClock
  const log = o.log ?? ((msg: string, data?: unknown) => console.log(`[vscout] ${msg}`, data ?? ""))
  const dbPath = config.DATA_DIR === ":memory:" ? ":memory:" : join(config.DATA_DIR, "vscout.db")
  const db = new Db(dbPath)
  const store = new Store(db, clock)
  const bus = new Bus()
  const users = new Users(db, store)
  const sessions = new Sessions(db, clock, config.REFRESH_TTL_DAYS * 86_400_000)
  const tokens = new TokenService(db, clock, config.ACCESS_TTL_SEC, config.JWT_PRIVATE_KEY)
  const settings = new Settings(store, sessions, bus)
  const guard = new Guard(tokens, sessions, users, settings)
  const games = new GameRegistry(config.GAME_SCHEMA_VERSIONS, config.GAME_SCHEMAS_DIR)
  const writes = new Writes(store, users, games, bus)
  const board = new AllianceBoard(store)
  const idempotency = new Idempotency(db, clock)
  const sync = new SyncReader(db, store)
  const auth = new AuthService(db, clock, users, sessions, tokens, settings, bus, (m, d) => log(m, d))

  // VAPID: from the environment, else generated once and kept in the database
  let vapidPublic = config.VAPID_PUBLIC_KEY
  let vapidPrivate = config.VAPID_PRIVATE_KEY
  if (!vapidPublic || !vapidPrivate) {
    const stored = db.getMeta("vapid_keys")
    const keys = stored ? (JSON.parse(stored) as { publicKey: string; privateKey: string }) : generateVapidKeys()
    if (!stored) db.setMeta("vapid_keys", JSON.stringify(keys))
    vapidPublic = keys.publicKey
    vapidPrivate = keys.privateKey
  }
  const pushSender =
    o.pushSender !== undefined
      ? o.pushSender
      : createWebPushSender({ subject: config.VAPID_SUBJECT, publicKey: vapidPublic, privateKey: vapidPrivate })
  const pwaOrigin = config.PWA_ORIGIN[0] ?? "http://localhost:3000"
  const push = new PushService(db, store, users, bus, clock, pushSender, pwaOrigin)

  const sse = new SseHub(store, () => clock.now())
  const capabilities = () => ({
    mqttRpc: !!config.MQTT_URL,
    guestLogin: true,
    reactions: true,
    restore: true,
    batchPush: true,
    changeStream: true,
    matchPush: !!config.NEXUS_API_KEY && push.enabled,
  })
  const sysStatus = () => ({
    v: 1,
    minClientVersion: config.MIN_CLIENT_VERSION,
    maintenance: db.getMeta("maintenance") === "1",
    message: db.getMeta("maintenance_message") ?? null,
    ts: iso(clock.now()),
    capabilities: capabilities(),
  })
  const publisher = new Publisher(store, bus, clock, sysStatus, (m, e) => log(m, e))

  const http = new CachedFetcher(db, clock, o.fetcher)
  const importer = new Importer(db, store, settings, board, bus, http, clock, {
    tbaKey: config.TBA_API_KEY,
    nexusKey: config.NEXUS_API_KEY,
    statbotics: config.STATBOTICS_ENABLED,
    gameIdsByYear: config.GAME_IDS_BY_YEAR,
    activeGameId: config.ACTIVE_GAME_ID,
  }, (m, d) => log(m, d))
  const matchScheduler = new MatchScheduler(store, users, settings, push, clock, importer.nexusDataAsOf, importer.liveEvents)

  const scheduler = new Scheduler(
    clock,
    config.IMPORTS_ENABLED ? importer : null,
    [
      { name: "matchPush", everyMs: 30_000, run: () => matchScheduler.tick() },
      {
        name: "prune",
        everyMs: 24 * 60 * 60_000,
        run: async () => {
          pruneChangeLog(db, clock)
          idempotency.prune()
          for (const s of sessions.prune()) bus.emit("dropPushDevices", { userId: s.userId, deviceIds: [s.deviceId] })
          push.prune()
        },
      },
    ],
    (m, e) => log(m, e)
  )

  settings.ensureTeamSettings()

  return {
    config,
    clock,
    log,
    db,
    store,
    bus,
    users,
    sessions,
    tokens,
    settings,
    guard,
    games,
    writes,
    board,
    idempotency,
    sync,
    auth,
    push,
    vapidPublicKey: vapidPublic,
    sse,
    publisher,
    importer,
    matchScheduler,
    scheduler,
    capabilities,
    sysStatus,
  }
}
