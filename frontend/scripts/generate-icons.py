"""Builds every SpendSense icon from the official logo, public/spendsense-logo.png.

The artwork is never redrawn: it is only cropped to its rounded tile, scaled and,
where an icon format needs it, padded with the logo's own cream background.
Output goes to public/icons/. Run after replacing the logo:
  pip install pillow
  python scripts/generate-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "spendsense-logo.png"
OUT = ROOT / "public" / "icons"

# Where the rounded tile sits inside the 1254 px source, and its corner radius.
TILE = (102, 103, 1152, 1153)
RADIUS = 256
BACKGROUND = (254, 249, 238)  # the logo's own cream margin


def tile(logo: Image.Image, size: int) -> Image.Image:
    """The rounded tile on a transparent background (browser and "any" icons)."""
    crop = logo.crop(TILE)
    side = crop.width
    scale = 4  # draw the mask large, then shrink it, for smooth corners
    mask = Image.new("L", (side * scale, side * scale), 0)
    inset = 1 * scale  # stay inside the tile's light rim, off the outer shadow
    ImageDraw.Draw(mask).rounded_rectangle(
        (inset, inset, side * scale - 1 - inset, side * scale - 1 - inset),
        radius=RADIUS * scale,
        fill=255,
    )
    crop.putalpha(mask.resize((side, side), Image.LANCZOS))
    return crop.resize((size, size), Image.LANCZOS)


def full_bleed(logo: Image.Image, size: int) -> Image.Image:
    """Opaque square filled by the tile (iOS rounds the corners itself)."""
    inset = 40  # iOS corner mask is a little tighter than the tile's corners
    box = (TILE[0] + inset, TILE[1] + inset, TILE[2] - inset, TILE[3] - inset)
    return logo.crop(box).convert("RGB").resize((size, size), Image.LANCZOS)


def maskable(logo: Image.Image, size: int) -> Image.Image:
    """The whole logo inside the maskable safe zone (centre circle, 80% diameter)."""
    canvas = Image.new("RGB", (size, size), BACKGROUND)
    inner = round(size * 0.86)
    art = logo.convert("RGB").resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(art, (offset, offset))
    return canvas


def main() -> None:
    logo = Image.open(SOURCE).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = {
        "pwa-192.png": tile(logo, 192),
        "pwa-512.png": tile(logo, 512),
        "pwa-maskable-512.png": maskable(logo, 512),
        "apple-touch-icon.png": full_bleed(logo, 180),
        "favicon-32.png": tile(logo, 32),
        "spendsense-mark.png": tile(logo, 256),  # in-app logo, sharp up to 3x at 56 px
    }
    for name, image in outputs.items():
        image.save(OUT / name, optimize=True)
        print(f"{name}: {image.width}x{image.height}")


if __name__ == "__main__":
    main()
