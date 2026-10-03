// The Sync Status notch's shape and position (features/sync-status.md S1). At rest it is a pill
// centered in the nav bar row; once the nav bar slides in it moves down with it and hangs from the
// bar's bottom edge, its top corners squared and joined to the bar by concave fillets. The bar and the
// notch travel the same 33 pt with the same curve and duration, so the bar's bottom edge and the
// notch's top edge sit at one position on every frame. White in light, black in dark (--notch-*).
import type { ReactNode, Ref } from "react"
import { cn } from "@/lib/utils"

/** The nav bar's slide (StackPage): keep in step with it. */
export const BAR_EASE =
  "duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:duration-150"

const FILLET = 8

function Fillet({ side, shown }: { side: "start" | "end"; shown: boolean }) {
  const mask = `radial-gradient(circle at ${side === "start" ? "0" : "100%"} 100%, transparent ${FILLET}px, black ${FILLET + 0.5}px)`
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-0 size-2 bg-(--notch-bg) transition-[opacity,scale]",
        BAR_EASE,
        side === "start"
          ? "-left-2 origin-top-right"
          : "-right-2 origin-top-left",
        shown ? "scale-100 opacity-100" : "scale-0 opacity-0"
      )}
      // the pill's color everywhere except a quarter circle: the curve that flares into the bar
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  )
}

export function StatusNotch({
  attached,
  label,
  onSelect,
  expanded = false,
  buttonRef,
  children,
}: {
  /** hangs from the nav bar (the bar has slid in) */
  attached: boolean
  /** "Sync status: connected, good signal" */
  label: string
  onSelect: () => void
  /** the details tooltip is open */
  expanded?: boolean
  /** the details tooltip anchors to the button */
  buttonRef?: Ref<HTMLButtonElement>
  /** the three glyph slots */
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-[calc(var(--k-safe-area-top,0px)+11px)] left-1/2 z-10 -translate-x-1/2 transition-[translate]",
        BAR_EASE,
        // the nav row is 44 pt: at rest centered in it (11 pt above), attached at its bottom edge
        attached && "translate-y-[33px]"
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={onSelect}
        className="pointer-events-auto relative -my-[11px] flex h-11 w-24 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "relative flex h-[22px] w-[76px] items-center justify-between bg-(--notch-bg) px-2 transition-[border-radius,box-shadow]",
            BAR_EASE,
            attached
              ? "rounded-t-none rounded-b-[11px] shadow-[0_2px_4px_rgb(0_0_0/0.08)]"
              : "rounded-[11px] shadow-sm ring-1 ring-black/10 dark:ring-white/10"
          )}
        >
          <Fillet side="start" shown={attached} />
          <Fillet side="end" shown={attached} />
          {children}
        </span>
      </button>
    </div>
  )
}
