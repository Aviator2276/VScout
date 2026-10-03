// A reorderable list (ADR-028, dnd-kit): drag by the handle, or use the row's Move Up / Move Down
// buttons (the non-drag path for VoiceOver and gloves). The list reports moves; the caller writes.
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { ReactNode } from "react"
import { haptic } from "@/lib/haptics"

export interface SortableRenderProps {
  /** spread on the drag handle button */
  handleProps: Record<string, unknown>
  index: number
  dragging: boolean
}

export function SortableList<TItem extends { id: string }>({
  label,
  items,
  disabled = false,
  onMove,
  renderItem,
}: {
  label: string
  items: ReadonlyArray<TItem>
  disabled?: boolean
  onMove: (from: number, to: number) => void
  renderItem: (item: TItem, props: SortableRenderProps) => ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => i.id === e.active.id)
    const to = items.findIndex((i) => i.id === e.over?.id)
    if (from >= 0 && to >= 0) {
      haptic("selection")
      onMove(from, to)
    }
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol aria-label={label} className="flex flex-col gap-2">
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              id={item.id}
              index={index}
              disabled={disabled}
              render={(props) => renderItem(item, props)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({
  id,
  index,
  disabled,
  render,
}: {
  id: string
  index: number
  disabled: boolean
  render: (props: SortableRenderProps) => ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {render({
        handleProps: disabled ? {} : { ...attributes, ...listeners },
        index,
        dragging: isDragging,
      })}
    </li>
  )
}
