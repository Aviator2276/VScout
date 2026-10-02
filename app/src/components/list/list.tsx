// iOS inset-grouped lists (Konsta draws them; ui-design-system §2). Compound: <List.Section>,
// <List.Row>, <List.Toggle>. Rows that navigate use the link component from LinkContext, which the
// app shell sets to the router's <Link>, so this file doesn't depend on the router.
import { List as KList, ListItem } from "konsta/react"
import { createContext, use } from "react"
import type { ReactNode } from "react"
import { Switch } from "@/components/controls/switch"
import { ChevronRight } from "@/components/icons/icon"
import { cn } from "@/lib/utils"

/** The app shell provides the router Link; tests and the gallery fall back to <a>. */
export interface LinkRenderProps {
  href: string
  className: string
  children: ReactNode
}

/** How rows render a navigation link. The app shell supplies the router <Link>. */
export const ListLinkContext = createContext<
  (props: LinkRenderProps) => ReactNode
>((props) => (
  <a href={props.href} className={props.className}>
    {props.children}
  </a>
))

const ROW_COLORS = {
  primaryTextIos: "text-foreground",
  secondaryTextIos: "text-muted-foreground",
  activeBgIos: "active:bg-muted",
}

function Section({
  title,
  footer,
  children,
}: {
  title?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-6 first:mt-2">
      {title ? (
        <h2 className="mb-1.5 px-4 text-footnote text-muted-foreground uppercase">
          {title}
        </h2>
      ) : null}
      {/* the page already has its side padding: the card lines up with the large title */}
      <KList strong inset dividers className="mx-0! my-0">
        {children}
      </KList>
      {footer ? (
        <p className="mt-1.5 px-4 text-footnote text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </section>
  )
}

interface RowProps {
  title: ReactNode
  subtitle?: ReactNode
  /** trailing value ("Starter", "2 min ago") */
  detail?: ReactNode
  /** leading icon or avatar */
  leading?: ReactNode
  /** navigates: a disclosure chevron is shown */
  href?: string
  /** acts in place (opens a sheet): no chevron unless it drills in */
  onSelect?: () => void
  className?: string
}

function Row({
  title,
  subtitle,
  detail,
  leading,
  href,
  onSelect,
  className,
}: RowProps) {
  const renderLink = use(ListLinkContext)
  const after = detail ? (
    <span className="text-muted-foreground">{detail}</span>
  ) : undefined
  if (href) {
    // Konsta's `link` mode renders its own <a>; the router link must be the only one
    return (
      <ListItem
        // Konsta's default is text-[17px], which ignores Dynamic Type (AX3, ui-design-system §6.2)
        titleFontSizeIos="text-body"
        colors={ROW_COLORS}
        className={cn("relative min-h-11", className)}
        title={renderLink({
          href,
          className: "after:absolute after:inset-0",
          children: title,
        })}
        subtitle={subtitle}
        after={
          <span className="flex items-center gap-1">
            {after}
            <ChevronRight
              aria-hidden
              size={20}
              className="text-muted-foreground/60"
            />
          </span>
        }
        media={leading}
      />
    )
  }
  if (onSelect)
    return (
      <ListItem
        // Konsta's default is text-[17px], which ignores Dynamic Type (AX3, ui-design-system §6.2)
        titleFontSizeIos="text-body"
        colors={ROW_COLORS}
        className={cn("min-h-11", className)}
        title={
          <button
            type="button"
            onClick={onSelect}
            className="text-start after:absolute after:inset-0"
          >
            {title}
          </button>
        }
        subtitle={subtitle}
        after={after}
        media={leading}
      />
    )
  return (
    <ListItem
      // Konsta's default is text-[17px], which ignores Dynamic Type (AX3, ui-design-system §6.2)
      titleFontSizeIos="text-body"
      colors={ROW_COLORS}
      className={cn("min-h-11", className)}
      title={title}
      subtitle={subtitle}
      after={after}
      media={leading}
    />
  )
}

function ToggleRow({
  title,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <ListItem
      // Konsta's default is text-[17px], which ignores Dynamic Type (AX3, ui-design-system §6.2)
      titleFontSizeIos="text-body"
      colors={ROW_COLORS}
      className="min-h-11"
      title={<span aria-hidden>{title}</span>}
      after={
        <Switch
          label={title}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
        />
      }
    />
  )
}

/** A standalone list without a section title. Prefer <List.Section> on settings-style screens. */
function ListRoot({ children }: { children: ReactNode }) {
  return (
    <KList strong inset dividers>
      {children}
    </KList>
  )
}

export const List = Object.assign(ListRoot, { Section, Row, Toggle: ToggleRow })
