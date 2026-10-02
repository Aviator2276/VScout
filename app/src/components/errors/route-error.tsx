// The router's default error view (routing-auth §12): no access, unsupported season, or a generic
// failure with Try Again. Never shows raw error text.
import { useRouter } from "@tanstack/react-router"
import type { ErrorComponentProps } from "@tanstack/react-router"
import { useEffect } from "react"
import { Button } from "@/components/controls/button"
import { CircleAlert, Lock, ArrowUpCircle } from "@/components/icons/icon"
import { FullPageMessage } from "@/components/layout/full-page-message"
import { ForbiddenError } from "@/lib/authorization"
import { logger } from "@/lib/logger"
import { UnsupportedSeasonError } from "./app-errors"

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter()
  const home = () => void router.navigate({ to: "/" })

  useEffect(() => {
    if (!(error instanceof ForbiddenError))
      logger.error("route", "render failed", { error: String(error) })
  }, [error])

  if (error instanceof ForbiddenError)
    return (
      <FullPageMessage
        icon={Lock}
        title="You don't have access"
        description="Your role can't open this page. Ask an admin if you need it."
      >
        <Button onClick={home}>Go Home</Button>
      </FullPageMessage>
    )
  if (error instanceof UnsupportedSeasonError)
    return (
      <FullPageMessage
        icon={ArrowUpCircle}
        title={`This version doesn't support ${error.year}`}
        description="Update VScout to scout this event, or pick another event."
      >
        <Button onClick={() => location.reload()}>Update App</Button>
        <Button
          variant="plain"
          onClick={() => void router.navigate({ to: "/onboarding" })}
        >
          Pick Another Event
        </Button>
      </FullPageMessage>
    )
  return (
    <FullPageMessage
      icon={CircleAlert}
      title="Something went wrong"
      description="This page couldn't load. Try again, or go back to Home."
    >
      <Button onClick={() => void router.invalidate()}>Try Again</Button>
      <Button variant="plain" onClick={home}>
        Go Home
      </Button>
    </FullPageMessage>
  )
}
