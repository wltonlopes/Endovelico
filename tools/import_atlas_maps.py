#!/usr/bin/env python3
"""Import Atlas scenario maps (.pmp + .xml) as skirmish maps of the mod, repainted and populated.

The maps drawn by Duileoga (South America) come with the relief and the player bases, but the
terrain is painted with Mediterranean/African textures, rivers are dug with vertical walls (no
docks, no crossing) and there is little or no gaia. For each map this tool:

  * reshapes the river banks and coasts: shallow at the edge, deeper than 2 m (not fordable) from
    4 m out, so docks can be built; rocky coasts (land rising fast behind the shore) keep their cliff;
  * repaints every tile from its region (a function of the map position), its height above the
    water, its slope and the distance to water: beaches, cliffs, forest floor, steppe, snow...;
  * writes the player bases with the skirmish templates (the civ is chosen in the game setup) and
    gives each base berries, a woodline, hunt, stone and metal;
  * populates the map: forests and scattered trees of each region, decoratives, mines, fish, whales,
    and the fauna of the mod that lives in each region;
  * writes maps/skirmishes/<name>.pmp/.xml and the preview image.

Usage: python3 tools/import_atlas_maps.py [--only wall_mapu,patagonia_fjords] [--src ~/Downloads]
"""
import argparse
import json
import math
import os
import re
import struct
import sys
import zipfile
from xml.sax.saxutils import escape

import numpy as np
from PIL import Image
from scipy import ndimage, special

MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PUBLIC_ZIP = "/snap/0ad/current/binaries/data/mods/public/public.zip"
HEIGHT_SCALE = 1 / 92.0
TILE = 4.0


# ------------------------------------------------------------------------------------------------
# Map files

def read_pmp(path):
	with open(path, "rb") as f:
		data = f.read()
	magic, version, _ = struct.unpack_from("<4sII", data, 0)
	assert magic == b"PSMP", path
	offset = 12
	patches, = struct.unpack_from("<I", data, offset)
	offset += 4
	n = patches * 16 + 1
	height = np.frombuffer(data, dtype="<u2", count=n * n, offset=offset).reshape(n, n).astype(float) * HEIGHT_SCALE
	offset += n * n * 2
	count, = struct.unpack_from("<I", data, offset)
	offset += 4
	textures = []
	for _ in range(count):
		length, = struct.unpack_from("<I", data, offset)
		textures.append(data[offset + 4:offset + 4 + length].decode())
		offset += 4 + length
	return dict(version=version, patches=patches, height=height, textures=textures)


def write_pmp(path, version, patches, height, textures, tiles):
	"""tiles: [z][x] indices into textures."""
	body = struct.pack("<I", patches)
	body += np.clip(np.round(height / HEIGHT_SCALE), 0, 65535).astype("<u2").tobytes()
	body += struct.pack("<I", len(textures))
	for texture in textures:
		encoded = texture.encode()
		body += struct.pack("<I", len(encoded)) + encoded
	order = tiles.reshape(patches, 16, patches, 16).transpose(0, 2, 1, 3).reshape(-1)
	records = np.zeros(len(order), dtype=[("a", "<u2"), ("b", "<u2"), ("p", "<u4")])
	records["a"] = order
	records["b"] = 0xFFFF
	body += records.tobytes()
	with open(path, "wb") as f:
		f.write(b"PSMP" + struct.pack("<II", version, len(body)) + body)


def read_scenario(path):
	with open(path, encoding="utf-8") as f:
		text = f.read()
	settings = json.loads(re.search(r"<!\[CDATA\[(.*?)\]\]>", text, re.S).group(1))
	water = float(re.search(r"<Height>([\d.]+)</Height>", text).group(1))
	entities = []
	for m in re.finditer(r"<Entity uid=\"\d+\">(.*?)</Entity>", text, re.S):
		block = m.group(1)
		template = re.search(r"<Template>([^<]+)</Template>", block).group(1)
		player = re.search(r"<Player>(\d+)</Player>", block)
		pos = re.search(r'<Position x="([\d.\-]+)" z="([\d.\-]+)"', block)
		rot = re.search(r'<Orientation y="([\d.\-]+)"', block)
		entities.append(dict(template=template, player=int(player.group(1)) if player else 0,
			x=float(pos.group(1)), z=float(pos.group(2)), angle=float(rot.group(1)) if rot else 0.0))
	return dict(settings=settings, water=water, entities=entities)


# ------------------------------------------------------------------------------------------------
# Game data checks

class GameData:
	def __init__(self):
		self.zip = zipfile.ZipFile(PUBLIC_ZIP)
		names = set(self.zip.namelist())
		self.terrains = {os.path.basename(n)[:-4] for n in names if n.startswith("art/terrains/") and n.endswith(".xml")}
		self.templates = {n[len("simulation/templates/"):-4] for n in names
			if n.startswith("simulation/templates/") and n.endswith(".xml")}
		self.actors = {n[len("art/actors/"):] for n in names if n.startswith("art/actors/") and n.endswith(".xml")}
		for root, _, files in os.walk(os.path.join(MOD, "simulation", "templates")):
			for f in files:
				if f.endswith(".xml"):
					self.templates.add(os.path.relpath(os.path.join(root, f), os.path.join(MOD, "simulation", "templates"))[:-4])
		for root, _, files in os.walk(os.path.join(MOD, "art", "actors")):
			for f in files:
				if f.endswith(".xml"):
					self.actors.add(os.path.relpath(os.path.join(root, f), os.path.join(MOD, "art", "actors")))

	def check(self, template):
		if template.startswith("actor|"):
			ok = template[6:] in self.actors
		else:
			ok = template in self.templates
		if not ok:
			raise SystemExit("missing template: " + template)
		return template


# ------------------------------------------------------------------------------------------------
# Terrain analysis

def noise(shape, scale, seed):
	rng = np.random.default_rng(seed)
	field = ndimage.gaussian_filter(rng.standard_normal(shape), scale, mode="wrap")
	return (field - field.mean()) / (field.std() + 1e-9)


def reshape_shores(height, water, rocky_rise=6.0):
	"""Gentle underwater slope at the banks: docks can be built, rivers stay deeper than 2 m."""
	wet = height < water
	distance = ndimage.distance_transform_edt(wet) * TILE  # metres to the nearest land vertex
	# Land rising more than rocky_rise metres within 8 m of the water is a rocky coast: left alone.
	land_rise = ndimage.maximum_filter(np.where(wet, -1e9, height - water), size=5)
	rocky = land_rise > rocky_rise
	target = np.where(distance <= 4, 0.5 + distance * 0.3, np.maximum(2.4, 0.5 + distance * 0.3))
	depth = water - height
	new_depth = np.where(wet & ~rocky, np.minimum(depth, target), depth)
	# Never fill a channel up to a ford: keep at least 2.2 m where the original was deeper than that
	# and the vertex is 4 m or more from land.
	new_depth = np.where(wet & (distance >= 4) & (depth > 2.2), np.maximum(new_depth, 2.2), new_depth)
	result = np.where(wet, water - new_depth, height)
	# Land side: the first metre above the water is eased so the shore is not a step.
	near = (~wet) & (ndimage.distance_transform_edt(~wet) * TILE <= 4) & ~rocky
	result = np.where(near, np.minimum(result, water + 1.5 + (result - water) * 0.5), result)
	return result


def crest_line(height, xmin, xmax, smooth=12):
	"""x of the highest point of each row (z), between xmin and xmax, smoothed along z."""
	blurred = ndimage.gaussian_filter(height, 4)
	crest = xmin + np.argmax(blurred[:, xmin:xmax], axis=1)
	return ndimage.gaussian_filter1d(crest.astype(float), smooth)


# ------------------------------------------------------------------------------------------------
# Regions of each map. Each region: terrains (base mix, forest floor, shore, cliff), flora and fauna.

def mix(*pairs):
	return list(pairs)


