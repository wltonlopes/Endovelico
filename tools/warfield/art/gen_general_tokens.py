#!/usr/bin/env python3
"""
Texturas do estandarte dos generais no mapa de campanha (Total Warfield).

Brancas com transparência: a campanha pinta cada uma na cor da tribo com
"color:R G B A:textureAsMask:<textura>" (gui/campaigns/grand_strategy/CampaignMenu.js).
  ring.png   anel grosso com bisel (moldura do retrato)
  glow.png   halo suave (general selecionado)
  badge.png  plaquinha arredondada (número de soldados)
  shadow.png sombra elíptica sob o estandarte
Uso: python3 tools/art/gen_general_tokens.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..",
                   "art", "textures", "ui", "campaigns", "total_warfield", "general")
SS = 4  # supersampling para bordas suaves


def save(img, name, size):
    img.resize(size, Image.LANCZOS).save(os.path.join(OUT, name))


def ring():
    n = 128 * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = n / 2
    outer, inner = n * 0.49, n * 0.41
    # Anel com bisel: mais claro no topo, mais escuro embaixo (o alfa vira
    # a máscara; o brilho fica no canal de cor e é multiplicado pela cor).
    d.ellipse([c - outer, c - outer, c + outer, c + outer], fill=(255, 255, 255, 255))
    d.ellipse([c - inner, c - inner, c + inner, c + inner], fill=(0, 0, 0, 0))
    # Filete fino interno, para separar o retrato.
    edge = inner + n * 0.012
    d.ellipse([c - edge, c - edge, c + edge, c + edge], outline=(255, 255, 255, 255), width=SS * 2)
    save(img, "ring.png", (128, 128))


def glow():
    n = 128 * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = n / 2
    for i in range(40):
        r = n * (0.5 - i * 0.004)
        a = int(255 * (i / 40) ** 2)
        d.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, a))
    hole = n * 0.36
    d.ellipse([c - hole, c - hole, c + hole, c + hole], fill=(0, 0, 0, 0))
    img = img.filter(ImageFilter.GaussianBlur(SS * 3))
    save(img, "glow.png", (128, 128))


def badge():
    w, h = 128 * SS, 64 * SS
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([SS * 2, SS * 2, w - SS * 2, h - SS * 2], radius=h // 2, fill=(255, 255, 255, 255))
    save(img, "badge.png", (128, 64))  # potência de 2 (o jogo exige)


def shadow():
    w, h = 128 * SS, 64 * SS
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.1, h * 0.15, w * 0.9, h * 0.85], fill=(255, 255, 255, 200))
    img = img.filter(ImageFilter.GaussianBlur(SS * 6))
    save(img, "shadow.png", (128, 64))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    ring()
    glow()
    badge()
    shadow()
    with open(os.path.join(OUT, "textures.xml"), "w") as handle:
        handle.write('<?xml version="1.0" encoding="utf-8"?>\n<Textures>\n  <File pattern="*" format="rgba" mipmap="false"/>\n</Textures>\n')
    print("texturas em", os.path.normpath(OUT))
