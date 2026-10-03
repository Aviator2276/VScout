// userSettings: one synced JSON document per user (ADR-033, features/settings.md). Unknown keys
// are kept so an older app never deletes a newer app's settings. homeLayout stays opaque here
// (ADR-074); the home feature parses it.
import { z } from "zod"
import { eventKey, recordId, teamNumber } from "./primitives"

export const notificationSettings = z.looseObject({
  announcements: z.boolean().default(true),
  directMessages: z.boolean().default(true),
  eventChat: z.enum(["off", "mentions", "all"]).default("all"),
  mutedChannelIds: z.array(z.string()).max(50).default([]),
  ourMatchQueue: z.boolean().default(true),
  watchedMatchQueue: z.boolean().default(false),
  matchLeadMinutes: z.number().int().min(2).max(30).default(10),
  /** in-app: our match results (notifications-center.md N2) */
  matchResults: z.boolean().default(true),
})

export const helpSettings = z.looseObject({
  underline: z.enum(["all", "first", "off"]).optional(),
  openWith: z.enum(["long-press", "tap"]).default("long-press"),
  completedGuides: z.array(z.string()).max(100).default([]),
})

export const userSettingsDocument = z.looseObject({
  v: z.literal(1).default(1),
  scouterLevel: z.enum(["new", "experienced"]).default("new"),
  lastActiveEventKey: eventKey.optional(),
  watchedTeams: z.array(teamNumber).max(50).default([]),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  homeLayout: z.unknown().optional(),
  teamListColumns: z.array(z.string()).min(2).max(4).optional(),
  notifications: notificationSettings.default(notificationSettings.parse({})),
  snippets: z.array(z.string().max(60)).max(30).optional(),
  celebrate: z.boolean().default(true),
  /** the tab screens' background (owner); unknown values from a newer app fall back to none */
  /** "none", a gradient name, "shape:<file>" or "custom:<file>" (config/app-backgrounds.ts);
   *  an id this build doesn't know shows no background */
  appBackground: z.string().max(80).default("none").catch("none"),
  dismissedTips: z.array(z.string()).max(100).default([]),
  help: helpSettings.optional(),
})
export type UserSettingsDocument = z.infer<typeof userSettingsDocument>

/** The userSettings record: server meta + the document's keys, flat (http-api-contract §2.5). */
export const wireUserSettings = userSettingsDocument.extend({
  id: recordId, // = userId
  rev: z.number().int().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
  userId: recordId,
})
export type WireUserSettings = z.infer<typeof wireUserSettings>

/** PATCH /me/settings: JSON merge patch of top-level keys. */
export const patchUserSettingsRequest = z.object({
  baseRev: z.number().int().min(0),
  patch: z.record(z.string(), z.unknown()),
})
