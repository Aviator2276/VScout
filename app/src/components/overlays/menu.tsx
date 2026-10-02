// iOS pull-down menu (HIG Menus) on Base UI Menu: a toolbar button that opens grouped choices, with
// a checkmark on the option in effect. Single-choice groups only (sort key, sort direction).
import { Menu as BaseMenu } from "@base-ui/react/menu"
import type { ReactNode } from "react"
import { Check } from "@/components/icons/icon"
import { haptic } from "@/lib/haptics"

export interface MenuChoice<TValue extends string> {
  value: TValue
  label: string
}

export interface MenuGroup<TValue extends string> {
  /** visible group heading; omit for an untitled group */
  label?: string
  /** accessible name of the group when it has no visible heading */
  name: string
  options: ReadonlyArray<MenuChoice<TValue>>
  value: TValue
  onValueChange: (value: TValue) => void
}

export interface PullDownMenuProps {
  /** the trigger's accessible name ("Sort") */
  label: string
  /** the trigger's visible content (an icon) */
  trigger: ReactNode
  /** build each with menuGroup() so groups of different value types can share one menu */
  groups: ReadonlyArray<MenuGroup<string>>
}

/** Erases a group's value type (the menu only passes values back that came from its options). */
export function menuGroup<TValue extends string>(
  group: MenuGroup<TValue>
): MenuGroup<string> {
  return group as unknown as MenuGroup<string>
}

export function PullDownMenu({ label, trigger, groups }: PullDownMenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label={label}
        className="inline-flex size-11 items-center justify-center rounded-full text-primary active:opacity-60"
      >
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="bottom" align="end" sideOffset={4}>
          <BaseMenu.Popup className="max-h-[70dvh] min-w-56 overflow-y-auto rounded-2xl bg-popover py-1 text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            {groups.map((g, i) => (
              <BaseMenu.Group
                key={g.name}
                aria-label={g.label ? undefined : g.name}
              >
                {i > 0 ? (
                  <BaseMenu.Separator className="my-1 h-px bg-border" />
                ) : null}
                {g.label ? (
                  <BaseMenu.GroupLabel className="px-4 pt-2 pb-1 text-footnote text-muted-foreground">
                    {g.label}
                  </BaseMenu.GroupLabel>
                ) : null}
                <BaseMenu.RadioGroup
                  value={g.value}
                  onValueChange={(v: unknown) => {
                    haptic("selection")
                    g.onValueChange(String(v))
                  }}
                >
                  {g.options.map((o) => (
                    <BaseMenu.RadioItem
                      key={o.value}
                      value={o.value}
                      closeOnClick
                      className="flex min-h-11 cursor-default items-center gap-2 px-4 text-body outline-none select-none data-[highlighted]:bg-muted"
                    >
                      <span className="flex w-5 justify-center">
                        <BaseMenu.RadioItemIndicator>
                          <Check aria-hidden size={18} />
                        </BaseMenu.RadioItemIndicator>
                      </span>
                      {o.label}
                    </BaseMenu.RadioItem>
                  ))}
                </BaseMenu.RadioGroup>
              </BaseMenu.Group>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export interface MenuAction {
  label: string
  onSelect: () => void
  destructive?: boolean
}

/** A "⋯" menu of commands (HIG Menus: "More" holds secondary actions). */
export function ActionMenu({
  label = "More",
  trigger,
  actions,
}: {
  label?: string
  trigger: ReactNode
  actions: ReadonlyArray<MenuAction>
}) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label={label}
        className="inline-flex size-11 items-center justify-center rounded-full text-primary active:opacity-60"
      >
        {trigger}
      </BaseMenu.Trigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner side="bottom" align="end" sideOffset={4}>
          <BaseMenu.Popup className="min-w-56 rounded-2xl bg-popover py-1 text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none">
            {actions.map((a) => (
              <BaseMenu.Item
                key={a.label}
                onClick={a.onSelect}
                className={
                  a.destructive
                    ? "flex min-h-11 items-center px-4 text-body text-destructive outline-none data-[highlighted]:bg-muted"
                    : "flex min-h-11 items-center px-4 text-body outline-none data-[highlighted]:bg-muted"
                }
              >
                {a.label}
              </BaseMenu.Item>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}
