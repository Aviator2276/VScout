// One Sync sheet for the whole app: every page's notch opens the same one (two pages can be mounted
// during a transition, and HIG allows one sheet at a time).
import { createStore } from "@/lib/mqtt/external-store"

export const syncSheetStore = createStore(false)
