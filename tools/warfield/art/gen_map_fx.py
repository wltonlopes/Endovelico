#!/usr/bin/env python3
"""Gera a arte dos efeitos do mapa de campanha (MapAnimator.js).

Saída em art/textures/ui/campaigns/grand_strategy/fx/:
- dot.png, ring.png: trilha e alvo da rota (máscaras brancas, a GUI tinge);
- swords.png: marcador de batalha;
- smoke.png, fire.png: fumaça e fogo (batalha, cidade sitiada com fome);
- tent.png: acampamento de cerco;
- flag_pole.png, flag_cloth_<n>.png (máscara) e flag_shade_<n>.png: a
  bandeira do exército tremulando em 4 quadros;
- cloud.png: nuvens que passam sobre o mapa.
Uso: python3 tools/art/gen_map_fx.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

MOD = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
OUT = os.path.join(MOD, "art/textures/ui/campaigns/grand_strategy/fx")
SS = 4


def canvas(size):
    return Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))


def save(img, name, size):
    img.resize((size, size) if isinstance(size, int) else size, Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)


def dot():
    img = canvas(32)
    d = ImageDraw.Draw(img)
    d.ellipse([3 * SS, 3 * SS, 29 * SS, 29 * SS], fill=(255, 255, 255, 255))
    save(img, "dot.png", 32)


def ring():
    img = canvas(64)
    d = ImageDraw.Draw(img)
    d.ellipse([4 * SS, 4 * SS, 60 * SS, 60 * SS], outline=(255, 255, 255, 255), width=6 * SS)
    save(img, "ring.png", 64)


def swords():
    size = 64
    img = canvas(size)
    d = ImageDraw.Draw(img)
    s = SS

    def sword(angle):
        # Lâmina, guarda e cabo em coordenadas locais, girados em volta do centro.
        cx, cy = 32, 32
        ca, sa = math.cos(angle), math.sin(angle)

        def p(x, y):
            return ((cx + x * ca - y * sa) * s, (cy + x * sa + y * ca) * s)

        blade = [p(-2.6, -26), p(2.6, -26), p(2.6, 10), p(0, 14), p(-2.6, 10)]
        blade = [p(0, -29), p(3, -24), p(3, 12), p(-3, 12), p(-3, -24)]
        guard = [p(-10, 12), p(10, 12), p(10, 16), p(-10, 16)]
        grip = [p(-2, 16), p(2, 16), p(2, 25), p(-2, 25)]
        pommel = p(0, 27.5)
        for poly, fill in ((blade, (225, 228, 235, 255)), (guard, (214, 170, 60, 255)), (grip, (110, 62, 30, 255))):
            d.polygon(poly, fill=fill, outline=(25, 20, 15, 255), width=int(1.6 * s))
        d.ellipse([pommel[0] - 3.4 * s, pommel[1] - 3.4 * s, pommel[0] + 3.4 * s, pommel[1] + 3.4 * s],
                  fill=(214, 170, 60, 255), outline=(25, 20, 15, 255), width=int(1.6 * s))
        # Brilho no meio da lâmina.
        d.line([p(0, -24), p(0, 10)], fill=(255, 255, 255, 255), width=int(1.2 * s))

    sword(math.radians(-40))
    sword(math.radians(40))
    # Contorno escuro suave para ler sobre qualquer terreno.
    alpha = img.getchannel("A").filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(2 * SS))
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    halo.putalpha(alpha.point(lambda v: int(v * 0.65)))
    halo.alpha_composite(img)
    save(halo, "swords.png", size)


def smoke():
    size = 64
    # Fundo com a cor da fumaça (alfa 0) para o desfoque não escurecer a borda.
    img = Image.new("RGBA", (size * SS, size * SS), (150, 150, 155, 0))
    rng = random.Random(3)
    d = ImageDraw.Draw(img)
    for _ in range(14):
        r = rng.uniform(9, 16) * SS
        x = rng.uniform(22, 42) * SS
        y = rng.uniform(22, 42) * SS
        g = rng.randint(130, 180)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(g, g, g + 6, 150))
    img = img.filter(ImageFilter.GaussianBlur(5 * SS))
    save(img, "smoke.png", size)


def fire():
    size = 64
    img = canvas(size)
    d = ImageDraw.Draw(img)
    for scale, color in ((1.0, (220, 60, 10, 230)), (0.72, (250, 140, 20, 240)), (0.45, (255, 225, 110, 255))):
        pts = []
        for i in range(60):
            t = i / 59 * 2 * math.pi
            # Gota de fogo: base redonda, ponta para cima.
            x = math.sin(t) * 14 * scale
            y = -math.cos(t) * 20 * scale
            if y < 0:
                x *= 1 + y / (20 * scale) * 0.85
            pts.append(((32 + x) * SS, (40 + y + 6 * (1 - scale)) * SS))
        d.polygon(pts, fill=color)
    img = img.filter(ImageFilter.GaussianBlur(0.8 * SS))
    save(img, "fire.png", size)


def tent():
    size = 64
    img = canvas(size)
    d = ImageDraw.Draw(img)
    s = SS
    shadow = [(10 * s, 50 * s), (56 * s, 50 * s), (60 * s, 54 * s), (14 * s, 54 * s)]
    d.polygon(shadow, fill=(0, 0, 0, 90))
    d.polygon([(32 * s, 12 * s), (54 * s, 50 * s), (32 * s, 50 * s)], fill=(196, 172, 128, 255), outline=(60, 45, 30, 255), width=2 * s)
    d.polygon([(32 * s, 12 * s), (10 * s, 50 * s), (32 * s, 50 * s)], fill=(228, 208, 160, 255), outline=(60, 45, 30, 255), width=2 * s)
    d.polygon([(32 * s, 30 * s), (26 * s, 50 * s), (38 * s, 50 * s)], fill=(70, 50, 30, 255))
    d.line([(32 * s, 6 * s), (32 * s, 14 * s)], fill=(70, 50, 30, 255), width=2 * s)
    save(img, "tent.png", size)


def flag():
    """Mastro e pano em 4 quadros (o pano é máscara; a sombra das dobras vai por cima).

    Desenhado em 48x64 e salvo em 64x64: o jogo exige lados em potência de 2,
    e a GUI estica a imagem no tamanho do objeto de qualquer forma.
    """
    w, h = 48, 64
    pole = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(pole)
    d.rectangle([6 * SS, 4 * SS, 9 * SS, 62 * SS], fill=(90, 60, 30, 255), outline=(30, 20, 10, 255), width=SS)
    d.ellipse([4 * SS, 1 * SS, 11 * SS, 8 * SS], fill=(220, 180, 70, 255), outline=(40, 30, 10, 255), width=SS)
    pole.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, "flag_pole.png"), optimize=True)
    for frame in range(4):
        cloth = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        shade = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
        dc = ImageDraw.Draw(cloth)
        ds = ImageDraw.Draw(shade)
        phase = frame / 4 * 2 * math.pi
        top, bottom = [], []
        for i in range(41):
            u = i / 40
            x = 9 + u * 36
            wave = math.sin(u * 2.6 * math.pi - phase) * 3.2 * u
            top.append((x * SS, (8 + wave) * SS))
            bottom.append((x * SS, (34 + wave + u * 2) * SS))
        dc.polygon(top + bottom[::-1], fill=(255, 255, 255, 255))
        # Faixas escuras onde a onda vira (dobras).
        for i in range(40):
            u = (i + 0.5) / 40
            slope = math.cos(u * 2.6 * math.pi - phase)
            if slope < 0:
                a = int(-slope * 85 * min(1, u * 3))
                x0, x1 = top[i][0], top[i + 1][0]
                ds.polygon([(x0, top[i][1]), (x1, top[i + 1][1]), (x1, bottom[i + 1][1]), (x0, bottom[i][1])], fill=(0, 0, 0, a))
        mask = cloth.getchannel("A")
        shade.putalpha(Image.composite(shade.getchannel("A"), Image.new("L", shade.size, 0), mask))
        cloth.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, f"flag_cloth_{frame}.png"), optimize=True)
        shade.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, f"flag_shade_{frame}.png"), optimize=True)


def cloud():
    w, h = 256, 128
    img = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    rng = random.Random(11)
    for _ in range(26):
        r = rng.uniform(14, 34)
        x = rng.uniform(50, 206)
        y = rng.uniform(48, 80) - (1 - abs(x - 128) / 90) * 14
        d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=(255, 255, 255, 120))
    img = img.filter(ImageFilter.GaussianBlur(9))
    img.save(os.path.join(OUT, "cloud.png"), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    dot()
    ring()
    swords()
    smoke()
    fire()
    tent()
    flag()
    cloud()
    with open(os.path.join(OUT, "textures.xml"), "w", encoding="utf-8") as fh:
        fh.write('<?xml version="1.0" encoding="utf-8"?>\n<Textures>\n  <File pattern="*" format="rgba" mipmap="false"/>\n</Textures>\n')
    print("fx em", OUT)


if __name__ == "__main__":
    main()
