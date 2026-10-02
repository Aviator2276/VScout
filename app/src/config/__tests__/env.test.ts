import { describe, expect, it } from "vitest"
import { readEnv } from "../env"

describe("readEnv", () => {
  it("defaults to the same origin", () => {
    expect(
      readEnv({}, { protocol: "https:", host: "scout.example.org" })
    ).toEqual({
      apiUrl: "/api/v1",
      mqttUrl: "wss://scout.example.org/mqtt",
    })
    expect(
      readEnv(
        { VITE_API_URL: "  " },
        { protocol: "http:", host: "localhost:3000" }
      )
    ).toEqual({
      apiUrl: "/api/v1",
      mqttUrl: "ws://localhost:3000/mqtt",
    })
  })

  it("uses configured URLs", () => {
    expect(
      readEnv(
        {
          VITE_API_URL: "http://localhost:8787/api/v1",
          VITE_MQTT_URL: "ws://localhost:9001",
        },
        { protocol: "http:", host: "localhost:3000" }
      )
    ).toEqual({
      apiUrl: "http://localhost:8787/api/v1",
      mqttUrl: "ws://localhost:9001",
    })
  })
})
