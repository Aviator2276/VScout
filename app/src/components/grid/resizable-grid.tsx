// The Home grid (features/home.md H2–H3, ADR-067/075): square cells, 4/6/8 columns by container
// width, iOS-style flow (list order = position = reading order). In edit mode each widget gets a
// remove badge, a move handle (dnd-kit, no hold, keyboard too), a resize corner that snaps to allowed
// sizes, and a body button that opens the Edit Widget sheet (the accessible path for everything).
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Minus } from "@/components/icons/icon"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import type { WidgetSizes } from "@/types/widget"
import {
  COLUMNS,
  GAP,
  MAX_GRID_WIDTH,
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
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => i.id === e.active.id)
    const to = items.findIndex((i) => i.id === e.over?.id)
    haptic("success")
    onChange(move(items, from, to))
  }
  const resize = (id: string, w: number, h: number) => {
    const it = items.find((i) => i.id === id)
    const meta = it ? metaOf(it.widget) : undefined
    if (!it || !meta) return
    const [sw, sh] = snapSize(meta.sizes, w, h, cols)
    if (sw === it.w && sh === it.h) return
    haptic("selection")
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
        onDragEnd={onDragEnd}
        accessibility={{ announcements }}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={rectSortingStrategy}
        >
          <ol
            aria-label="Home widgets"
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
                onRemove={() => onRemove(p.id)}
                onEdit={() => onEdit(p.id)}
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

function GridCell({
  item,
  title,
  editing,
  cellPx,
  onRemove,
  onEdit,
  onResize,
  children,
}: {
  item: Placed
  title: string
  editing: boolean
  cellPx: number
  onRemove: () => void
  onEdit: () => void
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
  const start = useRef<{ x: number; y: number; w: number; h: number } | null>(
    null
  )
  return (
    <li
      ref={setNodeRef}
      className={cn("relative min-w-0", isDragging && "z-20")}
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
    >
      <div
        className={cn(
          "h-full",
          editing &&
            "motion-safe:animate-[jiggle_0.28s_ease-in-out_infinite_alternate] motion-reduce:rounded-[22px] motion-reduce:outline-2 motion-reduce:outline-ring motion-reduce:outline-dashed"
        )}
        style={
          editing
            ? { animationDelay: `${(item.x * 37 + item.y * 61) % 280}ms` }
            : undefined
        }
      >
        <div className="h-full" inert={editing || undefined}>
          {children}
        </div>
      </div>
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
            className="absolute -right-2 -bottom-2 z-10 size-11 touch-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              start.current = {
                x: e.clientX,
                y: e.clientY,
                w: item.w,
                h: item.h,
              }
            }}
            onPointerMove={(e) => {
              const s = start.current
              if (!s) return
              onResize(
                Math.max(1, s.w + Math.round((e.clientX - s.x) / cellPx)),
                Math.max(1, s.h + Math.round((e.clientY - s.y) / cellPx))
              )
            }}
            onPointerUp={() => {
              start.current = null
            }}
          >
            <span className="absolute right-3 bottom-3 size-4 rounded-br-md border-r-2 border-b-2 border-muted-foreground" />
          </span>
        </>
      ) : null}
    </li>
  )
}
