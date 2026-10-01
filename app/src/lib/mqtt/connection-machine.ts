// The MQTT connection lifecycle as a pure reducer (mqtt.md §3.2): (state, event) → state + effects.
// The client module performs the effects (connect, timers, locks); this file is table-tested.
import { backoff } from "./reconnect-policy"

export type MqttState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "unauthorized"
  | "displaced"
  | "follower"

export interface MachineState {
  state: MqttState
  attempt: number
  /** one token refresh per auth failure streak */
  authRetried: boolean
}

export type MachineEvent =
  | { type: "START"; leader: boolean }
  | { type: "STOP" }
  | { type: "CONNACK_OK" }
  | { type: "CONNACK_FAILED"; code: number }
  | { type: "CLOSED" }
  | { type: "DISCONNECT"; code: number }
  | { type: "RETRY_TIMER" }
  | { type: "ONLINE" }
  | { type: "OFFLINE" }
  | { type: "VISIBLE"; hiddenMs: number }
  | { type: "HIDDEN" }
  | { type: "REFRESH_OK" }
  | { type: "REFRESH_FAILED" }
  | { type: "TOKEN_REFRESHED" }
  | { type: "LEADER_GAINED" }
  | { type: "LEADER_LOST" }
  /** planned reconnect: event switch (new will), role change (new ACL) */
  | { type: "RECONNECT" }

export type Effect =
  | { type: "connect" }
  | { type: "hardReconnect" }
  | { type: "end"; force: boolean }
  | { type: "scheduleRetry"; delayMs: number }
  | { type: "cancelRetry" }
  | { type: "refreshToken" }
  | { type: "updatePassword" }
  | { type: "resubscribeAll" }
  | { type: "publishPresence"; status: "online" | "away" }
  | { type: "requestSync"; reason: "mqtt-reconnect" }
  | { type: "rejectRpc" }

export const INITIAL: MachineState = {
  state: "idle",
  attempt: 0,
  authRetried: false,
}

/** 134 bad username or password, 135 not authorized (EMQX also disconnects with 135 on expiry). */
const AUTH_CODES = new Set([134, 135])
const SESSION_TAKEN_OVER = 142
const HARD_RECONNECT_AFTER_HIDDEN_MS = 5_000

type Result = { next: MachineState; effects: Array<Effect> }

const to = (
  s: MachineState,
  patch: Partial<MachineState>,
  effects: Array<Effect> = []
): Result => ({
  next: { ...s, ...patch },
  effects,
})

function authFailure(s: MachineState): Result {
  if (s.authRetried)
    return to(s, { state: "unauthorized" }, [
      { type: "rejectRpc" },
      { type: "end", force: true },
    ])
  return to(s, { state: "connecting", authRetried: true }, [
    { type: "rejectRpc" },
    { type: "refreshToken" },
  ])
}

function lost(s: MachineState, random: () => number): Result {
  const attempt = s.attempt + 1
  return to(s, { state: "reconnecting", attempt }, [
    { type: "rejectRpc" },
    { type: "scheduleRetry", delayMs: backoff(attempt, random) },
  ])
}

export function transition(
  s: MachineState,
  e: MachineEvent,
  random: () => number = Math.random
): Result {
  const live =
    s.state !== "idle" && s.state !== "unauthorized" && s.state !== "follower"

  switch (e.type) {
    case "START":
      if (s.state !== "idle") return to(s, {})
      return e.leader
        ? to(s, { state: "connecting" }, [{ type: "connect" }])
        : to(s, { state: "follower" })
    case "STOP":
      return to(INITIAL, {}, [
        { type: "cancelRetry" },
        { type: "rejectRpc" },
        { type: "end", force: false },
      ])
    case "CONNACK_OK":
      if (s.state !== "connecting") return to(s, {})
      return to(s, { state: "connected", attempt: 0, authRetried: false }, [
        { type: "resubscribeAll" },
        { type: "publishPresence", status: "online" },
        { type: "requestSync", reason: "mqtt-reconnect" },
      ])
    case "CONNACK_FAILED":
      if (s.state !== "connecting") return to(s, {})
      return AUTH_CODES.has(e.code) ? authFailure(s) : lost(s, random)
    case "DISCONNECT":
      if (!live) return to(s, {})
      if (e.code === SESSION_TAKEN_OVER)
        return to(s, { state: "displaced" }, [{ type: "rejectRpc" }])
      if (AUTH_CODES.has(e.code)) return authFailure(s)
      return lost(s, random)
    case "CLOSED":
      if (s.state !== "connected" && s.state !== "connecting") return to(s, {})
      return lost(s, random)
    case "RETRY_TIMER":
      return s.state === "reconnecting"
        ? to(s, { state: "connecting" }, [{ type: "connect" }])
        : to(s, {})
    case "OFFLINE":
      if (!live) return to(s, {})
      return to(s, { state: "offline" }, [
        { type: "cancelRetry" },
        { type: "rejectRpc" },
      ])
    case "ONLINE":
      if (s.state === "offline" || s.state === "reconnecting")
        return to(s, { state: "connecting" }, [
          { type: "cancelRetry" },
          { type: "connect" },
        ])
      return to(s, {})
    case "VISIBLE":
      if (
        s.state === "connected" &&
        e.hiddenMs > HARD_RECONNECT_AFTER_HIDDEN_MS
      )
        // a frozen iOS socket may look alive: replace it now
        return to(s, { state: "connecting" }, [
          { type: "rejectRpc" },
          { type: "hardReconnect" },
        ])
      if (
        s.state === "reconnecting" ||
        s.state === "displaced" ||
        s.state === "offline"
      )
        return to(s, { state: "connecting", attempt: 0 }, [
          { type: "cancelRetry" },
          { type: "connect" },
        ])
      return to(s, {})
    case "HIDDEN":
      return s.state === "connected"
        ? to(s, {}, [{ type: "publishPresence", status: "away" }])
        : to(s, {})
    case "REFRESH_OK":
      return s.state === "connecting" && s.authRetried
        ? to(s, {}, [{ type: "connect" }])
        : to(s, {})
    case "REFRESH_FAILED":
      return s.state === "connecting"
        ? to(s, { state: "unauthorized" }, [{ type: "end", force: true }])
        : to(s, {})
    case "TOKEN_REFRESHED":
      return s.state === "connected"
        ? to(s, {}, [{ type: "updatePassword" }])
        : to(s, {})
    case "RECONNECT":
      return s.state === "connected"
        ? to(s, { state: "connecting" }, [
            { type: "rejectRpc" },
            { type: "hardReconnect" },
          ])
        : to(s, {})
    case "LEADER_GAINED":
      return s.state === "follower"
        ? to(s, { state: "connecting" }, [{ type: "connect" }])
        : to(s, {})
    case "LEADER_LOST":
      if (s.state === "idle" || s.state === "follower") return to(s, {})
      // the new leader takes over the same clientId: end without publishing offline
      return to(s, { state: "follower", attempt: 0 }, [
        { type: "cancelRetry" },
        { type: "rejectRpc" },
        { type: "end", force: true },
      ])
  }
}
