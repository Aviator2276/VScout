// Match → ⋯ → Videos (features/matches.md M2 `?sheet=video`): the videos the backend has for this
// match, each with Download (or progress, Play, Try Again). Listing needs a connection; videos
// already downloaded play offline.
import { useEffect, useState } from "react"
import { Button } from "@/components/controls/button"
import { List } from "@/components/list/list"
import { Sheet } from "@/components/overlays/sheet"
import type { WireMatchVideo } from "@/lib/contracts/media"
import { useVideoManager } from "@/lib/db/react/data-runtime"
import type { VideoListResult } from "@/lib/media/videos"
import { videoId } from "@/lib/media/videos"
import { useMatchVideoRows } from "../api/get-videos"
import { VideoPlayerSheet } from "./video-player-sheet"
import { formatBytes } from "./videos-view"

export function MatchVideoSheet({
  open,
  onOpenChange,
  eventKey,
  matchKey,
  title,
  online,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventKey: string
  matchKey: string
  title: string
  online: boolean
}) {
  const videos = useVideoManager()
  const rows = useMatchVideoRows(matchKey)
  const [listed, setListed] = useState<
    (VideoListResult & { key: string }) | null
  >(null)
  const [attempt, setAttempt] = useState(0)
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => {
    if (!open || !online) return
    let live = true
    void videos.list(eventKey, matchKey).then((r) => {
      if (live) setListed({ ...r, key: matchKey })
    })
    return () => {
      live = false
    }
  }, [open, online, eventKey, matchKey, videos, attempt])

  const current = listed?.key === matchKey ? listed : null
  const byId = new Map(rows.map((r) => [r.id, r]))
  const available: ReadonlyArray<WireMatchVideo> =
    current?.kind === "ok" ? current.items : []
  // downloaded ones stay listed offline, even if the server list isn't reachable
  const ids = new Set([
    ...available.map((a) => videoId(matchKey, a.sourceId)),
    ...rows.map((r) => r.id),
  ])

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <Sheet.Content title="Videos" description={title}>
          {!online && rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              Connect to see this match’s videos.
            </p>
          ) : online && current === null ? (
            <p role="status" className="py-8 text-center text-muted-foreground">
              Looking for videos…
            </p>
          ) : current?.kind === "error" && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-muted-foreground">Couldn’t load videos.</p>
              <Button
                variant="secondary"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Try Again
              </Button>
            </div>
          ) : ids.size === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No videos for this match yet.
            </p>
          ) : (
            <List.Section>
              {[...ids].map((id) => {
                const row = byId.get(id)
                const item = available.find(
                  (a) => videoId(matchKey, a.sourceId) === id
                )
                const label = [
                  item?.kind ?? "Video",
                  item?.quality ?? row?.quality,
                ]
                  .filter(Boolean)
                  .join(" · ")
                const size = item?.bytes ?? row?.bytes
                const state = row?.downloadState ?? "none"
                return (
                  <List.Row
                    key={id}
                    title={label.charAt(0).toUpperCase() + label.slice(1)}
                    subtitle={
                      state === "downloading" && row?.bytes
                        ? `Downloading ${Math.round((row.bytesDownloaded / row.bytes) * 100)}%`
                        : state === "queued"
                          ? "Waiting…"
                          : state === "error"
                            ? (row?.error ?? "Download failed")
                            : size
                              ? formatBytes(size)
                              : undefined
                    }
                    detail={
                      state === "done" ? (
                        <Button variant="plain" onClick={() => setPlaying(id)}>
                          Play
                        </Button>
                      ) : item &&
                        online &&
                        (state === "none" || state === "error") ? (
                        <Button
                          variant="plain"
                          onClick={() =>
                            void videos.download(eventKey, matchKey, item)
                          }
                        >
                          {state === "error" ? "Try Again" : "Download"}
                        </Button>
                      ) : undefined
                    }
                  />
                )
              })}
            </List.Section>
          )}
        </Sheet.Content>
      </Sheet>
      <VideoPlayerSheet
        videoId={playing}
        title={title}
        onClose={() => setPlaying(null)}
      />
    </>
  )
}
