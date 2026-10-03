// Phase 1 gate (roadmap.md): a fake MQTT envelope → Dexie → a React hook re-renders. Wires the real
// connection manager, router, lanes, ingest and applyEnvelope together, with a live query in React.
import { act, renderHook, waitFor } from "@testing-library/react"
import { useLiveQuery } from "dexie-react-hooks"
import { describe, expect, it } from "vitest"
import { createMqttConnection } from "@/lib/mqtt/mqtt-client"
import { createSyncEngine } from "@/lib/sync/engine"
import { setupEngine } from "@/testing/engine"
import { wireEnvelope, wireMatch } from "@/testing/factories/wire"
import { MOCK_USER_ID } from "@/testing/mocks/mock-backend"
import { FakeMqttBroker, settle } from "@/testing/mqtt/fake-mqtt"

describe("phase 1 gate: MQTT → Dexie → React", () => {
  it("re-renders a live query when a match update arrives over MQTT", async () => {
    const { db, api, clock } = setupEngine()
    const engine = createSyncEngine({
      db,
      api,
      clock,
      ids: { newId: () => "id" },
      games: () => null,
      session: () => ({ userId: MOCK_USER_ID, role: "scouter" }),
      activeEventKey: () => "2026casj",
    })
    const broker = new FakeMqttBroker()
    const mqtt = createMqttConnection({
      transportFactory: broker.factory,
      url: "ws://fake",
      deviceId: "d1",
      appVersion: "test",
      auth: {
        getSession: () => ({ userId: MOCK_USER_ID, role: "scouter" }),
        getAccessToken: () => "t",
        refresh: () => Promise.resolve(true),
      },
      getActiveEventKey: () => "2026casj",
      ingest: async (raws) => {
        await engine.ingestMany(raws)
      },
      requestSync: () => undefined,
      lanes: { normalMs: 5 },
    })
    mqtt.start()
    await settle()

    const { result } = renderHook(() =>
      useLiveQuery(() => db.matches.get("2026casj_qm7"), [])
    )
    expect(result.current).toBeUndefined()

    await act(async () => {
      broker.publishFromServer(
        "vscout/event/2026casj/data/match",
        wireEnvelope(
          "match",
          wireMatch({ matchNumber: 7, rev: 2, status: "queuing" })
        )
      )
      await settle()
    })
    await waitFor(() =>
      expect(result.current).toMatchObject({
        key: "2026casj_qm7",
        status: "queuing",
      })
    )

    await act(async () => {
      broker.publishFromServer(
        "vscout/event/2026casj/data/match",
        wireEnvelope(
          "match",
          wireMatch({ matchNumber: 7, rev: 3, status: "onField" })
        )
      )
      await settle()
    })
    await waitFor(() => expect(result.current?.status).toBe("onField"))
    await mqtt.stop()
  })
})
