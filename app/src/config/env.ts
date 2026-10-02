// Deployment URLs (project-structure: config/env.ts). Read lazily: the shell prerender runs in Node,
// where there is no `location`. The API is same-site by default (ADR-035: the refresh cookie).
import { z } from "zod"

const url = z.string().trim().min(1).optional().catch(undefined)

export interface AppEnv {
  apiUrl: string
  mqttUrl: string
}

export function readEnv(
  raw: { VITE_API_URL?: string; VITE_MQTT_URL?: string },
  origin: { protocol: string; host: string }
): AppEnv {
  const apiUrl = url.parse(raw.VITE_API_URL) ?? "/api/v1"
  const ws = origin.protocol === "https:" ? "wss:" : "ws:"
  const mqttUrl = url.parse(raw.VITE_MQTT_URL) ?? `${ws}//${origin.host}/mqtt`
  return { apiUrl, mqttUrl }
}

export const getEnv = (): AppEnv => readEnv(import.meta.env, location)
