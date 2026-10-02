// List rows link through the router (no full reload) while staying real links (long-press, new tab).
import { useRouter } from "@tanstack/react-router"
import type { MouseEvent } from "react"
import type { LinkRenderProps } from "@/components/list/list"

export function RouterAnchor({ href, className, children }: LinkRenderProps) {
  const router = useRouter()
  // other sites open in a new tab (an installed PWA would otherwise leave the app)
  if (/^https?:\/\//.test(href))
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return
    e.preventDefault()
    void router.navigate({ href })
  }
  return (
    <a href={href} className={className} onClick={click}>
      {children}
    </a>
  )
}

export const renderRouterLink = (props: LinkRenderProps) => (
  <RouterAnchor {...props} />
)
