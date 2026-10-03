// GET /meta → capabilities and the version gate (ADR-071, ADR-076).
import { CAPABILITY_KEYS, metaResponse } from "@/lib/contracts/meta"
import type { CapabilityKey } from "@/lib/contracts/meta"
import type { DecodeResult } from "./entity-registry"
import { isoToMs } from "./time"

export type Capabilities = Record<CapabilityKey, boolean>

export interface ServerMetaInfo {
  apiVersion: number
  minClientVersion: string
  serverTime: number
  activeGameId: string | null
  gameSchemaVersions: Record<string, Array<number>>
  capabilities: Capabilities
}

/** A missing key means "not supported"; unknown keys are ignored. */
export function toCapabilities(
  raw: Record<string, boolean> | undefined
): Capabilities {
  return Object.fromEntries(
    CAPABILITY_KEYS.map((k) => [k, raw?.[k] === true])
  ) as Capabilities
}

export const NO_CAPABILITIES: Capabilities = toCapabilities(undefined)

export function decodeMeta(raw: unknown): DecodeResult<ServerMetaInfo> {
  const parsed = metaResponse.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error }
  const m = parsed.data
  return {
    ok: true,
    value: {
      apiVersion: m.apiVersion,
      minClientVersion: m.minClientVersion,
      serverTime: isoToMs(m.serverTime),
      activeGameId: m.activeGameId ?? null,
      gameSchemaVersions: m.gameSchemaVersions,
      capabilities: toCapabilities(m.capabilities),
    },
  }
}
