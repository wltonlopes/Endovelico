#!/usr/bin/env python3
"""Cut the Hibernian (hiber) unit textures out of Duileoga's unit atlas.

The atlas "A-catálogo unis hiber- FINAIS.png" (7632x4424, full size from the forum post, the file
the X-Unidades hiber *.blend files point at) holds every texture of the civ in the vanilla 0 A.D.
layouts: 256 px bodies for the skeletal/new meshes, 128 px heads for the celtic head meshes, capes for
the m_cape meshes, the war dog, and the shields / carnyx / chariot pieces. Tile positions come from
the UVs of the .blend files (and the white gaps between the tiles).

Usage: python3 tools/make_hiber_textures.py [--atlas path/to/A-catlogounishiber-FINAIS.png]
Writes art/textures/skins/skeletal/hiber/*.png, art/textures/skins/props/hiber/*.png and
art/textures/skins/props/head/hiber/*.png.
"""
import argparse
import glob
import os

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
BODY = os.path.join(MOD, "art/textures/skins/skeletal/hiber")
PROP = os.path.join(MOD, "art/textures/skins/props/hiber")
HEAD = os.path.join(MOD, "art/textures/skins/props/head/hiber")

# 256 px bodies: name -> (x of the four variants, y of the rows b/a/e or a single row)
RANKED = {   # light and auxiliary units: phase 1, 2, 3 -> ranks b, a, e
    "light_melee": ((47, 305, 562, 819), (54, 339, 626)),
    "light_ranged": ((1945, 2203, 2460, 2717), (54, 339, 626)),
    "auxiliary": ((3843, 4100, 4357, 4614), (55, 339, 626)),
}
SINGLE = {   # one row of variants
    "champion_bard": ((85, 343, 599, 856), 1235),
    "champion_carnyx": ((2026, 2283, 2541, 2797), 1236),
    "heavy": ((3959, 4216, 4472, 4730), 1244),
    "champion_melee": ((86, 343, 601, 857), 1870),
    "champion_ranged": ((2028, 2284, 2541, 2799), 1871),
    "female": ((3953, 4211, 4467, 4724), 1879),
    "civilian": ((5749, 6006, 6263, 6520), 66),     # fisherman, siege crew, trader, charioteer
    "priest": ((5770, 6027, 6283), 683),
    "war_dog": ((6742, 7014, 7291), 725),
    "hero": ((83, 341, 598), 2496),                 # Fiachu (cavalry), Tuathal (slinger), Elim (chariot)
}
# capes: name -> (x0, y0, x1, y1) region holding a 2x2 (or 1xN) block of cape tiles
CAPES = {
    "light_melee": (1080, 480, 1360, 740), "light_ranged": (2980, 480, 3260, 740),
    "auxiliary": (4880, 480, 5160, 740), "champion_bard": (80, 1535, 360, 1790),
    "champion_carnyx": (2020, 1535, 2300, 1790), "heavy": (3945, 1545, 4225, 1800),
    "champion_melee": (85, 2170, 365, 2425), "champion_ranged": (2020, 2170, 2300, 2425),
    "priest": (5925, 940, 6070, 1070), "hero": (130, 2800, 790, 2940),
}
HEADS = {
    "male": ((1086, 1215, 1344, 1474, 1603, 1732), (54, 183, 312)),
    "female": ((5394, 5523), (1911, 2040, 2169)),
    "priest": ((6152, 6281), (961,)),
    "hero": ((932, 1061, 1190), (2499,)),       # Fiachu, Elim, Tuathal
}
# props: name -> (x0, y0, x1, y1), kept at their pixel size (padded to a power of two)
PROPS = {
    "shield_light": (0, 3930, 440, 4424),
    "props": (440, 3780, 812, 4424),
    "carnyx": (820, 3980, 1165, 4424),
    "shield_champion": (1170, 3930, 1750, 4424),
}
# chariots / trader cart: vanilla celt_chariot_a layout (structural/celt_char_a.dae)
CHARIOTS = (6040, 1240, 7230, 1640)          # trader, champion, hero, left to right


def tiles(a, box, min_size=60):
    """Rectangles separated by white gaps inside box."""
    x0, y0, x1, y1 = box
    reg = a[y0:y1, x0:x1]
    white = reg.min(axis=2) > 235

    def runs(mask):
        out, s = [], None
        for i, m in enumerate(list(mask) + [False]):
            if m and s is None:
                s = i
            elif not m and s is not None:
                out.append((s, i))
                s = None
        return out
    cols = [(x0 + s, x0 + e) for s, e in runs(white.mean(axis=0) < 0.9) if e - s > min_size]
    rows = [(y0 + s, y0 + e) for s, e in runs(white.mean(axis=1) < 0.9) if e - s > min_size]
    return [(c0, r0, c1, r1) for r0, r1 in rows for c0, c1 in cols]


def save(img, path, size=None):
    if size:
        img = img.resize(size, Image.LANCZOS)
    img.convert("RGBA").save(path)


def pow2(n):
    p = 1
    while p < n:
        p *= 2
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--atlas", default=(glob.glob(os.path.expanduser("~/Downloads/hiber_fullres/*A-catlogounishiber-FINAIS.png*"))
        or [""])[0])
    args = ap.parse_args()
    atlas = Image.open(args.atlas).convert("RGB")
    a = np.asarray(atlas).astype(int)
    for d in (BODY, PROP, HEAD):
        os.makedirs(d, exist_ok=True)
    n = 0
    for name, (xs, ys) in RANKED.items():
        for rank, y in zip("bae", ys):
            for k, x in enumerate(xs, 1):
                save(atlas.crop((x, y, x + 256, y + 256)), f"{BODY}/{name}_{rank}_{k}.png", (256, 256))
                n += 1
    for name, (xs, y) in SINGLE.items():
        for k, x in enumerate(xs, 1):
            save(atlas.crop((x, y, x + 256, y + 256)), f"{BODY}/{name}_{k}.png", (256, 256))
            n += 1
    for name, box in CAPES.items():
        for k, r in enumerate(tiles(a, box), 1):
            save(atlas.crop(r), f"{PROP}/cape_{name}_{k}.png", (128, 128))
            n += 1
    for name, (xs, ys) in HEADS.items():
        k = 0
        for y in ys:
            for x in xs:
                k += 1
                save(atlas.crop((x, y, x + 128, y + 128)), f"{HEAD}/{name}_{k}.png")
                n += 1
    for name, box in PROPS.items():
        crop = atlas.crop(box)
        canvas = Image.new("RGB", (pow2(crop.width), pow2(crop.height)), (128, 128, 128))
        canvas.paste(crop, (0, 0))
        save(canvas, f"{PROP}/{name}.png")
        n += 1
    for name, r in zip(("trader", "champion", "hero"), tiles(a, CHARIOTS, 200)):
        save(atlas.crop(r), f"{PROP}/chariot_{name}.png", (512, 512))
        print("chariot", name, r)
        n += 1
    print("textures:", n)


if __name__ == "__main__":
    main()
