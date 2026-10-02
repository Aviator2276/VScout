// Match videos on this device (features/matches.md M3, data-layer §7.10). The list comes from the
// backend over HTTP (media is HTTP-only, ADR-063); the bytes stream into OPFS from a Worker;
// metadata and progress live in `mediaVideos`, so the UI reads it like any other Dexie table.
import type { ApiClient } from "@/lib/api/api-client"
import { wireMatchVideoList } from "@/lib/contracts/media"
import type { WireMatchVideo } from "@/lib/contracts/media"
import type { VScoutDB } from "@/lib/db/schema"
import type { MediaVideoRow } from "@/lib/db/types"
import { OfflineError } from "@/lib/api/errors"
import type { VideoWorkerMessage, VideoWorkerRequest } from "./video-worker"

export interface VideoPort {
  postMessage: (m: VideoWorkerRequest) => void
  onMessage: (listener: (m: VideoWorkerMessage) => void) => void
  terminate: () => void
}

export interface VideoDeps {
  db: VScoutDB
  api: Pick<ApiClient, "request">
  now: () => number
  /** a fresh download Worker; null when this browser can't write OPFS from a Worker */
  worker: (() => VideoPort) | null
  /** OPFS access for playback and deletion */
  files: {
    read: (path: string) => Promise<Blob>
    remove: (path: string) => Promise<void>
  }
}

export type VideoListResult =
  | { kind: "ok"; items: ReadonlyArray<WireMatchVideo> }
  | { kind: "offline" }
  | { kind: "error"; message: string }

export const videoId = (matchKey: string, sourceId: string) =>
  `${matchKey}:${sourceId}`
export const videoPath = (
  eventKey: string,
  matchKey: string,
  sourceId: string
) => `videos/${eventKey}/${matchKey}_${sourceId.replace(/[^\w-]/g, "_")}.mp4`

