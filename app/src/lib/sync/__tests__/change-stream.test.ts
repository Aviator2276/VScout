import { describe, expect, it, vi } from "vitest"
import { createChangeStream } from "../change-stream"

class FakeEventSource {
  static last: FakeEventSource | null = null
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    FakeEventSource.last = this
  }
  close() {
    this.closed = true
  }
}

function setup() {
  const ingest = vi.fn(() => Promise.resolve())
  const requestSync = vi.fn()
  const stream = createChangeStream({
    baseUrl: "http://api.test/api/v1",
    ingest,
    requestSync,
    EventSourceImpl: FakeEventSource as unknown as typeof EventSource,
  })
  return { stream, ingest, requestSync }
}

describe("change stream over HTTP (SSE, capabilities.changeStream)", () => {
  it("connects with the scopes and token, and applies each envelope", async () => {
    const { stream, ingest } = setup()
    stream.start({ scopes: ["global", "user", "event:2026casj"], token: "t1" })
    const es = FakeEventSource.last
    expect(es?.url).toBe(
      "http://api.test/api/v1/sync/stream?scopes=global%2Cuser%2Cevent%3A2026casj&access_token=t1"
    )
    es?.onmessage?.({
      data: JSON.stringify({ v: 1, entity: "message", id: "m1" }),
    })
    await Promise.resolve()
    expect(ingest).toHaveBeenCalledWith([{ v: 1, entity: "message", id: "m1" }])
  })

  it("pulls what it missed every time it (re)connects", () => {
    const { stream, requestSync } = setup()
    stream.start({ scopes: ["global"], token: "t1" })
    FakeEventSource.last?.onopen?.()
    FakeEventSource.last?.onopen?.()
    expect(requestSync).toHaveBeenCalledTimes(2)
    expect(requestSync).toHaveBeenCalledWith("stream-reconnect")
  })

  it("ignores pings and garbage; restarts on a new token or scopes; stops cleanly", () => {
    const { stream, ingest } = setup()
    stream.start({ scopes: ["global"], token: "t1" })
    const first = FakeEventSource.last
    first?.onmessage?.({ data: "not json" })
    expect(ingest).not.toHaveBeenCalled()
    stream.start({ scopes: ["global"], token: "t1" })
    expect(FakeEventSource.last).toBe(first)
    stream.start({ scopes: ["global"], token: "t2" })
    expect(first?.closed).toBe(true)
    const second = FakeEventSource.last
    stream.stop()
    expect(second?.closed).toBe(true)
    expect(stream.running()).toBe(false)
  })
})
