# Custom app backgrounds

Drop images here (`.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif`) and they show up under
**Settings → Appearance → Background → Custom** after a reload (dev) or the next build.

- The file name becomes the label: `team-photo.jpg` → "Team Photo". Keep names stable, because the chosen
  background is saved as `custom:<file name without extension>` and syncs to your other devices.
- Images cover the screen (`background-size: cover`, centered). Portrait images around 1200 × 2600 px
  look best on phones; keep files small (under ~500 KB), since they're bundled into the app and cached
  offline.
- Dark mode dims every background (like iOS dims the wallpaper), so light, soft images work best.
- Content stays on solid cards over the background, so busy images are fine for contrast, but quiet
  ones look better.
- Built-in shape backgrounds live next door in `../shapes/` and work the same way (`shape:<name>`).
