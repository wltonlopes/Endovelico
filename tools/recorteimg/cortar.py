import cv2
import numpy as np
from PIL import Image
import os

#Instalando no PIP Linux: sudo apt install python3-opencv python3-pil python3-numpy

# Pasta onde o próprio script está
PASTA_SCRIPT = os.path.dirname(os.path.abspath(__file__))

# Configurações
INPUT = os.path.join(PASTA_SCRIPT, "imagem_grande.png")
OUTPUT = os.path.join(PASTA_SCRIPT, "saida")

os.makedirs(OUTPUT, exist_ok=True)

# Abrir imagem
img = cv2.imread(INPUT)

# Verificar se carregou
if img is None:
    print(f"Erro: não foi possível abrir {INPUT}")
    exit()

# Converter BGR → RGB
rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

# Detectar fundo branco
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

_, thresh = cv2.threshold(
    gray,
    245,
    255,
    cv2.THRESH_BINARY_INV
)

# Encontrar objetos
contours, _ = cv2.findContours(
    thresh,
    cv2.RETR_EXTERNAL,
    cv2.CHAIN_APPROX_SIMPLE
)

objetos = []

for c in contours:

    x, y, w, h = cv2.boundingRect(c)

    # Ignorar pequenos ruídos
    if w < 20 or h < 20:
        continue

    objetos.append((x, y, w, h))


# Ordenar por linhas
tolerancia_linha = 40

objetos = sorted(
    objetos,
    key=lambda k: k[1]
)

linhas = []

for obj in objetos:

    x, y, w, h = obj

    inserido = False

    for linha in linhas:

        if abs(y - linha[0][1]) < tolerancia_linha:

            linha.append(obj)
            inserido = True
            break

    if not inserido:
        linhas.append([obj])


# Ordenar cada linha esquerda → direita
objetos_ordenados = []

for linha in linhas:

    linha = sorted(
        linha,
        key=lambda k: k[0]
    )

    objetos_ordenados.extend(linha)

contador = 1

for x, y, w, h in objetos_ordenados:

    crop = rgb[y:y+h, x:x+w]

    pil = Image.fromarray(crop)
    pil = pil.convert("RGBA")

    dados = np.array(pil)

    # Separar canais corretamente
    r = dados[:, :, 0]
    g = dados[:, :, 1]
    b = dados[:, :, 2]

    # Detectar branco
    branco = (
        (r > 245) &
        (g > 245) &
        (b > 245)
    )

    # Tornar branco transparente
    dados[:, :, 3] = np.where(
        branco,
        0,
        255
    )

    pil = Image.fromarray(dados)

    # Redimensionar mantendo proporção
    pil.thumbnail(
        (256,256),
        Image.Resampling.LANCZOS
    )

    # Criar tela transparente
    final = Image.new(
        "RGBA",
        (256,256),
        (0,0,0,0)
    )

    px = (256 - pil.width)//2
    py = (256 - pil.height)//2

    final.paste(
        pil,
        (px, py),
        pil
    )

    nome = f"01_{contador:03d}.png"

    final.save(
        os.path.join(
            OUTPUT,
            nome
        )
    )

    print(f"Salvo: {nome}")

    contador += 1

print("Concluído.")
