// The Home grid (features/home.md H2–H3, ADR-067/075): square cells, 4/6/8 columns by container
// width, iOS-style flow (list order = position = reading order). In edit mode each widget gets a
// remove badge, a move handle (dnd-kit, no hold, keyboard too), a resize corner that snaps to allowed
// sizes (a ghost follows the finger, red over sizes the widget can't take), and a body button that
// opens the Edit Widget sheet (the accessible path for everything). Outside edit mode a long press
// opens the widget menu. Moves and resizes reflow with an animation.
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { Announcements, DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { m } from "motion/react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { Minus } from "@/components/icons/icon"
import { springs } from "@/components/motion/springs"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import type { WidgetSizes } from "@/types/widget"
import {
  COLUMNS,
  GAP,
  MAX_GRID_WIDTH,
  allowedSizes,
  breakpointFor,
  cellSize,
  flow,
  move,
  snapSize,
} from "./grid-engine"
import type { Breakpoint, GridItem, Placed } from "./grid-engine"

export interface GridMeta {
  title: string
  sizes: WidgetSizes
}

export interface ResizableGridProps {
  items: ReadonlyArray<GridItem>
  metaOf: (widget: string) => GridMeta | undefined
  editing: boolean
  renderWidget: (item: Placed) => ReactNode
  onBreakpoint: (bp: Breakpoint) => void
  /** reorder or resize (edit mode) */
  onChange: (items: Array<GridItem>) => void
  onRemove: (id: string) => void
  onEdit: (id: string) => void
  /** long press outside edit mode (owner): the widget menu */
  onMenu?: (id: string) => void
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(390)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(([e]) => {
      if (e) setWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

export function ResizableGrid({
  items,
  metaOf,
  editing,
  renderWidget,
  onBreakpoint,
  onChange,
  onRemove,
  onEdit,
  onMenu,
}: ResizableGridProps) {
  const { ref, width } = useContainerWidth()
  const bp = breakpointFor(width)
  const cols = COLUMNS[bp]
  const cell = cellSize(width, bp)
  useEffect(() => onBreakpoint(bp), [bp, onBreakpoint])
  const placed = useMemo(() => flow(items, cols), [items, cols])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const titleOf = (id: string) =>
    metaOf(items.find((i) => i.id === id)?.widget ?? "")?.title ?? "Widget"
  const position = (id: string) => items.findIndex((i) => i.id === id) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(String(active.id))}, position ${position(String(active.id))} of ${items.length}. Use arrow keys to move.`,
    onDragOver: ({ over }) =>
      over
        ? `Position ${position(String(over.id))} of ${items.length}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      `Dropped ${titleOf(String(active.id))} at position ${position(String(over?.id ?? active.id))} of ${items.length}.`,
    onDragCancel: ({ active }) =>
      `Move cancelled. ${titleOf(String(active.id))} is back at position ${position(String(active.id))} of ${items.length}.`,
  }
  // dnd-kit moves the cells while sorting; layout animation waits a frame past the drop
  const [sorting, setSorting] = useState(false)
  const settle = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => setSorting(false)))
  const onDragEnd = (e: DragEndEvent) => {
    settle()
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => i.id === e.active.id)
    const to = items.findIndex((i) => i.id === e.over?.id)
    haptic("success")
    onChange(move(items, from, to))
  }
  const canSize = (widget: string, w: number, h: number) => {
    const meta = metaOf(widget)
    return meta
      ? allowedSizes(meta.sizes, cols).some(([aw, ah]) => aw === w && ah === h)
      : false
  }
  const resize = (id: string, w: number, h: number) => {
    const it = items.find((i) => i.id === id)
    const meta = it ? metaOf(it.widget) : undefined
    if (!it || !meta) return
    const [sw, sh] = snapSize(meta.sizes, w, h, cols)
    if (sw === it.w && sh === it.h) return
    haptic("success")
    onChange(items.map((i) => (i.id === id ? { ...i, w: sw, h: sh } : i)))
  }

  return (
    <div
      ref={ref}
      className="mx-auto w-full"
      style={{ maxWidth: MAX_GRID_WIDTH }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setSorting(true)}
        onDragEnd={onDragEnd}
        onDragCancel={settle}
        accessibility={{ announcements }}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={rectSortingStrategy}
        >
          <ol
            aria-label="Home widgets"
            // dragging widgets must not switch tabs (FX-13)
            data-no-swipe={editing || undefined}
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridAutoRows: `${cell}px`,
              gap: GAP[bp],
            }}
          >
            {placed.map((p) => (
              <GridCell
                key={p.id}
                item={p}
                title={metaOf(p.widget)?.title ?? "Widget"}
                editing={editing}
                cellPx={cell + GAP[bp]}
                gapPx={GAP[bp]}
                animateLayout={!sorting}
                canSize={(w, h) => canSize(p.widget, w, h)}
                onRemove={() => onRemove(p.id)}
                onEdit={() => onEdit(p.id)}
                onMenu={onMenu ? () => onMenu(p.id) : undefined}
                onResize={(w, h) => resize(p.id, w, h)}
              >
                {renderWidget(p)}
              </GridCell>
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  )
}

/** how long a press opens the widget menu (iOS: about half a second) */
const LONG_PRESS_MS = 450

function GridCell({
  item,
  title,
  editing,
  cellPx,
  gapPx,
  animateLayout,
  canSize,
  onRemove,
  onEdit,
  onMenu,
  onResize,
  children,
}: {
  item: Placed
  title: string
  editing: boolean
  cellPx: number
  gapPx: number
  /** off while a widget is being dragged: dnd-kit moves the cells then */
  animateLayout: boolean
  canSize: (w: number, h: number) => boolean
  onRemove: () => void
  onEdit: () => void
  onMenu?: () => void
  onResize: (w: number, h: number) => void
  children: ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !editing })
  const start = useRef<{ x: number; y: number } | null>(null)
  // the resize ghost (owner): a box that follows the finger, red over a size the widget can't take
  const [ghost, setGhost] = useState<{ dx: number; dy: number } | null>(null)
  const widthPx = item.w * cellPx - gapPx
  const heightPx = item.h * cellPx - gapPx
  const target = ghost
    ? ([
        Math.max(1, Math.round((widthPx + ghost.dx + gapPx) / cellPx)),
        Math.max(1, Math.round((heightPx + ghost.dy + gapPx) / cellPx)),
      ] as const)
    : null
  const targetOk = target ? canSize(target[0], target[1]) : true
  const lastTarget = useRef("")

  // long press (or right-click) outside edit mode opens the widget menu (owner)
  const press = useRef<{
    x: number
    y: number
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  const pressed = useRef(false)
  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }
  const menuHandlers =
    onMenu && !editing
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === "mouse") return
            endPress()
            pressed.current = false
            press.current = {
              x: e.clientX,
              y: e.clientY,
              timer: setTimeout(() => {
                press.current = null
                pressed.current = true
                haptic("selection")
                onMenu()
              }, LONG_PRESS_MS),
            }
          },
          onPointerMove: (e: React.PointerEvent) => {
            const p = press.current
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8)
              endPress()
          },
          onPointerUp: endPress,
          onPointerCancel: endPress,
          onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault()
            endPress()
            if (!pressed.current) onMenu()
          },
          // the press that opened the menu mustn't also follow the widget's link
          onClickCapture: (e: React.MouseEvent) => {
            if (!pressed.current) return
            pressed.current = false
            e.preventDefault()
            e.stopPropagation()
          },
        }
      : undefined
  useEffect(() => endPress, [])

  return (
    <li
      ref={setNodeRef}
      className={cn(
        "relative min-w-0",
        (isDragging || ghost) && "z-20",
        onMenu && !editing && "select-none [-webkit-touch-callout:none]"
      )}
      style={{
        gridColumn: `${item.x + 1} / span ${item.w}`,
        gridRow: `${item.y + 1} / span ${item.h}`,
        transform: CSS.Transform.toString(
          transform
            ? {
                ...transform,
                scaleX: isDragging ? 1.04 : 1,
                scaleY: isDragging ? 1.04 : 1,
              }
            : null
        ),
        transition,
      }}
      {...menuHandlers}
    >
      {/* the other widgets glide to their new places after a move or resize (owner) */}
      <m.div
        layout={animateLayout ? "position" : false}
        transition={springs.snappy}
        className="h-full"
        // a widget's color (owner): WidgetCard tints itself with it
        style={
          item.color
            ? ({
                "--widget-tint": `var(--tile-${item.color})`,
              } as CSSProperties)
            : undefined
        }
      >
        <div
          className={cn(
            "h-full transition-[filter,opacity] duration-150",
            editing &&
              "motion-safe:animate-[jiggle_0.15s_ease-in-out_infinite_alternate] motion-reduce:rounded-[22px] motion-reduce:outline-2 motion-reduce:outline-ring motion-reduce:outline-dashed",
            ghost && "opacity-70 blur-[3px]"
          )}
          style={
            editing
              ? { animationDelay: `${(item.x * 37 + item.y * 61) % 150}ms` }
              : undefined
          }
        >
          <div className="h-full" inert={editing || undefined}>
            {children}
          </div>
        </div>
      </m.div>
      {ghost && target ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-30 flex items-center justify-center rounded-[22px] border-2 text-headline tabular-nums",
            targetOk
              ? "border-muted-foreground/50 bg-muted-foreground/25 text-foreground"
              : "border-destructive bg-destructive/25 text-destructive"
          )}
          style={{
            width: Math.max(cellPx / 2, widthPx + ghost.dx),
            height: Math.max(cellPx / 2, heightPx + ghost.dy),
          }}
        >
          {target[0]}×{target[1]}
        </div>
      ) : null}
      {editing ? (
        <>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${title}, ${item.w} by ${item.h}`}
            className="absolute inset-0 rounded-[22px]"
          />
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${title}`}
            className="absolute -top-3 -left-3 z-10 flex size-11 items-center justify-center"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-muted-foreground text-background shadow">
              <Minus aria-hidden size={16} />
            </span>
          </button>
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Move ${title}`}
            className="absolute -top-3 -right-3 z-10 flex size-11 touch-none items-center justify-center"
            {...attributes}
            {...listeners}
          >
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-full bg-muted text-foreground shadow"
            >
              ⠿
            </span>
          </button>
          <span
            aria-hidden
            className="absolute -right-2 -bottom-2 z-40 size-11 touch-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              start.current = { x: e.clientX, y: e.clientY }
              lastTarget.current = `${item.w}x${item.h}`
              setGhost({ dx: 0, dy: 0 })
            }}
            onPointerMove={(e) => {
              const s = start.current
              if (!s) return
              const next = { dx: e.clientX - s.x, dy: e.clientY - s.y }
              setGhost(next)
              const tw = Math.max(
                1,
                Math.round((widthPx + next.dx + gapPx) / cellPx)
              )
              const th = Math.max(
                1,
                Math.round((heightPx + next.dy + gapPx) / cellPx)
              )
              const key = `${tw}x${th}`
              if (key !== lastTarget.current) {
                lastTarget.current = key
                haptic(canSize(tw, th) ? "selection" : "warning")
              }
            }}
            onPointerUp={() => {
              start.current = null
              if (target) onResize(target[0], target[1])
              setGhost(null)
            }}
            onPointerCancel={() => {
              start.current = null
              setGhost(null)
            }}
          >
            <span className="absolute right-3 bottom-3 size-4 rounded-br-md border-r-2 border-b-2 border-muted-foreground" />
          </span>
        </>
      ) : null}
    </li>
  )
}
