// Back (routing-auth §9.6, FX-10): within a tab, the previous page of that tab's own stack, never a
// page from another tab visited in between. With nothing in the stack (a cold deep link from a
// notification), the logical parent. Pages outside the tabs (scouting) use browser history.
import { useRouter } from "@tanstack/react-router"
import { ChevronLeft } from "@/components/icons/icon"
import { navigateBack } from "./navigate-back"

export function NavBackButton({
  parentHref,
  label = "Back",
}: {
  parentHref: string
  label?: string
}) {
  const router = useRouter()
  const back = () => navigateBack(router, parentHref)
  return (
    <button
      type="button"
      onClick={back}
      className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-2 text-body text-primary active:opacity-60"
    >
      <ChevronLeft aria-hidden size={24} />
      {label}
    </button>
  )
}
