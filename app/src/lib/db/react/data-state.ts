// The one DataState type (data-states.md, data-layer §9.2). Feature read hooks return it and never
// a raw undefined; DataView renders it.
import type { AppError } from "@/lib/errors"

export type MissingReason =
  "not-found" | "not-synced" | "not-scouted" | "forbidden"

export type DataState<TData> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "missing"; reason: MissingReason }
  | { status: "error"; error: AppError; retry: () => void }
  | { status: "success"; data: TData; stale?: boolean }

export type DataStatus = DataState<unknown>["status"]
