// Client RBAC, UX only (ADR-003, routing-auth §8): the server re-authorizes every request.
// Hide what a role can never do; disable (with a reason) what's temporarily unavailable.
import type { Role, Session } from "@/lib/auth/types"

export const PERMISSIONS = [
  "event:read",
  "event:select",
  "event:manage",
  "scouting:read",
  "scouting:create",
  "scouting:update",
  "scouting:delete",
  "comment:read",
  "comment:create",
  "comment:update",
  "comment:delete",
  "picklist:read",
  "picklist:create",
  "picklist:update",
  "picklist:delete",
  "picklist:follow",
  "alliance-board:record",
  "alliance-board:lock",
  "alliance-board:undo-any",
  "alliance-sim:use",
  "strategy:read",
  "announcement:read",
  "message:read",
  "message:send",
  "dm:use",
  "message:delete",
  "reaction:create",
  "reaction:delete",
  "announcement:create",
  "announcement:manage",
  "settings:update-own",
  "team-settings:manage",
  "media:download",
  "admin:access",
  "user:manage",
] as const
export type Permission = (typeof PERMISSIONS)[number]

const READ_ALL: ReadonlyArray<Permission> = [
  "event:read",
  "event:select",
  "scouting:read",
  "comment:read",
  "picklist:read",
  "alliance-sim:use",
  "strategy:read",
  "announcement:read",
  "media:download",
]
/** ADR-066: read event data (no chat, no DMs), react to announcements, prefs device-only */
const GUEST: ReadonlyArray<Permission> = [
  ...READ_ALL,
  "reaction:create",
  "reaction:delete",
]
const SCOUTER: ReadonlyArray<Permission> = [
  ...READ_ALL,
  "message:read",
  "reaction:create",
  "reaction:delete",
  "scouting:create",
  "scouting:update",
  "scouting:delete",
  "comment:create",
  "comment:update",
  "comment:delete",
  "picklist:create",
  "picklist:update",
  "picklist:delete",
  "alliance-board:record",
  "message:send",
  "dm:use",
  "message:delete",
  "settings:update-own",
]

export const ROLE_PERMISSIONS: Record<Role, ReadonlyArray<Permission>> = {
  admin: PERMISSIONS,
  scouter: SCOUTER,
  guest: GUEST,
}

type Who = Pick<Session, "userId" | "role">
type Owned = { authorId: string }

const isOwnerOrAdmin = (s: Who, r: Owned) =>
  s.role === "admin" || r.authorId === s.userId
/** private notes are the author's only, admins included (ADR-040, LQ-2) */
const canReadComment = (
  s: Who,
  r: Owned & { visibility: "team" | "private" }
) => r.visibility === "team" || r.authorId === s.userId
/** admins can't read other people's DMs (R2-6) */
const isParticipant = (s: Who, r: { participantIds: ReadonlyArray<string> }) =>
  r.participantIds.includes(s.userId)
const canRecordOnBoard = (s: Who, b: { locked: boolean }) =>
  !b.locked || s.role === "admin"
/** the caller has already checked read access to the target (ADR-073) */
const canReact = (s: Who, t: { targetType: "announcement" | "message" }) =>
  s.role !== "guest" || t.targetType === "announcement"
/** admins may moderate, but never touch reactions inside a DM */
const isOwnReaction = (s: Who, r: Owned & { inDm: boolean }) =>
  r.authorId === s.userId || (s.role === "admin" && !r.inDm)

export const POLICIES = {
  "scouting:update": isOwnerOrAdmin,
  "scouting:delete": isOwnerOrAdmin,
  "comment:read": canReadComment,
  "comment:update": isOwnerOrAdmin,
  "comment:delete": isOwnerOrAdmin,
  "picklist:update": isOwnerOrAdmin,
  "picklist:delete": isOwnerOrAdmin,
  "message:delete": isOwnerOrAdmin,
  "dm:use": isParticipant,
  "alliance-board:record": canRecordOnBoard,
  "reaction:create": canReact,
  "reaction:delete": isOwnReaction,
} as const

export type PolicyPermission = keyof typeof POLICIES
export type ResourceFor<TPermission extends Permission> =
  TPermission extends PolicyPermission
    ? Parameters<(typeof POLICIES)[TPermission]>[1]
    : undefined

/** A permission with a policy REQUIRES its resource. */
export function can<TPermission extends Permission>(
  session: Who | null,
  permission: TPermission,
  ...resource: TPermission extends PolicyPermission
    ? [ResourceFor<TPermission>]
    : []
): boolean {
  if (!session) return false
  if (!ROLE_PERMISSIONS[session.role].includes(permission)) return false
  const policy = (
    POLICIES as Partial<Record<Permission, (s: Who, r: never) => boolean>>
  )[permission]
  return policy ? policy(session, resource[0] as never) : true
}

export class ForbiddenError extends Error {
  readonly permission: Permission
  constructor(permission: Permission) {
    super(`Forbidden: ${permission}`)
    this.name = "ForbiddenError"
    this.permission = permission
  }
}

/** Route guards check role-level permissions only (no resource is loaded yet). */
export function requirePermission(
  session: Who,
  permission: Exclude<Permission, PolicyPermission>
): void {
  if (!can(session, permission)) throw new ForbiddenError(permission)
}