export function createVideoManager(d: VideoDeps) {
  const running = new Map<string, VideoPort>()

  async function list(
    eventKey: string,
    matchKey: string
  ): Promise<VideoListResult> {
    try {
      const res = await d.api.request({
        method: "GET",
        path: `/events/${eventKey}/matches/${matchKey}/videos`,
        class: "media",
      })
      const parsed = wireMatchVideoList.safeParse(res.body)
      if (!parsed.success)
        return { kind: "error", message: "Unexpected response" }
      return { kind: "ok", items: parsed.data.items }
    } catch (error) {
      if (error instanceof OfflineError) return { kind: "offline" }
      return { kind: "error", message: String(error) }
    }
  }

  async function download(
    eventKey: string,
    matchKey: string,
    item: WireMatchVideo
  ): Promise<void> {
    const id = videoId(matchKey, item.sourceId)
    if (running.has(id)) return
    const path = videoPath(eventKey, matchKey, item.sourceId)
    const existing = await d.db.mediaVideos.get(id)
    const row: MediaVideoRow = {
      id,
      eventKey,
      matchKey,
      sourceId: item.sourceId,
      url: item.url,
      mime: item.mime,
      ...(item.quality ? { quality: item.quality } : {}),
      ...(item.bytes !== undefined ? { bytes: item.bytes } : {}),
      downloadState: "queued",
      bytesDownloaded: existing?.bytesDownloaded ?? 0,
      opfsPath: path,
      createdAt: existing?.createdAt ?? d.now(),
    }
    if (!d.worker) {
      await d.db.mediaVideos.put({
        ...row,
        downloadState: "error",
        error: "Downloads aren't supported in this browser",
      })
      return
    }
    await d.db.mediaVideos.put(row)
    const port = d.worker()
    running.set(id, port)
    const finish = () => {
      running.delete(id)
      port.terminate()
    }
    port.onMessage((m) => {
      switch (m.type) {
        case "progress":
          void d.db.mediaVideos.update(id, {
            downloadState: "downloading",
            bytesDownloaded: m.bytes,
            ...(m.total !== undefined ? { bytes: m.total } : {}),
          })
          break
        case "done":
          finish()
          void d.db.mediaVideos.update(id, {
            downloadState: "done",
            bytesDownloaded: m.bytes,
            bytes: m.bytes,
            error: undefined,
          })
          break
        case "error":
          finish()
          void d.db.mediaVideos.update(id, {
            downloadState: "error",
            error: m.message,
          })
          break
      }
    })
    port.postMessage({ type: "start", url: item.url, path })
  }

  /** Retry with a fresh URL: signed URLs expire (§5.1). */
  async function retry(id: string): Promise<VideoListResult> {
    const row = await d.db.mediaVideos.get(id)
    if (!row) return { kind: "error", message: "Not found" }
    const fresh = await list(row.eventKey, row.matchKey)
    if (fresh.kind !== "ok") return fresh
    const item = fresh.items.find((i) => i.sourceId === row.sourceId)
    if (!item)
      return { kind: "error", message: "This video is no longer available" }
    await download(row.eventKey, row.matchKey, item)
    return fresh
  }

  async function remove(id: string): Promise<void> {
    running.get(id)?.postMessage({ type: "cancel" })
    running.get(id)?.terminate()
    running.delete(id)
    const row = await d.db.mediaVideos.get(id)
    if (row?.opfsPath) await d.files.remove(row.opfsPath).catch(() => undefined)
    await d.db.mediaVideos.delete(id)
  }

  /** A playable blob with an explicit type (OPFS drops MIME types; iOS needs it). */
  async function open(id: string): Promise<Blob | null> {
    const row = await d.db.mediaVideos.get(id)
    if (row?.downloadState !== "done" || !row.opfsPath) return null
    const file = await d.files.read(row.opfsPath)
    await d.db.mediaVideos.update(id, { lastOpenedAt: d.now() })
    return new Blob([file], { type: row.mime || "video/mp4" })
  }

  /** Free space: delete finished videos, least recently opened first, until `bytes` are freed. */
  async function evict(bytes: number): Promise<number> {
    const done = (
      await d.db.mediaVideos.where("downloadState").equals("done").toArray()
    ).sort(
      (a, b) =>
        (a.lastOpenedAt ?? a.createdAt) - (b.lastOpenedAt ?? b.createdAt)
    )
    let freed = 0
    for (const v of done) {
      if (freed >= bytes) break
      await remove(v.id)
      freed += v.bytes ?? v.bytesDownloaded
    }
    return freed
  }

  return { list, download, retry, remove, open, evict }
}

export type VideoManager = ReturnType<typeof createVideoManager>

/** The browser's OPFS (for VideoDeps.files). */
export const opfsFiles: VideoDeps["files"] = {
  async read(path) {
    let dir = await navigator.storage.getDirectory()
    const parts = path.split("/")
    const name = parts.pop() ?? ""
    for (const p of parts) dir = await dir.getDirectoryHandle(p)
    return (await dir.getFileHandle(name)).getFile()
  },
  async remove(path) {
    let dir = await navigator.storage.getDirectory()
    const parts = path.split("/")
    const name = parts.pop() ?? ""
    for (const p of parts) dir = await dir.getDirectoryHandle(p)
    await dir.removeEntry(name)
  },
}

/** A real download Worker, or null without OPFS (old Safari, private windows). */
export function browserVideoWorker(): (() => VideoPort) | null {
  if (typeof Worker === "undefined" || typeof navigator === "undefined")
    return null
  if (
    !(navigator as { storage?: { getDirectory?: unknown } }).storage
      ?.getDirectory
  )
    return null
  return () => {
    const w = new Worker(new URL("./video-worker.ts", import.meta.url), {
      type: "module",
    })
    return {
      postMessage: (m) => w.postMessage(m),
      onMessage: (l) =>
        w.addEventListener("message", (e: MessageEvent<VideoWorkerMessage>) =>
          l(e.data)
        ),
      terminate: () => w.terminate(),
    }
  }
}
