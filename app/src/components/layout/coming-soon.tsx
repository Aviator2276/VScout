// Placeholder body for a tab whose feature lands in a later phase (roadmap). Remove with the feature.
import type { LucideIcon } from "@/components/icons/icon"

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <section className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-muted/50 px-6 py-10 text-center">
      <Icon aria-hidden size={40} className="text-muted-foreground" />
      <h2 className="text-headline">{title}</h2>
      <p className="max-w-xs text-subhead text-muted-foreground">
        {description}
      </p>
    </section>
  )
}
