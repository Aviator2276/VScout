import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { getAppRuntime } from "@/app/app-runtime"
import type { RouterContext } from "@/app/router-context"
import { RouteError } from "@/components/errors/route-error"
import { RouteNotFound } from "@/components/errors/route-not-found"
import { RoutePending } from "@/components/layout/route-pending"
import { activeGame } from "@/config/game"
import { getTabMemory, navTransitionTypes } from "@/stores/tab-memory"
import { routeTree } from "./routeTree.gen"

// Called in Node for the shell prerender too: the context is lazy (routing-auth §3).
export function getRouter() {
  const context: RouterContext = { app: getAppRuntime, game: activeGame }
  const router = createTanStackRouter({
    routeTree,
    context,
    defaultPreload: "intent",
    // loaders are cheap Dexie reads; Dexie is the cache
    defaultPreloadStaleTime: 0,
    // every page's code is preloaded after launch (TabShell): the old page stays up until the new
    // one is ready, and the full-page skeleton only appears for a really slow load
    defaultPendingMs: 800,
    defaultPendingMinMs: 300,
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: RouteNotFound,
    scrollRestoration: true,
    getScrollRestorationKey: (l) => l.pathname,
    // Page slides (FX-13, ui-design-system §10.1 fallback): the router starts the view transition
    // and tags it nav-forward/nav-back/tab-forward/tab-back; styles.css animates the root by type.
    // Computed from the tab stacks, so Back links and the browser's back slide the right way too.
    defaultViewTransition: {
      types: ({ fromLocation, toLocation }) =>
        navTransitionTypes(getTabMemory(), fromLocation, toLocation),
    },
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
