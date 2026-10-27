"""Builds the Turkish letters Fredoka lacks (ğ Ğ ş Ş İ) from Fredoka's own glyphs.

Fredoka ships without these five, so browsers drew them in a fallback font.
Output: src/assets/fonts/fredoka-tr-<weight>.woff2, loaded in index.css with a
unicode-range so only these letters use it.

Run once after changing @fontsource/fredoka:  pip install fonttools brotli
  python scripts/fredoka-turkish.py
"""

import math
from pathlib import Path

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules/@fontsource/fredoka/files"
OUT = ROOT / "src/assets/fonts"
CAPS = 200  # Fredoka raises marks by ~200 units over capitals (see Eacute, Udieresis).


def bounds(font, name):
    g = font["glyf"][name]
    g.recalcBounds(font["glyf"])
    return g.xMin, g.yMin, g.xMax, g.yMax


def add(font, name, glyph, advance=0, lsb=0):
    font["glyf"][name] = glyph  # also appends the name to the glyph order
    font["hmtx"][name] = (advance, lsb)


def composite(font, code, name, base, parts):
    pen = TTGlyphPen(font.getGlyphSet())
    pen.addComponent(base, (1, 0, 0, 1, 0, 0))
    for mark, dx, dy in parts:
        pen.addComponent(mark, (1, 0, 0, 1, round(dx), round(dy)))
    glyph = pen.glyph()
    add(font, name, glyph, font["hmtx"][base][0], font["hmtx"][base][1])
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[code] = name


def breve(font, width, height, stroke):
    """A rounded U-shaped breve centred on x=0, its bottom at y=0."""
    a, b, t = width / 2, height, stroke
    cy = b  # the arc hangs from y=b down to y=0
    pts = []
    steps = 24
    for k in range(steps + 1):  # outer arc, left to right along the bottom
        th = math.pi + math.pi * k / steps
        pts.append((a * math.cos(th), cy + b * math.sin(th)))
    for k in range(1, steps):  # round cap on the right end
        th = -math.pi * k / steps
        pts.append((a - t / 2 + t / 2 * math.cos(th + math.pi), cy - t / 2 * math.sin(th)))
    for k in range(steps + 1):  # inner arc, right to left
        th = 2 * math.pi - math.pi * k / steps
        pts.append(((a - t) * math.cos(th), cy + (b - t) * math.sin(th)))
    for k in range(1, steps):  # round cap on the left end
        th = -math.pi * k / steps
        pts.append((-a + t / 2 + t / 2 * math.cos(th), cy - t / 2 * math.sin(th)))
    area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]))
    if area > 0:  # TrueType outer contours run clockwise
        pts.reverse()
    pen = TTGlyphPen(None)
    pen.moveTo(tuple(map(round, pts[0])))
    for p in pts[1:]:
        pen.lineTo(tuple(map(round, p)))
    pen.closePath()
    return pen.glyph()


def build(weight):
    font = TTFont(SRC / f"fredoka-latin-{weight}-normal.woff2")
    glyf = font["glyf"]
    mid = lambda n: (bounds(font, n)[0] + bounds(font, n)[2]) / 2

    # The i dot is the contour of "i" that sits highest; copy it, centred on x=0.
    i = glyf["i"]
    coords, ends = i.getCoordinates(glyf)[0], i.endPtsOfContours
    starts = [0] + [e + 1 for e in ends[:-1]]
    s, e = max(zip(starts, ends), key=lambda r: min(coords[k][1] for k in range(r[0], r[1] + 1)))
    dot = Glyph()
    dot.numberOfContours = 1
    dot.coordinates = GlyphCoordinates(coords[s : e + 1])
    dot.flags = i.flags[s : e + 1]
    dot.endPtsOfContours = [e - s]
    dot.program = i.program
    xs = [x for x, _ in dot.coordinates]
    dot.coordinates.translate((-(min(xs) + max(xs)) / 2, 0))
    dot_d = max(y for _, y in dot.coordinates) - min(y for _, y in dot.coordinates)
    add(font, "dotcomb.tr", dot)

    acute = bounds(font, "acutecomb")
    add(font, "brevecomb.tr", breve(font, acute[2] - acute[0] - 20, 150, dot_d * 0.62))

    cedilla = mid("uni0327")
    lift = acute[1] + 15  # breve bottom just above the x-height, like the acute
    composite(font, 0x015F, "scedilla", "s", [("uni0327", mid("s") - cedilla, 0)])
    composite(font, 0x015E, "Scedilla", "S", [("uni0327", mid("S") - cedilla, 12)])
    composite(font, 0x011F, "gbreve", "g", [("brevecomb.tr", mid("g"), lift)])
    composite(font, 0x011E, "Gbreve", "G", [("brevecomb.tr", mid("G"), lift + CAPS)])
    # Same gap above I as the dot has above the dotless i.
    rise = bounds(font, "I")[3] - bounds(font, "dotlessi")[3]
    composite(font, 0x0130, "Idotaccent", "I", [("dotcomb.tr", mid("I"), rise)])

    opts = Options()
    opts.flavor = "woff2"
    opts.layout_features = []
    sub = Subsetter(opts)
    sub.populate(unicodes=[0x011E, 0x011F, 0x015E, 0x015F, 0x0130])
    sub.subset(font)
    OUT.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(OUT / f"fredoka-tr-{weight}.woff2")


for w in ("500", "600"):
    build(w)
