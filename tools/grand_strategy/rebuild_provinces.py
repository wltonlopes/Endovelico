"""
Reconstrói as províncias do 0ad_grand_strat para casarem com o mapa-múndi
(campaign_map.png):
  - recorta as províncias de terra pela linha de costa real;
  - preenche a terra sem dono com a província mais próxima;
  - corrige províncias com nome trocado ou fora do lugar;
  - gera máscaras recortadas (maskSize), geometria, centro e vizinhanças (links).
Uso: rebuild.py <pasta_saida>
"""
import json, os, sys, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

GS = '/home/welton/snap/0ad/743/.local/share/0ad/mods/0ad_grand_strat/'
ART = GS + 'art/textures/ui/campaigns/grand_strategy/'
OUT = sys.argv[1]

# ------------------------------------------------------------ terra x mar
img = np.array(Image.open(ART + 'art/campaign_map.png').convert('RGB')).astype(int)
H, W = img.shape[:2]
r, g, b = img[..., 0], img[..., 1], img[..., 2]
water = (b > r + 15) & (b >= g - 5)
# Abertura: some com rios finos (e o pontilhado das ondas), mares e lagos ficam.
water = cv2.morphologyEx(water.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
lab, n = ndi.label(water)
sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
water = np.isin(lab, [i for i, s in enumerate(sizes, 1) if s >= 400])
land = ~water
lab, n = ndi.label(land)
sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
land = np.isin(lab, [i for i, s in enumerate(sizes, 1) if s >= 30])

# ------------------------------------------------------------ províncias originais
geo = json.load(open(GS + 'campaigns/grand_strategy/data/provinces.geojson'))
props = {}
for f in geo['features']:
    props.setdefault(f['properties']['code'], dict(f['properties']))
codes = list(props)
isSea = {c: props[c].get('provinceType') == 'sea' or 'ocean' in c for c in codes}
masks = {c: np.array(Image.open(ART + 'provinces/' + c + '.png'))[..., 3] > 127 for c in codes}

label = np.zeros((H, W), np.int16)
index = {c: i + 1 for i, c in enumerate(codes)}
order = sorted([c for c in codes if isSea[c]], key=lambda c: -masks[c].sum()) + \
        sorted([c for c in codes if not isSea[c]], key=lambda c: -masks[c].sum())
for c in order:
    x0, y0 = int(props[c]['position']['x']), int(props[c]['position']['y'])
    ys, xs = np.nonzero(masks[c])
    ys += y0; xs += x0
    ok = (xs >= 0) & (ys >= 0) & (xs < W) & (ys < H)
    label[ys[ok], xs[ok]] = index[c]

def add_code(code, name, civs, population='low'):
    codes.append(code)
    index[code] = len(codes)
    isSea[code] = False
    props[code] = {"code": code, "name": name, "capital": None, "culture": None, "civs": civs,
                   "provinceType": "land", "terrain": None, "mapTypes": [], "resources": None,
                   "religion": None, "population": population}

def rename(old, new, name, civs=None):
    """A forma de `old` passa a ser a província `new`."""
    p = props.pop(old)
    p['code'] = new; p['name'] = name
    if civs is not None:
        p['civs'] = civs
    props[new] = p
    codes[codes.index(old)] = new
    index[new] = index.pop(old)
    isSea[new] = isSea.pop(old)

def merge(src, dst):
    label[label == index[src]] = index[dst]
    drop(src)

def drop(code):
    label[label == index[code]] = 0
    props.pop(code)
    dropped.add(code)

def claim_component(code, x, y, only_unowned=True):
    """Dá a `code` a massa de terra (sem dono) que contém o ponto (x, y)."""
    free = land & (label == 0) if only_unowned else land
    lab, _ = ndi.label(free)
    k = lab[y, x]
    if not k:
        # procura a massa livre mais próxima do ponto
        ys, xs = np.nonzero(lab)
        j = np.argmin((xs - x) ** 2 + (ys - y) ** 2)
        k = lab[ys[j], xs[j]]
    label[lab == k] = index[code]

dropped = set()
log = []

# --- dados quebrados
drop('delminium')                     # cópia da posição de Sri Lanka, sem forma própria
drop('belgica')                       # coberta por helvecia/cisalpine_gaul; a Bélgica real já é "lowlands"
props['north_atlantic_ocean_02']['provinceType'] = 'sea'

# --- Sudeste Asiático: nomes trocados entre as formas
merge('malaya', 'siam')               # as três formas sobre Bornéu viram uma só
merge('burma_interior', 'siam')
rename('borneo', 'celebes', 'Celebes', ['yawa'])          # forma sobre Sulawesi
rename('siam', 'borneo', 'Borneo', ['malay'])             # forma sobre Bornéu
rename('assam', 'siam', 'Siam', ['suva'])                 # forma sobre o norte da Tailândia
rename('ferghana', 'assam', 'Assam (Kamarupa)', ['maur']) # forma sobre Assam/Manipur
rename('bengal', 'malaya', 'Malaya', ['malay'])           # forma sobre a península Malaia
rename('sumatra', 'java', 'Java', ['yawa'])               # forma sobre Java
rename('tamilakam', 'sumatra', 'Sumatra', ['malay'])      # forma sobre Sumatra
rename('arakan', 'chenla', 'Chenla (Khmer)', ['suva'])    # forma sobre o Camboja
rename('new_guinea', 'maluku', 'Maluku', ['yawa'])        # forma sobre as Molucas/Pequenas Sundas
rename('guangdong', 'luzon', 'Luzon', None)               # forma sobre Luzon; o Guangdong real é 'nanyue'

# --- Norte da Europa deslocado para leste
rename('scandinavia', 'aestia', 'Aestia (Baltic)', ['sarm'])
rename('finland', 'venedia', 'Venedia', ['sarm'])

# --- ilhas e massas de terra sem província
add_code('new_guinea', 'New Guinea', ['yawa'])
claim_component('new_guinea', 3944, 1241)
# Madagascar estava desenhada no continente: a forma antiga vai para os vizinhos.
label[label == index['madagascar']] = 0
claim_component('madagascar', 2317, 1550)
label[label == index['lanka']] = 0
add_code('scandinavia', 'Scandinavia', ['germ'])
add_code('finland', 'Finland', ['ural'])
# Península escandinava + Finlândia: divide pelo golfo de Bótnia.
free = land & (label == 0)
lab, _ = ndi.label(free)
k = lab[109, 2068]
comp = lab == k
ys, xs = np.nonzero(comp)
east = xs > 2120
label[ys[~east], xs[~east]] = index['scandinavia']
label[ys[east], xs[east]] = index['finland']

# ------------------------------------------------------------ recorte pela costa
seaIdx = [index[c] for c in codes if c in props and isSea[c]]
landLabel = label.copy()
landLabel[np.isin(landLabel, seaIdx)] = 0
# Arquipélagos (ilhas pequenas demais para a máscara): mantém a forma original.
archipelago = set()
for c in codes:
    if c not in props or isSea[c] or c in dropped:
        continue
    m = landLabel == index[c]
    a = m.sum()
    if a and (m & land).sum() / a < 0.5 and c not in ('madagascar', 'new_guinea', 'lanka'):
        archipelago.add(c)
archMask = np.isin(landLabel, [index[c] for c in archipelago])
landLabel[~land & ~archMask] = 0

# terra sem dono -> província de terra mais próxima (até 160 px)
dist, (iy, ix) = ndi.distance_transform_edt(landLabel == 0, return_indices=True)
fill = land & (landLabel == 0) & (dist <= 160)
landLabel[fill] = landLabel[iy[fill], ix[fill]]
# Sri Lanka: presa à Índia pela Ponte de Adão na máscara; recorta a ilha por caixa.
box = np.zeros_like(land)
box[1050:1122, 2843:2892] = True
landLabel[land & box] = index['lanka']
log.append('lanka: %d px' % (land & box).sum())
leftover = land & (landLabel == 0)
lab, n = ndi.label(leftover)
if n:
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    for i, s in enumerate(sizes, 1):
        if s > 500:
            ys, xs = np.nonzero(lab == i)
            log.append('terra sem província: %d px em (%d,%d)' % (s, xs.mean(), ys.mean()))

# mares: forma original, só onde é água
final = landLabel.copy()
seaLabel = label.copy()
seaLabel[~np.isin(seaLabel, seaIdx)] = 0
put = (final == 0) & (seaLabel > 0) & ~land
final[put] = seaLabel[put]

# ------------------------------------------------------------ saída
os.makedirs(OUT + '/provinces', exist_ok=True)
live = list(dict.fromkeys(c for c in codes if c in props and (final == index[c]).any()))
for c in codes:
    if c in props and c not in live:
        log.append('província sem área, removida: ' + c)

k8 = np.ones((3, 3), np.uint8)
dil_land = {}
features = []
for c in live:
    m = final == index[c]
    ys, xs = np.nonzero(m)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    crop = m[y0:y1, x0:x1]
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = crop * 255
    Image.fromarray(rgba, 'RGBA').save(OUT + '/provinces/' + c + '.png', optimize=True)

    # maior pedaço: contorno (geometria) e centro (ponto mais interno)
    cl, cn = ndi.label(crop)
    big = (cl == (np.argmax(ndi.sum(np.ones_like(cl), cl, range(1, cn + 1))) + 1)) if cn > 1 else crop
    dt = ndi.distance_transform_edt(np.pad(big, 1))[1:-1, 1:-1]
    cy, cx = np.unravel_index(np.argmax(dt), dt.shape)
    cnts, _ = cv2.findContours(big.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cnts, key=cv2.contourArea)
    cnt = cv2.approxPolyDP(cnt, 1.5, True)[:, 0, :]
    ring = [[float(x + x0), -float(y + y0)] for x, y in cnt]
    ring.append(ring[0])

    p = props[c]
    p['provinceType'] = 'sea' if isSea[c] else 'land'
    p['position'] = {"x": int(x0), "y": int(y0)}
    p['bbox'] = {"w": int(x1 - x0), "h": int(y1 - y0)}
    p['maskSize'] = [int(x1 - x0), int(y1 - y0)]
    p['centerpoint'] = [int(cx + x0), int(cy + y0)]
    p['area'] = int(m.sum())
    features.append({"type": "Feature", "properties": p, "geometry": {"type": "Polygon", "coordinates": [ring]}})

# vizinhanças: terra-terra encostadas (ou separadas por estreito de até ~8 px),
# terra-mar e mar-mar encostados.
def grow(m, px):
    return cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))) > 0

