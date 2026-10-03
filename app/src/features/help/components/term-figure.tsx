// A glossary figure (features/glossary-help.md §5). Light and dark artwork follow the app's theme
// (the `.dark` class, so the in-app override counts too, not just the system setting). An animated
// figure plays once and rests on its key frame; Replay restarts it. The URL fragment changes on
// each replay because WebKit keeps an SVG image's timeline when the same URL is mounted again.
// With Reduce Motion on, `#still` targets the figure's root group, whose CSS stops every animation
// so the key frame shows (an image's own media queries don't reliably see the setting).
import { useState } from "react"
import { RotateCcw } from "@/components/icons/icon"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import type { GlossaryTerm } from "@/types/glossary"

type Image = NonNullable<GlossaryTerm["image"]>

export function TermFigure({ image }: { image: Image }) {
  const [play, setPlay] = useState(0)
  const still = useReducedMotion()
  const at = (src: string) =>
    still ? `${src}#still` : play ? `${src}#play=${play}` : src
  return (
    <figure className="relative overflow-hidden rounded-2xl bg-muted">
      <img
        key={`l${play}`}
        src={at(image.src)}
        alt={image.alt}
        className={image.srcDark ? "block w-full dark:hidden" : "block w-full"}
      />
      {image.srcDark ? (
        <img
          key={`d${play}`}
          src={at(image.srcDark)}
          alt={image.alt}
          className="hidden w-full dark:block"
        />
      ) : null}
      {image.animated && !still ? (
        <button
          type="button"
          aria-label="Replay animation"
          onClick={() => setPlay((n) => n + 1)}
          className="absolute end-1 bottom-1 flex size-11 items-center justify-center rounded-full text-muted-foreground active:opacity-60"
        >
          <span className="flex size-8 items-center justify-center rounded-full glass bg-(--glass-tint-sheet) shadow-xs">
            <RotateCcw aria-hidden size={16} />
          </span>
        </button>
      ) : null}
    </figure>
  )
}
