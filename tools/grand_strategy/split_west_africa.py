"""
Subdivide as províncias grandes da África Ocidental (Senegâmbia, Gana,
Alto Níger, Benin, Nigéria...).

A área somada das províncias de REGION é repartida de novo por "sementes"
(Voronoi, igual às fronteiras retas do resto do mapa). Os códigos que já
existiam continuam existindo (saves antigos e tribos iniciais seguem válidos);
os novos são acrescentados ao provinces.geojson.

Refaz máscara, posição, centro, geometria e área das províncias da região e
as vizinhanças (links) de todo o mapa.

Rodar da raiz do mod:
    python3 tools/grand_strategy/split_west_africa.py            # aplica
    python3 tools/grand_strategy/split_west_africa.py --preview x.png   # só desenha
"""
import json, sys, numpy as np, cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

D = 'art/textures/ui/campaigns/grand_strategy/provinces/'
GEO = 'campaigns/grand_strategy/data/provinces.geojson'
MAP = 'art/textures/ui/campaigns/grand_strategy/art/campaign_map.png'

# Províncias cuja área será repartida.
# 'colombia' era um pedaço perdido no litoral da Guiné-Bissau (a Colômbia real
# já é 'far_northern_andes'): é absorvido e o código some.
REGION = ['senegambia', 'ghana', 'upper_niger', 'mali', 'niger', 'upper_volta', 'benin', 'nigeria',
          'lake_chad', 'colombia']

# código: (x, y da semente, nome, civs, terreno). Códigos já existentes mantêm o nome se None.
SEEDS = {
	'adrar':        (1365, 795, 'Adrar', ['sonin'], 'desert'),
	'senegambia':   (1318, 900, None, ['sonin'], 'savanna'),
	'wagadu':       (1455, 865, 'Wagadu', ['sonin'], 'semi_arid'),
	'futa_jallon':  (1365, 985, 'Futa Jallon', ['mand'], 'tropical'),
	'sierra_leone': (1385, 1060, 'Sierra Leone', ['mand', 'kwa'], 'tropical'),
	'kru_coast':    (1470, 1110, 'Kru Coast', ['kwa'], 'tropical'),
	'ghana':        (1590, 1115, None, ['kwa'], 'tropical'),
	'kong':         (1530, 1035, 'Kong', ['mand', 'kwa'], 'savanna'),
	'upper_niger':  (1500, 950, None, ['mand', 'sonin'], 'savanna'),
	'djenne':       (1590, 905, 'Djenne (Inner Niger Delta)', ['mand', 'sonin'], 'savanna'),
	'mali':         (1705, 905, None, ['mand', 'sonin'], 'desert'),
	'niger':        (1795, 925, None, ['sonin'], 'savanna'),
	'upper_volta':  (1645, 995, None, ['kwa'], 'savanna'),
	'borgu':        (1725, 1005, 'Borgu', ['kwa'], 'savanna'),
	'yorubaland':   (1720, 1085, 'Yorubaland (Ife)', ['kwa'], 'tropical'),
	'benin':        (1745, 1165, None, ['kwa'], 'tropical'),
	'hausaland':    (1865, 985, 'Hausaland', ['nok', 'sao'], 'savanna'),
	'lake_chad':    (1980, 985, None, ['sao'], 'savanna'),
	'nigeria':      (1865, 1070, None, ['nok', 'kwa'], 'tropical'),
	'igbo':         (1815, 1150, 'Igboland', ['nok', 'kwa'], 'tropical'),
}

PREVIEW = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == '--preview' else None

# ------------------------------------------------------------ rótulos a partir das máscaras atuais
img = np.array(Image.open(MAP).convert('RGB'))
H, W = img.shape[:2]
geo = json.load(open(GEO))
feats = geo['features']
P = {f['properties']['code']: f['properties'] for f in feats}
for code, (x, y, name, civs, terrain) in SEEDS.items():
	if code not in P:
		p = {"code": code, "name": name, "capital": None, "culture": None, "civs": civs,
		     "provinceType": "land", "terrain": terrain, "mapTypes": [terrain], "resources": None,
		     "religion": None, "population": "low"}
		P[code] = p
		feats.append({"type": "Feature", "properties": p, "geometry": None})
	else:
		p = P[code]
		if name:
			p['name'] = name
		p['civs'] = civs
		p['terrain'] = terrain
		p['mapTypes'] = [terrain]

