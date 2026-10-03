// Live changes over HTTP (owner: messages took up to a minute without MQTT). When the backend
// advertises `capabilities.changeStream` and MQTT isn't connected, the app opens a Server-Sent
// Events stream (GET /sync/stream). Each event is a ChangeEnvelope, applied through the same ingest
// path as MQTT fan-out (the rev rule drops duplicates). Every (re)connect pulls what was missed
// (like MQTT's subscribe-then-delta, mqtt.md M4). EventSource can't send headers, so the
// short-lived access token travels as `access_token`; a new token reconnects.

export interface ChangeStreamDeps {
  baseUrl: string
  ingest: (raws: Array<unknown>) => Promise<unknown>
  requestSync: (reason: "stream-reconnect") => void
  EventSourceImpl?: typeof EventSource
}

export interface ChangeStreamTarget {
  scopes: ReadonlyArray<string>
  token: string
}

export function createChangeStream(deps: ChangeStreamDeps) {
  let source: EventSource | null = null
  let key = ""

  const stop = () => {
    source?.close()
    source = null
    key = ""
  }

  return {
    /** Opens (or keeps, or reopens for new scopes or a new token) the stream. */
    start(target: ChangeStreamTarget): void {
      const ES =
        deps.EventSourceImpl ??
        (typeof EventSource === "undefined" ? undefined : EventSource)
      if (!ES) return
      const params = new URLSearchParams({
        scopes: target.scopes.join(","),
        access_token: target.token,
      })
      const url = `${deps.baseUrl}/sync/stream?${params.toString()}`
      if (source && key === url) return
      stop()
      key = url
      const es = new ES(url)
      source = es
      es.onopen = () => deps.requestSync("stream-reconnect")
      es.onmessage = (e: MessageEvent<string>) => {
        let envelope: unknown
        try {
          envelope = JSON.parse(e.data)
        } catch {
          return
        }
        void deps.ingest([envelope])
      }
      // EventSource reconnects by itself; onopen then catches up
    },
    stop,
    running: () => source !== null,
  }
}

export type ChangeStream = ReturnType<typeof createChangeStream>
