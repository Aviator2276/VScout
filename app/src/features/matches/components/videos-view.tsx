// Downloaded Videos (features/matches.md M3): every video on this device for the event, with
// progress, retry, play and delete, and the space they take.
import { useState } from "react"
import { DataView } from "@/components/data-view/data-view"
import { Video } from "@/components/icons/icon"
import { List } from "@/components/list/list"
import { ActionMenu } from "@/components/overlays/menu"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { useVideoManager } from "@/lib/db/react/data-runtime"
import type { MediaVideoRow } from "@/lib/db/types"
import { longMatchLabel, parseMatchKey } from "@/utils/match-label"
import { useEventVideos } from "../api/get-videos"
import { VideoPlayerSheet } from "./video-player-sheet"

export const formatBytes = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)} GB`
    : n >= 1e6
      ? `${Math.round(n / 1e6)} MB`
      : `${Math.max(1, Math.round(n / 1e3))} KB`

export const matchTitle = (key: string) => {
  const id = parseMatchKey(key)
  return id ? longMatchLabel(id) : key
}

function status(v: MediaVideoRow): string {
  switch (v.downloadState) {
    case "done":
      return formatBytes(v.bytes ?? v.bytesDownloaded)
    case "queued":
      return "Waiting…"
    case "downloading":
      return v.bytes
        ? `${Math.round((v.bytesDownloaded / v.bytes) * 100)}%`
        : formatBytes(v.bytesDownloaded)
    case "error":
      return "Failed"
    case "none":
      return ""
  }
}

export function VideosView({
  eventKey,
  online,
}: {
  eventKey: string
  online: boolean
}) {
  const state = useEventVideos(eventKey)
  const videos = useVideoManager()
  const [playing, setPlaying] = useState<MediaVideoRow | null>(null)
  const [deleting, setDeleting] = useState<MediaVideoRow | null>(null)
  const shown =
    state.status === "success" && state.data.length === 0
      ? ({ status: "empty" } as const)
      : state
  return (
    <>
      <DataView state={shown} size="page">
        <DataView.Empty
          icon={Video}
          title="No downloaded videos"
          description="Download a match video from its match page to watch it offline."
        />
        <DataView.Error title="Couldn’t load your videos." />
        <DataView.Success>
          {(list: ReadonlyArray<MediaVideoRow>) => {
            const total = list.reduce(
              (n, v) =>
                n +
                (v.downloadState === "done"
                  ? (v.bytes ?? v.bytesDownloaded)
                  : 0),
              0
            )
            return (
              <List.Section
                footer={`${formatBytes(total)} on this device. Videos are deleted first when space runs low.`}
              >
                {list.map((v) => (
                  <List.Row
                    key={v.id}
                    title={matchTitle(v.matchKey)}
                    subtitle={
                      [v.quality, v.downloadState === "error" ? v.error : null]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                    detail={
                      <span className="flex items-center gap-1">
                        {status(v)}
                        <ActionMenu
                          label={`Actions for ${matchTitle(v.matchKey)}`}
                          trigger={<span aria-hidden>⋯</span>}
                          actions={[
                            ...(v.downloadState === "done"
                              ? [
                                  {
                                    label: "Play",
                                    onSelect: () => setPlaying(v),
                                  },
                                ]
                              : []),
                            ...(v.downloadState === "error" && online
                              ? [
                                  {
                                    label: "Try Again",
                                    onSelect: () => void videos.retry(v.id),
                                  },
                                ]
                              : []),
                            {
                              label: "Delete",
                              destructive: true,
                              onSelect: () => setDeleting(v),
                            },
                          ]}
                        />
                      </span>
                    }
                  />
                ))}
              </List.Section>
            )
          }}
        </DataView.Success>
      </DataView>
      <VideoPlayerSheet
        videoId={playing?.id ?? null}
        title={playing ? matchTitle(playing.matchKey) : ""}
        onClose={() => setPlaying(null)}
      />
      <ConfirmAlert
        open={deleting !== null}
        onOpenChange={(o) => (o ? undefined : setDeleting(null))}
        title="Delete Video?"
        description="It’s removed from this device. You can download it again when you’re online."
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={() => {
          if (deleting) void videos.remove(deleting.id)
          setDeleting(null)
        }}
      />
    </>
  )
}
