// Back (routing-auth §9.6): history back when there is in-app history, otherwise the logical
// parent (a cold deep link from a notification has nothing to go back to).
import { useCanGoBack, useRouter } from "@tanstack/react-router"
import { ChevronLeft } from "@/components/icons/icon"

export function NavBackButton({
  parentHref,
  label = "Back",
}: {
  parentHref: string
  label?: string
}) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return (
    <button
      type="button"
      onClick={() =>
        canGoBack
          ? router.history.back()
          : void router.navigate({ href: parentHref, replace: true })
      }
      className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-2 text-body text-primary"
    >
      <ChevronLeft aria-hidden size={24} />
      {label}
    </button>
  )
}
