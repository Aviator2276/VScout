// The conflict picked in the Sync details. The tooltip closes when the sheet opens (one overlay at a
// time), so the sheet lives at the app level and reads this.
import { createStore } from "@/lib/mqtt/external-store"
import type { ConflictView } from "@/lib/sync/conflict-view"

export const conflictStore = createStore<ConflictView | null>(null)
