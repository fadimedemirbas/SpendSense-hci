"""Resize the official artwork without cropping, recoloring or redrawing it."""

import base64
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "spendsense-logo.png"
OUT = ROOT / "public" / "icons"


def fitted(logo: Image.Image, size: int, maskable: bool = False) -> Image.Image:
    # Keep the whole square inside the 80%-diameter maskable safe circle.
    side = math.floor(size * 0.8 / math.sqrt(2)) if maskable else size
    artwork = logo.copy()
    artwork.thumbnail((side, side), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), logo.getpixel((0, 0)))
    offset = ((size - artwork.width) // 2, (size - artwork.height) // 2)
    canvas.alpha_composite(artwork, offset)
    return canvas.convert("RGB")


def main() -> None:
    with Image.open(SOURCE) as source:
        logo = source.convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, maskable in [
        ("pwa-192.png", 192, False),
        ("pwa-512.png", 512, False),
        ("pwa-maskable-192.png", 192, True),
        ("pwa-maskable-512.png", 512, True),
        ("apple-touch-icon.png", 180, False),
        ("favicon-32.png", 32, False),
        ("spendsense-mark.png", 256, False),
    ]:
        fitted(logo, size, maskable).save(OUT / name, optimize=True)
        print(f"{name}: {size}x{size}")

    encoded = base64.b64encode((OUT / "pwa-512.png").read_bytes()).decode("ascii")
    width = height = 512
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">'
        f'<image width="{width}" height="{height}" preserveAspectRatio="xMidYMid meet" '
        f'href="data:image/png;base64,{encoded}"/></svg>\n'
    )
    for name in ("icon.svg", "favicon.svg"):
        (ROOT / "public" / name).write_text(svg, encoding="ascii")


if __name__ == "__main__":
    main()
