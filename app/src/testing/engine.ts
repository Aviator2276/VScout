// Builds a sync engine against the MSW mock backend over HTTP or MQTT RPC (data-layer §14.3).
import { createApiClient } from "@/lib/api/api-client"
import { TIMEOUTS } from "@/lib/api/transport/api-transport"
import { createHttpTransport } from "@/lib/api/transport/http-transport"
import { createMqttRpcTransport } from "@/lib/api/transport/mqtt-rpc-transport"
import { TransportHealth } from "@/lib/api/transport/select-transport"
import type { TransportMode } from "@/lib/api/transport/select-transport"
import { createRpcChannel } from "@/lib/mqtt/rpc-channel"
import { createSyncEngine } from "@/lib/sync/engine"
import type { EngineDeps, SyncSession } from "@/lib/sync/engine"
import type { SyncLockManager } from "@/lib/sync/lock"
import { createTestDb, fakeClock, seqIds, testGames } from "./db"
import { MOCK_USER_ID } from "./mocks/mock-backend"
import { FakeBroker } from "./mqtt/fake-broker"

export const API = "http://localhost/api/v1"

export interface EngineSetup {
  transport?: "http" | "mqtt"
  role?: SyncSession["role"]
  refresh?: () => Promise<boolean>
  token?: string
  locks?: SyncLockManager
  db?: ReturnType<typeof createTestDb>
  rpcTimeoutMs?: number
  intervalMs?: { idle: number; pending: number }
}

export function setupEngine(o: EngineSetup = {}) {
  const db = o.db ?? createTestDb()
  const clock = fakeClock()
  const ids = seqIds("0190cccc")
  const broker = new FakeBroker()
  broker.serveRpc()
  const channel = createRpcChannel(broker, {
    request: "vscout/rpc/req/u/d",
    response: "vscout/rpc/res/u/d",
  })
  const mode: TransportMode =
    o.transport === "mqtt" ? "prefer-mqtt" : "http-only"
  const api = createApiClient({
    transports: {
      http: createHttpTransport({ baseUrl: API }),
      mqtt: createMqttRpcTransport({
        channel: () => channel,
        ids: seqIds("0190dddd"),
        enabled: () => true,
      }),
    },
    health: new TransportHealth(),
    mode: () => mode,
    clock: { now: () => Date.now() },
    clientVersion: "2.0.0-alpha.0",
    accessToken: () => o.token ?? "test-access-token",
    refresh: o.refresh ?? (() => Promise.resolve(false)),
    ...(o.rpcTimeoutMs
      ? {
          timeouts: {
            ...TIMEOUTS,
            write: { mqtt: o.rpcTimeoutMs, http: 5000 },
          },
        }
      : {}),
  })
  const authLost: Array<true> = []
  const deps: EngineDeps = {
    db,
    api,
    clock,
    ids,
    games: testGames,
    session: () => ({ userId: MOCK_USER_ID, role: o.role ?? "scouter" }),
    activeEventKey: () => "2026casj",
    random: () => 0.5,
    onAuthLost: () => authLost.push(true),
    debounceMs: { sync: 5, push: 5 },
    ...(o.locks ? { locks: o.locks } : {}),
    ...(o.intervalMs ? { intervalMs: o.intervalMs } : {}),
  }
  const engine = createSyncEngine(deps)
  const mutateDeps = {
    db,
    clock,
    ids,
    games: testGames,
    session: () => ({ userId: MOCK_USER_ID }),
  }
  return { db, engine, api, broker, clock, mutateDeps, authLost }
}
