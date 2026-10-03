import { createFileRoute, notFound } from "@tanstack/react-router"
import { NavBackButton } from "@/components/layout/nav-back-button"
import { StackPage } from "@/components/layout/stack-page"
import { FEEDBACK_ENABLED } from "@/config/feedback"
import { FeedbackForm } from "@/features/feedback/components/feedback-sheet"

export const Route = createFileRoute("/_authed/_event/_tabs/settings/feedback")(
  {
    beforeLoad: () => {
      // alpha and beta builds only: a release build at a live event never loads the form
      if (!FEEDBACK_ENABLED) throw notFound()
    },
    component: Feedback,
  }
)

// Kept for old links; Send Feedback opens a sheet from Settings and the nav bar (FX-32).
function Feedback() {
  return (
    <StackPage
      title="Send Feedback"
      leading={<NavBackButton parentHref="/settings" label="Settings" />}
    >
      <FeedbackForm />
    </StackPage>
  )
}