REGIONS = {
	"chile_north": dict(
		base=mix(("medit_shrubs_dry", 3), ("desert_grass_a_stones", 2), ("medit_dirt_d", 2), ("desert_sand_scrub", 1)),
		forest="medit_grass_shrubs", shore="desert_shore_stones", beach="medit_sand", cliff="desert_cliff_badlands",
		trees=[("gaia/tree/bush_mediterranean_dry", 4), ("gaia/tree/acacia", 2), ("gaia/tree/bush_badlands", 3)],
		forest_density=0.12, scatter=0.010, fruit="gaia/fruit/berry_04",
		decor=[("actor|props/flora/bush_medit_sm_dry.xml", 3), ("actor|props/flora/grass_soft_dry_small_tall.xml", 3),
			("actor|geology/stone_desert_med.xml", 1)],
		fauna=[("gaia/fauna_guanaco", 5, 3), ("gaia/fauna_fox_gray", 2, 1), ("gaia/fauna_tinamou", 3, 3), ("gaia/fauna_puma", 1, 1)],
		stone="gaia/rock/badlands_large", metal="gaia/ore/badlands_large"),
	"chile_central": dict(
		base=mix(("medit_grass_shrubs", 3), ("medit_grass_field", 2), ("medit_grass_field_dry", 2), ("medit_rocks_grass_shrubs", 1)),
		forest="medit_grass_wild", shore="medit_sand_wet", beach="medit_sand", cliff="medit_cliff_grass",
		trees=[("gaia/tree/oak_holly", 4), ("gaia/tree/bush_mediterranean", 3), ("gaia/tree/carob", 2), ("gaia/tree/pine", 1)],
		forest_density=0.35, scatter=0.012, fruit="gaia/fruit/berry_01",
		decor=[("actor|props/flora/bush_medit_me.xml", 3), ("actor|props/flora/grass_medit_field.xml", 3),
			("actor|props/flora/grass_medit_flowering_tall.xml", 2), ("actor|geology/stone_granite_small.xml", 1)],
		fauna=[("gaia/fauna_guanaco", 3, 3), ("gaia/fauna_fox_gray", 3, 1), ("gaia/fauna_skunk", 2, 1),
			("gaia/fauna_tinamou", 3, 3), ("gaia/fauna_grison", 1, 1), ("gaia/fauna_puma", 1, 1)],
		stone="gaia/rock/mediterranean_large", metal="gaia/ore/mediterranean_large"),
	"chile_south": dict(
		base=mix(("new_alpine_grass_mossy", 3), ("temperate_grass_04", 2), ("alpine_grass_b_wild", 2), ("temp_grass_mossy", 1)),
		forest="temperate_forestfloor_02", shore="alpine_shore_rocks_grass_50", beach="alpine_shore_rocks", cliff="temperate_cliff_01",
		trees=[("gaia/tree/euro_beech", 5), ("gaia/tree/oak", 2), ("gaia/tree/fir", 3), ("gaia/tree/bush_temperate", 2)],
		forest_density=0.75, scatter=0.02, fruit="gaia/fruit/berry_03",
		decor=[("actor|props/flora/ferns.xml", 3), ("actor|props/flora/bush_tempe_me_lush.xml", 3),
			("actor|props/flora/grass_soft_large_tall.xml", 2), ("actor|geology/highland1_moss.xml", 1)],
		fauna=[("gaia/fauna_deer_roe", 4, 3), ("gaia/fauna_deer_red", 2, 3), ("gaia/fauna_fox_gray", 2, 1),
			("gaia/fauna_grison", 1, 1), ("gaia/fauna_puma", 2, 1)],
		stone="gaia/rock/temperate_large", metal="gaia/ore/temperate_large"),
	"cuyo": dict(
		base=mix(("desert_grass_a", 3), ("desert_sand_scrub", 2), ("steppe_dirt_b", 2), ("desert_grass_a_sand", 1)),
		forest="desert_grass_a", shore="steppe_river_rocks_dirt", beach="desert_sand_wet", cliff="desert_cliff_badlands",
		trees=[("gaia/tree/acacia", 3), ("gaia/tree/bush_badlands", 4), ("gaia/tree/bush_mediterranean_dry", 2)],
		forest_density=0.10, scatter=0.012, fruit="gaia/fruit/berry_04",
		decor=[("actor|props/flora/bush_desert_dry_a.xml", 3), ("actor|props/flora/grass_soft_dry_large.xml", 3),
			("actor|geology/stone_desert_med.xml", 1)],
		fauna=[("gaia/fauna_guanaco", 5, 3), ("gaia/fauna_rhea", 3, 3), ("gaia/fauna_skunk", 2, 1),
			("gaia/fauna_tinamou", 2, 3), ("gaia/fauna_puma", 1, 1)],
		stone="gaia/rock/desert_large", metal="gaia/ore/desert_large"),
	"patagonian_steppe": dict(
		base=mix(("steppe_dirt_a", 2), ("steppe_grass_dirt_66", 3), ("sand_scrub_75", 2), ("steppe_grass_d", 2)),
		forest="steppe_grass_dirt_33", shore="steppe_river_rocks", beach="desert_shore_stones", cliff="steppe_rocks_dirt_01",
		trees=[("gaia/tree/bush_steppe_01", 3), ("gaia/tree/bush_steppe_02", 3), ("gaia/tree/bush_badlands", 2)],
		forest_density=0.08, scatter=0.012, fruit="gaia/fruit/berry_02",
		decor=[("actor|props/flora/grass_steppe_field_tall.xml", 3), ("actor|props/flora/grass_soft_dry_tuft_a.xml", 3),
			("actor|props/flora/bush_tempe_sm_dry.xml", 2), ("actor|geology/stone_granite_small.xml", 1)],
		fauna=[("gaia/fauna_guanaco", 7, 3), ("gaia/fauna_rhea", 4, 3), ("gaia/fauna_fox_gray", 2, 1),
			("gaia/fauna_skunk", 2, 1), ("gaia/fauna_tinamou", 2, 3), ("gaia/fauna_puma", 1, 1)],
		stone="gaia/rock/temperate_large_02", metal="gaia/ore/temperate_02"),
	"pampas": dict(
		base=mix(("steppe_grass_green_a", 3), ("temperate_grass_04", 2), ("steppe_grass_c", 2), ("steppe_grass_a", 1)),
		forest="temperate_grass_dirt_02", shore="steppe_grass_mud_01", beach="steppe_river_rocks_wet", cliff="temperate_cliff_01",
		trees=[("gaia/tree/bush_temperate", 3), ("gaia/tree/temperate", 2), ("gaia/tree/bush_steppe_02", 2), ("gaia/tree/poplar", 1)],
		forest_density=0.07, scatter=0.004, fruit="gaia/fruit/berry_03",
		decor=[("actor|props/flora/grass_steppe_field_tall.xml", 4), ("actor|props/flora/grass_field_flowering_tall.xml", 2),
			("actor|props/flora/grass_soft_large.xml", 3)],
		fauna=[("gaia/fauna_rhea", 5, 3), ("gaia/fauna_deer_white_tailed_02", 4, 3), ("gaia/fauna_guanaco", 2, 3),
			("gaia/fauna_tinamou", 3, 3), ("gaia/fauna_skunk", 2, 1), ("gaia/fauna_grison", 1, 1),
			("gaia/fauna_fox_gray", 2, 1), ("gaia/fauna_puma", 1, 1)],
		stone="gaia/rock/temperate_large", metal="gaia/ore/temperate_large"),
	"litoral": dict(
		base=mix(("temperate_grass_01", 3), ("steppe_grass_green_a", 2), ("temperate_grass_03", 2), ("temp_grass_long", 1)),
		forest="temperate_forestfloor_01", shore="temperate_grass_mud_01", beach="temperate_mud_01", cliff="temperate_cliff_01",
		trees=[("gaia/tree/bush_tropic", 2), ("gaia/tree/oak", 2), ("gaia/tree/temperate", 3), ("gaia/tree/medit_fan_palm", 2)],
		forest_density=0.30, scatter=0.008, fruit="gaia/fruit/berry_03",
		decor=[("actor|props/flora/grass_field_lush_tall.xml", 3), ("actor|props/flora/bush_tempe_me_lush.xml", 2),
			("actor|props/flora/grass_soft_large_tall.xml", 3)],
		fauna=[("gaia/fauna_deer_white_tailed_02", 4, 3), ("gaia/fauna_rhea", 3, 3), ("gaia/fauna_coati", 2, 1),
			("gaia/fauna_otter", 2, 1), ("gaia/fauna_tinamou", 2, 3), ("gaia/fauna_jaguar", 1, 1)],
		stone="gaia/rock/temperate_large", metal="gaia/ore/temperate_large"),
	"magellanic_forest": dict(
		base=mix(("alpine_grass_b_wild", 3), ("new_alpine_grass_mossy", 3), ("alpine_dirt_grass_50", 1), ("temp_grass_mossy", 1)),
		forest="alpine_forrestfloor", shore="alpine_shore_rocks_grass_50", beach="alpine_shore_rocks", cliff="alpine_cliff_a",
		trees=[("gaia/tree/euro_beech", 6), ("gaia/tree/fir", 2), ("gaia/tree/euro_beech_aut", 2), ("gaia/tree/bush_temperate", 1)],
		forest_density=0.7, scatter=0.02, fruit="gaia/fruit/berry_02",
		decor=[("actor|props/flora/ferns.xml", 2), ("actor|props/flora/bush_tempe_me_lush.xml", 3),
			("actor|geology/highland2_moss.xml", 1), ("actor|props/flora/grass_soft_large_tall.xml", 2)],
		fauna=[("gaia/fauna_deer_roe", 4, 3), ("gaia/fauna_guanaco", 2, 3), ("gaia/fauna_fox_gray", 2, 1), ("gaia/fauna_puma", 2, 1)],
		stone="gaia/rock/alpine_large", metal="gaia/ore/alpine_large"),
	"fuegian_steppe": dict(
		base=mix(("steppe_grass_b", 3), ("steppe_grass_c", 2), ("alpine_grass_d", 2), ("steppe_grass_dirt_33", 1)),
		forest="alpine_forestfloor_02", shore="alpine_shore_rocks_grass_50", beach="alpine_shore_rocks", cliff="alpine_cliff_b",
		trees=[("gaia/tree/euro_beech", 3), ("gaia/tree/bush_temperate_winter", 2), ("gaia/tree/bush_steppe_01", 2)],
		forest_density=0.25, scatter=0.01, fruit="gaia/fruit/berry_02",
		decor=[("actor|props/flora/grass_steppe_field_tall.xml", 3), ("actor|props/flora/grass_soft_tuft_a.xml", 3),
			("actor|geology/stone_granite_small.xml", 1)],
		fauna=[("gaia/fauna_guanaco", 6, 3), ("gaia/fauna_fox_gray", 2, 1), ("gaia/fauna_tinamou", 2, 3), ("gaia/fauna_puma", 1, 1)],
		stone="gaia/rock/alpine_large", metal="gaia/ore/alpine_large"),
	"falklands": dict(
		base=mix(("polar_tundra", 3), ("steppe_grass_b", 2), ("alpine_grass_rocky", 2), ("baltic_grass_rocks_01", 1)),
		forest="polar_tundra", shore="alpine_shore_rocks", beach="alpine_shore_rocks_icy", cliff="polar_cliff_a",
		trees=[("gaia/tree/bush_temperate_winter", 1)], forest_density=0.0, scatter=0.003, fruit="gaia/fruit/berry_02",
		decor=[("actor|props/flora/grass_soft_dry_tuft_a.xml", 3), ("actor|geology/highland1.xml", 1)],
		fauna=[("gaia/fauna_fox_gray", 2, 1), ("gaia/fauna_tinamou", 2, 3)],
		stone="gaia/rock/polar_01", metal="gaia/ore/polar_01"),
}

