// The label, help and inline problem around one field (ui-patterns §2.7): the label is always
// visible above the control; help shows for new scouters (ADR-039).
import { useId } from "react"
import type { ReactNode } from "react"
import { CircleAlert } from "@/components/icons/icon"

export function FieldFrame({
  label,
  help,
  issue,
  children,
}: {
  label: string
  help?: string | undefined
  issue?: string | undefined
  /** receives the ids to put on the control's aria-describedby */
  children: (describedBy: string | undefined) => ReactNode
}) {
  const id = useId()
  const describedBy =
    [help ? `${id}-help` : null, issue ? `${id}-issue` : null]
      .filter(Boolean)
      .join(" ") || undefined
  return (
    <div className="flex flex-col gap-2 py-3">
      <p className="text-subhead font-medium">{label}</p>
      {help ? (
        <p
          id={`${id}-help`}
          className="-mt-1 text-footnote text-muted-foreground"
        >
          {help}
        </p>
      ) : null}
      {children(describedBy)}
      {issue ? (
        <p
          id={`${id}-issue`}
          className="flex items-center gap-1 text-footnote text-destructive"
        >
          <CircleAlert aria-hidden size={14} />
          {issue}
        </p>
      ) : null}
    </div>
  )
}
