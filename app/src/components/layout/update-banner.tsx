// Update banners (pwa-offline §7.5, §8): below the nav bar, never over the tab bar.
import { Button } from "@/components/controls/button"
import { ArrowUpCircle, TriangleAlert } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

function Frame({
  tone,
  title,
  body,
  children,
}: {
  tone: "info" | "warning"
  title: string
  body: string
  children?: React.ReactNode
}) {
  const Icon = tone === "warning" ? TriangleAlert : ArrowUpCircle
  return (
    <section
      role="status"
      aria-label={title}
      className={cn(
        "mt-2 mx-safe-4 flex flex-col gap-2 rounded-xl px-3 py-3",
        tone === "warning" ? "bg-warning/15" : "bg-info/12"
      )}
    >
      <div className="flex gap-2">
        <Icon
          aria-hidden
          size={18}
          className={cn(
            "mt-0.5 shrink-0",
            tone === "warning" ? "text-warning" : "text-info"
          )}
        />
        <div>
          <p className="text-subhead font-semibold">{title}</p>
          <p className="text-footnote text-muted-foreground">{body}</p>
        </div>
      </div>
      {children ? (
        <div className="flex justify-end gap-2">{children}</div>
      ) : null}
    </section>
  )
}

export function UpdateReadyBanner({
  version,
  onUpdate,
  onLater,
}: {
  version: string | undefined
  onUpdate: () => void
  onLater: () => void
}) {
  return (
    <Frame
      tone="info"
      title="Update ready"
      body={`VScout ${version ?? "update"} is downloaded.`}
    >
      <Button variant="plain" onClick={onLater}>
        Later
      </Button>
      <Button onClick={onUpdate}>Update Now</Button>
    </Frame>
  )
}

export function UpdatedElsewhereBanner({ onReload }: { onReload: () => void }) {
  return (
    <Frame
      tone="info"
      title="VScout updated"
      body="VScout updated in another window. Reload when you're done."
    >
      <Button onClick={onReload}>Reload</Button>
    </Frame>
  )
}

export type ForcedUpdateCopy =
  "finish-form" | "downloading" | "offline" | "not-available" | "updating"

const FORCED: Record<ForcedUpdateCopy, { title: string; body: string }> = {
  "finish-form": {
    title: "Update required",
    body: "Finish this form and VScout will update. Your work is saved on this device.",
  },
  downloading: {
    title: "Update required",
    body: "Downloading the latest VScout…",
  },
  offline: {
    title: "Update required to sync",
    body: "Connect to the internet to download the latest VScout. Your changes are saved and will sync after the update.",
  },
  "not-available": {
    title: "Update required to sync",
    body: "This version of VScout is out of date, and the update isn't available yet. VScout will keep checking.",
  },
  updating: { title: "Update required", body: "Updating VScout…" },
}

export function ForcedUpdateBanner({ copy }: { copy: ForcedUpdateCopy }) {
  return <Frame tone="warning" {...FORCED[copy]} />
}