# Mountain tiers, shared: highland grass, bare rock, snow, ice.
HIGHLAND = dict(
	dry=mix(("desert_grass_a_stones", 2), ("steppe_rocks_dirt_01", 2), ("alpine_dirt", 1)),
	wet=mix(("alpine_grass_rocky", 2), ("alpine_dirt_grass_50", 2), ("alpine_grass_d", 1)),
	rock=mix(("alpine_rock_01", 2), ("alpine_mountainside", 2), ("alpine_rock_02", 1)),
	snow=mix(("alpine_snow_a", 2), ("alpine_snow_rocky", 2), ("alpine_rock_01_snow", 1)),
	ice=mix(("alpine_snow_glacial", 2), ("polar_ice_snow", 1)),
	cliff="alpine_cliff_a", snow_cliff="alpine_cliff_snow",
	fauna=[("gaia/fauna_guanaco", 4, 3), ("gaia/fauna_puma", 1, 1)],
	stone="gaia/rock/alpine_large", metal="gaia/ore/alpine_large")

SEA = dict(deep="steppe_river_rocks_wet",
	fauna=[("gaia/fauna_orca", 1, 2), ("gaia/fauna_whale_humpback", 1, 1), ("gaia/fauna_dolphin", 2, 3),
		("gaia/fauna_whale_fin", 1, 1)],
	fish=["gaia/fish/generic", "gaia/fish/tuna"], seal="gaia/fauna_seal_harbor")


REEDS = "actor|props/flora/reeds_pond_lush_a.xml"
for _name in ("pampas", "litoral", "chile_central", "chile_south"):
	REGIONS[_name]["reeds"] = REEDS

AMAZON_FOREST_FAUNA = [("gaia/fauna_peccary", 5, 3), ("gaia/fauna_tapir_lowland", 2, 2), ("gaia/fauna_brocket_red", 3, 2),
	("gaia/fauna_monkey_howler", 2, 3), ("gaia/fauna_coati", 2, 3), ("gaia/fauna_paca", 2, 1), ("gaia/fauna_curassow", 2, 2),
	("gaia/fauna_curassow_female", 1, 2), ("gaia/fauna_tamandua", 1, 1), ("gaia/fauna_opossum", 1, 1),
	("gaia/fauna_iguana_green", 1, 1), ("gaia/fauna_boa_constrictor", 1, 1), ("gaia/fauna_jaguar_02", 1, 1)]

