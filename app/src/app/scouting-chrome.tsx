// What every scouting route shares (app layer: it composes features). The close button keeps the
// draft (nothing is ever unsaved), the toast after submit says whether it synced, and the "what
// next" actions lead back into scouting or out of it.
import { useNavigate, useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Button } from "@/components/controls/button"
import { X } from "@/components/icons/icon"
import { StackPage } from "@/components/layout/stack-page"
import { useToast } from "@/components/overlays/toaster"
import { usePrefs } from "@/hooks/use-prefs"
import { useUpdateBlocker } from "@/hooks/use-update-blocker"

export function ScoutingPage({
  title,
  parentHref,
  children,
}: {
  title: string
  parentHref: string
  children: ReactNode
}) {
  const router = useRouter()
  return (
    <StackPage
      title={title}
      titleMode="inline"
      leading={
        <button
          type="button"
          aria-label="Close"
          onClick={() =>
            router.history.canGoBack()
              ? router.history.back()
              : void router.navigate({ href: parentHref, replace: true })
          }
          className="-ms-2 inline-flex size-11 items-center justify-center rounded-full text-primary"
        >
          <X aria-hidden size={24} />
        </button>
      }
    >
      {children}
    </StackPage>
  )
}

/** Submit feedback and the next-action sheet's buttons. */
export function useScoutingFinish(parentHref: string) {
  const toast = useToast()
  const navigate = useNavigate()
  const { scouterLevel } = usePrefs()
  // an app update never interrupts a form (pwa-offline §7)
  useUpdateBlocker(true)
  return {
    level: scouterLevel,
    onSubmitted: ({ online }: { online: boolean }) =>
      toast.show({ title: online ? "Saved" : "Saved · will sync when online" }),
    nextActions: (close: () => void) => (
      <>
        <Button
          size="large"
          onClick={() => {
            close()
            void navigate({ to: "/scout/needs-scouting", replace: true })
          }}
        >
          Scout Another Robot
        </Button>
        <Button
          size="large"
          variant="secondary"
          onClick={() => {
            close()
            void navigate({ href: parentHref, replace: true })
          }}
        >
          Done
        </Button>
      </>
    ),
  }
}
