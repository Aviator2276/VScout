// The composition root (project-structure: src/app). Builds the singletons the shell needs (db,
// API client, auth, sync engine, MQTT) from Phase 1's lib modules and owns the session lifecycle
// that <SessionRuntime> starts and stops (routing-auth §7.2). Created lazily on first use, never at
// module load: the shell prerender runs in Node (routing-auth §1).
import { decodeMeta } from "@/lib/api/adapters/meta-adapter"
import { createApiClient } from "@/lib/api/api-client"
import { attachNetworkMonitor } from "@/lib/network/network-monitor"
import { createNetworkTelemetry } from "@/lib/network/network-telemetry"
import type { ApiClient } from "@/lib/api/api-client"
import { createCapabilitiesStore } from "@/lib/api/capabilities"
import type { CapabilitiesStore } from "@/lib/api/capabilities"
import {
  createUser,
  fetchOptional,
  patchUser,
  refreshAudit,
  refreshUsers,
  createDemoEvent,
  deleteDemoEvent,
  revokeSessions,
  saveGuestAccess,
} from "@/lib/sync/admin-actions"
import { patchEventSettings, setTeamNumber } from "@/lib/sync/admin-writes"
import {
  browserVideoWorker,
  createVideoManager,
  opfsFiles,
} from "@/lib/media/videos"
import { createHttpTransport } from "@/lib/api/transport/http-transport"
import { createMqttRpcTransport } from "@/lib/api/transport/mqtt-rpc-transport"
import { TransportHealth } from "@/lib/api/transport/select-transport"
import type { TransportMode } from "@/lib/api/transport/select-transport"
import { createAuthClient } from "@/lib/auth/auth-client"
import type { AuthClient } from "@/lib/auth/auth-client"
import { createRefresher } from "@/lib/auth/refresh"
import type { BroadcastLike, RefreshLockManager } from "@/lib/auth/refresh"
import { createTokenStore } from "@/lib/auth/token-store"
import type { Session } from "@/lib/auth/types"
import { systemClock } from "@/lib/clock"
import type { Clock } from "@/lib/clock"
import { migrateDrafts } from "@/lib/db/drafts"
import { getKv, setKv } from "@/lib/db/kv"
import type { DataRuntime } from "@/lib/db/react/data-runtime"
import { clearLiveCache } from "@/lib/db/react/use-live"
import { createChangeStream } from "@/lib/sync/change-stream"
import type { VScoutDB } from "@/lib/db/schema"
import type { DeviceSettingsRow, EventRecord } from "@/lib/db/types"
import { uuidIds } from "@/lib/ids"
import type { IdGen } from "@/lib/ids"
import { logger } from "@/lib/logger"
import { createStore } from "@/lib/mqtt/external-store"
import type { ExternalStore } from "@/lib/mqtt/external-store"
import { requestLeadership } from "@/lib/mqtt/leader"
import type { LockManagerLike, Leadership } from "@/lib/mqtt/leader"
import { attachLifecycle } from "@/lib/mqtt/lifecycle"
import { createMqttConnection } from "@/lib/mqtt/mqtt-client"
import type { MqttConnection, MqttStatus } from "@/lib/mqtt/mqtt-client"
import { createRpcChannel } from "@/lib/mqtt/rpc-channel"
import type { RpcChannel } from "@/lib/mqtt/rpc-channel"
import type { PresenceEntry } from "@/lib/mqtt/presence-store"
import type { MqttTransportFactory } from "@/lib/mqtt/transport"
import { createSyncEngine } from "@/lib/sync/engine"
import type { SyncEngine } from "@/lib/sync/engine"
import type { GameLookup } from "@/lib/sync/game-payload"
import type { SyncLockManager } from "@/lib/sync/lock"
import { createScopeInfoStore } from "@/lib/sync/scope-info"
import type { ScopeInfoStore } from "@/lib/sync/scope-info"
import { attachSyncTriggers } from "@/lib/sync/triggers"
import { createPushClient } from "@/lib/push/push-client"
import type { PushClient, PushEnv } from "@/lib/push/push-client"
import type { MutateDeps } from "@/lib/sync/mutate"
import {
  changePassword,
  refreshPitMap,
  restoreRecord,
  sendBoardAction,
} from "@/lib/sync/live-actions"
import { canWrite } from "@/lib/authorization"

