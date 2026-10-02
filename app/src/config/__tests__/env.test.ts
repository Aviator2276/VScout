import { describe, expect, it } from "vitest"
import { DEV_DEFAULTS, readEnv } from "../env"

const local = { protocol: "http:", host: "localhost:3000" }

describe("readEnv", () => {
  it("production defaults to the same origin", () => {
    expect(
      readEnv({}, { protocol: "https:", host: "scout.example.org" })
    ).toEqual({
      apiUrl: "/api/v1",
      mqttUrl: "wss://scout.example.org/mqtt",
    })
    expect(readEnv({ VITE_API_URL: "  " }, local)).toEqual({
      apiUrl: "/api/v1",
      mqttUrl: "ws://localhost:3000/mqtt",
    })
  })

  it("pnpm dev talks to the local mock API and broker", () => {
    expect(readEnv({ DEV: true }, local)).toEqual(DEV_DEFAULTS)
  })

  it("configured URLs win", () => {
    expect(
      readEnv(
        {
          DEV: true,
          VITE_API_URL: "https://api.example.org/api/v1",
          VITE_MQTT_URL: "wss://mq.example.org",
        },
        local
      )
    ).toEqual({
      apiUrl: "https://api.example.org/api/v1",
      mqttUrl: "wss://mq.example.org",
    })
  })
})
