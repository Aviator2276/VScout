import { createFileRoute, redirect } from "@tanstack/react-router"

// Moved to the Messages tab (FX-14). Kept so old links and push notifications still land.
export const Route = createFileRoute(
  "/_authed/_event/_tabs/scout/messages/$channelId"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/messages/$channelId",
      params: { channelId: params.channelId },
      replace: true,
    })
  },
})