type Targets = Pick<Window, "addEventListener" | "removeEventListener">
type DocTargets = Pick<
  Document,
  "addEventListener" | "removeEventListener" | "visibilityState"
>

export interface RuntimeOptions {
  /** the browser's push APIs (absent in tests and the prerender) */
  push?: PushEnv
  db: VScoutDB
  apiUrl: string
  mqttUrl: string
  appVersion: string
  games: GameLookup
  mqttTransport: MqttTransportFactory
  fetch?: typeof fetch
  clock?: Clock
  ids?: IdGen
  window: Targets
  document: DocTargets
  isOnline: () => boolean
  /** navigator.locks; absent in old browsers and in tests */
  locks?: LockManagerLike & RefreshLockManager & SyncLockManager
  /** BroadcastChannel("vscout:auth") */
  authChannel?: BroadcastLike
  deviceName?: () => string
  /** navigator.storage.persist (routing-auth §7.1); absent in old browsers */
  persistStorage?: () => Promise<boolean>
}

export type SessionEndedReason = string

export interface ActiveEvent {
  key: string
  name: string
  year: number
}

const DEFAULT_DEVICE: DeviceSettingsRow = {
  id: "device",
  solidSurfaces: false,
  haptics: true,
  iosHapticsExperiment: false,
  keepScreenAwake: false,
  autoDownloadVideos: false,
  transport: "auto",
}

/** "iPhone · Safari" for the sessions list (Settings → Account, admin users). */
export function describeDevice(ua: string): string {
  const device = /iPad/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Browser"
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : null
  return browser ? `${device} · ${browser}` : device
}

