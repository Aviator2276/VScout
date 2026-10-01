// Renders children only when the session may perform the action (routing-auth §8.3).
// Hide what a role can never do; pass a fallback (e.g. a disabled control with a reason) otherwise.
import type { ReactNode } from "react"
import { can } from "@/lib/authorization"
import type {
  Permission,
  PolicyPermission,
  ResourceFor,
} from "@/lib/authorization"
import type { Session } from "@/lib/auth/types"

type CanProps<TPermission extends Permission> = {
  session: Session | null
  permission: TPermission
  fallback?: ReactNode
  children: ReactNode
} & (TPermission extends PolicyPermission
  ? { resource: ResourceFor<TPermission> }
  : { resource?: undefined })

export function Can<TPermission extends Permission>(
  props: CanProps<TPermission>
) {
  const allowed = (
    can as (s: Session | null, p: Permission, r?: unknown) => boolean
  )(props.session, props.permission, props.resource)
  return <>{allowed ? props.children : (props.fallback ?? null)}</>
}