REGIONS.update({
	# Marajó: the western half of the island and the mainland are flooded forest (várzea), the
	# eastern half natural grasslands (campos) that flood in the rainy season, the coasts mangroves.
	"varzea_forest": dict(
		base=mix(("tropic_grass_plants", 3), ("tropic_plants", 2), ("tropic_grass_b", 2), ("tropic_dirt_a_plants", 1)),
		forest="tropic_dirt_a_plants", shore="tropic_beach_wet", beach="tropic_beach_wet", cliff="tropic_cliff_grass",
		trees=[("gaia/tree/tropic_rainforest", 5), ("gaia/tree/palm_tropical", 3), ("gaia/tree/palm_areca", 2),
			("gaia/tree/strangler", 1), ("gaia/tree/bush_tropic", 2)],
		forest_density=0.8, scatter=0.03, fruit="gaia/fruit/berry_05", reeds="actor|props/flora/reeds_giant.xml",
		decor=[("actor|props/flora/shrub_tropic_plant_a.xml", 3), ("actor|props/flora/shrub_tropic_plant_b.xml", 2),
			("actor|props/flora/ferns.xml", 2), ("actor|props/flora/grass_tropic_field_tall.xml", 2)],
		fauna=AMAZON_FOREST_FAUNA, stone="gaia/rock/tropical_large", metal="gaia/ore/tropical_large", colour=(48, 104, 44)),
	"campos": dict(
		base=mix(("savanna_grass_a_wetseason", 3), ("savanna_grass_b_wetseason", 2), ("tropic_grass_c", 2), ("new_savanna_grass_b", 1)),
		forest="tropic_grass_plants", shore="tropic_beach_wet", beach="tropic_beach_wet", cliff="tropic_cliff_grass",
		trees=[("gaia/tree/palm_tropical", 4), ("gaia/tree/bush_tropic", 3), ("gaia/tree/tropic_rainforest", 1)],
		forest_density=0.18, scatter=0.006, fruit="gaia/fruit/berry_05", reeds="actor|props/flora/reeds_pond_lush_b.xml",
		decor=[("actor|props/flora/grass_tropic_field_tall.xml", 4), ("actor|props/flora/grass_tropical.xml", 3),
			("actor|props/flora/grass_savanna_field_tall.xml", 2)],
		fauna=[("gaia/fauna_deer_white_tailed", 4, 3), ("gaia/fauna_anteater_02", 2, 1), ("gaia/fauna_tinamou", 3, 3),
			("gaia/fauna_caiman", 3, 2), ("gaia/fauna_peccary", 2, 3), ("gaia/fauna_toad_cane", 1, 1),
			("gaia/fauna_curassow", 1, 2), ("gaia/fauna_jaguar_02", 1, 1)],
		stone="gaia/rock/tropical_large", metal="gaia/ore/tropical_large", colour=(120, 150, 70)),
	"mangrove": dict(
		base=mix(("tropic_beach_dry_plants", 3), ("tropic_dirt_a_plants", 2), ("tropic_grass_plants", 1)),
		forest="tropic_dirt_a_plants", shore="tropic_beach_wet", beach="tropic_beach_wet", cliff="tropic_cliff_grass",
		trees=[("gaia/tree/mangrove", 6), ("gaia/tree/palm_tropical", 1)],
		forest_density=0.6, scatter=0.02, fruit="gaia/fruit/berry_05", reeds="actor|props/flora/reeds_beach.xml",
		decor=[("actor|props/flora/shrub_tropic_plant_b.xml", 2), ("actor|props/flora/reeds_beach_2.xml", 2)],
		fauna=[("gaia/fauna_caiman", 3, 2), ("gaia/fauna_otter_tropical", 2, 2), ("gaia/fauna_iguana_green", 1, 1),
			("gaia/fauna_toad_cane", 1, 1)],
		stone="gaia/rock/tropical_large", metal="gaia/ore/tropical_large", colour=(70, 110, 70)),
	# Numantia: the cold, dry plateau of the upper Douro, its river meadows and the pine and oak sierras.
	"meseta": dict(
		base=mix(("medit_grass_field_brown", 3), ("steppe_grass_dirt_33", 2), ("medit_grass_field_dry", 2), ("medit_rocks_grass", 1)),
		forest="medit_grass_wild", shore="steppe_river_rocks_dirt", beach="steppe_river_rocks_wet", cliff="medit_cliff_grass",
		trees=[("gaia/tree/oak_holly", 5), ("gaia/tree/juniper_prickly", 3), ("gaia/tree/pine_black", 2),
			("gaia/tree/bush_mediterranean", 2)],
		forest_density=0.3, scatter=0.012, fruit="gaia/fruit/berry_01",
		decor=[("actor|props/flora/grass_soft_dry_large.xml", 3), ("actor|props/flora/bush_medit_sm_dry.xml", 2),
			("actor|props/flora/grass_field_parched_tall.xml", 2), ("actor|geology/stone_granite_small.xml", 1)],
		fauna=[("gaia/fauna_deer_red", 3, 3), ("gaia/fauna_deer_red_female", 2, 3), ("gaia/fauna_rabbit", 3, 3),
			("gaia/fauna_partridge", 3, 3), ("gaia/fauna_horse_sorraia", 2, 3), ("gaia/fauna_aurochs", 1, 2),
			("gaia/fauna_aurochs_female", 1, 2), ("gaia/fauna_fox_red", 2, 1), ("gaia/fauna_badger", 1, 1),
			("gaia/fauna_wolf", 1, 2)],
		stone="gaia/rock/mediterranean_large", metal="gaia/ore/mediterranean_large", colour=(168, 150, 100)),
	"sierra": dict(
		base=mix(("temperate_grass_dirt_03", 2), ("alpine_grass_rocky", 2), ("medit_rocks_grass", 2), ("temperate_grass_05", 1)),
		forest="temperate_forestfloor_01", shore="steppe_river_rocks_dirt", beach="steppe_river_rocks_wet", cliff="temperate_cliff_02",
		trees=[("gaia/tree/pine", 4), ("gaia/tree/pine_black", 3), ("gaia/tree/oak", 2), ("gaia/tree/euro_beech", 2)],
		forest_density=0.5, scatter=0.02, fruit="gaia/fruit/berry_01",
		decor=[("actor|props/flora/ferns.xml", 2), ("actor|props/flora/bush_tempe_me.xml", 3),
			("actor|geology/highland1.xml", 1), ("actor|props/flora/grass_soft_large_tall.xml", 2)],
		fauna=[("gaia/fauna_deer_roe", 4, 3), ("gaia/fauna_deer_roe_female", 2, 3), ("gaia/fauna_boar", 3, 3),
			("gaia/fauna_wolf", 1, 2), ("gaia/fauna_bear_brown", 1, 1), ("gaia/fauna_fox_red", 1, 1)],
		stone="gaia/rock/temperate_large_02", metal="gaia/ore/temperate_large", colour=(84, 112, 70)),
	"vega": dict(
		base=mix(("temperate_grass_02", 3), ("temp_grass_long", 2), ("temperate_grass_03", 2), ("temperate_grass_mud_01", 1)),
		forest="temperate_forestfloor_02", shore="temperate_grass_mud_01", beach="temperate_mud_01", cliff="temperate_cliff_01",
		trees=[("gaia/tree/poplar", 4), ("gaia/tree/elm", 2), ("gaia/tree/bush_temperate", 2), ("gaia/tree/oak", 1)],
		forest_density=0.45, scatter=0.02, fruit="gaia/fruit/berry_01", reeds="actor|props/flora/cattails.xml",
		decor=[("actor|props/flora/grass_soft_large_tall.xml", 3), ("actor|props/flora/bush_tempe_me_lush.xml", 2),
			("actor|props/flora/grass_field_lush_tall.xml", 2)],
		fauna=[("gaia/fauna_deer_red", 2, 3), ("gaia/fauna_boar", 2, 3), ("gaia/fauna_mallard", 3, 3),
			("gaia/fauna_otter", 2, 1), ("gaia/fauna_rabbit", 2, 3)],
		stone="gaia/rock/temperate_large", metal="gaia/ore/temperate_large", colour=(96, 140, 72)),
})

PALETTE = {"chile_north": (176, 158, 112), "chile_central": (150, 150, 92), "chile_south": (64, 104, 58),
	"cuyo": (186, 160, 118), "patagonian_steppe": (170, 156, 110), "pampas": (122, 148, 78),
	"litoral": (88, 132, 70), "magellanic_forest": (70, 106, 64), "fuegian_steppe": (128, 136, 92),
	"falklands": (120, 126, 100)}
PALETTE.update({name: region["colour"] for name, region in REGIONS.items() if "colour" in region})


def marajo_regions(x, z, crest, e, ctx):
	"""West of x=255 and the mainland forest, east of it grasslands, mangroves along the open sea."""
	names = np.empty(x.shape, dtype=object)
	names[:] = "varzea_forest"
	names[(x > 255) & (x < 430) & (z > 90)] = "campos"
	sea_coast = (ctx["land_distance"] < 22) & (ctx["open_sea"])
	names[sea_coast] = "mangrove"
	return names


def numancia_regions(x, z, crest, e, ctx):
	names = np.empty(x.shape, dtype=object)
	names[:] = "meseta"
	names[e > 24] = "sierra"
	names[(ctx["land_distance"] < 36) & (e < 8)] = "vega"
	return names


def wall_mapu_regions(x, z, crest, e, ctx):
	"""Region name per tile from its position (tiles, z north), the Andes crest and height above water."""
	west = x < crest[np.clip(z.astype(int), 0, len(crest) - 1)]
	names = np.empty(x.shape, dtype=object)
	names[:] = "pampas"
	names[west & (z > 360)] = "chile_north"
	names[west & (z <= 360) & (z > 250)] = "chile_central"
	names[west & (z <= 250)] = "chile_south"
	east = ~west
	names[east & (z > 330) & (x < 300)] = "cuyo"
	names[east & (z <= 210)] = "patagonian_steppe"
	names[east & (z > 300) & (x >= 330)] = "litoral"
	return names


def patagonia_regions(x, z, crest, e, ctx):
	west = x < crest[np.clip(z.astype(int), 0, len(crest) - 1)] + 6
	names = np.empty(x.shape, dtype=object)
	names[:] = "patagonian_steppe"
	names[west] = "magellanic_forest"
	names[(~west) & (z < 120)] = "fuegian_steppe"
	names[x > 370] = "falklands"
	return names


