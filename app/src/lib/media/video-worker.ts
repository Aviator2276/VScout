// Downloads one match video into OPFS (data-layer §7.10, ADR-053). A dedicated Worker is the only
// place iOS 18 can write OPFS files (createSyncAccessHandle). Resumes with Range from the bytes
// already on disk. Progress is posted at most every 500 ms.
/// <reference lib="webworker" />

export type VideoWorkerRequest =
  { type: "start"; url: string; path: string } | { type: "cancel" }
export type VideoWorkerMessage =
  | { type: "progress"; bytes: number; total?: number }
  | { type: "done"; bytes: number }
  | { type: "error"; message: string }

const PROGRESS_MS = 500
let controller: AbortController | null = null

async function fileHandle(path: string) {
  let dir = await navigator.storage.getDirectory()
  const parts = path.split("/")
  const name = parts.pop() ?? "video.mp4"
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true })
  return dir.getFileHandle(name, { create: true })
}

async function download(url: string, path: string) {
  controller = new AbortController()
  const handle = await fileHandle(path)
  const access = await (
    handle as unknown as {
      createSyncAccessHandle: () => Promise<{
        getSize: () => number
        write: (b: Uint8Array, o: { at: number }) => number
        truncate: (n: number) => void
        flush: () => void
        close: () => void
      }>
    }
  ).createSyncAccessHandle()
  try {
    let at = access.getSize()
    const res = await fetch(url, {
      signal: controller.signal,
      ...(at > 0 ? { headers: { Range: `bytes=${at}-` } } : {}),
    })
    if (res.status === 200 && at > 0) {
      // the server ignored Range: start over
      access.truncate(0)
      at = 0
    } else if (!res.ok && res.status !== 206)
      throw new Error(`HTTP ${res.status}`)
    const length = Number(res.headers.get("content-length") ?? NaN)
    const total = Number.isFinite(length) ? at + length : undefined
    const reader = res.body?.getReader()
    if (!reader) throw new Error("No response body")
    let last = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      at += access.write(value, { at })
      const now = Date.now()
      if (now - last >= PROGRESS_MS) {
        last = now
        postMessage({
          type: "progress",
          bytes: at,
          ...(total ? { total } : {}),
        } satisfies VideoWorkerMessage)
      }
    }
    access.flush()
    postMessage({ type: "done", bytes: at } satisfies VideoWorkerMessage)
  } finally {
    access.close()
  }
}

addEventListener("message", (e: MessageEvent<VideoWorkerRequest>) => {
  if (e.data.type === "cancel") {
    controller?.abort()
    return
  }
  download(e.data.url, e.data.path).catch((error: unknown) => {
    postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    } satisfies VideoWorkerMessage)
  })
})
