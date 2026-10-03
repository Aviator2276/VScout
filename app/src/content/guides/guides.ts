// Bundled guides (features/glossary-help.md §6). Each guide is code-split as raw markdown.
import type { GuideMeta } from "@/types/glossary"

export const coreGuides: ReadonlyArray<GuideMeta> = [
  {
    id: "first-match",
    title: "Scouting your first match",
    summary: "From picking a robot to submitting your entry.",
    audience: "new",
    load: () => import("./first-match.md?raw"),
  },
  {
    id: "pit-scouting",
    title: "Pit scouting",
    summary: "Asking teams about their robots before matches.",
    audience: "new",
    load: () => import("./pit-scouting.md?raw"),
  },
  {
    id: "picklists",
    title: "Building a picklist",
    summary: "Ranking teams for alliance selection.",
    audience: "all",
    load: () => import("./picklists.md?raw"),
  },
  {
    id: "offline",
    title: "Working offline",
    summary: "How your entries are saved and synced.",
    audience: "all",
    load: () => import("./offline.md?raw"),
  },
  {
    id: "install-iphone",
    title: "Installing on iPhone",
    summary: "Add VScout to your Home Screen.",
    audience: "all",
    load: () => import("./install-iphone.md?raw"),
  },
  {
    id: "sign-in",
    title: "Signing in",
    summary: "Accounts, guests and forgotten passwords.",
    audience: "all",
    load: () => import("./sign-in.md?raw"),
  },
]
