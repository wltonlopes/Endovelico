#!/usr/bin/env python3
"""Gera os mini-exércitos animados do mapa de campanha.

Para cada civilização com lista de batalhões (simulation/data/total_warfield/
rosters/<civ>.json) renderiza, a partir dos atores do public.zip, três
soldados: infantaria corpo a corpo (`inf`), atiradores (`rng`) e cavalaria
(`cav`). Cada um vira um atlas de 8 direções (linhas) x 9 quadros (colunas:
8 de marcha e 1 parado), com a cor da tribo da civ no escudo e nas roupas.

Saídas:
- art/textures/ui/campaigns/grand_strategy/army/<civ>_<classe>.png
- gui/campaigns/grand_strategy/army_sprites.xml (um sprite por quadro:
  twArmy_<civ>_<classe>_<direção>_<quadro>)
- campaigns/grand_strategy/data/army_sprites.json (o que existe, para a GUI)

Direções: 0 = leste, 1 = nordeste, 2 = norte ... 7 = sudeste (anti-horário,
na tela). Uso: python3 tools/art/gen_army_sprites.py [civ ...] [--jobs N]
"""
import argparse
import json
import os
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

from actor_render import Triangles, pose_actor, rasterize, resolve_actor, rotation_y  # noqa: E402
from tw_templates import TemplateLoader, find_public_zip  # noqa: E402
from zeroad_formats import PublicArchive  # noqa: E402

CELL = 64          # tamanho final de cada quadro
SUPER = 4          # supersampling
# Pixels (finais) por unidade do mundo. A infantaria usa escala maior para
# ter mais detalhe; a GUI compensa com `scale` do army_sprites.json.
SCALE = {"inf": 12.0, "rng": 12.0, "cav": 8.5}
ELEVATION = np.radians(40)
LIGHT = np.array([-0.45, 0.8, -0.5]) / np.linalg.norm([-0.45, 0.8, -0.5])
WALK_FRAMES = 8
DIRECTIONS = 8

CLASSES = {
    "inf": (["infantry_spearman", "infantry_hoplite", "infantry_pikeman", "infantry_swordsman"], ["infantry_melee"]),
    "rng": (["infantry_archer", "infantry_javelineer", "infantry_slinger"], ["infantry_ranged"]),
    "cav": (["cavalry_spearman", "cavalry_swordsman", "cavalry_javelineer"], ["cavalry_melee", "cavalry_ranged"]),
}

# Extras do mapa (uma folha cada): navio para exércitos no mar e caravana
# para as rotas de comércio. "extra" faz as vezes da civ.
EXTRAS = {
    "ship": ("structures/hellenes/merchant.xml", 2.4),
    "trader": ("units/achaemenids/trader.xml", 8.0),
}

OUT_TEX = os.path.join(MOD, "art/textures/ui/campaigns/grand_strategy/army")
OUT_XML = os.path.join(MOD, "gui/campaigns/grand_strategy/army_sprites.xml")
OUT_JSON = os.path.join(MOD, "campaigns/grand_strategy/data/army_sprites.json")

_archive = None


def archive():
    global _archive
    if _archive is None:
        _archive = PublicArchive(find_public_zip())
    return _archive


def pick_units(civ, loader):
    roster = json.load(open(os.path.join(MOD, "simulation/data/total_warfield/rosters", civ + ".json")))
    picks = {}
    for cls, (keys, categories) in CLASSES.items():
        units = roster["units"]
        chosen = None
        for key in keys:
            chosen = next((u for u in units if u["key"] == key or u["key"].startswith(key)), None)
            if chosen:
                break
        if not chosen:
            chosen = next((u for u in units if u.get("category") in categories), None)
        if not chosen:
            continue
        actor = loader.get(chosen["baseTemplate"]).text("VisualActor/Actor")
        if actor:
            picks[cls] = actor
    return picks


def tribe_color(civ):
    path = os.path.join(MOD, "campaigns/grand_strategy/tribes", civ + ".json")
    try:
        return [float(v) / 255 for v in json.load(open(path))["color"].split()[:3]]
    except (OSError, KeyError, ValueError):
        return [0.75, 0.75, 0.75]


def render_frame(part, animation, fraction, direction, color, scale):
    """Um quadro RGBA (CELL x CELL) com sombra no chão."""
    alpha = np.radians(direction * 360 / DIRECTIONS)
    angle = np.radians(270) - alpha
    tris = Triangles()
    pose_actor(archive(), part, animation, fraction, rotation_y(angle), tris, color)
    size = CELL * SUPER
    image = rasterize(tris, size, scale * SUPER, ELEVATION, LIGHT)

    # Pré-multiplica para reduzir sem halo escuro nas bordas.
    rgba = np.clip(image, 0, 1)
    premul = np.dstack([rgba[..., :3] * rgba[..., 3:4], rgba[..., 3:4]])
    small = Image.fromarray((premul * 255).astype(np.uint8), "RGBA").resize((CELL, CELL), Image.LANCZOS)
    arr = np.asarray(small).astype(np.float32) / 255
    a = arr[..., 3:4]
    rgb = np.where(a > 1e-3, arr[..., :3] / np.maximum(a, 1e-3), 0)

    # Sombra elíptica sob os pés.
    shadow = Image.new("L", (CELL, CELL), 0)
    draw = ImageDraw.Draw(shadow)
    cx, cy = CELL / 2, CELL * 0.88
    rx = CELL * (0.17 if scale < 10 else 0.11)
    if scale >= 3:  # navio: sem sombra na água
        draw.ellipse([cx - rx, cy - rx * 0.4, cx + rx, cy + rx * 0.4], fill=110)
    shadow = np.asarray(shadow.filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)[..., None] / 255
    out_a = a + shadow * (1 - a)
    out_rgb = rgb * a / np.maximum(out_a, 1e-3)
    out = (np.clip(np.dstack([out_rgb, out_a]), 0, 1) * 255).astype(np.uint8)
    out[out[..., 3] == 0] = 0  # PNG menor
    return out


