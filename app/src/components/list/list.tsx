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
      <KList strong inset dividers className="vs-list mx-0! my-0">
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

const ROW_CONTENT = "min-h-11 w-full text-start"

/** Konsta renders `linkComponent` as an element type; its typings only allow tag names. */
const asLinkComponent = (c: (props: never) => ReactNode) =>
  c as unknown as string

/**
 * Konsta's link mode makes the whole row the control (FX-2): the row's content element is the
 * router link, so the chevron and the empty space activate it too, and `activeBgIos` shows the
 * pressed state. Konsta passes its own props; only these are forwarded.
 */
function RowLink({
  href = "",
  className = "",
  children,
}: {
  href?: string
  className?: string
  children?: ReactNode
}) {
  const renderLink = use(ListLinkContext)
  return renderLink({ href, className, children })
}

function RowButton({
  className,
  children,
  onClick,
}: {
  className?: string
  children?: ReactNode
  onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  )
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
  const after = detail ? (
    <span className="text-muted-foreground">{detail}</span>
  ) : undefined
  const common = {
    // Konsta's default is text-[17px], which ignores Dynamic Type (AX3, ui-design-system §6.2)
    titleFontSizeIos: "text-body",
    colors: ROW_COLORS,
    className: cn("min-h-11", className),
    title,
    subtitle,
    after,
    media: leading,
  }
  if (href)
    return (
      <ListItem
        {...common}
        link
        href={href}
        linkComponent={asLinkComponent(RowLink)}
        contentClassName={ROW_CONTENT}
        chevronIcon={
          <ChevronRight
            aria-hidden
            size={20}
            className="ms-1 shrink-0 text-muted-foreground/60"
          />
        }
      />
    )
  if (onSelect)
    return (
      <ListItem
        {...common}
        link
        chevron={false}
        linkComponent={asLinkComponent(RowButton)}
        linkProps={{ onClick: onSelect }}
        contentClassName={ROW_CONTENT}
      />
    )
  return <ListItem {...common} />
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
    <KList strong inset dividers className="vs-list">
      {children}
    </KList>
  )
}

export const List = Object.assign(ListRoot, { Section, Row, Toggle: ToggleRow })
