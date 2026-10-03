// Plays a downloaded video from OPFS (data-layer §7.10): an object URL, revoked on close.
import { useEffect, useState } from "react"
import { Sheet } from "@/components/overlays/sheet"
import { useVideoManager } from "@/lib/db/react/data-runtime"

export function VideoPlayerSheet({
  videoId,
  title,
  onClose,
}: {
  videoId: string | null
  title: string
  onClose: () => void
}) {
  const videos = useVideoManager()
  const [src, setSrc] = useState<
    { id: string; url: string } | { id: string; error: true } | null
  >(null)
  useEffect(() => {
    if (!videoId) return
    let url: string | null = null
    let live = true
    videos
      .open(videoId)
      .then((blob) => {
        if (!live) return
        if (!blob) {
          setSrc({ id: videoId, error: true })
          return
        }
        url = URL.createObjectURL(blob)
        setSrc({ id: videoId, url })
      })
      .catch(() => {
        if (live) setSrc({ id: videoId, error: true })
      })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [videoId, videos])
  const current = src?.id === videoId ? src : null
  return (
    <Sheet
      open={videoId !== null}
      onOpenChange={(o) => (o ? undefined : onClose())}
    >
      <Sheet.Content title={title} detent="large">
        {current === null ? (
          <p role="status" className="py-10 text-center text-muted-foreground">
            Opening video…
          </p>
        ) : "error" in current ? (
          <p className="py-10 text-center text-muted-foreground">
            Couldn’t open this video. Delete it and download it again.
          </p>
        ) : (
          // match footage has no captions to offer
          <video
            src={current.url}
            controls
            playsInline
            className="w-full rounded-xl bg-black"
          />
        )}
      </Sheet.Content>
    </Sheet>
  )
}
