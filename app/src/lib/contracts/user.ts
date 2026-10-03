// User directory entry and the signed-in user (http-api-contract §2).
import { z } from "zod"
import { recordId, role, teamNumber, wireServerMeta } from "./primitives"

export const authUser = z.looseObject({
  id: recordId,
  username: z.string().nullable(), // null for guests
  displayName: z.string().min(1),
  role,
  teamNumber: teamNumber.nullable().optional(),
})
export type WireAuthUser = z.infer<typeof authUser>

/** `user` entity in the change log (directory; guests aren't listed). */
export const wireUser = z.looseObject({
  ...wireServerMeta,
  username: z.string(),
  displayName: z.string().min(1),
  role,
  active: z.boolean().default(true),
  teamNumber: teamNumber.nullable().optional(),
})
export type WireUser = z.infer<typeof wireUser>
