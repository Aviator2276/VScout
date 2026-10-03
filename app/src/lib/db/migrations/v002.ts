// Dexie schema version 2 (FX-16, features/notifications-center.md N1). FROZEN once shipped.
// Only the tables this version adds or changes; the rest carry over from v001.
export const stores = {
  // device-only in-app notifications: dedupe by key, newest first
  notifications: "id, &key, createdAt",
} as const