MAPS = {
	"wall_mapu": dict(
		pmp="709435207_WallMapu.pmp", xml="Wall Mapu.xml", name="Wall Mapu",
		description="Wall Mapu, \"the known land\" in Mapudungun, covers every land the Mapuche people ever lived in: "
			"the Pacific coast and the Andes, from the dry valleys of the north to the rainforests and fjords of the south, "
			"and across the mountains the Cuyo deserts, the Pampas and the Patagonian steppe down to the Río de la Plata. "
			"Guanacos and rheas roam the plains, pudús and huemuls the southern forests, and the puma hunts them all.",
		regions=wall_mapu_regions, crest=(80, 260), snow=(76, 60), sky="cirrus",
		water=dict(color=(0.22, 0.32, 0.38), tint=(0.28, 0.36, 0.38), murkiness=0.75, waviness=5),
		sun=dict(color=(1.05, 1.0, 0.92), elevation=0.72, rotation=-0.55, ambient=(0.38, 0.4, 0.46))),
	"patagonia_fjords": dict(
		pmp="Patagonia.pmp", xml="Patagonia.xml", name="Patagonia Fjords",
		description="The southern tip of the Americas, homeland of the Tehuelche, Selk'nam and Kawésqar peoples. West of "
			"the Andes, ice fields and beech forests drop into a maze of fjords; east of them the windswept steppe "
			"runs to the Atlantic, crossed by herds of guanacos and rheas. Seals rest on the beaches and orcas and "
			"whales hunt along the coast.",
		regions=patagonia_regions, crest=(60, 260), snow=(48, 34), sky="stratus",
		# The two neutral villages of the original map belong to the Pampid peoples of the mod.
		retemplate={r"^structures/maur/": "structures/pamp/", r"^units/maur/infantry_swordsman_e": "units/pamp/infantry_clubman_e",
			r"^units/maur/infantry_archer_e": "units/pamp/infantry_boleador_e", r"^units/maur/": "units/pamp/"},
		settlement=mix(("steppe_dirt_a", 2), ("steppe_grass_dirt_66", 1)),
		water=dict(color=(0.18, 0.26, 0.34), tint=(0.24, 0.32, 0.38), murkiness=0.6, waviness=6),
		sun=dict(color=(0.98, 0.98, 0.98), elevation=0.6, rotation=-0.7, ambient=(0.42, 0.45, 0.52))),
	"marajo_island": dict(
		pmp="229998361_IsladeMaraj.pmp", xml="Isla de Marajó.xml", name="Marajó Island",
		description="Marajó, the great island at the mouth of the Amazon, home of the Marajoara mound builders and "
			"later disputed by many Tupi and Arawak peoples. Flooded forests cover the west, wet grasslands the east, "
			"and mangroves line the coast. Neutral villages can be won over. Peccaries, deer, caimans and jaguars "
			"live among the channels, and river dolphins fish in the bay.",
		regions=marajo_regions, crest=(0, 2), snow=(999, 999), sky="cumulus", starting_animal="gaia/fauna_curassow",
		retemplate={r"^structures/maur/": "structures/tupi/", r"^units/maur/support_female_citizen": "units/tupi/support_civilian",
			r"^units/maur/": "units/tupi/"},
		settlement=mix(("tropic_dirt_a_plants", 2), ("tropic_beach_dry", 1)),
		sea=dict(deep="tropic_beach_wet", fauna=[("gaia/fauna_dolphin", 1, 2)], fish=["gaia/fish/generic", "gaia/fish/tilapia"],
			seal=None, offshore=20),
		water=dict(color=(0.36, 0.33, 0.22), tint=(0.42, 0.38, 0.26), murkiness=0.92, waviness=3),
		sun=dict(color=(1.1, 1.02, 0.9), elevation=0.85, rotation=-0.5, ambient=(0.4, 0.42, 0.42))),
	"numantia": dict(
		pmp="numancia.pmp", xml="numancia.xml", name="Siege of Numantia", mode="scenario",
		description="134-133 BC. After twenty years of war, the Celtiberian city of Numantia still defies Rome. Scipio "
			"Aemilianus has ringed the hill with nine kilometres of walls, towers and seven camps, and blocked the Douro. "
			"Numantia must break the siege or endure; Rome must starve it into surrender.",
		players=[{"Name": "Numantia", "Civ": "iber", "Team": 0, "Resources": {"food": 500, "wood": 300, "stone": 300, "metal": 200}},
			{"Name": "Rome", "Civ": "rome", "Team": 1, "AI": "petra", "Resources": {"food": 1000, "wood": 1000, "stone": 500, "metal": 800}}],
		regions=numancia_regions, crest=(0, 2), snow=(96, 96), sky="cirrus",
		highland_fauna=[("gaia/fauna_deer_roe", 3, 3), ("gaia/fauna_wolf", 1, 2)],
		settlement=mix(("medit_dirt_b", 2), ("steppe_dirt_a", 2), ("medit_grass_field_dry", 1)),
		sea=dict(deep="steppe_river_rocks_wet", fauna=[], fish=["gaia/fish/generic", "gaia/fish/generic"], seal=None),
		water=dict(color=(0.26, 0.3, 0.28), tint=(0.36, 0.38, 0.3), murkiness=0.85, waviness=2),
		sun=dict(color=(1.06, 1.0, 0.9), elevation=0.7, rotation=-0.6, ambient=(0.4, 0.4, 0.44))),
}


# ------------------------------------------------------------------------------------------------

def pick(options, field):
	"""Index into a weighted list from a noise field (patches, not salt and pepper)."""
	weights = np.array([w for _, w in options], float)
	edges = np.cumsum(weights) / weights.sum()
	u = 0.5 * (1 + special.erf(field / math.sqrt(2)))
	return np.searchsorted(edges, np.clip(u, 0, 0.999999))


class Placer:
	"""Keeps entities apart and off water, cliffs and the player bases."""

	def __init__(self, height, water, slope, structures, rng):
		"""structures: (x, z) of the player bases and kept buildings, kept clear of gaia."""
		self.height, self.water, self.slope, self.rng = height, water, slope, rng
		self.size = height.shape[0] - 1
		self.cell = 2.0
		cells = int(self.size * TILE / self.cell) + 1
		self.taken = np.zeros((cells, cells), dtype=np.uint8)
		points = np.ones((cells, cells), dtype=bool)
		for x, z in structures:
			points[min(int(z / self.cell), cells - 1), min(int(x / self.cell), cells - 1)] = False
		self.structure_distance = ndimage.distance_transform_edt(points) * self.cell if structures else np.full((cells, cells), 1e9)
		self.entities = []

	def ground(self, x, z):
		i, j = int(z / TILE), int(x / TILE)
		if not (0 <= i < self.size and 0 <= j < self.size):
			return None
		return self.height[i, j], self.slope[i, j]

	def inside(self, x, z):
		c = self.size * TILE / 2
		return (x - c) ** 2 + (z - c) ** 2 < (c - 12) ** 2

	def free(self, x, z, radius):
		ci, cj = int(z / self.cell), int(x / self.cell)
		r = int(math.ceil(radius / self.cell))
		block = self.taken[max(ci - r, 0):ci + r + 1, max(cj - r, 0):cj + r + 1]
		return not block.any()

	def take(self, x, z, radius):
		ci, cj = int(z / self.cell), int(x / self.cell)
		r = int(math.ceil(radius / self.cell))
		self.taken[max(ci - r, 0):ci + r + 1, max(cj - r, 0):cj + r + 1] = 1

	def ok(self, x, z, radius=1.0, kind="land", base_distance=0.0, max_slope=0.8):
		if not self.inside(x, z):
			return False
		g = self.ground(x, z)
		if g is None:
			return False
		h, s = g
		depth = self.water - h
		if kind == "land" and (depth > -0.3 or s > max_slope):
			return False
		if kind == "shore" and not (-1.2 < depth < 0.3 and s < 0.9):
			return False
		if kind == "sea" and depth < 4:
			return False
		if kind == "fish" and not (2 < depth):
			return False
		if base_distance and self.structure_distance[int(z / self.cell), int(x / self.cell)] < base_distance:
			return False
		return self.free(x, z, radius)

	def add(self, template, x, z, radius=1.0, player=0, angle=None, block=True):
		if block:
			self.take(x, z, radius)
		self.entities.append((template, player, x, z, self.rng.uniform(0, 2 * math.pi) if angle is None else angle))


