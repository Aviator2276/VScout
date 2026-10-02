// A real AppRuntime against MSW (HTTP) and the fake MQTT broker, with event targets standing in
// for window and document. Used by the runtime and route tests.
import { createAppRuntime } from "@/app/runtime"
import type { RuntimeOptions } from "@/app/runtime"
import type { BroadcastLike } from "@/lib/auth/refresh"
import { createTestDb, testGames } from "./db"
import { FakeMqttBroker } from "./mqtt/fake-mqtt"

export const TEST_API = "http://localhost/api/v1"

export class FakeChannel implements BroadcastLike {
  private readonly target = new EventTarget()
  postMessage(): void {
    // a tab doesn't hear its own messages
  }
  addEventListener(type: "message", fn: (e: MessageEvent) => void) {
    this.target.addEventListener(type, fn as EventListener)
  }
  removeEventListener(type: "message", fn: (e: MessageEvent) => void) {
    this.target.removeEventListener(type, fn as EventListener)
  }
  /** a message from another tab */
  receive(data: unknown) {
    this.target.dispatchEvent(new MessageEvent("message", { data }))
  }
}

export function setupAppRuntime(o: Partial<RuntimeOptions> = {}) {
  const db = o.db ?? createTestDb()
  const broker = new FakeMqttBroker()
  const win = new EventTarget() as unknown as Window
  const doc = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  }) as unknown as Document
  const channel = new FakeChannel()
  let online = true
  const runtime = createAppRuntime({
    db,
    apiUrl: TEST_API,
    mqttUrl: "ws://localhost/mqtt",
    appVersion: "2.0.0-alpha.0",
    games: testGames,
    mqttTransport: broker.factory,
    window: win,
    document: doc,
    isOnline: () => online,
    authChannel: channel,
    deviceName: () => "Test Device",
    ...o,
  })
  return {
    runtime,
    db,
    broker,
    channel,
    window: win,
    setOnline(next: boolean) {
      online = next
      win.dispatchEvent(new Event(next ? "online" : "offline"))
    },
  }
}
