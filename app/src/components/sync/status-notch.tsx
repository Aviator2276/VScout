// The Sync Status notch's shape and position (features/sync-status.md S1). At rest it is a black pill
// centered in the nav bar row; once the nav bar slides in it moves down with it and hangs from the
// bar's bottom edge, its top corners squared and joined to the bar by concave fillets. Same curve and
// duration as the bar, so they move as one piece. The tap target is 44 pt around the 22 pt pill.
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** The nav bar's slide (StackPage): keep in step with it. */
export const BAR_EASE =
  "duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:duration-150"

const FILLET = 8

function Fillet({ side, shown }: { side: "start" | "end"; shown: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-0 size-2 bg-black transition-[opacity,scale]",
        BAR_EASE,
        side === "start"
          ? "-left-2 origin-top-right"
          : "-right-2 origin-top-left",
        shown ? "scale-100 opacity-100" : "scale-0 opacity-0"
      )}
      style={{
        // black everywhere except a quarter circle: the curve that flares into the bar
        maskImage: `radial-gradient(circle at ${side === "start" ? "0" : "100%"} 100%, transparent ${FILLET}px, black ${FILLET + 0.5}px)`,
        WebkitMaskImage: `radial-gradient(circle at ${side === "start" ? "0" : "100%"} 100%, transparent ${FILLET}px, black ${FILLET + 0.5}px)`,
      }}
    />
  )
}

export function StatusNotch({
  attached,
  label,
  onSelect,
  children,
}: {
  /** hangs from the nav bar (the bar has slid in) */
  attached: boolean
  /** "Sync status: connected, good signal" */
  label: string
  onSelect: () => void
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
        type="button"
        aria-label={label}
        onClick={onSelect}
        className="pointer-events-auto relative -my-[11px] flex h-11 w-24 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "relative flex h-[22px] w-[76px] items-center justify-between bg-black px-2 shadow-sm transition-[border-radius]",
            BAR_EASE,
            attached
              ? "rounded-t-none rounded-b-[11px]"
              : "rounded-[11px] dark:ring-1 dark:ring-white/10"
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
