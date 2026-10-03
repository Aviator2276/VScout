import type { ReactNode } from "react"

export function GallerySection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={`g-${title}`}
      className="mt-8 flex flex-col gap-3"
    >
      <h2 id={`g-${title}`} className="font-heading text-title-3">
        {title}
      </h2>
      {children}
    </section>
  )
}
