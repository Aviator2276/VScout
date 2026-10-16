import { createHash } from "node:crypto"

/** JSON with object keys sorted, so equal values hash equally regardless of key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as object).sort())
      out[k] = sortKeys((value as Record<string, unknown>)[k])
    return out
  }
  return value
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex")

export const contentHash = (value: unknown) => sha256(canonicalJson(value))

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