def build(key, config, src, data, rng_seed=7):
	rng = np.random.default_rng(rng_seed)
	pmp = read_pmp(os.path.join(src, config["pmp"]))
	scenario = read_scenario(os.path.join(src, config["xml"]))
	water = scenario["water"]
	height = reshape_shores(pmp["height"], water)
	n = height.shape[0] - 1
	tile_h = 0.25 * (height[:-1, :-1] + height[1:, :-1] + height[:-1, 1:] + height[1:, 1:])
	gy, gx = np.gradient(height, TILE)
	slope_v = np.hypot(gx, gy)
	slope = np.maximum.reduce([slope_v[:-1, :-1], slope_v[1:, :-1], slope_v[:-1, 1:], slope_v[1:, 1:]])
	e = tile_h - water
	wet = e < 0
	land_distance = ndimage.distance_transform_edt(~wet) * TILE   # from water, on land
	sea_distance = ndimage.distance_transform_edt(wet) * TILE     # from land, in water
	zz, xx = np.mgrid[0:n, 0:n].astype(float)
	crest = crest_line(height[:-1, :-1], *config["crest"])
	# Region borders follow a noisy line instead of straight cuts.
	wobble = 28
	rx = xx + wobble * noise((n, n), 14, rng_seed + 11)
	rz = zz + wobble * noise((n, n), 14, rng_seed + 12)
	labels, _ = ndimage.label(wet)
	sizes = np.bincount(labels.ravel())
	sizes[0] = 0
	open_sea = ndimage.binary_dilation(labels == sizes.argmax(), iterations=6)
	ctx = dict(land_distance=land_distance, sea_distance=sea_distance, n=n, open_sea=open_sea)
	regions = config["regions"](rx, rz, crest, e, ctx)
	snow_n, snow_s = config["snow"]
	snow_line = snow_s + (snow_n - snow_s) * (zz / n)
	snow_line = snow_line + 4 * noise((n, n), 6, rng_seed + 1)
	dry = np.isin(regions, ["chile_north", "cuyo", "patagonian_steppe", "meseta"])
	sea = config.get("sea", SEA)

	textures = []
	index = {}

	def tex(name):
		if name not in data.terrains:
			raise SystemExit("missing terrain: " + name)
		if name not in index:
			index[name] = len(textures)
			textures.append(name)
		return index[name]

	tiles = np.zeros((n, n), dtype=np.int32)
	variety = noise((n, n), 3, rng_seed + 2)
	for name, region in REGIONS.items():
		mask = regions == name
		if not mask.any():
			continue
		choice = pick(region["base"], variety)
		for k, (t, _) in enumerate(region["base"]):
			tiles[mask & (choice == k)] = tex(t)
	# Forest patches (also used for the trees below).
	forest_field = noise((n, n), 5, rng_seed + 3) + 0.6 * noise((n, n), 18, rng_seed + 4)
	density = np.vectorize(lambda r: REGIONS[r]["forest_density"])(regions)
	forest = (forest_field > 1.25 - 1.6 * density) & (e > 0.3) & (slope < 0.8) & (e < snow_line - 22)
	for name, region in REGIONS.items():
		tiles[(regions == name) & forest] = tex(region["forest"])
	# Mountain tiers.
	high = e > snow_line - 26
	choice = pick(HIGHLAND["dry"], variety)
	for k, (t, _) in enumerate(HIGHLAND["dry"]):
		tiles[high & dry & (choice == k)] = tex(t)
	choice = pick(HIGHLAND["wet"], variety)
	for k, (t, _) in enumerate(HIGHLAND["wet"]):
		tiles[high & ~dry & (choice == k)] = tex(t)
	rock = e > snow_line - 12
	choice = pick(HIGHLAND["rock"], variety)
	for k, (t, _) in enumerate(HIGHLAND["rock"]):
		tiles[rock & (choice == k)] = tex(t)
	snow = e > snow_line
	choice = pick(HIGHLAND["snow"], variety)
	for k, (t, _) in enumerate(HIGHLAND["snow"]):
		tiles[snow & (choice == k)] = tex(t)
	ice = e > snow_line + 14
	choice = pick(HIGHLAND["ice"], variety)
	for k, (t, _) in enumerate(HIGHLAND["ice"]):
		tiles[ice & (choice == k)] = tex(t)
	# Cliffs.
	cliff = slope > 1.0
	for name, region in REGIONS.items():
		tiles[(regions == name) & cliff & ~high] = tex(region["cliff"])
	tiles[cliff & high & ~snow] = tex(HIGHLAND["cliff"])
	tiles[cliff & snow] = tex(HIGHLAND["snow_cliff"])
	# Shores and the bottom of the water.
	shore = (~wet) & (land_distance <= 6) & (e < 2.5) & ~cliff
	beach = wet & (sea_distance <= 8)
	for name, region in REGIONS.items():
		tiles[(regions == name) & shore] = tex(region["shore"])
		tiles[(regions == name) & beach] = tex(region["beach"])
	tiles[wet & ~beach] = tex(sea["deep"])

	# ---- Entities --------------------------------------------------------------------------------
	bases = []
	kept = []
	mode = config.get("mode", "skirmish")
	retemplate = config.get("retemplate", {})
	for entity in scenario["entities"]:
		template = entity["template"]
		if mode == "skirmish" and entity["player"] > 0:
			if "civil_centre" in template:
				bases.append((entity["x"], entity["z"], entity["player"], entity["angle"]))
			continue
		if template.startswith("gaia/") or template.startswith("actor|"):
			continue
		for pattern, replacement in retemplate.items():
			template = re.sub(pattern, replacement, template)
		kept.append(dict(entity, template=template))
	structures = [(b[0], b[1]) for b in bases] + [(k["x"], k["z"]) for k in kept if k["template"].startswith("structures/")]
	placer = Placer(height, water, slope_v, structures, rng)

	def footprint(template):
		for key, radius in (("civil_centre", 18), ("fortress", 16), ("army_camp", 20), ("field", 12), ("wall", 4),
				("house", 6), ("tent", 4), ("tower", 4), ("monument", 5)):
			if key in template:
				return radius
		return 6

	# Kept buildings and units of the original map, with the ground around the buildings trodden.
	settlement = config.get("settlement")
	trodden = np.zeros((n, n), dtype=bool)
	for k in kept:
		is_structure = k["template"].startswith("structures/")
		radius = footprint(k["template"]) if is_structure else 1
		placer.add(data.check(k["template"]), k["x"], k["z"], radius, k["player"], k["angle"], block=is_structure)
		if is_structure and settlement and "wall" not in k["template"]:
			r = int(math.ceil((radius + 4) / TILE))
			i, j = int(k["z"] / TILE), int(k["x"] / TILE)
			trodden[max(i - r, 0):i + r + 1, max(j - r, 0):j + r + 1] = True
	if settlement:
		trodden &= ~wet & ~cliff
		choice = pick(settlement, noise((n, n), 1.5, rng_seed + 21))
		for k, (t, _) in enumerate(settlement):
			tiles[trodden & (choice == k)] = tex(t)
	highland_fauna = config.get("highland_fauna", HIGHLAND["fauna"])
	starting_animal = config.get("starting_animal", "gaia/fauna_tinamou")

	def region_at(x, z):
		i, j = min(int(z / TILE), n - 1), min(int(x / TILE), n - 1)
		return REGIONS[regions[i, j]], i, j

	# Player bases: civil centre, starting units, and nearby resources.
	# Civilians: every civ of the mod has support_civilian, only some have support_female_citizen.
	start_units = [("skirmish/units/default_support_civilian", 4), ("skirmish/units/default_infantry_melee_b", 2),
		("skirmish/units/default_infantry_ranged_b", 2), ("skirmish/units/default_cavalry", 1)]
	for bx, bz, player, angle in bases:
		placer.add(data.check("skirmish/structures/default_civil_centre"), bx, bz, 20, player, angle)
		k = 0
		for template, count in start_units:
			for _ in range(count):
				a = angle + math.pi + (k - 4) * 0.22
				placer.add(data.check(template), bx + 26 * math.sin(a), bz + 26 * math.cos(a), 1, player, angle, block=False)
				k += 1
		region, _, _ = region_at(bx, bz)

		def ring(r0, r1, radius, tries=200):
			for _ in range(tries):
				a, r = rng.uniform(0, 2 * math.pi), rng.uniform(r0, r1)
				x, z = bx + r * math.sin(a), bz + r * math.cos(a)
				if placer.ok(x, z, radius, max_slope=0.6):
					return x, z
			return None

		spot = ring(26, 34, 6)
		if spot:
			placed = 0
			for _ in range(80):
				x, z = spot[0] + rng.uniform(-7, 7), spot[1] + rng.uniform(-7, 7)
				if placed < 5 and placer.ok(x, z, 1.0):
					placer.add(data.check(region["fruit"]), x, z, 1.0)
					placed += 1
		for template in (region["stone"], region["metal"]):
			spot = ring(38, 50, 6)
			if spot:
				placer.add(data.check(template), *spot, 6)
		spot = ring(30, 40, 8)
		if spot:
			for _ in range(6):
				x, z = spot[0] + rng.uniform(-7, 7), spot[1] + rng.uniform(-7, 7)
				if placer.ok(x, z, 1):
					placer.add(data.check(starting_animal), x, z, 1, block=False)
		spot = ring(55, 70, 12)
		if spot:
			herd = region["fauna"][0][0]
			for _ in range(5):
				x, z = spot[0] + rng.uniform(-8, 8), spot[1] + rng.uniform(-8, 8)
				if placer.ok(x, z, 1.5):
					placer.add(data.check(herd), x, z, 1.5, block=False)
		# A woodline of the region's largest trees (bushes give little wood): up to three groves until
		# there are at least 40 trees.
		big = [t for t, _ in region["trees"] if "bush" not in t] or ["gaia/tree/euro_beech"]
		planted = 0
		for _ in range(3):
			if planted >= 40:
				break
			spot = ring(45, 65, 14)
			if not spot:
				continue
			for _ in range(160):
				x, z = spot[0] + rng.normal(0, 8), spot[1] + rng.normal(0, 8)
				if placer.ok(x, z, 1.8):
					placer.add(data.check(big[rng.integers(len(big))]), x, z, 1.8)
					planted += 1

	# Forests and scattered trees.
	for i in range(n):
		for j in range(n):
			name = regions[i, j]
			region = REGIONS[name]
			if wet[i, j] or slope[i, j] > 0.8 or e[i, j] > snow_line[i, j] - 14:
				continue
			p = 0.0
			if forest[i, j]:
				p = 0.18 + 0.4 * region["forest_density"]
			elif e[i, j] < snow_line[i, j] - 22:
				p = region["scatter"]
			if p and rng.random() < p:
				x, z = (j + rng.uniform(0.1, 0.9)) * TILE, (i + rng.uniform(0.1, 0.9)) * TILE
				if placer.ok(x, z, 1.6, base_distance=40):
					trees = region["trees"]
					weights = np.array([w for _, w in trees], float)
					template = trees[rng.choice(len(trees), p=weights / weights.sum())][0]
					placer.add(data.check(template), x, z, 1.6)

	# Decoratives: grass, bushes and stones, more of them away from the forests.
	for _ in range(n * n // 18):
		i, j = rng.integers(0, n, 2)
		if wet[i, j] or snow[i, j]:
			continue
		region = REGIONS[regions[i, j]]
		x, z = (j + rng.random()) * TILE, (i + rng.random()) * TILE
		if placer.ok(x, z, 0.5, base_distance=22, max_slope=1.0):
			decor = region["decor"]
			weights = np.array([w for _, w in decor], float)
			placer.add(data.check(decor[rng.choice(len(decor), p=weights / weights.sum())][0]), x, z, 0.5, block=False)
	# Reeds along fresh water and calm shores of the warmer regions.
	for _ in range(n * 6):
		i, j = rng.integers(0, n, 2)
		if not (shore[i, j] and REGIONS[regions[i, j]].get("reeds")):
			continue
		x, z = (j + rng.random()) * TILE, (i + rng.random()) * TILE
		if placer.ok(x, z, 0.5, kind="shore"):
			placer.add(data.check(REGIONS[regions[i, j]]["reeds"]), x, z, 0.5, block=False)

	# Mines: spread over the map, more in the mountains.
	def mines(count, templates, condition, distance):
		placed = 0
		for _ in range(count * 60):
			if placed >= count:
				break
			i, j = rng.integers(0, n, 2)
			if not condition(i, j):
				continue
			x, z = (j + 0.5) * TILE, (i + 0.5) * TILE
			if placer.ok(x, z, 12, base_distance=distance, max_slope=0.7):
				placer.add(data.check(templates(i, j)), x, z, 10)
				placed += 1
		return placed

	area = (n / 128) ** 2
	mines(int(4 * area), lambda i, j: REGIONS[regions[i, j]]["stone"], lambda i, j: e[i, j] < snow_line[i, j] - 14, 90)
	mines(int(4 * area), lambda i, j: REGIONS[regions[i, j]]["metal"], lambda i, j: e[i, j] < snow_line[i, j] - 14, 90)
	mines(int(2 * area), lambda i, j: HIGHLAND["stone"] if rng.random() < 0.5 else HIGHLAND["metal"],
		lambda i, j: snow_line[i, j] - 26 < e[i, j] < snow_line[i, j] - 6, 90)

	# Land fauna: herds per region; predators away from the bases.
	for _ in range(int(55 * area)):
		i, j = rng.integers(0, n, 2)
		if wet[i, j]:
			continue
		highland = e[i, j] > snow_line[i, j] - 26
		if e[i, j] > snow_line[i, j] - 6:
			continue
		fauna = highland_fauna if highland else REGIONS[regions[i, j]]["fauna"]
		weights = np.array([w for _, w, _ in fauna], float)
		template, _, kind = fauna[rng.choice(len(fauna), p=weights / weights.sum())]
		size = {3: rng.integers(4, 9), 1: rng.integers(1, 3), 2: rng.integers(2, 4)}[kind]
		predator = any(k in template for k in ("puma", "jaguar", "wolf", "bear"))
		distance = 110 if predator else 60
		cx, cz = (j + 0.5) * TILE, (i + 0.5) * TILE
		if not placer.ok(cx, cz, 2, base_distance=distance):
			continue
		for _ in range(size):
			x, z = cx + rng.uniform(-9, 9), cz + rng.uniform(-9, 9)
			if placer.ok(x, z, 1.2, base_distance=distance):
				placer.add(data.check(template), x, z, 1.2, block=False)
	# Seals on the coasts; fish near the land; whales, orcas and dolphins offshore.
	for _ in range(int(40 * area) if sea.get("seal") else 0):
		i, j = rng.integers(0, n, 2)
		if not (beach[i, j] or shore[i, j]) or regions[i, j] in ("cuyo", "litoral", "chile_north"):
			continue
		cx, cz = (j + 0.5) * TILE, (i + 0.5) * TILE
		for _ in range(rng.integers(2, 6)):
			x, z = cx + rng.uniform(-6, 6), cz + rng.uniform(-6, 6)
			if placer.ok(x, z, 1.5, kind="shore", base_distance=50):
				placer.add(data.check(sea["seal"]), x, z, 1.5, block=False)
	for _ in range(int(220 * area)):
		i, j = rng.integers(0, n, 2)
		if not (wet[i, j] and 8 < sea_distance[i, j] < 60):
			continue
		x, z = (j + 0.5) * TILE, (i + 0.5) * TILE
		if placer.ok(x, z, 6, kind="fish"):
			placer.add(data.check(sea["fish"][int(sea_distance[i, j] > 30)]), x, z, 6)
	for _ in range(int(60 * area) if sea["fauna"] else 0):
		i, j = rng.integers(0, n, 2)
		if not (wet[i, j] and sea_distance[i, j] > sea.get("offshore", 40)):
			continue
		fauna = sea["fauna"]
		weights = np.array([w for _, w, _ in fauna], float)
		template, _, kind = fauna[rng.choice(len(fauna), p=weights / weights.sum())]
		cx, cz = (j + 0.5) * TILE, (i + 0.5) * TILE
		for _ in range({1: 1, 2: 2, 3: 3}[kind]):
			x, z = cx + rng.uniform(-12, 12), cz + rng.uniform(-12, 12)
			if placer.ok(x, z, 4, kind="sea"):
				placer.add(data.check(template), x, z, 4, block=False)

	return dict(height=height, tiles=tiles, textures=textures, version=pmp["version"], patches=pmp["patches"],
		entities=placer.entities, bases=bases, kept=kept, water=water, settings=scenario["settings"], regions=regions,
		wet=wet, e=e, snow_line=snow_line)


def write_scenario(path, key, config, result, preview):
	c = config
	w, s = c["water"], c["sun"]
	scenario_mode = c.get("mode") == "scenario"
	players = list(range(1, len(c["players"]) + 1)) if scenario_mode else sorted({b[2] for b in result["bases"]})
	settings = {
		"CircularMap": True,
		"Description": c["description"],
		"Keywords": [],
		"LockTeams": False,
		"Name": c["name"] if scenario_mode else "%s (%d)" % (c["name"], len(players)),
		"PlayerData": [None] + c["players"] if scenario_mode else [""] + [{"Name": "Player %d" % p} for p in players],
		"Preview": preview,
		"RevealMap": False,
		"VictoryConditions": ["conquest"] if scenario_mode else ["conquest_civic_centers"],
	}
	if scenario_mode:
		settings["LockTeams"] = True
	if players != list(range(1, len(players) + 1)):
		raise SystemExit("players are not numbered 1..n: %s" % players)
	first = result["bases"][0][:2] if result["bases"] else next((k["x"], k["z"]) for k in result["kept"] if k["player"] == 1)
	bx, bz = first
	lines = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>", "", "<Scenario version=\"7\">", "\t<Environment>",
		"\t\t<SkySet>%s</SkySet>" % c["sky"],
		'\t\t<SunColor r="%g" g="%g" b="%g"/>' % s["color"],
		'\t\t<SunElevation angle="%g"/>' % s["elevation"],
		'\t\t<SunRotation angle="%g"/>' % s["rotation"],
		'\t\t<AmbientColor r="%g" g="%g" b="%g"/>' % s["ambient"],
		"\t\t<Fog>", "\t\t\t<FogFactor>0.0012</FogFactor>", "\t\t\t<FogThickness>0.4</FogThickness>",
		'\t\t\t<FogColor r="0.85" g="0.88" b="0.92"/>', "\t\t</Fog>",
		"\t\t<Water>", "\t\t\t<WaterBody>", "\t\t\t\t<Type>ocean</Type>",
		'\t\t\t\t<Color r="%g" g="%g" b="%g"/>' % w["color"],
		'\t\t\t\t<Tint r="%g" g="%g" b="%g"/>' % w["tint"],
		"\t\t\t\t<Height>%g</Height>" % result["water"],
		"\t\t\t\t<Waviness>%g</Waviness>" % w["waviness"],
		"\t\t\t\t<Murkiness>%g</Murkiness>" % w["murkiness"],
		"\t\t\t\t<WindAngle>0</WindAngle>", "\t\t\t</WaterBody>", "\t\t</Water>",
		"\t\t<Postproc>", "\t\t\t<Brightness>0</Brightness>", "\t\t\t<Contrast>1.03</Contrast>",
		"\t\t\t<Saturation>0.95</Saturation>", "\t\t\t<Bloom>0.15</Bloom>", "\t\t\t<PostEffect>hdr</PostEffect>",
		"\t\t</Postproc>", "\t</Environment>",
		"\t<Camera>", '\t\t<Position x="%g" y="160" z="%g"/>' % (bx, bz - 90),
		'\t\t<Rotation angle="0"/>', '\t\t<Declination angle="0.6"/>', "\t</Camera>",
		"\t<ScriptSettings><![CDATA[", json.dumps(settings, indent=2, ensure_ascii=False), "]]></ScriptSettings>",
		"\t<Entities>"]
	for uid, (template, player, x, z, angle) in enumerate(result["entities"], 100):
		lines += ['\t\t<Entity uid="%d">' % uid, "\t\t\t<Template>%s</Template>" % escape(template),
			"\t\t\t<Player>%d</Player>" % player, '\t\t\t<Position x="%.3f" z="%.3f"/>' % (x, z),
			'\t\t\t<Orientation y="%.4f"/>' % angle, "\t\t</Entity>"]
	lines += ["\t</Entities>", "\t<Paths/>", "</Scenario>", ""]
	with open(path, "w", encoding="utf-8") as f:
		f.write("\n".join(lines))


