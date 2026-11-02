"""
Completes the world campaign map with sea provinces: every sea, ocean and large lake of
campaign_map.png gets a named sea province.

  - the water is split among the seeds below by geodesic growth (a sea only grows through water,
    so it never jumps over an isthmus);
  - the 13 old sea provinces keep their code (saved games refer to them) but get new shapes cut
    along the coast;
  - masks (power-of-two sides), position, bbox, centre, geometry, area and the links of every
    province are rebuilt, as postedit_provinces.py does.

Run from the mod root: python3 tools/grand_strategy/build_sea_provinces.py
"""
import json

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

D = 'art/textures/ui/campaigns/grand_strategy/provinces/'
GEO = 'campaigns/grand_strategy/data/provinces.geojson'
MAP = 'art/textures/ui/campaigns/grand_strategy/art/campaign_map.png'

# code: (name, x, y) on the 4096x2048 map. The first 13 are the old sea provinces.
SEAS = {
	"mexico_sea": ("Gulf of Mexico", 390, 780),
	"labrador_sea": ("Labrador Sea", 900, 330),
	"north_atlantic_ocean_02": ("North Atlantic Ocean", 1330, 260),
	"english_channel": ("English Channel", 1610, 360),
	"med_west": ("Western Mediterranean", 1690, 570),
	"med_central": ("Central Mediterranean", 1900, 640),
	"med_oriet": ("Eastern Mediterranean", 2150, 690),
	"persian_gulf": ("Persian Gulf", 2430, 790),
	"indian_ocean": ("Indian Ocean", 2720, 1320),
	"nan_hai": ("South China Sea", 3450, 990),
	"dong_hai": ("East China Sea", 3690, 730),
	"sea_korean": ("Yellow Sea", 3650, 580),
	"ocean_pacific_austral": ("Southern Pacific Ocean", 120, 1950),
	# North America and the North Atlantic
	"gulf_of_alaska": ("Gulf of Alaska", 40, 260),
	"beaufort_sea": ("Beaufort Sea", 300, 40),
	"arctic_archipelago": ("Arctic Archipelago", 480, 90),
	"hudson_bay": ("Hudson Bay", 540, 300),
	"baffin_bay": ("Baffin Bay", 820, 110),
	"great_lakes": ("Great Lakes", 560, 520),
	"gulf_of_saint_lawrence": ("Gulf of Saint Lawrence", 740, 470),
	"western_atlantic": ("Western Atlantic", 720, 640),
	"sargasso_sea": ("Sargasso Sea", 960, 780),
	"caribbean_west": ("Western Caribbean Sea", 520, 930),
	"caribbean_east": ("Eastern Caribbean Sea", 730, 910),
	"greenland_sea": ("Greenland Sea", 1080, 140),
	"north_atlantic_central": ("Central North Atlantic", 1150, 650),
	"norwegian_sea": ("Norwegian Sea", 1700, 90),
	"north_sea": ("North Sea", 1720, 280),
	"baltic_sea": ("Baltic Sea", 1880, 340),
	"gulf_of_bothnia": ("Gulf of Bothnia", 1960, 160),
	"celtic_sea": ("Celtic Sea", 1500, 340),
	"bay_of_biscay": ("Bay of Biscay", 1490, 470),
	"canary_sea": ("Canary Sea", 1380, 680),
	"cape_verde_sea": ("Cape Verde Sea", 1250, 880),
	# Mediterranean, Black Sea, Caspian and the Middle East
	"adriatic_sea": ("Adriatic Sea", 1890, 510),
	"aegean_sea": ("Aegean Sea", 2070, 610),
	"black_sea": ("Black Sea", 2150, 470),
	"caspian_sea": ("Caspian Sea", 2360, 500),
	"aral_sea": ("Aral Sea", 2540, 440),
	"red_sea": ("Red Sea", 2200, 880),
	"gulf_of_aden": ("Gulf of Aden", 2380, 1020),
	"arabian_sea": ("Arabian Sea", 2600, 920),
	# Pacific coast of the Americas and the South Atlantic
	"eastern_pacific": ("Eastern Pacific Ocean", 130, 830),
	"eastern_pacific_tropical": ("Tropical Eastern Pacific", 150, 1200),
	"panama_bight": ("Gulf of Panama", 420, 1060),
	"peruvian_sea": ("Grau Sea", 330, 1290),
	"chilean_sea": ("Chilean Sea", 420, 1650),
	"southeast_pacific": ("Southeast Pacific Ocean", 120, 1600),
	"drake_passage": ("Drake Passage", 640, 1990),
	"argentine_sea": ("Argentine Sea", 950, 1720),
	"south_atlantic_southwest": ("Southwest Atlantic", 1200, 1880),
	"brazilian_sea": ("Brazilian Sea", 1180, 1380),
	"equatorial_atlantic": ("Equatorial Atlantic", 1260, 1120),
	"south_atlantic": ("South Atlantic Ocean", 1460, 1560),
	"gulf_of_guinea": ("Gulf of Guinea", 1640, 1130),
	"benguela_sea": ("Benguela Sea", 1700, 1480),
	"cape_sea": ("Cape Sea", 1820, 1860),
	# Indian Ocean
	"agulhas_sea": ("Agulhas Sea", 2150, 1900),
	"mozambique_channel": ("Mozambique Channel", 2220, 1540),
	"somali_sea": ("Somali Sea", 2380, 1250),
	"mascarene_sea": ("Mascarene Sea", 2480, 1660),
	"laccadive_sea": ("Laccadive Sea", 2700, 1060),
	"bay_of_bengal": ("Bay of Bengal", 2920, 950),
	"andaman_sea": ("Andaman Sea", 3070, 990),
	"southern_indian_ocean": ("Southern Indian Ocean", 2700, 1850),
	"eastern_indian_ocean": ("Eastern Indian Ocean", 3080, 1450),
	"west_australian_sea": ("West Australian Sea", 3150, 1700),
	# Southeast Asia, Australia and the western Pacific
	"java_sea": ("Java Sea", 3370, 1210),
	"celebes_sea": ("Celebes Sea", 3650, 1040),
	"banda_sea": ("Banda Sea", 3730, 1240),
	"timor_sea": ("Timor Sea", 3430, 1320),
	"arafura_sea": ("Arafura Sea", 3630, 1300),
	"coral_sea": ("Coral Sea", 3870, 1390),
	"tasman_sea": ("Tasman Sea", 3920, 1680),
	"great_australian_bight": ("Great Australian Bight", 3550, 1770),
	"southern_ocean": ("Southern Ocean", 3500, 1980),
	"philippine_sea": ("Philippine Sea", 3850, 900),
	"sea_of_japan": ("Sea of Japan", 3850, 470),
	"sea_of_okhotsk": ("Sea of Okhotsk", 3960, 200),
	"northwest_pacific": ("Northwest Pacific Ocean", 4010, 700),
	"western_pacific": ("Western Pacific Ocean", 4020, 1060),
	"melanesian_sea": ("Melanesian Sea", 4030, 1280),
	"south_pacific_west": ("Southwest Pacific Ocean", 4040, 1900),
}

