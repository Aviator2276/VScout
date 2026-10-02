// RBAC in components (routing-auth §8.3). UX only: the server re-checks every request.
import { can } from "@/lib/authorization"
import type {
  Permission,
  PolicyPermission,
  ResourceFor,
} from "@/lib/authorization"
import type { Session } from "@/lib/auth/types"

export function useCan<TPermission extends Permission>(
  session: Session | null,
  permission: TPermission,
  ...resource: TPermission extends PolicyPermission
    ? [ResourceFor<TPermission>]
    : []
): boolean {
  return can(session, permission, ...resource)
}
