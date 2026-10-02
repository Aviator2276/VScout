import { describe, expect, it, vi } from "vitest"
import { OfflineError } from "@/lib/api/errors"
import { createTestDb } from "@/testing/db"
import { createVideoManager, videoId } from "../videos"
import type { VideoDeps, VideoPort } from "../videos"
import type { VideoWorkerMessage, VideoWorkerRequest } from "../video-worker"

const ITEM = {
  sourceId: "yt-1",
  mime: "video/mp4",
  url: "https://media.test/qm1.mp4",
  bytes: 100,
}

function setup(over: Partial<VideoDeps> = {}) {
  const db = createTestDb()
  const sent: Array<VideoWorkerRequest> = []
  let listener: ((m: VideoWorkerMessage) => void) | null = null
  const terminate = vi.fn()
  const port: VideoPort = {
    postMessage: (m) => sent.push(m),
    onMessage: (l) => {
      listener = l
    },
    terminate,
  }
  const files = {
    read: vi.fn(async () => new Blob(["abc"])),
    remove: vi.fn(async () => undefined),
  }
  const request = vi.fn(async () => ({ status: 200, body: { items: [ITEM] } }))
  let t = 1000
  const m = createVideoManager({
    db,
    api: { request } as unknown as VideoDeps["api"],
    now: () => ++t,
    worker: () => port,
    files,
    ...over,
  })
  const emit = async (msg: VideoWorkerMessage) => {
    listener?.(msg)
    await new Promise((r) => setTimeout(r, 0))
  }
  return { db, m, sent, emit, files, request, terminate }
}

describe("video manager (matches.md M3, data-layer §7.10)", () => {
  it("lists videos for a match over the media class", async () => {
    const { m, request } = setup()
    expect(await m.list("2026casj", "2026casj_qm1")).toEqual({
      kind: "ok",
      items: [expect.objectContaining({ sourceId: "yt-1" })],
    })
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        class: "media",
        path: "/events/2026casj/matches/2026casj_qm1/videos",
      })
    )
  })

  it("offline: the list says so", async () => {
    const { m } = setup({
      api: {
        request: () => Promise.reject(new OfflineError(["http"])),
      } as unknown as VideoDeps["api"],
    })
    expect(await m.list("e", "m")).toEqual({ kind: "offline" })
  })

  it("downloads into OPFS through the worker, tracking progress in mediaVideos", async () => {
    const { db, m, sent, emit, terminate } = setup()
    await m.download("2026casj", "2026casj_qm1", ITEM)
    const id = videoId("2026casj_qm1", "yt-1")
    expect(sent).toEqual([
      {
        type: "start",
        url: ITEM.url,
        path: "videos/2026casj/2026casj_qm1_yt-1.mp4",
      },
    ])
    expect((await db.mediaVideos.get(id))?.downloadState).toBe("queued")
    await emit({ type: "progress", bytes: 40, total: 100 })
    expect(await db.mediaVideos.get(id)).toMatchObject({
      downloadState: "downloading",
      bytesDownloaded: 40,
    })
    await emit({ type: "done", bytes: 100 })
    expect(await db.mediaVideos.get(id)).toMatchObject({
      downloadState: "done",
      bytes: 100,
    })
    expect(terminate).toHaveBeenCalled()
  })

  it("a failed download keeps the row with the error", async () => {
    const { db, m, emit } = setup()
    await m.download("e", "m", ITEM)
    await emit({ type: "error", message: "HTTP 403" })
    expect(await db.mediaVideos.get(videoId("m", "yt-1"))).toMatchObject({
      downloadState: "error",
      error: "HTTP 403",
    })
  })

  it("without OPFS workers the row says downloads aren't supported", async () => {
    const { db, m } = setup({ worker: null })
    await m.download("e", "m", ITEM)
    expect((await db.mediaVideos.get(videoId("m", "yt-1")))?.error).toMatch(
      /supported/
    )
  })

  it("open returns an mp4-typed blob and marks it opened; remove deletes the file and row", async () => {
    const { db, m, emit, files } = setup()
    await m.download("e", "m", ITEM)
    await emit({ type: "done", bytes: 3 })
    const id = videoId("m", "yt-1")
    const blob = await m.open(id)
    expect(blob?.type).toBe("video/mp4")
    expect((await db.mediaVideos.get(id))?.lastOpenedAt).toBeDefined()
    await m.remove(id)
    expect(files.remove).toHaveBeenCalledWith("videos/e/m_yt-1.mp4")
    expect(await db.mediaVideos.get(id)).toBeUndefined()
  })

  it("evicts least recently opened videos first", async () => {
    const { db, m } = setup()
    const base = {
      eventKey: "e",
      sourceId: "s",
      url: "u",
      mime: "video/mp4",
      downloadState: "done" as const,
      opfsPath: "p",
    }
    await db.mediaVideos.bulkPut([
      {
        ...base,
        id: "a",
        matchKey: "a",
        bytes: 50,
        bytesDownloaded: 50,
        createdAt: 1,
        lastOpenedAt: 900,
      },
      {
        ...base,
        id: "b",
        matchKey: "b",
        bytes: 50,
        bytesDownloaded: 50,
        createdAt: 2,
        lastOpenedAt: 100,
      },
    ])
    expect(await m.evict(40)).toBe(50)
    expect((await db.mediaVideos.toArray()).map((v) => v.id)).toEqual(["a"])
  })
})
