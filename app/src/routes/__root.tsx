import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import appCss from "../styles.css?url"
import { z } from "zod"
import { AppProviders } from "@/app/app-providers"
import { HelpRuntime } from "@/app/help-runtime"
import { UpdateRuntime } from "@/app/update-runtime"
import type { RouterContext } from "@/app/router-context"
import { RouteNotFound } from "@/components/errors/route-not-found"
import { SplashScreen, useHideSplash } from "@/components/layout/splash-screen"
import { PREPAINT_SCRIPT } from "@/lib/theme"

export const Route = createRootRouteWithContext<RouterContext>()({
  // the Help panel on any page (routing-auth §2.4): glossary, guides, term:<id>, guide:<id>
  validateSearch: z.object({
    help: z.string().max(80).optional().catch(undefined),
  }),
  head: () => ({
    // Static only: the root route is prerendered in Node at build time (routing-auth §1).
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "VScout" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "VScout" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      {
        rel: "icon",
        href: "/icons/favicon-32.png",
        type: "image/png",
        sizes: "32x32",
      },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon-180.png" },
    ],
  }),
  notFoundComponent: RouteNotFound,
  component: Root,
  shellComponent: RootDocument,
})

// No I/O here: the root renders in Node for the shell prerender (routing-auth §1).
function Root() {
  const { app } = Route.useRouteContext()
  useHideSplash()
  return (
    <AppProviders>
      <UpdateRuntime app={app}>
        <HelpRuntime>
          <Outlet />
        </HelpRuntime>
      </UpdateRuntime>
    </AppProviders>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="k-ios" suppressHydrationWarning>
      <head>
        {/* sets .dark before first paint from the saved theme (lib/theme.ts) */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
        <HeadContent />
        {/* Written here, not in head(): head() dedupes meta by name and would drop one */}
        <meta
          name="theme-color"
          content="#ffffff"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#0a0a0a"
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body>
        <SplashScreen />
        {children}
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
