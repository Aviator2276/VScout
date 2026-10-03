// Send Feedback (owner, FX-32): the testers' Google Form in a sheet, reachable from Settings and
// from a small button in the nav bar of every tab screen. Testing builds only (FEEDBACK_ENABLED):
// release candidates and stable builds, which run at live events, never show or load it.
import { createContext, use, useState } from "react"
import type { ReactNode } from "react"
import { MessageSquareText, WifiOff } from "@/components/icons/icon"
import { Sheet } from "@/components/overlays/sheet"
import { FEEDBACK_ENABLED, FEEDBACK_FORM_URL } from "@/config/feedback"
import { APP_VERSION } from "@/config/version"
import { useOnline } from "@/hooks/use-online"

interface FeedbackContext {
  open: () => void
}

const Ctx = createContext<FeedbackContext | null>(null)

/** null in release builds (no feedback) or outside the provider. */
export function useFeedback(): FeedbackContext | null {
  return use(Ctx)
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (!FEEDBACK_ENABLED) return children
  return (
    <Ctx value={{ open: () => setOpen(true) }}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <Sheet.Content
          title="Send Feedback"
          description={`VScout ${APP_VERSION}`}
          detent="large"
          closeLabel="Done"
        >
          {/* the form only loads while the sheet is open */}
          {open ? <FeedbackForm /> : null}
        </Sheet.Content>
      </Sheet>
    </Ctx>
  )
}

export function FeedbackForm() {
  const online = useOnline()
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-subhead text-muted-foreground">
        Tell us what broke or what could be better.
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
            onLoad={() => setLoaded(true)}
            // sized to the screen so the form scrolls inside itself: a touch on an iframe goes
            // to the iframe, so a 1,500 px frame inside a scrolling sheet couldn't scroll on iOS
            className="block h-[calc(100dvh-13rem)] w-full border-0"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <WifiOff aria-hidden size={32} className="text-muted-foreground" />
          <p className="text-body">Connect to send feedback.</p>
        </div>
      )}
    </div>
  )
}

/** The nav-bar button (tab roots), beside Help and the bell. */
export function FeedbackButton() {
  const feedback = useFeedback()
  if (!feedback) return null
  return (
    <button
      type="button"
      aria-label="Send Feedback"
      onClick={feedback.open}
      className="hit-44 inline-flex size-9 items-center justify-center rounded-full glass-button text-primary transition-[scale] active:scale-90"
    >
      <MessageSquareText aria-hidden size={22} />
    </button>
  )
}
