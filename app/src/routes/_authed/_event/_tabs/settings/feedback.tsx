import { createFileRoute, notFound } from "@tanstack/react-router"
import { useState } from "react"
import { WifiOff } from "@/components/icons/icon"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { APP_VERSION } from "@/config/version"
import { FEEDBACK_ENABLED, FEEDBACK_FORM_URL } from "@/config/feedback"
import { useOnline } from "@/hooks/use-online"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/feedback")(
  {
    beforeLoad: () => {
      // alpha and beta builds only: a release build at a live event never loads the form
      if (!FEEDBACK_ENABLED) throw notFound()
    },
    component: Feedback,
  }
)

// Settings → Send Feedback (testing builds): the owner's Google Form, embedded. It loads only when
// this page opens, and needs a connection.
function Feedback() {
  const online = useOnline()
  const [loaded, setLoaded] = useState(false)
  return (
    <StackPage
      title="Send Feedback"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <p className="mt-2 mb-3 text-subhead text-muted-foreground">
        Tell us what broke or what could be better. You’re on VScout{" "}
        {APP_VERSION}.
      </p>
      {online ? (
        <div className="relative overflow-hidden rounded-2xl bg-white">
          {loaded ? null : (
            <p
              role="status"
              className="absolute inset-x-0 top-8 text-center text-muted-foreground"
            >
              Loading the form…
            </p>
          )}
          <iframe
            src={FEEDBACK_FORM_URL}
            title="VScout feedback form"
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="block h-[1526px] w-full border-0"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <WifiOff aria-hidden size={32} className="text-muted-foreground" />
          <p className="text-body">Connect to send feedback.</p>
        </div>
      )}
    </StackPage>
  )
}
