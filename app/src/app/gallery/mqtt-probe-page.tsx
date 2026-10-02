// Proves mqtt.js keeps MQTT 5 binary properties intact in the browser bundle (Phase 1 gate leftover:
// RPC correlationData). Publishes to itself on the dev broker (`pnpm stack:up`) and compares bytes.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { getEnv } from "@/config/env"
import { mqttJsTransportFactory } from "@/lib/mqtt/transport"
import { GallerySection } from "./gallery-section"

const BYTES = Uint8Array.from([0, 1, 2, 127, 128, 254, 255])

type ProbeState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok" }
  | { kind: "failed"; reason: string }

export function runMqttProbe(
  url: string,
  timeoutMs = 5000
): Promise<ProbeState> {
  return new Promise((resolve) => {
    const t = mqttJsTransportFactory()()
    const id = Math.random().toString(36).slice(2, 10)
    const topic = `vscout-dev/probe/${id}`
    const finish = (s: ProbeState) => {
      clearTimeout(timer)
      void t.end()
      resolve(s)
    }
    const timer = setTimeout(
      () => finish({ kind: "failed", reason: "No answer from the broker." }),
      timeoutMs
    )
    t.on("connectFailed", (code) =>
      finish({ kind: "failed", reason: `Connect refused (${code}).` })
    )
    t.on("message", (_topic, _payload, props) => {
      const got = props.correlationData
      const same =
        got !== undefined &&
        got.length === BYTES.length &&
        BYTES.every((b, i) => got[i] === b)
      finish(
        same
          ? { kind: "ok" }
          : {
              kind: "failed",
              reason: `correlationData changed: ${got ? Array.from(got).join(",") : "missing"}`,
            }
      )
    })
    t.on("connect", () => {
      void t
        .subscribe(topic, 1)
        .then(() =>
          t.publish(topic, "probe", {
            qos: 1,
            properties: {
              correlationData: BYTES,
              responseTopic: topic,
              contentType: "application/json",
            },
          })
        )
        .catch((e: unknown) => finish({ kind: "failed", reason: String(e) }))
    })
    t.connect({
      url,
      clientId: `vscout-probe-${id}`,
      username: "",
      password: "",
      keepalive: 30,
    })
  })
}

export function MqttProbePage() {
  const [state, setState] = useState<ProbeState>({ kind: "idle" })
  const url = getEnv().mqttUrl
  return (
    <GallerySection title="MQTT binary properties">
      <p className="text-subhead text-muted-foreground">
        Publishes to itself on {url} with correlationData{" "}
        {Array.from(BYTES).join(",")} and checks the bytes come back unchanged.
        Needs the dev broker (pnpm stack:up).
      </p>
      <Button
        disabled={state.kind === "running"}
        onClick={() => {
          setState({ kind: "running" })
          void runMqttProbe(url).then(setState)
        }}
      >
        Run Probe
      </Button>
      <p role="status" className="text-body">
        {state.kind === "idle"
          ? "Not run yet."
          : state.kind === "running"
            ? "Running…"
            : state.kind === "ok"
              ? "Binary properties survive."
              : `Probe failed: ${state.reason}`}
      </p>
    </GallerySection>
  )
}
