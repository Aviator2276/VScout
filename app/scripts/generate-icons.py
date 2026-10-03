#!/usr/bin/env python3
"""Generates every app icon from brand/ (see brand/README.md). Requires Pillow."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

icon = Image.open(BRAND / "vscout-icon-dark-1024.png").convert("RGBA")
glyph = Image.open(BRAND / "vscout-glyph-1024.png").convert("RGBA")
SIZE = icon.size[0]

# The dark icon is a vertical gradient squircle with transparent (pre-masked) corners. iOS and
# Android masks need a full-bleed square, so fill the corners with the same gradient.
TOP, BOTTOM = (50, 50, 50), (17, 17, 17)


def gradient(size: int) -> Image.Image:
    bg = Image.new("RGBA", (size, size))
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        bg.paste((*c, 255), (0, y, size, y + 1))
    return bg



def save(img: Image.Image, name: str, size: int) -> None:
    img.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)


# manifest "any": the icon as designed (its own rounded shape, transparent corners)
save(icon, "icon-192.png", 192)
save(icon, "icon-512.png", 512)
# Apple touch icon: full bleed with no rim (the dark icon's own squircle edge would show inside
# iOS's mask as a double edge), so compose the same gradient + glyph at the icon's scale
apple = gradient(SIZE)
ga = glyph.resize((round(SIZE * 0.86), round(SIZE * 0.86)), Image.LANCZOS)
apple.alpha_composite(ga, ((SIZE - ga.size[0]) // 2, (SIZE - ga.size[1]) // 2 + round(SIZE * 0.01)))
save(apple.convert("RGB"), "apple-touch-icon-180.png", 180)
# maskable: glyph inside the 80% safe zone on the full-bleed background
maskable = gradient(SIZE)
g = glyph.resize((round(SIZE * 0.62), round(SIZE * 0.62)), Image.LANCZOS)
maskable.alpha_composite(g, ((SIZE - g.size[0]) // 2, (SIZE - g.size[1]) // 2))
save(maskable, "maskable-512.png", 512)
# monochrome: the glyph's silhouette in white (Android themed icons)
alpha = glyph.getchannel("A")
mono = Image.new("RGBA", glyph.size, (255, 255, 255, 0))
mono.putalpha(alpha)
save(mono, "monochrome-96.png", 96)
# in-app logo and favicon
save(glyph, "logo-256.png", 256)
save(glyph, "favicon-32.png", 32)
glyph.resize((256, 256), Image.LANCZOS).save(
    ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
)
print("icons written to", OUT)