export function createAppRuntime(o: RuntimeOptions) {
  const clock = o.clock ?? systemClock
  const ids = o.ids ?? uuidIds
  const db = o.db
  const tokens = createTokenStore()
  const health = new TransportHealth()
  /** what's moving and how fast, for the Sync Status notch (ADR-079) */
  const network = createNetworkTelemetry(() => clock.now())
  const capabilities: CapabilitiesStore = createCapabilitiesStore()
  const scopeInfo: ScopeInfoStore = createScopeInfoStore(() => db)
  const activeEventKey = createStore<string | null>(null)
  const mqttStatus = createStore<MqttStatus | null>(null)
  /** who's online (MQTT presence, memory only), mirrored from the live connection */
  const presence = createStore<ReadonlyMap<string, PresenceEntry>>(new Map())
  /** from /meta: the oldest client version the backend accepts (pwa-offline §8) */
  const minClientVersion = createStore<string | null>(null)
  /** listeners may return a promise: the logout wipe waits for it (leave the signed-in pages first) */
  const sessionEnded = new Set<
    (reason: SessionEndedReason) => void | Promise<unknown>
  >()
  const roleChanged = new Set<(role: Session["role"]) => void>()
  let transportMode: TransportMode = "auto"
  let mqtt: MqttConnection | null = null
  let rpcChannel: RpcChannel | null = null

  const rpc = (): RpcChannel | null => {
    if (rpcChannel || !mqtt) return rpcChannel
    const topics = mqtt.rpcTopics()
    if (topics) rpcChannel = createRpcChannel(mqtt.rpcLink, topics)
    return rpcChannel
  }

  // `auth` is defined below; the API client only calls these after construction.
  let authRef: AuthClient | null = null
  const api: ApiClient = createApiClient({
    transports: {
      http: createHttpTransport({
        baseUrl: o.apiUrl,
        ...(o.fetch ? { fetch: o.fetch } : {}),
        clock,
      }),
      mqtt: createMqttRpcTransport({
        channel: rpc,
        ids,
        clock,
        enabled: () =>
          capabilities.get().mqttRpc &&
          (mqtt?.status.getSnapshot().isLeader ?? false),
      }),
    },
    health,
    mode: () => transportMode,
    clock,
    clientVersion: o.appVersion,
    accessToken: () => tokens.get(),
    refresh: () => authRef?.refresh() ?? Promise.resolve(false),
    telemetry: network,
  })

  const refresher = createRefresher({
    api,
    tokens,
    now: () => clock.now(),
    ...(o.locks ? { locks: o.locks } : {}),
    ...(o.authChannel ? { channel: o.authChannel } : {}),
  })

  let sync: SyncEngine | null = null
  const stopTransports = async () => {
    sync?.stop()
    const conn = mqtt
    mqtt = null
    rpcChannel = null
    mqttStatus.set(null)
    await conn?.stop({ publishOffline: true })
  }

  const auth = createAuthClient({
    db: () => db,
    api,
    tokens,
    refresher,
    clock,
    ids,
    deviceName: o.deviceName ?? (() => "Browser"),
    isOnline: o.isOnline,
    ...(o.authChannel ? { channel: o.authChannel } : {}),
    onLoggedOut: async (reason) => {
      await stopTransports()
      activeEventKey.set(null)
      // pages reading Dexie must unmount before the database is deleted (DatabaseClosedError)
      await Promise.all([...sessionEnded].map(async (l) => l(reason)))
      // the next user must never see the last user's rows, not even for a frame
      clearLiveCache()
    },
    onRoleChanged: (role) => {
      for (const l of roleChanged) l(role)
    },
  })
  authRef = auth

  // Another tab signed in or out (routing-auth §7.5 step 5).
  o.authChannel?.addEventListener("message", (e) => {
    const data = e.data as { type?: unknown; reason?: unknown } | null
    if (data?.type === "logout") {
      auth.invalidate()
      const reason = typeof data.reason === "string" ? data.reason : "logout"
      void stopTransports()
        .then(() => Promise.all([...sessionEnded].map(async (l) => l(reason))))
        // the other tab deleted the database; this tab's copy was closed by versionchange
        .then(() => (db.isOpen() ? undefined : db.open()))
        .catch((error: unknown) =>
          logger.warn("auth", "cross-tab logout cleanup failed", {
            error: String(error),
          })
        )
    } else if (data?.type === "session") auth.invalidate()
  })

  sync = createSyncEngine({
    db,
    api,
    clock,
    ids,
    games: o.games,
    session: () => {
      const s = auth.getSession()
      return s ? { userId: s.userId, role: s.role } : null
    },
    activeEventKey: () => activeEventKey.getSnapshot(),
    ...(o.locks ? { locks: o.locks } : {}),
    scopeInfo,
    onAuthLost: () => logger.warn("auth", "sync stopped: sign in again"),
    onUpgradeRequired: () => void setKv(db, "needsAppUpdate", true),
  })
  const engine = sync

  async function deviceSettings(): Promise<DeviceSettingsRow> {
    return (await db.deviceSettings.get("device")) ?? DEFAULT_DEVICE
  }

  async function deviceId(): Promise<string> {
    const existing = await getKv(db, "deviceId")
    if (existing) return existing
    const id = ids.newId()
    await setKv(db, "deviceId", id)
    return id
  }

  /** GET /meta → capabilities (ADR-071). Missing or failing → nothing optional is used. */
  async function loadMeta(): Promise<void> {
    try {
      const res = await api.request({
        method: "GET",
        path: "/meta",
        class: "delta",
        anonymous: true,
      })
      const meta = decodeMeta(res.body)
      if (meta.ok) {
        capabilities.set(meta.value.capabilities)
        minClientVersion.set(meta.value.minClientVersion)
      }
    } catch (error) {
      logger.info("api", "meta unavailable", { error: String(error) })
    }
  }

  /**
   * Guests belong to their code's event (ADR-073). Everyone else picks one per device; a wiped
   * device falls back to the synced `lastActiveEventKey` (ADR-056).
   */
  async function loadActiveEvent(): Promise<ActiveEvent | null> {
    const session = await auth.ensureLoaded()
    let key = session?.eventKey ?? (await deviceSettings()).activeEventKey
    if (!key && session) {
      key = (await db.userSettings.get(session.userId))?.lastActiveEventKey
      if (key) await setActiveEvent(key)
    }
    activeEventKey.set(key ?? null)
    if (!key) return null
    const event = await db.events.get(key)
    return event ? toActiveEvent(event) : { key, name: key, year: yearOf(key) }
  }

  async function setActiveEvent(key: string): Promise<void> {
    const current = await deviceSettings()
    await db.deviceSettings.put({ ...current, activeEventKey: key })
    const changed = activeEventKey.getSnapshot() !== key
    activeEventKey.set(key)
    if (changed) {
      engine.requestSync("event-switch", { force: true })
      mqtt?.activeEventChanged()
    }
  }

  function connectMqtt(id: string): () => void {
    const conn = createMqttConnection({
      transportFactory: o.mqttTransport,
      url: o.mqttUrl,
      deviceId: id,
      appVersion: o.appVersion,
      auth: {
        getSession: () => {
          const s = auth.getSession()
          return s?.status === "active"
            ? { userId: s.userId, role: s.role }
            : null
        },
        getAccessToken: () => tokens.get(),
        refresh: () => auth.refresh(),
      },
      getActiveEventKey: () => activeEventKey.getSnapshot(),
      ingest: async (raws) => {
        await engine.ingestMany(raws)
      },
      requestSync: (reason, opts) => engine.requestSync(reason, opts),
      onSysStatus: () => void loadMeta(),
      onInbox: (m) => {
        if (m.kind === "forceLogout" || m.kind === "sessionRevoked")
          void auth.logout({
            force: true,
            reason: m.kind === "forceLogout" ? m.reason : "session_revoked",
          })
        else void auth.refresh()
      },
      onReload: () => void setKv(db, "needsAppUpdate", true),
      onTraffic: (bytes) => network.live(bytes),
    })
    mqtt = conn
    const offPresence = conn.presence.presence.subscribe(() =>
      presence.set(conn.presence.presence.getSnapshot())
    )
    const unsubscribe = conn.status.subscribe(() =>
      mqttStatus.set(conn.status.getSnapshot())
    )
    mqttStatus.set(conn.status.getSnapshot())
    // one connection per device: a visible tab steals the lock (mqtt.md §3.4)
    const leadership: Leadership = requestLeadership(
      o.locks,
      { steal: o.document.visibilityState === "visible" },
      () => conn.start({ leader: true }),
      () => void conn.stop()
    )
    const detach = attachLifecycle(conn, {
      window: o.window,
      document: o.document,
      now: () => clock.now(),
    })
    return () => {
      detach()
      unsubscribe()
      offPresence()
      presence.set(new Map())
      leadership.release()
    }
  }

  /**
   * Live changes over HTTP (capabilities.changeStream) while MQTT isn't connected: messages and
   * announcements arrive at once instead of on the next sync (owner). Re-evaluated whenever the
   * capability, MQTT, the active event, the token or the connection changes.
   */
  function attachChangeStream(): () => void {
    const stream = createChangeStream({
      baseUrl: o.apiUrl,
      ingest: (raws) => engine.ingestMany(raws),
      requestSync: (reason) => engine.requestSync(reason),
    })
    const update = () => {
      const session = auth.getSession()
      const token = tokens.get()
      const event = activeEventKey.getSnapshot()
      const live =
        capabilities.get().changeStream &&
        mqttStatus.getSnapshot()?.state !== "connected" &&
        session?.status === "active" &&
        token !== null &&
        o.isOnline()
      if (!live) {
        stream.stop()
        return
      }
      stream.start({
        scopes: ["global", "user", ...(event ? [`event:${event}`] : [])],
        token,
      })
    }
    const offs = [
      capabilities.subscribe(update),
      mqttStatus.subscribe(update),
      activeEventKey.subscribe(update),
      tokens.subscribe(update),
    ]
    o.window.addEventListener("online", update)
    o.window.addEventListener("offline", update)
    update()
    return () => {
      for (const off of offs) off()
      o.window.removeEventListener("online", update)
      o.window.removeEventListener("offline", update)
      stream.stop()
    }
  }

  /**
   * <SessionRuntime> boot order (routing-auth §7.2): refresh → sync → MQTT. Offline, each step
   * no-ops and the triggers retry on `online` and `visible`. Returns the teardown.
   */
  async function startSession(): Promise<() => Promise<void>> {
    const settings = await deviceSettings()
    transportMode = settings.transport
    await loadActiveEvent()
    await scopeInfo.refresh()
    // drafts saved under an older form version resume migrated (scouting-forms criterion 11)
    await migrateDrafts(db, o.games).catch((error: unknown) =>
      logger.warn("app", "draft migration failed", { error: String(error) })
    )
    if (o.isOnline()) await auth.refreshIfNeeded()
    void loadMeta()
    await engine.start()
    const detachTriggers = attachSyncTriggers(engine, {
      window: o.window,
      document: o.document,
    })
    const disconnect = connectMqtt(await deviceId())
    const detachStream = attachChangeStream()
    const detachNetwork = attachNetworkMonitor({
      telemetry: network,
      isOnline: o.isOnline,
      isVisible: () => o.document.visibilityState === "visible",
      probe: () =>
        api.request({
          method: "GET",
          path: "/meta",
          class: "delta",
          anonymous: true,
          quiet: true,
        }),
      now: () => clock.now(),
      window: o.window,
    })
    void push.reconcile()
    return async () => {
      detachNetwork()
      detachTriggers()
      detachStream()
      disconnect()
      await stopTransports()
    }
  }

  // One running session however many components hold it. Start and stop are serialized, so a
  // StrictMode remount (or a logout followed by a login) never lets an old teardown stop a new start.
  let holders = 0
  let teardown: (() => Promise<void>) | null = null
  let chain: Promise<void> = Promise.resolve()
  const enqueue = (step: () => Promise<void>) => {
    chain = chain.then(step).catch((error: unknown) => {
      logger.error("app", "session step failed", { error: String(error) })
    })
    return chain
  }

  /** <SessionRuntime> holds the session while mounted. Returns the release. */
  function acquireSession(): () => void {
    holders++
    if (holders === 1)
      void enqueue(async () => {
        if (holders > 0 && !teardown) teardown = await startSession()
      })
    let released = false
    return () => {
      if (released) return
      released = true
      holders--
      if (holders === 0)
        void enqueue(async () => {
          if (holders > 0 || !teardown) return
          const stop = teardown
          teardown = null
          await stop()
        })
    }
  }

  /** Ask the browser not to evict our data (routing-auth §7.1); iOS tabs evict after 7 days. */
  async function afterSignIn(): Promise<void> {
    try {
      if (await getKv(db, "storagePersisted")) return
      if (!o.persistStorage) return
      const persisted = await o.persistStorage()
      await setKv(db, "storagePersisted", persisted)
    } catch (error) {
      logger.info("app", "storage persist unavailable", {
        error: String(error),
      })
    }
  }

  const writer: MutateDeps = {
    db,
    clock,
    ids,
    games: o.games,
    session: () => auth.getSession(),
    authorize: (action, entity, record) =>
      canWrite(auth.getSession(), action, entity, record),
    onWrite: () => engine.requestSync("write"),
  }

  const push: PushClient = createPushClient({
    api,
    db: () => db,
    deviceId,
    now: clock.now,
    appVersion: o.appVersion,
    env: o.push ?? null,
  })

  /** Sign Out (routing-auth §7.5): stop push to this device first, while still signed in. */
  async function signOut(opts: { force?: boolean } = {}) {
    const pending = await auth.pendingChanges()
    if (pending > 0 && !opts.force)
      return { ok: false as const, pendingChanges: pending }
    await push.disable().catch(() => undefined)
    return auth.logout({ force: true })
  }

  const liveDeps = () => ({
    api,
    db,
    games: o.games,
    now: clock.now,
    newId: ids.newId,
  })
  const videos = createVideoManager({
    db,
    api,
    now: clock.now,
    worker: browserVideoWorker(),
    files: opfsFiles,
  })

  const dataRuntime: DataRuntime = {
    db,
    scopeInfo,
    canSync: () => o.isOnline() && auth.getSession()?.status === "active",
    subscribeSync: (listener) => {
      o.window.addEventListener("online", listener)
      o.window.addEventListener("offline", listener)
      const off = auth.subscribe(listener)
      return () => {
        o.window.removeEventListener("online", listener)
        o.window.removeEventListener("offline", listener)
        off()
      }
    },
    requestSync: () => engine.requestSync("manual"),
    clockSkewMs: () => 0,
    syncStatus: engine.status,
    network,
    viewer: () => auth.getSession(),
    writer,
    live: {
      boardAction: (eventKey, baseRev, action) =>
        sendBoardAction(
          { api, db, games: o.games, now: clock.now, newId: ids.newId },
          eventKey,
          baseRev,
          action
        ),
      changePassword: (current, next) => changePassword({ api }, current, next),
      restore: (entity, id) =>
        restoreRecord(
          { api, db, games: o.games, now: clock.now, newId: ids.newId },
          entity,
          id
        ),
      refreshPitMap: (eventKey) =>
        refreshPitMap({ api, db, now: clock.now }, eventKey),
    },
    videos,
    admin: {
      saveGuestAccess: (eventKey, next) =>
        saveGuestAccess(liveDeps(), eventKey, next),
      refreshUsers: () => refreshUsers(liveDeps()),
      createUser: (input) => createUser(liveDeps(), input),
      patchUser: (userId, patch) => patchUser(liveDeps(), userId, patch),
      revokeSessions: (userId) => revokeSessions(liveDeps(), userId),
      refreshAudit: (eventKey) => refreshAudit(liveDeps(), eventKey),
      fetchOptional: (path, schema) => fetchOptional({ api }, path, schema),
      patchEventSettings: (eventKey, patch) =>
        patchEventSettings(writer, eventKey, patch),
      setTeamNumber: (n) => setTeamNumber(writer, n),
      // the new (or removed) event arrives through the change feed; pull it now
      createDemoEvent: async (options) => {
        const r = await createDemoEvent(liveDeps(), options)
        if (r.kind === "ok") engine.requestSync("manual", { force: true })
        return r
      },
      deleteDemoEvent: async (eventKey) => {
        const r = await deleteDemoEvent(liveDeps(), eventKey)
        if (r.kind === "ok") engine.requestSync("manual", { force: true })
        return r
      },
    },
  }

  return {
    db,
    api,
    auth,
    sync: engine,
    capabilities,
    activeEventKey: activeEventKey as ExternalStore<string | null>,
    mqttStatus: mqttStatus as ExternalStore<MqttStatus | null>,
    presence: presence as ExternalStore<ReadonlyMap<string, PresenceEntry>>,
    minClientVersion: minClientVersion as ExternalStore<string | null>,
    dataRuntime,
    isOnline: o.isOnline,
    loadMeta,
    loadActiveEvent,
    setActiveEvent,
    acquireSession,
    afterSignIn,
    push,
    signOut,
    /** Settings → Storage: transport health, this device's id, stop sync before a cache reset */
    transportHealth: () => health.snapshot(),
    deviceId: () => auth.deviceId(),
    quiesce: stopTransports,
    /** settled when queued session steps finish (tests) */
    whenSettled: () => chain,
    onSessionEnded(
      listener: (reason: SessionEndedReason) => void | Promise<unknown>
    ) {
      sessionEnded.add(listener)
      return () => {
        sessionEnded.delete(listener)
      }
    },
    onRoleChanged(listener: (role: Session["role"]) => void) {
      roleChanged.add(listener)
      return () => {
        roleChanged.delete(listener)
      }
    },
  }
}

export type AppRuntime = ReturnType<typeof createAppRuntime>

function yearOf(eventKey: string): number {
  return Number(eventKey.slice(0, 4))
}

function toActiveEvent(e: EventRecord): ActiveEvent {
  return { key: e.key, name: e.name, year: e.year }
}
