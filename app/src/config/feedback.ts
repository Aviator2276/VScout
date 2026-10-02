// The testers' feedback form (owner, 2026-10-02). Shown only in alpha and beta builds: release
// candidates and stable releases are what runs at live events, and they never load it.
import { releaseChannel } from "@/utils/semver"
import { APP_VERSION } from "./version"

export const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSc2Uk9H3sGMWZiE8vspiSo9a5ryIlEnX110LetNSlTqcv3oDg/viewform?embedded=true"

export const FEEDBACK_ENABLED = ["alpha", "beta"].includes(
  releaseChannel(APP_VERSION)
)
