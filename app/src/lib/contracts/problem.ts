// RFC 9457 problem+json (http-api-contract §1). The client switches on `code` only.
import { z } from "zod"

export const KNOWN_ERROR_CODES = [
  "validation_failed",
  "unknown_game",
  "unsupported_schema_version",
  "token_expired",
  "token_invalid",
  "invalid_credentials",
  "invalid_guest_code",
  "refresh_invalid",
  "forbidden",
  "not_author",
  "role_required",
  "guest_access_disabled",
  "not_found",
  "rev_conflict",
  "deleted",
  "duplicate",
  "already_exists",
  "guest_code_taken",
  "request_in_progress",
  "idempotency_key_reuse",
  "cursor_expired",
  "payload_too_large",
  "rpc_too_large",
  "upgrade_required",
  "rate_limited",
] as const
export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number]

export const problemFieldError = z.looseObject({
  path: z.string(),
  code: z.string(),
  message: z.string().optional(),
})

export const problem = z.looseObject({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().int().min(100).max(599),
  code: z.string().min(1),
  detail: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(problemFieldError).optional(),
  /** The server copy on 409 (record or null) and on 404 for update/delete. */
  current: z.unknown().optional(),
  /** 426 upgrade_required */
  minVersion: z.string().optional(),
})
export type Problem = z.infer<typeof problem>

export function isKnownErrorCode(code: string): code is KnownErrorCode {
  return (KNOWN_ERROR_CODES as ReadonlyArray<string>).includes(code)
}
