#!/usr/bin/env python3
"""Provisional Hibernian (hiber) art: a triskele on the session background circle, the waypoint banner
and the garrison flag, in the layouts of the mod's other civs (background_circle_<civ>.png 512 px,
banner_<civ>.png 256 px with the wooden pole of banner_numi, garrison flag 128 px like garrison_flag_moch).

Usage: python3 tools/make_hiber_emblems.py
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
CIV = "hiber"


def triskele(size, width, color, bg=(0, 0, 0, 0), scale=1.0, turns=2.0):
    """Three spiral arms turning around the centre, drawn at 4x and reduced."""
    big = size * 4
    im = Image.new("RGBA", (big, big), bg)
    d = ImageDraw.Draw(im)
    c = big / 2
    R = big * 0.42 * scale
    w = int(width * 4)
    for k in range(3):
        a0 = math.radians(90 + 120 * k)
        sc = (c + 0.52 * R * math.cos(a0), c - 0.52 * R * math.sin(a0))   # spiral centre
        pts = []
        for i in range(260):
            t = i / 259
            ang = a0 + math.pi + t * turns * 2 * math.pi
            r = 0.46 * R * (1 - t)
            pts.append((sc[0] + r * math.cos(ang), sc[1] - r * math.sin(ang)))
        # the arm: from the centre of the figure to the outer end of the spiral
        start = pts[0]
        arm = [(c + (start[0] - c) * f, c + (start[1] - c) * f) for f in np.linspace(0, 1, 20)]
        line = arm + pts
        d.line(line, fill=color, width=w, joint="curve")
        for p in (line[0], line[-1]):
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=color)
    return im.resize((size, size), Image.LANCZOS)


def noise(size, seed, blur=1.5):
    rng = np.random.default_rng(seed)
    n = rng.normal(0, 1, (size, size))
    img = Image.fromarray(((n - n.min()) / (n.max() - n.min()) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(img).astype(float) / 255


def background_circle():
    S = 512
    base = 0.17 + 0.05 * noise(S, 1, 2.5) + 0.03 * noise(S, 2, 8)
    rgb = np.stack([base * 255, base * 255, base * 242], -1)
    yy, xx = np.mgrid[0:S, 0:S]
    r = np.hypot(xx - S / 2 + 0.5, yy - S / 2 + 0.5)
    alpha = np.clip((S / 2 - r) * 2, 0, 1) * 255
    rgb *= (1 - 0.25 * (r / (S / 2)) ** 3)[..., None]          # darker towards the rim
    # engraved triskele: lighter face, dark shadow below-right, as in the other civs' circles
    mark = np.asarray(triskele(S, 26, (255, 255, 255, 255), scale=0.85).split()[3]).astype(float) / 255
    shadow = np.roll(np.roll(mark, 3, 0), 3, 1)
    ring = (np.abs(r - S * 0.455) < 5).astype(float)
    ring = np.asarray(Image.fromarray((ring * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(float) / 255
    rgb = rgb * (1 - 0.35 * shadow[..., None]) + 38 * mark[..., None] + 26 * ring[..., None]
    out = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(f"{MOD}/art/textures/ui/session/icons/bkg/background_circle_{CIV}.png")


def banner():
    """Waypoint banner: green cloth, gold triskele and borders; pole and bottom from banner_numi."""
    src = Image.open(f"{MOD}/art/textures/skins/props/banner_numi.png").convert("RGBA")
    im = src.copy()
    cloth = (4, 4, 236, 218)                                    # cloth area of banner_numi
    w, h = cloth[2] - cloth[0], cloth[3] - cloth[1]
    n = noise(max(w, h), 3, 0.8)[:h, :w]
    green = np.stack([18 + 16 * n, 62 + 22 * n, 34 + 16 * n, np.full_like(n, 255)], -1).astype(np.uint8)
    im.paste(Image.fromarray(green, "RGBA"), cloth[:2])
    d = ImageDraw.Draw(im)
    gold = (196, 150, 62, 255)
    for y in (cloth[1] + 10, cloth[3] - 12):                    # bands of a simple knot border
        d.rectangle([cloth[0] + 6, y - 3, cloth[2] - 6, y + 3], outline=gold, width=2)
        for x in range(cloth[0] + 12, cloth[2] - 8, 14):
            d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=gold, width=1)
    mark = triskele(150, 6.5, gold, turns=1.6)
    im.alpha_composite(mark, (cloth[0] + (w - 150) // 2, cloth[1] + (h - 150) // 2))
    im.save(f"{MOD}/art/textures/skins/props/banner_{CIV}.png")


def garrison_flag():
    """Garrison flag: the light parts take the player colour, like garrison_flag_moch."""
    src = Image.open(f"{MOD}/art/textures/skins/props/garrison_flag_moch.png").convert("RGBA")
    im = src.copy()
    cloth_h = 112                                               # wooden strip at the bottom is kept
    field = Image.new("RGBA", (128, cloth_h), (120, 120, 120, 255))
    d = ImageDraw.Draw(field)
    d.rectangle([3, 3, 124, cloth_h - 4], outline=(235, 235, 235, 255), width=5)
    field.alpha_composite(triskele(92, 6, (240, 240, 240, 255), turns=1.25), (18, 10))
    im.paste(field, (0, 0))
    im.save(f"{MOD}/art/textures/skins/props/garrison_flag_{CIV}.png")


def actors():
    common = f"{MOD}/art/actors/props/special/common"
    with open(f"{common}/{CIV}_waypoint_flag.xml", "w", encoding="utf-8") as f:
        f.write(f"""<?xml version="1.0" encoding="utf-8"?>
<actor version="1">
  <castshadow/>
  <float/>
  <group>
    <variant file="others/waypoints/base.xml" frequency="1" name="Hibernian Waypoint Flag">
      <textures>
        <texture file="props/banner_{CIV}.png" name="baseTex"/>
      </textures>
    </variant>
  </group>
  <material>basic_trans_norm_spec.xml</material>
</actor>
""")
    with open(f"{common}/garrison_flag_{CIV}.xml", "w", encoding="utf-8") as f:
        f.write(f"""<?xml version="1.0" encoding="utf-8"?>
<actor version="1">
  <castshadow/>
  <group>
    <variant frequency="100" name="base">
      <animations>
        <animation file="mechanical/garrison_flag_idle.dae" name="Idle" speed="30"/>
      </animations>
      <mesh>props/garrison_flag.dae</mesh>
      <textures>
        <texture file="props/garrison_flag_{CIV}.png" name="baseTex"/>
      </textures>
    </variant>
  </group>
  <material>player_trans.xml</material>
</actor>
""")


if __name__ == "__main__":
    background_circle()
    banner()
    garrison_flag()
    actors()
    print("ok")
