import { HttpResponse } from "msw"

/** problem+json response like the real backend (http-api-contract §1.1). */
export function problemResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {}
) {
  return HttpResponse.json(
    {
      type: `https://vscout.app/errors/${code}`,
      title: code,
      status,
      code,
      ...extra,
    },
    { status, headers: { "Content-Type": "application/problem+json" } }
  )
}
