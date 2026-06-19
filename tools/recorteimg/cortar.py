import cv2
import numpy as np
from PIL import Image
import os
import math

# =====================================================
# CONFIGURAÇÃO
# =====================================================

TAMANHO = 256
TOLERANCIA = 25

PASTA_SCRIPT = os.path.dirname(
    os.path.abspath(__file__)
)

INPUT = os.path.join(
    PASTA_SCRIPT,
    "img.png"
)

OUTPUT = os.path.join(
    PASTA_SCRIPT,
    "saida"
)

os.makedirs(
    OUTPUT,
    exist_ok=True
)

# =====================================================
# ABRIR IMAGEM
# =====================================================

img = cv2.imread(INPUT)

if img is None:
    raise RuntimeError(
        f"Não foi possível abrir:\n{INPUT}"
    )

rgb = cv2.cvtColor(
    img,
    cv2.COLOR_BGR2RGB
)

gray = cv2.cvtColor(
    img,
    cv2.COLOR_BGR2GRAY
)

# =====================================================
# REMOVER FUNDO BRANCO
# =====================================================

mask = (
    gray < 245
).astype(np.uint8) * 255

kernel = np.ones(
    (3,3),
    np.uint8
)

mask = cv2.morphologyEx(
    mask,
    cv2.MORPH_OPEN,
    kernel
)

# =====================================================
# COMPONENTES CONECTADOS
# =====================================================

# remover linhas pretas finas
kernel = np.ones((5,5), np.uint8)

mask = cv2.morphologyEx(
    mask,
    cv2.MORPH_OPEN,
    kernel
)

mask = cv2.erode(
    mask,
    np.ones((3,3), np.uint8),
    iterations=1
)

####
num_labels, labels, stats, centroids = (
    cv2.connectedComponentsWithStats(
        mask,
        connectivity=8
    )
)

objetos = []

for i in range(1, num_labels):

    x = stats[i, cv2.CC_STAT_LEFT]
    y = stats[i, cv2.CC_STAT_TOP]
    w = stats[i, cv2.CC_STAT_WIDTH]
    h = stats[i, cv2.CC_STAT_HEIGHT]
    area = stats[i, cv2.CC_STAT_AREA]

    if area < 2000:
        continue

    objetos.append(
        (x, y, w, h)
    )

# =====================================================
# ORDENAÇÃO
# =====================================================

objetos.sort(
    key=lambda o: (
        o[1] // 100,
        o[0]
    )
)

# Detecta componentes conectados
num_labels, labels, stats, centroids = (
    cv2.connectedComponentsWithStats(
        mask,
        connectivity=8
    )
)

objetos = []

for i in range(1, num_labels):

    x = stats[i, cv2.CC_STAT_LEFT]
    y = stats[i, cv2.CC_STAT_TOP]
    w = stats[i, cv2.CC_STAT_WIDTH]
    h = stats[i, cv2.CC_STAT_HEIGHT]
    area = stats[i, cv2.CC_STAT_AREA]

    # Ignorar textos e ruídos
    if area < 2000:
        continue

    objetos.append(
        (x, y, w, h)
    )

# Ordenação
objetos.sort(
    key=lambda o: (
        o[1] // 100,
        o[0]
    )
)

# =====================================================
# Divisão baseada em múltiplos de 256 px
# =====================================================

TAMANHO = 256
TOLERANCIA = 25

objetos_finais = []

for x, y, w, h in objetos:

    # Usa apenas a parte superior para inferir colunas
    altura_util = min(h, 256)

    crop_mask = mask[
        y:y+altura_util,
        x:x+w
    ]

    ocupacao = np.sum(
        crop_mask > 0,
        axis=0
    )

    ativos = np.where(
        ocupacao > altura_util * 0.10
    )[0]

    if len(ativos) == 0:

        largura_util = w
        inicio_x = x
        n_colunas = 1

    else:

        largura_util = (
            ativos[-1]
            - ativos[0]
        )

        inicio_x = (
            x + ativos[0]
        )

        n_colunas = max(
            1,
            round(
                largura_util
                / TAMANHO
            )
        )

    # Está próximo de múltiplos de 256?
    if abs(
        largura_util
        - n_colunas*TAMANHO
    ) <= TOLERANCIA * n_colunas:

        largura_celula = (
            largura_util
            / n_colunas
        )

        for c in range(
            n_colunas
        ):

            objetos_finais.append(
                (
                    int(
                        inicio_x
                        + c * largura_celula
                    ),
                    y,
                    int(
                        largura_celula
                    ),
                    h
                )
            )

    else:

        objetos_finais.append(
            (x, y, w, h)
        )

# =====================================================
# EXPORTAÇÃO
# =====================================================

contador = 1

for x, y, w, h in objetos_finais:

    crop = rgb[
        y:y+h,
        x:x+w
    ]

    if crop.size == 0:
        continue

    pil = Image.fromarray(
        crop
    ).convert("RGBA")

    dados = np.array(
        pil
    )

    r = dados[:,:,0]
    g = dados[:,:,1]
    b = dados[:,:,2]

    branco = (
        (r > 240) &
        (g > 240) &
        (b > 240)
    )

    # Preserva transparências existentes
    dados[:,:,3] = np.where(
        branco,
        0,
        dados[:,:,3]
    )

    pil = Image.fromarray(
        dados
    )

    bbox = pil.getbbox()

    if bbox is None:
        continue

    pil = pil.crop(
        bbox
    )

    if (
        pil.width < 32
        or
        pil.height < 32
    ):
        continue

    pil.thumbnail(
        (256,256),
        Image.Resampling.LANCZOS
    )

    final = Image.new(
        "RGBA",
        (256,256),
        (0,0,0,0)
    )

    px = (
        256 - pil.width
    ) // 2

    py = (
        256 - pil.height
    ) // 2

    final.paste(
        pil,
        (px, py),
        pil
    )

    nome = (
        f"01_{contador:03d}.png"
    )

    caminho = os.path.join(
        OUTPUT,
        nome
    )

    final.save(
        caminho
    )

    print(
        f"Salvo: {nome}"
    )

    contador += 1

print(
    f"\nConcluído: {contador-1} texturas exportadas."
)