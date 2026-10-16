// Domain events emitted after commit. The MQTT publisher, SSE hub and push sender listen; the
// domain never calls them directly, so a broker or push outage can't fail a write.
import { EventEmitter } from "node:events"
import type { Rec } from "./entities.js"

export interface InboxEvent {
  userId: string
  payload: Record<string, unknown>
}

export interface ControlEvent {
  eventKey: string
  payload: Record<string, unknown>
}

export interface AlertEvent {
  eventKey: string | null
  kind: string
  message: string
  detail?: Record<string, unknown>
}

interface Events {
  messageCreated: [Rec]
  inbox: [InboxEvent]
  control: [ControlEvent]
  alert: [AlertEvent]
  /** push rows to drop (logout, revoked sessions, disabled users) */
  dropPushDevices: [{ userId: string; deviceIds?: string[] }]
}

export class Bus extends EventEmitter<Events> {}
