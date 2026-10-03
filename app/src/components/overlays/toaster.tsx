// Toasts on Base UI Toast (live regions, swipe to dismiss, an action button), stacked like Sonner,
// on the thicker sheet glass so their text stays readable over anything behind them:
// the newest in front, older ones peeking behind it, smaller. Tapping the stack expands it into a
// scrollable list (timers pause); tapping elsewhere collapses it. It always sits above the tab bar
// (--tabbar-offset) and above the scouting form's bottom bar. Undo after delete (ADR-029) uses it.
import { Toast } from "@base-ui/react/toast"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { X } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

export interface ToastOptions {
  title: string
  description?: string
  /** e.g. { label: "Undo", onAction } */
  action?: { label: string; onAction: () => void }
  /** high = announced assertively (errors, urgent) */
  priority?: "low" | "high"
  /** ms; 0 keeps it until dismissed */
  timeout?: number
}

const DEFAULT_TIMEOUT = 5000
/** how many toasts peek out of the collapsed stack */
const VISIBLE = 3

export function useToast() {
  const manager = Toast.useToastManager()
  return {
    show(opts: ToastOptions): string {
      const timeout = opts.timeout ?? DEFAULT_TIMEOUT
      return manager.add({
        title: opts.title,
        ...(opts.description ? { description: opts.description } : {}),
        priority: opts.priority ?? "low",
        timeout,
        // remembered so an expanded stack can pause and later restore it
        data: { timeout },
        ...(opts.action
          ? {
              actionProps: {
                children: opts.action.label,
                onClick: opts.action.onAction,
              },
            }
          : {}),
      })
    },
    dismiss: (id?: string) => manager.close(id),
  }
}

function ToastList({ expanded }: { expanded: boolean }) {
  const { toasts } = Toast.useToastManager()
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl glass bg-(--glass-tint-sheet) px-4 py-3 text-foreground shadow-lg transition-[translate,scale,opacity,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] select-none",
        "data-[ending-style]:opacity-0 data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0",
        expanded
          ? "relative"
          : [
              // collapsed: stacked behind the newest, each one a little higher and smaller
              "absolute inset-x-0 bottom-0 origin-bottom",
              "z-[calc(100-var(--toast-index))]",
              "translate-y-[calc(var(--toast-index)*-0.6rem+var(--toast-swipe-movement-y,0px))]",
              "scale-[calc(1-var(--toast-index)*0.05)]",
              // behind cards take the front card's height and hide their text
              "data-[behind]:h-(--toast-frontmost-height) data-[behind]:overflow-hidden",
              "[&[data-behind]>*]:opacity-0",
            ]
      )}
      {...(!expanded && toastIndex(toasts, t.id) > 0
        ? { "data-behind": "" }
        : {})}
      style={
        !expanded && toastIndex(toasts, t.id) >= VISIBLE
          ? { opacity: 0, pointerEvents: "none" }
          : undefined
      }
    >
      <div className="min-w-0 flex-1 transition-opacity">
        <Toast.Title className="text-subhead font-semibold" />
        <Toast.Description className="text-footnote" />
      </div>
      {t.actionProps ? (
        <Toast.Action className="min-h-11 px-2 text-subhead font-semibold text-primary transition-opacity" />
      ) : null}
      <Toast.Close
        aria-label="Dismiss"
        className="hit-44 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-opacity"
      >
        <X aria-hidden size={18} />
      </Toast.Close>
    </Toast.Root>
  ))
}

/** 0 = the newest (frontmost); counts only toasts still showing. */
function toastIndex(
  toasts: ReadonlyArray<{ id: string; transitionStatus?: string }>,
  id: string
): number {
  const live = toasts.filter((t) => t.transitionStatus !== "ending")
  const i = live.findIndex((t) => t.id === id)
  return i < 0 ? 0 : i
}

function Viewport() {
  const manager = Toast.useToastManager()
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const count = manager.toasts.length

  // expanded: timers pause; collapsed: each toast gets its own timeout back
  useEffect(() => {
    for (const t of manager.toasts) {
      const original =
        (t.data as { timeout?: number } | undefined)?.timeout ?? DEFAULT_TIMEOUT
      const want = expanded ? 0 : original
      if (t.timeout !== want) manager.update(t.id, { timeout: want })
    }
  }, [expanded, manager])

  // tap outside collapses; the stack collapses by itself once it's empty
  useEffect(() => {
    if (!expanded) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setExpanded(false)
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
  }, [expanded])
  const open = expanded && count > 0

  return (
    <Toast.Viewport
      ref={ref}
      onClick={() => {
        if (count > 1) setExpanded(true)
      }}
      data-stack={open ? "expanded" : "collapsed"}
      className={cn(
        "fixed inset-x-0 z-[60] mx-auto w-[min(100%-2rem,28rem)] outline-none",
        // above the tab bar when it shows, above the scouting form's bottom bar when it doesn't
        "bottom-[max(calc(var(--tabbar-offset)+0.75rem),calc(var(--k-safe-area-bottom,0px)+6rem))]",
        open
          ? "flex max-h-[60dvh] flex-col-reverse gap-2 overflow-y-auto overscroll-contain rounded-3xl pt-2"
          : "h-[var(--toast-frontmost-height,0px)]"
      )}
    >
      <ToastList expanded={open} />
    </Toast.Viewport>
  )
}

/** Mount once at the app root; components call useToast(). */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider limit={20}>
      {children}
      <Toast.Portal>
        <Viewport />
      </Toast.Portal>
    </Toast.Provider>
  )
}
