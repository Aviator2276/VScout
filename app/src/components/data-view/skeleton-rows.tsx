// Placeholder rows shaped like the list that's loading (data-states.md: skeletons for lists).
// Decorative: DataView's loading slot carries the live label.
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function SkeletonRows({
  rows,
  rowClassName,
}: {
  rows: number
  rowClassName?: string
}) {
  return (
    <div className="flex flex-col gap-2 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-11 w-full rounded-xl", rowClassName)}
        />
      ))}
    </div>
  )
}
