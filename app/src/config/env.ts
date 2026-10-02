// Deployment URLs (project-structure: config/env.ts). Read lazily: the shell prerender runs in Node,
// where there is no `location`. Production is same-site by default (ADR-035: the refresh cookie);
// `pnpm dev` defaults to the local mock API (`pnpm mock:api`) and broker (`pnpm stack:up`).
import { z } from "zod"

const url = z.string().trim().min(1).optional().catch(undefined)

export interface AppEnv {
  apiUrl: string
  mqttUrl: string
}

export const DEV_DEFAULTS: AppEnv = {
  apiUrl: "http://localhost:8787/api/v1",
  mqttUrl: "ws://localhost:9001",
}

export function readEnv(
  raw: { VITE_API_URL?: string; VITE_MQTT_URL?: string; DEV?: boolean },
  origin: { protocol: string; host: string }
): AppEnv {
  const ws = origin.protocol === "https:" ? "wss:" : "ws:"
  const fallback: AppEnv = raw.DEV
    ? DEV_DEFAULTS
    : { apiUrl: "/api/v1", mqttUrl: `${ws}//${origin.host}/mqtt` }
  return {
    apiUrl: url.parse(raw.VITE_API_URL) ?? fallback.apiUrl,
    mqttUrl: url.parse(raw.VITE_MQTT_URL) ?? fallback.mqttUrl,
  }
}

export const getEnv = (): AppEnv => readEnv(import.meta.env, location)
