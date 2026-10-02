// /login search params (routing-auth §6). The redirect is cleaned here, so routes can trust it.
import { z } from "zod"
import { safeRedirect } from "@/utils/safe-redirect"

export const loginSearch = z.object({
  redirect: z
    .string()
    .optional()
    .transform((v) => (v ? safeRedirect(v) : undefined))
    .catch(undefined),
  /** "Sign in again": prefill the username */
  reauth: z.boolean().optional().catch(undefined),
  /** the guest code field is open */
  guest: z.boolean().optional().catch(undefined),
  /** why the last session ended (forced logout, revoked guest access) */
  reason: z.string().max(64).optional().catch(undefined),
})
export type LoginSearch = z.infer<typeof loginSearch>
