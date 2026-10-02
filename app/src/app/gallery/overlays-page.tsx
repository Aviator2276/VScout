// Sheets (solid and glass, medium and large), the action sheet, the confirm alert and a toast.
import { useState } from "react"
import { Button } from "@/components/controls/button"
import { ActionSheet } from "@/components/overlays/action-sheet"
import { ConfirmAlert } from "@/components/overlays/confirm-alert"
import { Sheet } from "@/components/overlays/sheet"
import { useToast } from "@/components/overlays/toaster"
import { GallerySection } from "./gallery-section"

type Open = null | "solid" | "glass" | "large" | "actions" | "confirm"

export function OverlaysPage() {
  const [open, setOpen] = useState<Open>(null)
  const toast = useToast()
  const close = (next: boolean) => {
    if (!next) setOpen(null)
  }
  return (
    <GallerySection title="Overlays">
      <div className="flex flex-col gap-2">
        <Button onClick={() => setOpen("solid")}>Open Sheet</Button>
        <Button onClick={() => setOpen("glass")}>Open Glass Sheet</Button>
        <Button onClick={() => setOpen("large")}>Open Large Sheet</Button>
        <Button onClick={() => setOpen("actions")}>Open Action Sheet</Button>
        <Button onClick={() => setOpen("confirm")}>Open Alert</Button>
        <Button
          onClick={() =>
            toast.show({
              title: "Entry deleted",
              action: { label: "Undo", onAction: () => undefined },
            })
          }
        >
          Show Toast
        </Button>
      </div>

      <Sheet open={open === "solid" || open === "glass"} onOpenChange={close}>
        <Sheet.Content
          title="Edit Widget"
          description="A medium sheet."
          surface={open === "glass" ? "glass" : "solid"}
          closeLabel="Done"
        >
          <p className="text-body">Sheet content scrolls inside the sheet.</p>
        </Sheet.Content>
      </Sheet>
      <Sheet open={open === "large"} onOpenChange={close}>
        <Sheet.Content title="Filters" detent="large">
          {Array.from({ length: 20 }, (_, i) => (
            <p key={i} className="py-2 text-body">
              Row {i + 1}
            </p>
          ))}
          <Sheet.Footer>
            <Button size="large" onClick={() => setOpen(null)}>
              Apply
            </Button>
          </Sheet.Footer>
        </Sheet.Content>
      </Sheet>
      <ActionSheet
        open={open === "actions"}
        onOpenChange={close}
        title="Delete this entry?"
        message="You can restore it from Recently Deleted for 30 days."
        actions={[
          {
            label: "Delete Entry",
            destructive: true,
            onSelect: () => undefined,
          },
          { label: "Duplicate", onSelect: () => undefined },
        ]}
      />
      <ConfirmAlert
        open={open === "confirm"}
        onOpenChange={close}
        title="Sign out anyway?"
        description="3 changes haven't synced."
        confirmLabel="Sign Out"
        cancelLabel="Stay and Sync"
        tone="destructive"
        onConfirm={() => setOpen(null)}
      />
    </GallerySection>
  )
}
