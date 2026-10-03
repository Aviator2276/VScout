import { Link } from "@tanstack/react-router"
import { FileQuestion } from "@/components/icons/icon"
import { FullPageMessage } from "@/components/layout/full-page-message"

export function RouteNotFound() {
  return (
    <FullPageMessage
      icon={FileQuestion}
      title="Page not found"
      description="This page doesn't exist. It may have moved, or the link is wrong."
    >
      <Link
        to="/"
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 text-body font-medium text-primary-foreground"
      >
        Go Home
      </Link>
    </FullPageMessage>
  )
}
