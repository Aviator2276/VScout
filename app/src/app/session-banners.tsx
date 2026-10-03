// The banners that stay under every page's nav bar while signed in (notifications-center.md N4): the
// update banners that need attention (forced, updated in another window). Offline is the Sync Status
// notch's job now (features/sync-status.md, ADR-079).
// "Sign in again", "sign-in expiring" and "update ready" are System notifications now.
import { AppUpdateBanner } from "./update-runtime"

export function SessionBanners() {
  return (
    <>
      <AppUpdateBanner />
    </>
  )
}
