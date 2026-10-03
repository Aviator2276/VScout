// A short name and an approximate size for each API request (Sync sheet "Recent", ADR-079).
import type { HttpMethod } from "@/lib/api/transport/api-transport"

const NAMES: ReadonlyArray<[RegExp, string]> = [
  [/^\/sync\/changes/, "Changes"],
  [/^\/meta$/, "Status check"],
  [/^\/auth\//, "Sign-in"],
  [/^\/me\/password/, "Password"],
  [/^\/media/, "Photo"],
  [/\/alliance-board/, "Alliance board"],
  [/\/pit-map/, "Pit map"],
  [/^\/admin\//, "Admin"],
  [/\/settings$/, "Settings"],
]

const VERB: Partial<Record<HttpMethod, string>> = {
  POST: "Save",
  PUT: "Save",
  PATCH: "Update",
  DELETE: "Delete",
}

/** "Changes", "Save scout entries", "Delete comments" */
export function describeRequest(method: HttpMethod, path: string): string {
  for (const [re, name] of NAMES) if (re.test(path)) return name
  const collection = path.split("/").find(Boolean) ?? "request"
  const noun = collection.replace(/-/g, " ")
  const verb = VERB[method]
  return verb ? `${verb} ${noun}` : noun[0]?.toUpperCase() + noun.slice(1)
}

/** Bytes a body takes on the wire, roughly: JSON length, or the files in a form. */
export function approxBytes(body: unknown): number {
  if (body === undefined || body === null) return 0
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    let total = 0
    for (const [, v] of body.entries())
      total += typeof v === "string" ? v.length : v.size
    return total
  }
  if (typeof body === "string") return body.length
  try {
    return JSON.stringify(body).length
  } catch {
    return 0
  }
}
