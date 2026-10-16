// RFC 9457 problem+json (REQUIREMENTS §2.1). Handlers throw HttpProblem; the error handler renders it.
export interface FieldError {
  path: string
  code: string
  message?: string
}

const TITLES: Record<string, string> = {
  validation_failed: "Validation failed",
  rev_conflict: "Revision conflict",
  not_found: "Not found",
  forbidden: "Forbidden",
  role_required: "Role required",
  not_author: "Not the author",
  deleted: "Record deleted",
  duplicate: "Duplicate record",
  already_exists: "Record already exists",
  token_expired: "Token expired",
  token_invalid: "Token invalid",
  refresh_invalid: "Refresh token invalid",
  rate_limited: "Too many requests",
  upgrade_required: "Upgrade required",
  cursor_expired: "Cursor expired",
  idempotency_key_reuse: "Idempotency key reused",
  request_in_progress: "Request in progress",
}

export class HttpProblem extends Error {
  readonly status: number
  readonly code: string
  readonly extra: Record<string, unknown>
  readonly headers: Record<string, string>

  constructor(
    status: number,
    code: string,
    extra: Record<string, unknown> & { detail?: string; errors?: FieldError[] } = {},
    headers: Record<string, string> = {}
  ) {
    super(extra.detail ?? code)
    this.status = status
    this.code = code
    this.extra = extra
    this.headers = headers
  }

  body(requestId?: string): Record<string, unknown> {
    return {
      type: `https://vscout.app/errors/${this.code}`,
      title: TITLES[this.code] ?? this.code,
      status: this.status,
      code: this.code,
      ...(requestId ? { requestId } : {}),
      ...this.extra,
    }
  }
}

export const problem = (
  status: number,
  code: string,
  extra?: ConstructorParameters<typeof HttpProblem>[2],
  headers?: Record<string, string>
) => new HttpProblem(status, code, extra, headers)

/** zod issues → problem field errors */
export function zodErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; code: string; message: string }>,
  prefix = ""
): FieldError[] {
  return issues.map((i) => ({
    path: [prefix, ...i.path.map(String)].filter(Boolean).join("."),
    code: i.code,
    message: i.message,
  }))
}
