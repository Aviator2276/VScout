// Renders a DataState: the success slot for data, and a consistent message + icon for every other
// state (data-states.md, ui-design-system §13). Compound component: slots are children; a slot you
// omit falls back to its default. Features never hand-roll these states.
import {
  Children,
  createContext,
  isValidElement,
  use,
  useEffect,
  useState,
} from "react"
import type { ReactElement, ReactNode } from "react"
import { LoaderCircle } from "@/components/icons/icon"
import type { LucideIcon } from "@/components/icons/icon"
import { Button } from "@/components/ui/button"
import type { DataState, MissingReason } from "@/lib/db/react/data-state"
import { cn } from "@/lib/utils"
import * as defaults from "./defaults"

export type DataViewSize = "page" | "section" | "inline"

const SizeContext = createContext<DataViewSize>("section")

const SIZE = {
  page: {
    wrap: "min-h-[50svh] gap-3 px-8 py-12",
    icon: 48,
    title: "text-title-3",
    desc: "text-subhead",
  },
  section: {
    wrap: "gap-2 px-4 py-8",
    icon: 32,
    title: "text-headline",
    desc: "text-subhead",
  },
  inline: {
    wrap: "flex-row gap-2 px-3 py-2 text-left",
    icon: 20,
    title: "text-subhead",
    desc: "text-footnote",
  },
} as const

interface MessageProps {
  icon: LucideIcon
  title: string
  description?: string | undefined
  action?: ReactNode
  role: "status" | "alert"
  busy?: boolean
}

/** The shared look of every non-success state. */
function StateMessage({
  icon: Icon,
  title,
  description,
  action,
  role,
  busy,
}: MessageProps) {
  const size = use(SizeContext)
  const s = SIZE[size]
  const inline = size === "inline"
  return (
    <div
      role={role}
      aria-busy={busy || undefined}
      className={cn(
        "flex flex-col items-center justify-center text-center text-muted-foreground",
        s.wrap
      )}
    >
      <Icon
        aria-hidden
        size={s.icon}
        strokeWidth={inline ? 2 : 1.75}
        className={cn(busy && "animate-spin")}
      />
      <div
        className={cn(
          "flex flex-col gap-1",
          inline ? "items-start" : "items-center"
        )}
      >
        <p className={cn("font-medium text-foreground", s.title)}>{title}</p>
        {description ? <p className={s.desc}>{description}</p> : null}
      </div>
      {action ? (
        <div className={inline ? "ms-auto" : "mt-2"}>{action}</div>
      ) : null}
    </div>
  )
}

// ---------- slots (markers read by DataView; each renders its state) ----------

interface CopyOverride {
  icon?: LucideIcon
  title?: string
  description?: string
  action?: ReactNode
}

function Idle(_props: CopyOverride) {
  return null
}
function Loading(_props: { children?: ReactNode; label?: string }) {
  return null
}
function Empty(_props: CopyOverride) {
  return null
}
function Missing(_props: Partial<Record<MissingReason, CopyOverride>>) {
  return null
}
function ErrorSlot(_props: { title?: string; description?: string }) {
  return null
}
function Success<TData>(_props: {
  children: (data: TData, meta: { stale: boolean }) => ReactNode
}) {
  return null
}

type Slots = {
  idle?: CopyOverride
  loading?: { children?: ReactNode; label?: string }
  empty?: CopyOverride
  missing?: Partial<Record<MissingReason, CopyOverride>>
  error?: { title?: string; description?: string }
  success?: { children: (data: unknown, meta: { stale: boolean }) => ReactNode }
}

function readSlots(children: ReactNode): Slots {
  const slots: Slots = {}
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const el = child as ReactElement<Record<string, unknown>>
    if (el.type === Idle) slots.idle = el.props
    else if (el.type === Loading) slots.loading = el.props
    else if (el.type === Empty) slots.empty = el.props
    else if (el.type === Missing) slots.missing = el.props
    else if (el.type === ErrorSlot) slots.error = el.props
    else if (el.type === Success) slots.success = el.props as Slots["success"]
  })
  return slots
}

/** Shows loading UI only after a short delay, so instant reads don't flash a spinner. */
function DelayedLoading({
  children,
  label,
}: {
  children?: ReactNode
  label?: string
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), defaults.LOADING_DELAY_MS)
    return () => clearTimeout(t)
  }, [])
  const text = label ?? defaults.LOADING_LABEL
  if (!show)
    return (
      <div role="status" aria-busy className="sr-only">
        {text}
      </div>
    )
  if (children)
    return (
      <div role="status" aria-busy aria-label={text}>
        <div aria-hidden>{children}</div>
      </div>
    )
  return <StateMessage icon={LoaderCircle} title={text} role="status" busy />
}

export interface DataViewProps<TData> {
  state: DataState<TData>
  size?: DataViewSize
  children?: ReactNode
}

function DataViewRoot<TData>({
  state,
  size = "section",
  children,
}: DataViewProps<TData>) {
  const slots = readSlots(children)
  let body: ReactNode
  switch (state.status) {
    case "idle": {
      const c = { ...defaults.IDLE, ...slots.idle }
      body = <StateMessage {...c} role="status" />
      break
    }
    case "loading":
      body = <DelayedLoading {...slots.loading} />
      break
    case "empty": {
      const c = { ...defaults.EMPTY, ...slots.empty }
      body = <StateMessage {...c} role="status" />
      break
    }
    case "missing": {
      const c = {
        ...defaults.MISSING[state.reason],
        ...slots.missing?.[state.reason],
      }
      body = <StateMessage {...c} role="status" />
      break
    }
    case "error": {
      const c = {
        ...defaults.ERROR,
        description: state.error.message,
        ...slots.error,
      }
      body = (
        <StateMessage
          {...c}
          role="alert"
          action={
            <Button variant="outline" onClick={state.retry}>
              {defaults.RETRY_LABEL}
            </Button>
          }
        />
      )
      break
    }
    case "success":
      body = slots.success
        ? slots.success.children(state.data, { stale: state.stale === true })
        : null
      break
  }
  return <SizeContext value={size}>{body}</SizeContext>
}

export const DataView = Object.assign(DataViewRoot, {
  Idle,
  Loading,
  Empty,
  Missing,
  Error: ErrorSlot,
  Success,
})
