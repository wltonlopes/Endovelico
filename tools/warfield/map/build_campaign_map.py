#!/usr/bin/env python3
"""
Mapa de campanha em blocos (Total Warfield).

Lê a arte original (tools/map/source/campaign_map.png, 4096x2048) e os
contornos das províncias (campaigns/grand_strategy/data/provinces.geojson,
em pixels dessa arte, com y negativo) e gera em
art/textures/ui/campaigns/grand_strategy/:

  map/overview.png       mapa inteiro em 4096x2048 com as bordas, para o
                         zoom afastado (uma textura só, leve)
  map/tile_<c>_<l>.png   blocos de 1024x1024 com a arte em SCALE x (Lanczos
                         + nitidez, na CPU) e bordas desenhadas já nessa
                         resolução; a página mostra só os blocos visíveis
                         no zoom próximo (CampaignMenu.renderMapTiles)
  map/textures.xml       compressão DXT1 e mipmaps (o jogo converte uma vez
                         para .dds e guarda no cache)
  provinces/<código>.png máscaras das províncias refeitas em MASK_SCALE x a
                         partir dos contornos suavizados (cor e clique); a
                         posição e o tamanho na interface não mudam

As bordas e as máscaras usam os contornos do geojson suavizados (Chaikin),
que eram traçados em degraus de pixel.

Uso: python3 tools/map/build_campaign_map.py [--scale 2] [--mask-scale 2]
"""
import argparse
import json
import os
import shutil

import numpy

from PIL import Image, ImageDraw, ImageFilter

MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
SOURCE = os.path.join(MOD, "tools", "warfield", "map", "source", "campaign_map.png")
SOURCE_MASKS = os.path.join(MOD, "tools", "warfield", "map", "source", "provinces")
GEOJSON = os.path.join(MOD, "campaigns", "total_warfield", "data", "provinces.geojson")
ART = os.path.join(MOD, "art", "textures", "ui", "campaigns", "total_warfield")
MAP_DIR = os.path.join(ART, "map")
MASK_DIR = os.path.join(ART, "provinces")

WIDTH, HEIGHT = 4096, 2048
TILE = 1024
# Borda entre províncias: marrom escuro translúcido.
BORDER_COLOR = (40, 28, 18, 175)


def chaikin(ring, iterations=2):
    """Suaviza um anel fechado de pontos (cortes de Chaikin)."""
    points = ring[:-1] if ring[0] == ring[-1] else ring
    for _ in range(iterations):
        out = []
        n = len(points)
        for i in range(n):
            (x0, y0), (x1, y1) = points[i], points[(i + 1) % n]
            out.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
            out.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
        points = out
    return points + [points[0]]


def load_provinces():
    with open(GEOJSON) as handle:
        data = json.load(handle)
    provinces = []
    for feature in data["features"]:
        geometry = feature["geometry"]
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        rings = []
        for polygon in polygons:
            for ring in polygon:
                if len(ring) >= 4:
                    # geojson: (x, -y) em pixels da arte de 4096.
                    rings.append(chaikin([(x, -y) for x, y in ring]))
        provinces.append({"props": feature["properties"], "rings": rings})
    return provinces


