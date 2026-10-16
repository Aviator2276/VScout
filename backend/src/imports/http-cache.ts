// Conditional GETs for import sources (REQUIREMENTS §11: cache with ETag/If-Modified-Since).
import type { Db } from "../db/db.js"
import type { Clock } from "../lib/clock.js"

export type Fetcher = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>

export interface FetchResult<T> {
  body: T
  /** false when the source answered 304 (or the body is byte-identical to the cached one) */
  changed: boolean
}

export class SourceError extends Error {
  constructor(
    readonly source: string,
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export class CachedFetcher {
  constructor(
    private db: Db,
    private clock: Clock,
    private fetcher: Fetcher = (u, i) => fetch(u, i)
  ) {}

  async getJson<T>(source: string, url: string, headers: Record<string, string>, timeoutMs = 20_000): Promise<FetchResult<T>> {
    const cached = this.db.get<{ etag: string | null; last_modified: string | null; body: string }>(
      "SELECT etag, last_modified, body FROM http_cache WHERE url = ?",
      url
    )
    const h: Record<string, string> = { Accept: "application/json", "User-Agent": "VScout-backend/2", ...headers }
    if (cached?.etag) h["If-None-Match"] = cached.etag
    if (cached?.last_modified) h["If-Modified-Since"] = cached.last_modified
    let res: Response
    try {
      res = await this.fetcher(url, { headers: h, signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      throw new SourceError(source, 0, `${source} unreachable: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (res.status === 304 && cached) return { body: JSON.parse(cached.body) as T, changed: false }
    if (!res.ok) throw new SourceError(source, res.status, `${source} answered ${res.status} for ${redact(url)}`)
    const text = await res.text()
    let body: T
    try {
      body = JSON.parse(text) as T
    } catch {
      throw new SourceError(source, res.status, `${source} sent invalid JSON for ${redact(url)}`)
    }
    const changed = !cached || cached.body !== text
    this.db.run(
      `INSERT INTO http_cache (url, etag, last_modified, body, fetched_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET etag = excluded.etag, last_modified = excluded.last_modified, body = excluded.body, fetched_at = excluded.fetched_at`,
      url,
      res.headers.get("etag"),
      res.headers.get("last-modified"),
      text,
      this.clock.now()
    )
    return { body, changed }
  }
}

/** URLs never carry keys here (they travel in headers), but strip query strings from logs anyway. */
function redact(url: string): string {
  return url.split("?")[0] ?? url
}
