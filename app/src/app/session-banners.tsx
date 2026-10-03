// The banners that stay under every page's nav bar while signed in (notifications-center.md N4):
// offline, and the update banners that need attention (forced, updated in another window).
// "Sign in again", "sign-in expiring" and "update ready" are System notifications now.
import { OfflineBanner } from "@/components/layout/offline-banner"
import { AppUpdateBanner } from "./update-runtime"

export function SessionBanners() {
  return (
    <>
      <OfflineBanner />
      <AppUpdateBanner />
    </>
  )
}