def draw_borders(image, provinces, scale, offset=(0, 0), width=1.0, supersample=2):
    """
    Bordas entre províncias de terra sobre `image` (que cobre a área a
    partir de `offset`, na escala `scale`). Pinta um mapa de rótulos (cada
    província com o seu número) e marca os pixels onde o rótulo muda entre
    duas províncias de terra: uma linha só por fronteira (contornos
    suavizados de vizinhos não coincidem exatamente). O litoral já está
    pintado na arte e não ganha linha.
    """
    w, h = image.size
    ss = supersample
    labels = Image.new("I", (w * ss, h * ss), 0)
    draw = ImageDraw.Draw(labels)
    ox, oy = offset
    margin = 8
    land = {}
    for index, province in enumerate(provinces, start=1):
        is_land = province["props"].get("provinceType") != "sea"
        land[index] = is_land
        for ring in province["rings"]:
            xs = [x * scale - ox for x, _ in ring]
            ys = [y * scale - oy for _, y in ring]
            if max(xs) < -margin or min(xs) > w + margin or max(ys) < -margin or min(ys) > h + margin:
                continue
            draw.polygon([(x * ss, y * ss) for x, y in zip(xs, ys)], fill=index)

    grid = numpy.array(labels, dtype=numpy.int32)
    # Os contornos foram traçados pelos centros dos pixels: entre vizinhos
    # sobra uma fresta "sem província". Preenche com o vizinho mais próximo.
    for _ in range(int(3 * scale * ss) + 4):
        empty = grid == 0
        if not empty.any():
            break
        for shifted in (numpy.roll(grid, 1, 0), numpy.roll(grid, -1, 0), numpy.roll(grid, 1, 1), numpy.roll(grid, -1, 1)):
            fill = empty & (shifted > 0)
            grid[fill] = shifted[fill]
            empty &= ~fill
    is_land = numpy.zeros(len(provinces) + 1, dtype=bool)
    for index, value in land.items():
        is_land[index] = value
    edge = numpy.zeros(grid.shape, dtype=bool)
    for a, b in ((grid[:, :-1], grid[:, 1:]), (grid[:-1, :], grid[1:, :])):
        diff = (a != b) & is_land[a] & is_land[b] & (a > 0) & (b > 0)
        if a.shape[1] != grid.shape[1]:
            edge[:, :-1] |= diff
        else:
            edge[:-1, :] |= diff
    mask = Image.fromarray((edge * 255).astype(numpy.uint8))
    thickness = max(1, round(width * ss * 1.1))
    if thickness > 1:
        mask = mask.filter(ImageFilter.MaxFilter(2 * (thickness // 2) + 1))
    mask = mask.filter(ImageFilter.GaussianBlur(0.6 * ss)).resize((w, h), Image.LANCZOS)
    alpha = mask.point(lambda v: min(BORDER_COLOR[3], int(v * BORDER_COLOR[3] / 255 * 2.4)))
    layer = Image.new("RGBA", (w, h), BORDER_COLOR[:3] + (0,))
    layer.putalpha(alpha)
    base = image.convert("RGBA")
    base.alpha_composite(layer)
    return base.convert("RGB")


def build_masks(provinces, mask_scale):
    """Máscaras das províncias em mask_scale x (mesma posição e tamanho na interface)."""
    if not os.path.isdir(SOURCE_MASKS):
        shutil.copytree(MASK_DIR, SOURCE_MASKS)
    ss = 4
    for province in provinces:
        props = province["props"]
        code = props["code"]
        original = os.path.join(SOURCE_MASKS, code + ".png")
        if not os.path.exists(original):
            continue
        mw, mh = Image.open(original).size
        pos = props["position"]
        size = (mw * mask_scale, mh * mask_scale)
        big = Image.new("L", (size[0] * ss, size[1] * ss), 0)
        draw = ImageDraw.Draw(big)
        factor = mask_scale * ss
        for ring in province["rings"]:
            # Contorno grosso = expande meio pixel da arte: fecha a fresta
            # entre vizinhas (os contornos passam pelos centros dos pixels).
            draw.polygon([((x - pos["x"]) * factor, (y - pos["y"]) * factor) for x, y in ring], fill=255, outline=255, width=factor)
        alpha = big.resize(size, Image.LANCZOS)
        mask = Image.new("RGBA", size, (255, 255, 255, 0))
        mask.putalpha(alpha)
        mask.save(os.path.join(MASK_DIR, code + ".png"), optimize=True)


def textures_xml(path, fmt):
    with open(path, "w") as handle:
        handle.write('<?xml version="1.0" encoding="utf-8"?>\n<Textures>\n'
                     '  <File pattern="*" format="%s" mipmap="true"/>\n</Textures>\n' % fmt)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scale", type=int, default=2, help="resolução dos blocos em relação à arte (2 = 8192x4096)")
    parser.add_argument("--mask-scale", type=int, default=2, help="resolução das máscaras das províncias")
    parser.add_argument("--skip-masks", action="store_true")
    args = parser.parse_args()

    os.makedirs(MAP_DIR, exist_ok=True)
    provinces = load_provinces()
    source = Image.open(SOURCE).convert("RGB")
    assert source.size == (WIDTH, HEIGHT), source.size

    overview = draw_borders(source, provinces, 1, width=1.0, supersample=3)
    overview.save(os.path.join(MAP_DIR, "overview.png"), optimize=True)
    print("overview.png")

    scale = args.scale
    columns, rows = WIDTH * scale // TILE, HEIGHT * scale // TILE
    src_tile = TILE // scale
    pad = 8
    for row in range(rows):
        for column in range(columns):
            x0, y0 = column * src_tile, row * src_tile
            box = (max(0, x0 - pad), max(0, y0 - pad), min(WIDTH, x0 + src_tile + pad), min(HEIGHT, y0 + src_tile + pad))
            region = source.crop(box).resize(((box[2] - box[0]) * scale, (box[3] - box[1]) * scale), Image.LANCZOS)
            region = region.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
            left, top = (x0 - box[0]) * scale, (y0 - box[1]) * scale
            tile = region.crop((left, top, left + TILE, top + TILE))
            tile = draw_borders(tile, provinces, scale, offset=(x0 * scale, y0 * scale), width=scale, supersample=2)
            tile.save(os.path.join(MAP_DIR, "tile_%d_%d.png" % (column, row)), compress_level=6)
        print("linha %d/%d de blocos" % (row + 1, rows))
    textures_xml(os.path.join(MAP_DIR, "textures.xml"), "dxt1")
    # Grade dos blocos para a página (CampaignMenu.renderMapTiles): tamanho
    # de cada bloco em pixels do mapa de 4096.
    with open(os.path.join(MOD, "campaigns", "total_warfield", "data", "map_tiles.json"), "w") as handle:
        json.dump({"columns": columns, "rows": rows, "size": src_tile, "scale": scale}, handle)

    if not args.skip_masks:
        build_masks(provinces, args.mask_scale)
        textures_xml(os.path.join(MASK_DIR, "textures.xml"), "rgba")
        print("máscaras das províncias em %dx" % args.mask_scale)


if __name__ == "__main__":
    main()
