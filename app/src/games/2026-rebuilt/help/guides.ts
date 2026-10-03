// Season guides (features/glossary-help.md §6), merged after the core guides in the Help panel.
import type { GuideMeta } from "@/types/glossary"

export const guides: ReadonlyArray<GuideMeta> = [
  {
    id: "watching-a-match",
    title: "Watching a 2026 match",
    summary: "What to look for in auto, each shift and the end game.",
    audience: "new",
    load: () => import("./guides/watching-a-match.md?raw"),
  },
]