def write_preview(path, result):
	"""Top view: the colour of each terrain kind, hill shading, water by depth, a circle mask."""
	height, e, wet = result["height"], result["e"], result["wet"]
	n = e.shape[0]
	image = np.zeros((n, n, 3))
	for name, colour in PALETTE.items():
		image[result["regions"] == name] = colour
	high = e > result["snow_line"] - 26
	image[high] = (128, 118, 100)
	image[e > result["snow_line"] - 12] = (120, 116, 112)
	image[e > result["snow_line"]] = (236, 238, 242)
	tiles_h = height[:-1, :-1]
	gy, gx = np.gradient(tiles_h)
	shade = np.clip(1 + 0.05 * (gx - gy), 0.6, 1.3)
	image *= shade[..., None]
	depth = np.clip(-e / 20, 0, 1)
	sea = np.stack([60 - 30 * depth, 100 - 40 * depth, 130 - 30 * depth], -1)
	image[wet] = sea[wet]
	yy, xx = np.mgrid[0:n, 0:n]
	outside = (xx - n / 2) ** 2 + (yy - n / 2) ** 2 > (n / 2) ** 2
	image[outside] = (0, 0, 0)
	img = Image.fromarray(np.clip(image, 0, 255).astype(np.uint8)[::-1])
	alpha = Image.fromarray(((~outside)[::-1] * 255).astype(np.uint8))
	img.putalpha(alpha)
	img.resize((512, 512), Image.LANCZOS).save(path)


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--only", default="")
	parser.add_argument("--src", default=os.path.expanduser("~/Downloads"))
	args = parser.parse_args()
	only = {n for n in args.only.split(",") if n}
	data = GameData()
	for key, config in MAPS.items():
		if only and key not in only:
			continue
		if not all(os.path.exists(os.path.join(args.src, config[k])) for k in ("pmp", "xml")):
			print("%s: source files not found in %s, skipped" % (key, args.src))
			continue
		result = build(key, config, args.src, data)
		scenario_mode = config.get("mode") == "scenario"
		players = len(config["players"]) if scenario_mode else len({b[2] for b in result["bases"]})
		name = key if scenario_mode else "%s_%dp" % (key, players)
		out = os.path.join(MOD, "maps", "scenarios" if scenario_mode else "skirmishes")
		os.makedirs(out, exist_ok=True)
		write_pmp(os.path.join(out, name + ".pmp"), result["version"], result["patches"], result["height"],
			result["textures"], result["tiles"])
		preview_dir = os.path.join(MOD, "art", "textures", "ui", "session", "icons", "mappreview")
		os.makedirs(preview_dir, exist_ok=True)
		write_preview(os.path.join(preview_dir, key + ".png"), result)
		write_scenario(os.path.join(out, name + ".xml"), key, config, result, key + ".png")
		kinds = {}
		for template, *_ in result["entities"]:
			k = template.split("/")[1] if "/" in template and not template.startswith("actor|") else (
				"actor" if template.startswith("actor|") else template)
			k = "tree" if template.startswith("gaia/tree") else ("fauna" if "fauna_" in template else k)
			kinds[k] = kinds.get(k, 0) + 1
		print("%s: %d players, %d textures, %d entities %s" % (name, players, len(result["textures"]),
			len(result["entities"]), kinds))


if __name__ == "__main__":
	main()