# ------------------------------------------------------------ land and water (as the other tools)
img = np.array(Image.open(MAP).convert('RGB')).astype(int)
H, W = img.shape[:2]
r, g, b = img[..., 0], img[..., 1], img[..., 2]
water = (b > r + 15) & (b >= g - 5)
water = cv2.morphologyEx(water.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) > 0
lab, n = ndi.label(water)
sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
water = np.isin(lab, [i for i, s in enumerate(sizes, 1) if s >= 400])

# ------------------------------------------------------------ current provinces
geo = json.load(open(GEO))
feats = geo['features']
P = {f['properties']['code']: f['properties'] for f in feats}
template = dict(P['mexico_sea'])
for code, (name, x, y) in SEAS.items():
	if code not in P:
		props = {k: template[k] for k in ('capital', 'culture', 'civs', 'terrain', 'mapTypes', 'resources', 'religion', 'population')}
		props.update(code=code, name=name, provinceType='sea', civs=[], mapTypes=[])
		P[code] = props
		feats.append({"type": "Feature", "properties": props, "geometry": None})
	P[code]['name'] = name
codes = list(P)
idx = {c: i + 1 for i, c in enumerate(codes)}
isSea = {c: P[c]['provinceType'] == 'sea' for c in codes}

label = np.zeros((H, W), np.int16)
for c in codes:
	if isSea[c] or 'bbox' not in P[c]:
		continue
	p = P[c]
	w, h = p['bbox']['w'], p['bbox']['h']
	m = np.array(Image.open(D + c + '.png').convert('RGBA'))[:h, :w, 3] > 127
	x0, y0 = p['position']['x'], p['position']['y']
	sub = label[y0:y0 + h, x0:x0 + w]
	sub[m[:sub.shape[0], :sub.shape[1]]] = idx[c]

# ------------------------------------------------------------ seas: geodesic growth through the water
free = water & (label == 0)
sea_label = np.zeros((H, W), np.int16)
for code, (name, x, y) in SEAS.items():
	if not free[y, x]:
		# Nudge the seed to the nearest free water pixel.
		dist, (iy, ix) = ndi.distance_transform_edt(~free, return_indices=True)
		y, x = iy[y, x], ix[y, x]
		print('seed moved: %s -> (%d, %d)' % (code, x, y))
	sea_label[y, x] = idx[code]
kernel = np.ones((3, 3), np.uint8)
for step in range(4000):
	grown = cv2.dilate(sea_label, kernel)
	new = free & (sea_label == 0) & (grown > 0)
	if not new.any():
		break
	sea_label[new] = grown[new]
print('growth steps:', step)
left = free & (sea_label == 0)
print('water left without a sea (small lakes):', int(left.sum()), 'px')
label[sea_label > 0] = sea_label[sea_label > 0]

# ------------------------------------------------------------ output (as postedit_provinces.py)
pot = lambda n: 1 << (max(1, int(n)) - 1).bit_length()


def grow(m, px):
	return cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))) > 0


live = [c for c in codes if (label == idx[c]).any()]
for c in codes:
	if c not in live:
		print('province without area:', c)
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
		# land-sea and sea-sea must touch; land-land accepts straits of about 8 px
		if (isSea[c] or isSea[o]) and k not in touch:
			continue
		links[c].add(o)
		links[o].add(c)
# Islands still without a neighbour: the nearest province.
for c in live:
	if links[c]:
		continue
	m = label == idx[c]
	dist = ndi.distance_transform_edt(~m)
	cand = np.isin(label, [idx[o] for o in live if o != c])
	d = np.where(cand, dist, np.inf)
	y, x = np.unravel_index(np.argmin(d), d.shape)
	o = codes[label[y, x] - 1]
	links[c].add(o)
	links[o].add(c)
	print('island %s linked to %s (%d px)' % (c, o, d[y, x]))

geo['features'] = [f for f in feats if f['properties']['code'] in live]
for f in geo['features']:
	f['properties']['links'] = sorted(links[f['properties']['code']])
json.dump(geo, open(GEO, 'w'), ensure_ascii=False)
seas = [c for c in live if isSea[c]]
print('provinces:', len(live), '| seas:', len(seas), '| without links:', [c for c in live if not links[c]])
print('sea areas (px): min %d median %d max %d' % tuple(np.percentile([P[c]['area'] for c in seas], [0, 50, 100])))