def pot(n):
    """Menor potência de 2 >= n."""
    return 1 << (n - 1).bit_length()


def render_sheet(job):
    civ, cls, actor, color = job
    scale = EXTRAS[cls][1] if civ == "extra" else SCALE[cls]
    part = resolve_actor(archive(), actor)
    if part is None:
        return civ, cls, None
    # O jogo exige lados em potência de 2: sobra transparente à direita
    # (os quadros são lidos por real_texture_placement, em pixels).
    sheet = np.zeros((pot(CELL * DIRECTIONS), pot(CELL * (WALK_FRAMES + 1)), 4), dtype=np.uint8)
    for d in range(DIRECTIONS):
        for f in range(WALK_FRAMES):
            sheet[d * CELL:(d + 1) * CELL, f * CELL:(f + 1) * CELL] = render_frame(part, "walk", f / WALK_FRAMES, d, color, scale)
        sheet[d * CELL:(d + 1) * CELL, WALK_FRAMES * CELL:] = render_frame(part, "idle", 0.0, d, color, scale)
    os.makedirs(OUT_TEX, exist_ok=True)
    # Paleta de 256 cores com alfa: o atlas fica umas 4x menor.
    Image.fromarray(sheet, "RGBA").quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(
        os.path.join(OUT_TEX, f"{civ}_{cls}.png"), optimize=True)
    return civ, cls, actor


def write_outputs(done):
    width, height = CELL * (WALK_FRAMES + 1), CELL * DIRECTIONS
    lines = ['<?xml version="1.0" encoding="utf-8"?>',
             "<!-- Gerado por tools/art/gen_army_sprites.py. Não edite à mão. -->",
             "<sprites>"]
    for civ in sorted(done):
        for cls in sorted(done[civ]):
            texture = f"campaigns/grand_strategy/army/{civ}_{cls}.png"
            for d in range(DIRECTIONS):
                for f in range(WALK_FRAMES + 1):
                    x, y = f * CELL, d * CELL
                    lines.append(f'\t<sprite name="twArmy_{civ}_{cls}_{d}_{f}"><image texture="{texture}" '
                                 f'texture_size="0 0 100% 100%" real_texture_placement="{x} {y} {x + CELL} {y + CELL}" '
                                 f'size="0 0 100% 100%"/></sprite>')
    lines.append("</sprites>")
    with open(OUT_XML, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    with open(os.path.join(OUT_TEX, "textures.xml"), "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="utf-8"?>\n<Textures>\n  <File pattern="*" format="rgba" mipmap="false"/>\n</Textures>\n')
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump({"directions": DIRECTIONS, "walkFrames": WALK_FRAMES, "idleFrame": WALK_FRAMES, "cell": CELL, "scale": dict(SCALE, **{k: v[1] for k, v in EXTRAS.items()}),
                   "civs": {civ: sorted(done[civ]) for civ in sorted(done)}}, fh, indent="\t")
        fh.write("\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("civs", nargs="*")
    parser.add_argument("--extras", action="store_true", help="só o navio e a caravana")
    parser.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    args = parser.parse_args()

    roster_dir = os.path.join(MOD, "simulation/data/total_warfield/rosters")
    civs = args.civs or sorted(f[:-5] for f in os.listdir(roster_dir) if f.endswith(".json"))
    loader = TemplateLoader([find_public_zip(), MOD])
    jobs = []
    if args.extras:
        civs = []
        for cls, (actor, _) in EXTRAS.items():
            jobs.append(("extra", cls, actor, [0.85, 0.82, 0.75]))
    for civ in civs:
        color = tribe_color(civ)
        for cls, actor in pick_units(civ, loader).items():
            jobs.append((civ, cls, actor, color))

    # Mantém no manifesto as civs já geradas antes (regerar só algumas).
    done = {}
    if os.path.exists(OUT_JSON):
        done = {c: set(v) for c, v in json.load(open(OUT_JSON)).get("civs", {}).items()}
    with Pool(args.jobs) as pool:
        for civ, cls, actor in pool.imap_unordered(render_sheet, jobs):
            if actor:
                done.setdefault(civ, set()).add(cls)
                print(f"{civ} {cls}: {actor}", flush=True)
            else:
                print(f"{civ} {cls}: falhou", flush=True)
    write_outputs(done)


if __name__ == "__main__":
    main()
