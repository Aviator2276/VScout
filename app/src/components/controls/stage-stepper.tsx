// Steps of a multi-stage form (ui-patterns §2.1): tappable pills whose state is shape plus icon,
// never color alone. A tablist; each tab reads "Teleop, step 3 of 5, incomplete".
import {
  Check,
  Circle,
  CircleDot,
  TriangleAlert,
} from "@/components/icons/icon"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

export type StepStatus = "done" | "todo" | "issue"

export interface Step<TId extends string> {
  id: TId
  label: string
  status: StepStatus
}

const STATUS_TEXT: Record<StepStatus, string> = {
  done: "complete",
  todo: "not started",
  issue: "incomplete",
}

export function StageStepper<TId extends string>({
  label,
  steps,
  current,
  onSelect,
  panelId,
}: {
  label: string
  steps: ReadonlyArray<Step<TId>>
  current: TId
  onSelect: (id: TId) => void
  /** the id of the element showing the current stage */
  panelId?: string
}) {
  const index = steps.findIndex((s) => s.id === current)
  const go = (i: number) => {
    const s = steps[(i + steps.length) % steps.length]
    if (!s) return
    haptic("selection")
    onSelect(s.id)
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      className="sticky top-[calc(var(--k-safe-area-top)+44px)] z-20 flex gap-1 overflow-x-auto rounded-full glass p-1"
    >
      {steps.map((s, i) => {
        const selected = s.id === current
        const Icon = selected
          ? CircleDot
          : s.status === "done"
            ? Check
            : s.status === "issue"
              ? TriangleAlert
              : Circle
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            aria-label={`${s.label}, step ${i + 1} of ${steps.length}, ${STATUS_TEXT[s.status]}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => go(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") go(index + 1)
              if (e.key === "ArrowLeft") go(index - 1)
            }}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full px-3 text-footnote font-medium whitespace-nowrap",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            )}
          >
            <Icon
              aria-hidden
              size={14}
              className={cn(
                !selected && s.status === "issue" && "text-warning",
                !selected && s.status === "done" && "text-success"
              )}
            />
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
