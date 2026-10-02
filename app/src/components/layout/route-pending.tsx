// The router's pending view (routing-auth §12): a large-title skeleton after 150 ms.
import { Skeleton } from "@/components/ui/skeleton"

export function RoutePending() {
  return (
    <main
      aria-busy="true"
      className="min-h-dvh pt-[calc(var(--k-safe-area-top)+44px)] px-safe-4"
    >
      <p className="sr-only" role="status">
        Loading…
      </p>
      <Skeleton className="mt-1 h-10 w-48 rounded-lg" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </main>
  )
}