links = {c: set() for c in live}
for c in live:
    m = final == index[c]
    ys, xs = np.nonzero(m)
    pad = 12
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    sub = final[y0:y1, x0:x1]
    sm = m[y0:y1, x0:x1]
    near = np.unique(sub[grow(sm, 8 if not isSea[c] else 3)])
    for k in near:
        if not k or k == index[c]:
            continue
        o = codes[k - 1]
        if o not in links:
            continue
        if isSea[c] != isSea[o] or isSea[c]:
            # terra-mar e mar-mar precisam encostar de fato
            if not (np.unique(sub[grow(sm, 3)]) == k).any():
                continue
        links[c].add(o)
        links[o].add(c)
# Ilhas sem vizinho encostado: liga à província mais próxima (terra e mar).
for c in live:
    if links[c]:
        continue
    m = final == index[c]
    dist, (iy, ix) = ndi.distance_transform_edt(~m, return_indices=True)
    found = []
    for want_sea in (False, True):
        cand = (final > 0) & ~m & np.isin(final, [index[o] for o in live if isSea[o] == want_sea])
        if not cand.any():
            continue
        d = np.where(cand, dist, np.inf)
        y, x = np.unravel_index(np.argmin(d), d.shape)
        found.append((d[y, x], codes[final[y, x] - 1]))
    near = [f for f in found if f[0] <= 150] or [min(found)]
    for d, o in near:
        links[c].add(o); links[o].add(c)
        log.append('ilha %s ligada a %s (%d px)' % (c, o, d))
for f in features:
    f['properties']['links'] = sorted(links[f['properties']['code']])

out = {"type": "FeatureCollection", "name": "provinces", "features": features}
json.dump(out, open(OUT + '/provinces.geojson', 'w'), ensure_ascii=False)
np.savez_compressed(OUT + '/labels_final.npz', label=final, land=land, codes=np.array(codes))
isolated = [c for c in live if not links[c]]
print('\n'.join(log))
print('províncias:', len(live), 'terra:', sum(1 for c in live if not isSea[c]), 'mar:', sum(1 for c in live if isSea[c]))
print('arquipélagos mantidos:', sorted(archipelago))
print('sem vizinhos:', isolated)
print('terra coberta: %.3f' % ((final > 0) & land).sum(), '/', land.sum())
