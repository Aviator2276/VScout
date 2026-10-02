// cn(): clsx + Tailwind class merging. The merger must know our iOS type scale (styles.css
// `--text-*`): unknown `text-*` classes count as colors, so `text-body` would silently drop
// `text-primary-foreground`.
import { createCn } from "cn/config"

export const TYPE_SCALE = [
  "large-title",
  "title-1",
  "title-2",
  "title-3",
  "headline",
  "body",
  "callout",
  "subhead",
  "footnote",
  "caption-1",
  "caption-2",
] as const

export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: [...TYPE_SCALE] }] } },
})
