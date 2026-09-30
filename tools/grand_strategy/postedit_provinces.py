"""
Ajustes finos sobre as províncias já geradas (máscaras + provinces.geojson do
Endovelico), sem refazer tudo a partir do 0ad_grand_strat:
  - divide Escandinávia / Finlândia pelo golfo de Bótnia;
  - arquipélagos: ilhas com uma margem pequena, em vez do polígono original;
  - refaz máscaras (lados em potência de 2), posição, centro, geometria,
    área e vizinhanças (links) de todas as províncias.
Rodar da raiz do mod: python3 tools/grand_strategy/postedit_provinces.py
"""
import json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

D = 'art/textures/ui/campaigns/grand_strategy/provinces/'
GEO = 'campaigns/grand_strategy/data/provinces.geojson'
MAP = 'art/textures/ui/campaigns/grand_strategy/art/campaign_map.png'

# ------------------------------------------------------------ terra x mar (igual ao rebuild)
img = np.array(Image.open(MAP).convert('RGB')).astype(int)
H, W = img.shape[:2]
r, g, b = img[..., 0], img[..., 1], img[..., 2]
water = (b > r + 15) & (b >= g - 5)
water = cv2.morphologyEx(water.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
lab, n = ndi.label(water)
sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
water = np.isin(lab, [i for i, s in enumerate(sizes, 1) if s >= 400])
land = ~water
lab, n = ndi.label(land)
sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
land = np.isin(lab, [i for i, s in enumerate(sizes, 1) if s >= 30])

# ------------------------------------------------------------ rótulos a partir das máscaras atuais
geo = json.load(open(GEO))
feats = geo['features']
P = {f['properties']['code']: f['properties'] for f in feats}
codes = list(P)
idx = {c: i + 1 for i, c in enumerate(codes)}
isSea = {c: P[c]['provinceType'] == 'sea' for c in codes}
label = np.zeros((H, W), np.int16)
for c in sorted(codes, key=lambda c: not isSea[c]):  # mares primeiro, terra por cima
    p = P[c]
    w, h = p['bbox']['w'], p['bbox']['h']
    m = np.array(Image.open(D + c + '.png').convert('RGBA'))[:h, :w, 3] > 127
    x0, y0 = p['position']['x'], p['position']['y']
    sub = label[y0:y0 + h, x0:x0 + w]
    sub[m[:sub.shape[0], :sub.shape[1]]] = idx[c]

# ------------------------------------------------------------ Escandinávia / Finlândia
both = (label == idx['scandinavia']) | (label == idx['finland'])
ys, xs = np.nonzero(both)
BOTHNIA_X = 1975          # topo do golfo de Bótnia; a leste fica a Finlândia (e a Lapônia finlandesa)
east = xs >= BOTHNIA_X
label[ys[~east], xs[~east]] = idx['scandinavia']
label[ys[east], xs[east]] = idx['finland']

# ------------------------------------------------------------ arquipélagos
ARCHIPELAGOS = ['antilles', 'maldivas', 'maluku', 'polinesia', 'ryukyu']
HALO = 6
kern = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * HALO + 1, 2 * HALO + 1))
for c in ARCHIPELAGOS:
    area = label == idx[c]
    islands = area & land
    if not islands.any():
        print('arquipélago sem ilhas, mantido:', c)
        continue
    halo = cv2.dilate(islands.astype(np.uint8), kern) > 0
    new = halo & area
    label[area & ~new] = 0
    print('%s: %d px -> %d px' % (c, area.sum(), new.sum()))

# ------------------------------------------------------------ saída
pot = lambda n: 1 << (max(1, int(n)) - 1).bit_length()
def grow(m, px):
    return cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))) > 0

live = [c for c in codes if (label == idx[c]).any()]
for c in codes:
    if c not in live:
        print('província sem área:', c)
for c in live:
    m = label == idx[c]
    ys, xs = np.nonzero(m)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = m[y0:y1, x0:x1]
    w, h = x1 - x0, y1 - y0
    rgba = np.zeros((pot(h), pot(w), 4), np.uint8)
    rgba[:h, :w, :3] = 255
    rgba[:h, :w, 3] = crop * 255
    Image.fromarray(rgba, 'RGBA').save(D + c + '.png', optimize=True)
    cl, cn = ndi.label(crop)
    big = (cl == (np.argmax(ndi.sum(np.ones_like(cl), cl, range(1, cn + 1))) + 1)) if cn > 1 else crop
    dt = ndi.distance_transform_edt(np.pad(big, 1))[1:-1, 1:-1]
    cy, cx = np.unravel_index(np.argmax(dt), dt.shape)
    cnts, _ = cv2.findContours(big.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = cv2.approxPolyDP(max(cnts, key=cv2.contourArea), 1.5, True)[:, 0, :]
    ring = [[float(x + x0), -float(y + y0)] for x, y in cnt]
    ring.append(ring[0])
    p = P[c]
    p['position'] = {"x": int(x0), "y": int(y0)}
    p['bbox'] = {"w": int(w), "h": int(h)}
    p['maskSize'] = [pot(w), pot(h)]
    p['centerpoint'] = [int(cx + x0), int(cy + y0)]
    p['area'] = int(m.sum())
    for f in feats:
        if f['properties']['code'] == c:
            f['geometry'] = {"type": "Polygon", "coordinates": [ring]}

links = {c: set() for c in live}
for c in live:
    m = label == idx[c]
    ys, xs = np.nonzero(m)
    pad = 12
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    sub = label[y0:y1, x0:x1]
    sm = m[y0:y1, x0:x1]
    touch = set(np.unique(sub[grow(sm, 3)]))
    for k in np.unique(sub[grow(sm, 8 if not isSea[c] else 3)]):
        if not k or k == idx[c]:
            continue
        o = codes[k - 1]
        if o not in links:
            continue
        # terra-mar e mar-mar precisam encostar; terra-terra aceita estreitos de ~8 px
        if (isSea[c] or isSea[o]) and k not in touch:
            continue
        links[c].add(o)
        links[o].add(c)
# ilhas isoladas: liga à província mais próxima (até 150 px, senão só a mais próxima)
for c in live:
    if links[c]:
        continue
    m = label == idx[c]
    dist = ndi.distance_transform_edt(~m)
    found = []
    for wantSea in (False, True):
        cand = np.isin(label, [idx[o] for o in live if isSea[o] == wantSea and o != c])
        if cand.any():
            d = np.where(cand, dist, np.inf)
            y, x = np.unravel_index(np.argmin(d), d.shape)
            found.append((d[y, x], codes[label[y, x] - 1]))
    for d, o in ([f for f in found if f[0] <= 150] or [min(found)]):
        links[c].add(o)
        links[o].add(c)
        print('ilha %s ligada a %s (%d px)' % (c, o, d))

geo['features'] = [f for f in feats if f['properties']['code'] in live]
for f in geo['features']:
    f['properties']['links'] = sorted(links[f['properties']['code']])
json.dump(geo, open(GEO, 'w'), ensure_ascii=False)
print('províncias:', len(live), '| sem vizinhos:', [c for c in live if not links[c]])