codes = list(P)
idx = {c: i + 1 for i, c in enumerate(codes)}
isSea = {c: P[c]['provinceType'] == 'sea' for c in codes}
label = np.zeros((H, W), np.int16)
for c in sorted(codes, key=lambda c: not isSea[c]):  # mares primeiro, terra por cima
	p = P[c]
	if 'bbox' not in p:
		continue
	w, h = p['bbox']['w'], p['bbox']['h']
	m = np.array(Image.open(D + c + '.png').convert('RGBA'))[:h, :w, 3] > 127
	x0, y0 = p['position']['x'], p['position']['y']
	sub = label[y0:y0 + h, x0:x0 + w]
	sub[m[:sub.shape[0], :sub.shape[1]]] = idx[c]

# ------------------------------------------------------------ nova partição (Voronoi nas sementes)
region = np.isin(label, [idx[c] for c in REGION])
ys, xs = np.nonzero(region)
seedCodes = list(SEEDS)
seedXY = np.array([[SEEDS[c][0], SEEDS[c][1]] for c in seedCodes], float)
for c, (sx, sy) in zip(seedCodes, seedXY):
	if not region[int(sy), int(sx)]:
		print('AVISO: semente fora da região:', c)
d2 = (xs[:, None] - seedXY[None, :, 0]) ** 2 + (ys[:, None] - seedXY[None, :, 1]) ** 2
nearest = np.argmin(d2, axis=1)
label[ys, xs] = np.array([idx[c] for c in seedCodes], np.int16)[nearest]

# Pedaços soltos (cortados por lagos/costa): ficam com o vizinho que mais encosta.
for c in seedCodes:
	m = label == idx[c]
	cl, cn = ndi.label(m)
	if cn <= 1:
		continue
	sizes = ndi.sum(np.ones_like(cl), cl, range(1, cn + 1))
	keep = np.argmax(sizes) + 1
	for k in range(1, cn + 1):
		if k == keep:
			continue
		frag = cl == k
		ring = (cv2.dilate(frag.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~frag & region
		vals = label[ring]
		vals = vals[vals != idx[c]]
		if len(vals) and sizes[k - 1] < 400:
			label[frag] = np.bincount(vals).argmax()

for c in seedCodes:
	print('%-14s %6d px' % (c, (label == idx[c]).sum()))

if PREVIEW:
	X0, Y0, X1, Y1 = 1250, 720, 2050, 1240
	crop = img[Y0:Y1, X0:X1].copy()
	L = label[Y0:Y1, X0:X1]
	edge = (np.roll(L, 1, 0) != L) | (np.roll(L, 1, 1) != L)
	crop[edge] = [255, 0, 0]
	im = Image.fromarray(crop).resize(((X1 - X0) * 2, (Y1 - Y0) * 2), Image.NEAREST)
	dr = ImageDraw.Draw(im)
	for c in seedCodes:
		sx, sy = SEEDS[c][:2]
		dr.text(((sx - X0) * 2 - 25, (sy - Y0) * 2), c, fill=(0, 0, 0))
	im.save(PREVIEW)
	sys.exit(0)

# ------------------------------------------------------------ saída (só as províncias da região)
pot = lambda n: 1 << (max(1, int(n)) - 1).bit_length()
def grow(m, px):
	return cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))) > 0

for c in seedCodes:
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

# vizinhanças (mesma regra do postedit_provinces.py), para o mapa todo
live = [c for c in codes if (label == idx[c]).any()]
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
		if (isSea[c] or isSea[o]) and k not in touch:
			continue
		links[c].add(o)
		links[o].add(c)
# Ilhas sem vizinho encostado: mantém as ligações antigas.
for c in live:
	if not links[c]:
		for o in P[c].get('links') or []:
			if o in links:
				links[c].add(o)
				links[o].add(c)

old = {c: set(P[c].get('links') or []) for c in live}
changed = [c for c in live if old[c] != links[c] and c not in SEEDS]
print('links alterados fora da região:', changed)

import os
for c in codes:
	if c not in live:
		print('removida:', c)
		if os.path.exists(D + c + '.png'):
			os.remove(D + c + '.png')
geo['features'] = [f for f in feats if f['properties']['code'] in live]
for f in geo['features']:
	f['properties']['links'] = sorted(links[f['properties']['code']])
json.dump(geo, open(GEO, 'w'), ensure_ascii=False)
print('províncias:', len(live))
