#!/usr/bin/env python3
"""Turn the map skeletons of novos_mapas/ (relief + civil centres drawn in Atlas) into skirmish maps.

Uses the pipeline of import_atlas_maps.py (shores, painting by region/height/slope, player bases,
forests, mines, fauna, preview) with the biomes of each part of the world and the animals that
lived there. Maps drawn without civil centres get their bases placed on flat land, far apart.

Usage: python3 tools/import_novos_mapas.py [--only crimea,egipto] [--jobs 4]
"""
import argparse
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_atlas_maps as base  # noqa: E402
from import_atlas_maps import mix  # noqa: E402

SRC = os.path.join(base.MOD, "novos_mapas")


def F(template, weight, kind):
	"""Fauna entry: kind 3 = herd (4-8), 2 = group (2-3), 1 = alone or a pair."""
	return ("gaia/fauna_" + template, weight, kind)


def T(name, weight):
	return ("gaia/tree/" + name, weight)


def A(name, weight):
	return ("actor|" + name + ".xml", weight)


# ------------------------------------------------------------------------------------------------
# Biomes. The first fauna entry is the herd hunted next to the player bases: always a prey animal.

B = {}

# ---- Atlantic and temperate Europe
B["atlantic"] = dict(
	base=mix(("temperate_grass_01", 3), ("temperate_grass_04", 2), ("temp_grass_long", 2), ("temperate_grass_dirt_01", 1)),
	forest="temperate_forestfloor_01", shore="temperate_grass_mud_01", beach="temperate_mud_01", cliff="temperate_cliff_02",
	trees=[T("oak", 4), T("euro_beech", 3), T("euro_birch", 1), T("bush_temperate", 2)],
	forest_density=0.45, scatter=0.012, fruit="gaia/fruit/berry_01", reeds="actor|props/flora/cattails.xml",
	decor=[A("props/flora/grass_soft_large_tall", 3), A("props/flora/bush_tempe_me_lush", 2), A("props/flora/ferns", 2),
		A("geology/highland1_moss", 1)],
	fauna=[F("deer_red", 4, 3), F("deer_roe", 3, 3), F("boar", 3, 3), F("aurochs", 1, 2), F("aurochs_female", 1, 2),
		F("rabbit_european", 2, 3), F("fox_red", 2, 1), F("badger", 1, 1), F("hedgehog_european", 1, 1),
		F("wolf", 1, 2), F("bear_brown", 1, 1)],
	stone="gaia/rock/temperate_large", metal="gaia/ore/temperate_large", colour=(88, 130, 70))
B["eriu"] = dict(B["atlantic"],
	base=mix(("temperate_grass_02", 3), ("temp_grass_mossy", 2), ("temperate_grass_03", 2), ("temp_grass_clovers", 1)),
	trees=[T("oak", 4), T("euro_birch", 2), T("euro_beech", 1), T("bush_temperate", 3)], forest_density=0.35,
	fauna=[F("deer_red", 5, 3), F("boar", 3, 3), F("hare_iberian", 2, 2), F("fox_red", 2, 1), F("badger", 1, 1),
		F("otter", 1, 1), F("wolf", 1, 2), F("bear_brown", 1, 1)], colour=(84, 136, 66))
B["moorland"] = dict(B["atlantic"],
	base=mix(("temp_highlands", 3), ("alpine_grass_rocky", 2), ("temp_plants_bog", 1), ("new_alpine_grass_mossy", 2)),
	forest="temp_highlands", cliff="temperate_cliff_01",
	trees=[T("euro_birch", 2), T("bush_temperate", 3), T("fir", 1)], forest_density=0.12, scatter=0.006,
	decor=[A("props/flora/grass_soft_dry_tuft_a", 3), A("props/flora/bush_highlands", 2), A("geology/highland2_moss", 1)],
	fauna=[F("deer_red", 5, 3), F("wildcat_european", 1, 1), F("fox_red", 2, 1), F("wolf", 1, 2)], colour=(112, 120, 84))
B["frisian_marsh"] = dict(B["atlantic"],
	base=mix(("temperate_grass_mud_01", 2), ("temp_plants_bog", 2), ("temp_grass_wet", 3), ("temperate_grass_02", 2)),
	forest="temp_plants_bog", shore="temp_mud_a", beach="mud_flats", cliff="temperate_cliff_01",
	trees=[T("poplar", 2), T("euro_birch", 2), T("bush_temperate", 4), T("elm", 1)], forest_density=0.12, scatter=0.006,
	reeds="actor|props/flora/reeds_pond_lush_a.xml",
	decor=[A("props/flora/grass_field_lush_tall", 3), A("props/flora/cattails", 2), A("props/flora/reeds_a", 2)],
	fauna=[F("goose_greylag", 4, 3), F("mallard", 3, 3), F("deer_roe", 2, 3), F("heron_gray", 2, 1), F("stork_white", 2, 2),
		F("otter", 1, 1), F("fox_red", 1, 1)], colour=(104, 128, 84))
B["north_european"] = dict(B["atlantic"],
	base=mix(("temp_grass_long", 2), ("temperate_grass_04", 3), ("temp_grass_plants", 2), ("temperate_grass_dirt_02", 1)),
	forest="temperate_forestfloor_02",
	trees=[T("euro_beech", 4), T("oak", 3), T("euro_birch", 2), T("pine", 1), T("bush_temperate", 1)], forest_density=0.55,
	fauna=[F("deer_roe", 4, 3), F("deer_red", 3, 3), F("boar", 3, 3), F("aurochs", 1, 2), F("bison", 1, 2),
		F("beaver_eurasian", 1, 1), F("squirrel_red", 1, 1), F("fox_red", 1, 1), F("wolf", 1, 2), F("bear_brown", 1, 1)],
	colour=(76, 120, 64))
B["boreal"] = dict(
	base=mix(("alpine_grass_b_wild", 2), ("new_alpine_grass_mossy", 3), ("alpine_forrestfloor", 1), ("baltic_grass_rocks_01", 2)),
	forest="alpine_forrestfloor", shore="alpine_shore_rocks_grass_50", beach="alpine_shore_rocks", cliff="alpine_cliff_b",
	trees=[T("fir", 4), T("pine", 3), T("euro_birch", 3), T("bush_temperate_winter", 1)], forest_density=0.7, scatter=0.02,
	fruit="gaia/fruit/berry_02", reeds="actor|props/flora/cattails.xml",
	decor=[A("props/flora/ferns", 2), A("props/flora/bush_tempe_sm", 2), A("geology/highland2_moss", 2),
		A("props/flora/grass_soft_tuft_a", 2)],
	fauna=[F("moose", 3, 2), F("moose_female", 2, 2), F("deer_roe", 3, 3), F("deer_red", 2, 3), F("caribou", 2, 3),
		F("caribou_female", 1, 3), F("capercaillie", 1, 1), F("beaver_eurasian", 1, 1), F("squirrel_red", 1, 1),
		F("wolf", 2, 2), F("bear_brown", 1, 1)],
	stone="gaia/rock/alpine_large", metal="gaia/ore/alpine_large", colour=(60, 96, 64))

# ---- Iberia
B["montado"] = dict(
	base=mix(("medit_grass_field", 3), ("medit_grass_field_dry", 2), ("medit_grass_shrubs", 2), ("medit_rocks_grass", 1)),
	forest="medit_grass_wild", shore="medit_riparian_mud", beach="medit_sand_wet", cliff="medit_cliff_grass",
	trees=[T("oak_holly", 5), T("pine_maritime", 2), T("olive", 1), T("bush_mediterranean", 2), T("carob", 1)],
	forest_density=0.35, scatter=0.014, fruit="gaia/fruit/berry_01", reeds="actor|props/flora/reeds_pond_lush_a.xml",
	decor=[A("props/flora/bush_medit_me", 3), A("props/flora/grass_medit_field", 3), A("props/flora/grass_medit_flowering_tall", 2),
		A("geology/stone_granite_small", 1)],
	fauna=[F("deer_red", 4, 3), F("deer_red_female", 2, 3), F("boar_iberian", 3, 3), F("rabbit_european", 3, 3),
		F("hare_iberian", 2, 2), F("partridge", 3, 3), F("horse_sorraia", 2, 3), F("aurochs", 1, 2), F("stork_white", 1, 2),
		F("lizard_ocellated", 1, 1), F("fox_red_iberian", 2, 1), F("lynx_iberian", 1, 1), F("wolf_iberian", 1, 2)],
	stone="gaia/rock/mediterranean_large", metal="gaia/ore/mediterranean_large", colour=(150, 150, 90))
B["iberian_mountain"] = dict(B["montado"],
	base=mix(("temperate_grass_dirt_03", 2), ("alpine_grass_rocky", 2), ("medit_rocks_grass", 2), ("temperate_grass_05", 1)),
	forest="temperate_forestfloor_01", cliff="temperate_cliff_02",
	trees=[T("pine", 3), T("oak", 3), T("euro_beech", 1), T("pine_black", 2), T("bush_temperate", 1)], forest_density=0.5,
	decor=[A("props/flora/ferns", 2), A("props/flora/bush_tempe_me", 3), A("geology/highland1", 1),
		A("props/flora/grass_soft_large_tall", 2)],
	fauna=[F("deer_roe", 4, 3), F("deer_roe_female", 2, 3), F("boar_iberian", 3, 3), F("goat_lusitanian", 2, 3),
		F("wolf_iberian", 1, 2), F("bear_cantabrian", 1, 1), F("fox_red_iberian", 1, 1), F("polecat_european", 1, 1)],
	stone="gaia/rock/temperate_large_02", colour=(84, 112, 70))
B["iberian_marsh"] = dict(B["montado"],
	base=mix(("medit_riparian_mud", 2), ("temperate_grass_mud_01", 2), ("medit_grass_wild", 2), ("temp_grass_wet", 1)),
	forest="medit_grass_wild", trees=[T("poplar", 3), T("tamarix", 3), T("bush_mediterranean", 2), T("pine_maritime", 1)],
	forest_density=0.2, reeds="actor|props/flora/reeds_pond_lush_b.xml",
	decor=[A("props/flora/reeds_a", 3), A("props/flora/grass_field_lush_tall", 2), A("props/flora/cattails", 2)],
	fauna=[F("deer_red", 3, 3), F("flamingo_greater", 3, 3), F("egret_little", 2, 2), F("stork_white", 2, 2),
		F("mallard", 2, 3), F("turtle_spanish_pond", 1, 1), F("frog_perez", 1, 1), F("otter", 1, 1), F("lynx_iberian", 1, 1)],
	colour=(118, 140, 88))

# ---- Mediterranean
B["maquis"] = dict(
	base=mix(("medit_grass_shrubs", 3), ("medit_shrubs", 2), ("medit_rocks_grass_shrubs", 2), ("medit_dirt_b", 1)),
	forest="medit_forestfloor_a", shore="medit_sand_wet", beach="medit_sand", cliff="medit_cliff_aegean",
	trees=[T("aleppo_pine", 4), T("olive", 2), T("carob", 2), T("cypress", 1), T("bush_mediterranean", 3), T("oak_holly", 2)],
	forest_density=0.3, scatter=0.014, fruit="gaia/fruit/grapes", reeds="actor|props/flora/reeds_pond_lush_a.xml",
	decor=[A("props/flora/bush_medit_me", 3), A("props/flora/bush_medit_sm_dry", 2), A("props/flora/grass_medit_flowering_tall", 2),
		A("geology/stone_granite_greek_small", 1)],
	fauna=[F("deer_fallow", 4, 3), F("deer_fallow_female", 2, 3), F("boar", 3, 3), F("goat", 2, 3), F("rabbit_european", 2, 3),
		F("partridge", 2, 3), F("hare_iberian", 1, 2), F("fox_red", 1, 1), F("wolf", 1, 2)],
	stone="gaia/rock/aegean_large", metal="gaia/ore/aegean_anatolian_01", colour=(140, 140, 86))
B["balkan_forest"] = dict(B["maquis"],
	base=mix(("aegean_grass_02", 3), ("temperate_grass_dirt_02", 2), ("aegean_grass_dirt_02", 2), ("aegean_rocks_grass_01", 1)),
	forest="aegean_forestfloor_01", cliff="medit_cliff_greek", shore="steppe_river_rocks_dirt",
	trees=[T("oak_hungarian", 4), T("pine_black", 3), T("euro_beech", 2), T("oak", 2), T("bush_temperate", 1)],
	forest_density=0.5, fruit="gaia/fruit/apple",
	decor=[A("props/flora/bush_tempe_me", 3), A("props/flora/grass_soft_large_tall", 3), A("geology/stone_granite_med", 1)],
	fauna=[F("deer_red", 4, 3), F("deer_roe", 3, 3), F("boar", 3, 3), F("aurochs", 1, 2), F("bison", 1, 2),
		F("fox_red", 1, 1), F("wolf", 2, 2), F("bear_brown", 1, 1), F("lion", 1, 1)],
	stone="gaia/rock/temperate_large_02", metal="gaia/ore/temperate_large", colour=(92, 122, 68))
B["thracian_plain"] = dict(B["maquis"],
	base=mix(("steppe_grass_green_a", 3), ("medit_grass_field_a", 2), ("steppe_grass_c", 2), ("aegean_grass_dirt_01", 1)),
	forest="aegean_forestfloor_01", shore="steppe_river_rocks_dirt",
	trees=[T("oak_hungarian", 3), T("poplar", 2), T("elm", 2), T("bush_temperate", 2)], forest_density=0.18, scatter=0.006,
	fruit="gaia/fruit/grapes",
	decor=[A("props/flora/grass_steppe_field_tall", 3), A("props/flora/grass_field_flowering_tall", 2), A("props/flora/grass_soft_large", 2)],
	fauna=[F("horse", 3, 3), F("deer_red", 3, 3), F("aurochs", 2, 2), F("aurochs_female", 1, 2), F("boar", 2, 3),
		F("hare_iberian", 2, 2), F("partridge", 2, 3), F("stork_white", 1, 2), F("wolf", 1, 2)],
	colour=(124, 146, 80))
B["pontic_steppe"] = dict(
	base=mix(("steppe_grass_a", 3), ("steppe_grass_b", 2), ("steppe_grass_dirt_33", 2), ("steppe_grass_c", 2)),
	forest="steppe_grass_c", shore="steppe_river_rocks", beach="steppe_river_rocks_wet", cliff="steppe_rocks_dirt_01",
	trees=[T("bush_steppe_01", 3), T("bush_steppe_02", 3), T("poplar", 1), T("elm", 1)], forest_density=0.06, scatter=0.004,
	fruit="gaia/fruit/berry_02", reeds="actor|props/flora/reeds_pond_dry.xml", dry=True,
	decor=[A("props/flora/grass_steppe_field_tall", 4), A("props/flora/grass_soft_dry_tuft_a", 3), A("props/flora/bush_tempe_sm_dry", 1)],
	fauna=[F("saiga", 5, 3), F("horse", 4, 3), F("wild_ass_european", 2, 3), F("aurochs", 1, 2), F("deer_red", 2, 3),
		F("marmot_alpine", 1, 2), F("hare_iberian", 1, 2), F("fox_red", 1, 1), F("wolf", 2, 2)],
	stone="gaia/rock/temperate_large_03", metal="gaia/ore/temperate_02", colour=(158, 156, 98))
B["caucasus_forest"] = dict(B["balkan_forest"],
	base=mix(("temperate_grass_04", 3), ("temp_grass_plants", 2), ("alpine_grass_b", 2), ("temperate_grass_dirt_03", 1)),
	forest="temperate_forestfloor_02", cliff="temperate_cliff_02",
	trees=[T("euro_beech", 4), T("oak", 2), T("fir", 3), T("maple", 1), T("bush_temperate", 1)], forest_density=0.6,
	fauna=[F("deer_red", 4, 3), F("deer_roe", 3, 3), F("boar", 3, 3), F("bison", 2, 2), F("goat", 2, 3),
		F("fox_red", 1, 1), F("wolf", 1, 2), F("bear_brown", 1, 1), F("leopard", 1, 1)], colour=(70, 112, 60))

# ---- North Africa, deserts and the Nile
B["north_africa"] = dict(
	base=mix(("medit_grass_field_brown", 3), ("medit_dirt_d", 2), ("medit_shrubs_golden", 2), ("aegean_rocks_grass_01_dry", 1)),
	forest="medit_shrubs_dry", shore="desert_shore_stones", beach="medit_sand", cliff="desert_cliff_4",
	trees=[T("olive", 3), T("carob", 2), T("aleppo_pine", 2), T("bush_mediterranean_dry", 3), T("juniper_prickly", 2),
		T("medit_fan_palm", 1)],
	forest_density=0.22, scatter=0.01, fruit="gaia/fruit/fig", dry=True,
	decor=[A("props/flora/bush_medit_sm_dry", 3), A("props/flora/grass_soft_dry_large", 3), A("props/flora/plant_medit_artichoke", 1),
		A("geology/stone_desert_med", 1)],
	fauna=[F("gazelle", 4, 3), F("deer_red", 2, 3), F("boar", 2, 3), F("ostrich", 2, 3), F("ostrich_female", 1, 3),
		F("elephant_north_african", 1, 2), F("porcupine_crested", 1, 1), F("hare_iberian", 1, 2), F("hyena", 1, 1),
		F("leopard", 1, 1), F("lion", 1, 1)],
	stone="gaia/rock/mediterranean_large", metal="gaia/ore/mediterranean_large", colour=(170, 150, 96))
B["atlas_forest"] = dict(B["north_africa"],
	base=mix(("medit_rocks_grass", 2), ("aegean_grass_dirt_03", 2), ("medit_grass_field_dry", 2), ("medit_rocks_shrubs", 1)),
	forest="medit_forestfloor_a", cliff="medit_cliff_italia",
	trees=[T("cedar_atlas_3_mature", 4), T("cedar_atlas_2_young", 2), T("oak_holly", 3), T("juniper_prickly", 1)],
	forest_density=0.45, dry=False,
	fauna=[F("deer_red", 4, 3), F("macaque_barbary", 3, 3), F("boar", 3, 3), F("goat", 2, 3), F("porcupine_crested", 1, 1),
		F("leopard", 1, 1), F("lion", 1, 1)], colour=(98, 116, 72))
B["desert"] = dict(
	base=mix(("desert_sand_dunes_50", 2), ("desert_dirt_rocks_2", 2), ("desert_sand_smooth", 3), ("desert_rough", 2)),
	forest="desert_sand_scrub", shore="desert_sand_wet", beach="desert_shore_stones_wet", cliff="desert_cliff_egypt_1",
	trees=[T("acacia", 2), T("bush_badlands", 3), T("date_palm", 1), T("tamarix", 1)], forest_density=0.04, scatter=0.002,
	fruit="gaia/fruit/date", dry=True, no_seal=True,
	decor=[A("props/flora/bush_desert_dry_a", 2), A("geology/stone_desert_med", 2), A("props/flora/plant_desert_a", 1)],
	fauna=[F("gazelle", 4, 3), F("oryx_arabian", 2, 3), F("addax", 2, 3), F("addax_female", 1, 3), F("ostrich", 1, 3),
		F("camel", 1, 2), F("hyena", 1, 1)],
	stone="gaia/rock/desert_large", metal="gaia/ore/desert_large", colour=(206, 180, 128))
B["nile"] = dict(
	base=mix(("desert_grass_a", 2), ("sahara_grass_dirt_02", 2), ("nubia_farmland_01", 1), ("savanna_riparian_wet", 2)),
	forest="desert_forestfloor_palms", shore="savanna_riparian_bank", beach="desert_sand_wet", cliff="desert_cliff_egypt_2",
	trees=[T("date_palm", 4), T("palm_doum", 3), T("tamarix", 2), T("acacia", 1), T("senegal_date_palm", 1)],
	forest_density=0.4, scatter=0.02, fruit="gaia/fruit/date", reeds="actor|props/flora/papyrus.xml", no_seal=True,
	decor=[A("props/flora/papyrus", 3), A("props/flora/grass_tropic_field", 2), A("props/flora/reeds_a", 2)],
	fauna=[F("gazelle", 3, 3), F("goose_greylag", 3, 3), F("crocodile_nile", 2, 2), F("hippopotamus", 2, 2),
		F("flamingo_greater", 2, 3), F("heron_gray", 1, 1), F("egret_little", 1, 2), F("monitor_nile", 1, 1)],
	stone="gaia/rock/desert_large", metal="gaia/ore/desert_large", colour=(110, 140, 70))

# ---- Sub-Saharan Africa
_SAVANNA_BASE = dict(
	forest="savanna_forestfloor_a", shore="savanna_riparian_bank", beach="savanna_riparian_wet", cliff="savanna_cliff_a",
	fruit="gaia/fruit/berry_05", reeds="actor|props/flora/reeds_pond_lush_b.xml", no_seal=True,
	decor=[A("props/flora/grass_savanna", 3), A("props/flora/grass_savanna_field_tall", 3), A("geology/stone_savanna_med", 1),
		A("props/flora/bush_dry_a", 1)],
	stone="gaia/rock/savanna_large", metal="gaia/ore/savanna_large")
B["sahel"] = dict(_SAVANNA_BASE,
	base=mix(("savanna_grass_b", 3), ("savanna_dirt_a", 2), ("savanna_shrubs_b", 2), ("savanna_dirt_plants_cracked", 1)),
	trees=[T("acacia", 4), T("baobab", 2), T("palm_doum", 2), T("bush_badlands", 2)], forest_density=0.1, scatter=0.008, dry=True,
	fauna=[F("gazelle", 5, 3), F("topi", 3, 3), F("ostrich", 2, 3), F("giraffe", 2, 2), F("warthog", 2, 2), F("guineafowl", 2, 3),
		F("crane_crowned", 1, 2), F("elephant_african_bush", 1, 2), F("hyena", 1, 1), F("cheetah", 1, 1), F("lion", 1, 2)],
	colour=(186, 164, 100))
B["sahel_wetland"] = dict(_SAVANNA_BASE,
	base=mix(("savanna_grass_a_wetseason", 3), ("savanna_riparian_wet", 2), ("sudd_flora_01", 2), ("savanna_grass_b_wetseason", 1)),
	trees=[T("palm_doum", 3), T("acacia", 2), T("tamarix", 2), T("bush_tropic", 2)], forest_density=0.2, scatter=0.01,
	decor=[A("props/flora/papyrus", 2), A("props/flora/reeds_a", 2), A("props/flora/grass_tropic_field_tall", 3)],
	fauna=[F("buffalo_cape", 2, 3), F("topi", 3, 3), F("hippopotamus", 2, 2), F("crocodile_nile", 2, 2), F("crane_crowned", 2, 2),
		F("marabou", 1, 2), F("heron_gray", 1, 1), F("monitor_nile", 1, 1), F("elephant_african_bush", 1, 2)],
	colour=(118, 140, 70))
B["guinea_savanna"] = dict(_SAVANNA_BASE,
	base=mix(("savanna_grass_a", 3), ("savanna_grass_01", 2), ("savanna_shrubs_a_wetseason", 2), ("savanna_dirt_b", 1)),
	trees=[T("baobab", 2), T("acacia", 2), T("palm_tropical", 2), T("bush_tropic", 2), T("senegal_date_palm", 1)],
	forest_density=0.25, scatter=0.01,
	fauna=[F("kudu", 3, 3), F("buffalo_cape", 2, 3), F("warthog", 3, 2), F("guineafowl", 2, 3), F("baboon", 2, 3),
		F("hornbill_ground", 1, 2), F("elephant_african_bush", 1, 2), F("hyena", 1, 1), F("leopard", 1, 1), F("lion", 1, 2)],
	colour=(140, 150, 72))
B["african_rainforest"] = dict(_SAVANNA_BASE,
	base=mix(("tropic_grass_plants", 3), ("tropic_plants", 2), ("tropic_grass_b", 2), ("tropic_dirt_a_plants", 1)),
	forest="tropic_forestfloor_a", shore="tropic_mud_a", beach="tropic_beach_wet", cliff="tropic_cliff_grass",
	trees=[T("tropic_rainforest", 5), T("strangler", 2), T("palm_tropical", 2), T("banyan", 1), T("bush_tropic", 2)],
	forest_density=0.8, scatter=0.03, fruit="gaia/fruit/banana",
	decor=[A("props/flora/shrub_tropic_plant_a", 3), A("props/flora/ferns", 2), A("props/flora/plant_tropic_large", 2)],
	fauna=[F("bongo", 3, 2), F("mandrill", 2, 3), F("mandrill_female", 1, 3), F("chimpanzee", 2, 3), F("gorilla", 1, 2),
		F("gorilla_female", 1, 2), F("peafowl_congo", 1, 2), F("buffalo_cape", 1, 3), F("elephant_african_bush", 1, 2),
		F("leopard", 1, 1)],
	stone="gaia/rock/tropical_large", metal="gaia/ore/tropical_large", colour=(46, 100, 44))
B["african_mangrove"] = dict(B["african_rainforest"],
	base=mix(("tropic_beach_dry_plants", 3), ("tropic_dirt_a_plants", 2), ("tropic_swamp_a", 2)),
	forest="tropic_dirt_a_plants", trees=[T("mangrove", 6), T("palm_tropical", 1)], forest_density=0.6,
	reeds="actor|props/flora/reeds_beach.xml",
	decor=[A("props/flora/shrub_tropic_plant_b", 2), A("props/flora/reeds_beach_2", 2)],
	fauna=[F("crocodile_nile", 2, 2), F("monitor_nile", 2, 1), F("hippopotamus", 1, 2), F("egret_little", 2, 2),
		F("heron_gray", 1, 1)], colour=(70, 110, 70))
B["east_african_savanna"] = dict(_SAVANNA_BASE,
	base=mix(("savanna_grass_a", 3), ("savanna_grass_b", 2), ("savanna_dirt_a_red", 1), ("savanna_shrubs_a", 2)),
	trees=[T("acacia", 4), T("acacia_large", 2), T("baobab", 1), T("bush_badlands", 2)], forest_density=0.12, scatter=0.008,
	fauna=[F("wildebeest", 5, 3), F("zebra", 4, 3), F("topi", 2, 3), F("eland", 2, 3), F("giraffe", 2, 2), F("warthog", 2, 2),
		F("buffalo_cape", 2, 3), F("ostrich", 1, 3), F("baboon", 1, 3), F("rhinoceros_white", 1, 1),
		F("elephant_african_bush", 1, 2), F("hyena", 1, 2), F("cheetah", 1, 1), F("leopard", 1, 1), F("lion", 1, 2)],
	colour=(170, 160, 92))
B["lake_forest"] = dict(B["african_rainforest"],
	trees=[T("tropic_rainforest", 4), T("strangler", 2), T("palm_tropical", 2), T("acacia_large", 1), T("bush_tropic", 2)],
	forest_density=0.55,
	fauna=[F("kudu", 2, 3), F("bongo", 2, 2), F("chimpanzee", 2, 3), F("vervet", 2, 3), F("hippopotamus", 2, 2),
		F("crocodile_nile", 1, 2), F("buffalo_cape", 1, 3), F("crane_crowned", 1, 2), F("monitor_nile", 1, 1),
		F("leopard", 1, 1)], colour=(62, 112, 52))
B["kalahari"] = dict(_SAVANNA_BASE,
	base=mix(("savanna_dirt_a", 2), ("savanna_grass_b", 3), ("savanna_sand_dunes_100", 1), ("savanna_dirt_rocks_a", 1)),
	trees=[T("acacia", 4), T("bush_badlands", 3), T("baobab_3_mature", 1)], forest_density=0.07, scatter=0.006, dry=True,
	fauna=[F("oryx", 5, 3), F("gazelle", 3, 3), F("wildebeest", 2, 3), F("eland", 2, 3), F("ostrich", 2, 3), F("meerkat", 1, 3),
		F("aardvark", 1, 1), F("porcupine_crested", 1, 1), F("hyena", 1, 1), F("cheetah", 1, 1), F("lion", 1, 2)],
	colour=(196, 172, 110))
B["okavango"] = dict(_SAVANNA_BASE,
	base=mix(("savanna_grass_a_wetseason", 3), ("savanna_riparian_wet", 2), ("savanna_grass_b_wetseason", 2), ("sudd_flora_02", 1)),
	trees=[T("palm_doum", 2), T("acacia_large", 2), T("baobab", 1), T("strangler", 1), T("bush_tropic", 2)], forest_density=0.3,
	scatter=0.012, decor=[A("props/flora/papyrus", 3), A("props/flora/reeds_a", 2), A("props/flora/grass_tropic_field_tall", 3)],
	fauna=[F("buffalo_cape", 3, 3), F("kudu", 2, 3), F("zebra", 2, 3), F("wildebeest", 2, 3), F("hippopotamus", 2, 2),
		F("crocodile_nile", 2, 2), F("elephant_african_bush", 2, 2), F("giraffe", 1, 2), F("baboon", 1, 3), F("warthog", 1, 2),
		F("crane_crowned", 1, 2), F("marabou", 1, 2), F("wild_dog_african", 1, 2), F("leopard", 1, 1), F("lion", 1, 2)],
	colour=(110, 140, 70))
B["afar"] = dict(B["desert"],
	base=mix(("savanna_dirt_rocks_b", 2), ("desert_dirt_rocks_1", 2), ("savanna_dirt_b", 2), ("desert_grass_a_stones", 1)),
	cliff="savanna_cliff_b", trees=[T("acacia", 4), T("bush_badlands", 3), T("palm_doum", 1)], forest_density=0.05,
	fauna=[F("gazelle", 4, 3), F("oryx", 2, 3), F("ostrich", 2, 3), F("kudu", 1, 3), F("wild_ass_european", 2, 3),
		F("baboon", 1, 3), F("hyena", 1, 1), F("cheetah", 1, 1), F("lion", 1, 1)], colour=(190, 164, 116))
B["ethiopian_highland"] = dict(_SAVANNA_BASE,
	base=mix(("alpine_grass_d", 2), ("savanna_grass_a", 2), ("steppe_grass_dirt_66", 2), ("alpine_grass_rocky", 1)),
	forest="savanna_forestfloor_b", cliff="savanna_cliff_b",
	trees=[T("juniper_prickly", 4), T("podocarpus_lambertii", 2), T("acacia_large", 2), T("bush_temperate", 1)],
	forest_density=0.35, scatter=0.012,
	fauna=[F("kudu", 3, 3), F("baboon", 3, 3), F("goat", 2, 3), F("buffalo_cape", 1, 3), F("vervet", 1, 3), F("wolf", 1, 2),
		F("hyena", 1, 1), F("leopard", 1, 1), F("lion", 1, 1)], colour=(118, 126, 78))
B["arabia"] = dict(B["desert"],
	base=mix(("desert_dirt_persia_rocks", 2), ("desert_sand_stones", 2), ("desert_dirt_rough", 2), ("desert_grass_a_stones", 1)),
	fauna=[F("gazelle", 3, 3), F("oryx_arabian", 3, 3), F("camel", 2, 2), F("ostrich", 1, 3), F("baboon", 1, 3),
		F("hyena", 1, 1), F("leopard", 1, 1)], colour=(198, 170, 120))

# ---- Steppes and Central Asia
B["central_asian_desert"] = dict(B["desert"],
	base=mix(("desert_dirt_persia_1", 2), ("desert_sand_scrub", 3), ("desert_lakebed_dry", 1), ("desert_grass_a_sand", 2)),
	cliff="desert_cliff_persia_1", trees=[T("bush_steppe_03", 3), T("tamarix", 2), T("bush_badlands", 2)],
	fauna=[F("saiga", 4, 3), F("gazelle", 3, 3), F("wild_ass_european", 2, 3), F("camel_bactrianus", 2, 2), F("wolf", 1, 2),
		F("hyena", 1, 1), F("cheetah", 1, 1)], colour=(196, 176, 126))
B["tugai"] = dict(B["nile"],
	base=mix(("steppe_grass_mud_01", 2), ("persia_grass_01", 2), ("steppe_grass_green_a", 2), ("persia_grass_dirt_01", 1)),
	forest="persia_forestfloor_01", shore="steppe_river_rocks", beach="steppe_river_rocks_wet", cliff="desert_cliff_persia_2",
	trees=[T("poplar", 3), T("tamarix", 4), T("elm", 1), T("bush_steppe_02", 2)], fruit="gaia/fruit/berry_02",
	reeds="actor|props/flora/reeds_pond_lush_b.xml",
	decor=[A("props/flora/reeds_a", 3), A("props/flora/grass_field_lush_tall", 2), A("props/flora/cattails", 2)],
	fauna=[F("deer_red", 3, 3), F("boar", 3, 3), F("goose_greylag", 2, 3), F("mallard", 2, 3), F("heron_gray", 1, 1),
		F("wolf", 1, 2), F("tiger", 1, 1)], colour=(112, 136, 76))
B["kazakh_steppe"] = dict(B["pontic_steppe"],
	fauna=[F("saiga", 6, 3), F("horse", 3, 3), F("wild_ass_european", 2, 3), F("gazelle", 2, 3), F("camel_bactrianus", 1, 2),
		F("marmot_alpine", 1, 2), F("fox_red", 1, 1), F("wolf", 2, 2)], colour=(166, 160, 100))
B["tian_shan"] = dict(B["boreal"],
	base=mix(("alpine_grass_d", 2), ("alpine_grass_b", 2), ("steppe_grass_c", 2), ("alpine_grass_rocky", 1)),
	trees=[T("fir", 5), T("euro_birch", 1), T("poplar", 1), T("bush_temperate", 1)], forest_density=0.4,
	fauna=[F("deer_red", 4, 3), F("goat", 3, 3), F("boar", 2, 3), F("marmot_alpine", 1, 2), F("wolf", 1, 2),
		F("bear_brown", 1, 1), F("leopard_snow", 1, 1)], colour=(84, 112, 72))
B["siberian_steppe"] = dict(B["pontic_steppe"],
	fauna=[F("deer_roe", 3, 3), F("horse", 3, 3), F("deer_red", 2, 3), F("marmot_alpine", 2, 2), F("camel_bactrianus", 1, 2),
		F("wolf", 2, 2)], colour=(150, 150, 96))
B["taiga"] = dict(B["boreal"],
	fauna=[F("deer_red", 4, 3), F("deer_roe", 3, 3), F("moose", 2, 2), F("moose_female", 1, 2), F("caribou", 2, 3),
		F("boar", 2, 3), F("capercaillie", 1, 1), F("squirrel_red", 1, 1), F("wolf", 2, 2), F("bear_brown", 1, 1),
		F("tiger", 1, 1)])

# ---- East Asia
B["loess"] = dict(
	base=mix(("steppe_grass_dirt_66", 2), ("steppe_dirt_b", 2), ("medit_grass_field_brown", 2), ("steppe_grass_d", 1)),
	forest="temperate_grass_dirt_03", shore="steppe_river_rocks_dirt", beach="steppe_river_rocks_wet", cliff="desert_cliff_badlands_2",
	trees=[T("toona", 2), T("elm", 2), T("juniper_prickly", 2), T("pine", 1), T("bush_steppe_02", 2)],
	forest_density=0.15, scatter=0.006, fruit="gaia/fruit/berry_04", dry=True, no_seal=True,
	decor=[A("props/flora/grass_steppe_field_tall", 3), A("props/flora/grass_soft_dry_large", 2), A("geology/stone_desert_med", 1)],
	fauna=[F("deer", 4, 3), F("deer_red", 2, 3), F("horse", 2, 3), F("boar", 2, 3), F("wolf", 1, 2), F("tiger", 1, 1)],
	stone="gaia/rock/temperate_large_03", metal="gaia/ore/temperate_02", colour=(178, 158, 108))
B["china_plain"] = dict(
	base=mix(("temperate_grass_dirt_02", 2), ("temperate_grass_04", 3), ("temp_grass_plants", 2), ("steppe_grass_green_a", 1)),
	forest="temperate_forestfloor_01", shore="temperate_grass_mud_01", beach="temperate_mud_01", cliff="temperate_cliff_01",
	trees=[T("poplar", 3), T("toona", 3), T("elm", 2), T("oak", 2), T("bush_temperate", 1)],
	forest_density=0.3, scatter=0.01, fruit="gaia/fruit/apple", reeds="actor|props/flora/reeds_pond_lush_a.xml", no_seal=True,
	decor=[A("props/flora/grass_field_lush_tall", 3), A("props/flora/bush_tempe_me", 2), A("props/flora/grass_soft_large", 2)],
	fauna=[F("deer", 4, 3), F("deer_red", 2, 3), F("boar", 3, 3), F("macaque_barbary", 1, 3), F("goose_greylag", 1, 3),
		F("elephant_asian", 1, 2), F("bear_black", 1, 1), F("tiger", 1, 1)],
	stone="gaia/rock/temperate_large", metal="gaia/ore/temperate_large", colour=(104, 136, 72))
B["jiangnan"] = dict(B["china_plain"],
	base=mix(("temp_grass_wet", 2), ("tropic_grass_c", 2), ("temperate_grass_02", 3), ("temp_grass_plants", 1)),
	forest="tropic_forestfloor_a",
	trees=[T("bamboo", 4), T("toona", 2), T("oak_holly", 2), T("pine_black", 2), T("cherry_blossom", 1)], forest_density=0.5,
	scatter=0.014, fruit="gaia/fruit/berry_05",
	decor=[A("props/flora/grass_tropic_field", 3), A("props/flora/ferns", 2), A("props/flora/reeds_a", 1)],
	fauna=[F("deer", 4, 3), F("boar", 3, 3), F("macaque_barbary", 2, 3), F("peacock", 1, 2), F("mallard", 2, 3),
		F("egret_little", 1, 2), F("caiman", 1, 2), F("elephant_asian", 1, 2), F("bear_black", 1, 1), F("tiger", 1, 1)],
	colour=(84, 132, 66))
B["lingnan"] = dict(B["jiangnan"],
	base=mix(("tropic_grass_plants", 3), ("tropic_grass_b", 2), ("tropic_grass_c", 2), ("tropic_dirt_b_plants", 1)),
	forest="tropic_forestfloor_a", cliff="tropic_cliff_grass", shore="tropic_beach_wet", beach="tropic_beach_wet",
	trees=[T("bamboo", 3), T("tropic_rainforest", 3), T("banyan", 2), T("palm_tropical", 1), T("toona", 1)], forest_density=0.6,
	fruit="gaia/fruit/banana",
	fauna=[F("deer", 3, 3), F("boar", 3, 3), F("macaque_barbary", 2, 3), F("peacock", 2, 2), F("chicken", 1, 3),
		F("elephant_asian", 1, 2), F("crocodile_nile", 1, 1), F("bear_black", 1, 1), F("leopard", 1, 1), F("tiger", 1, 1)],
	stone="gaia/rock/tropical_large", metal="gaia/ore/tropical_large", colour=(62, 118, 54))
B["korea"] = dict(B["china_plain"],
	base=mix(("temperate_grass_04", 3), ("temperate_grass_dirt_03", 2), ("alpine_grass_b", 2), ("temp_grass_long", 1)),
	trees=[T("pine", 4), T("oak", 3), T("maple", 2), T("euro_birch", 1)], forest_density=0.55, no_seal=False,
	fauna=[F("deer", 4, 3), F("deer_roe", 3, 3), F("boar", 3, 3), F("goat", 1, 3), F("fox_red", 1, 1), F("bear_black", 1, 1),
		F("wolf", 1, 2), F("leopard", 1, 1), F("tiger", 1, 1)], colour=(76, 124, 66))
B["korea_lowland"] = dict(B["korea"],
	base=mix(("temperate_grass_02", 3), ("temp_grass_wet", 2), ("temperate_grass_dirt_02", 2)), forest_density=0.3,
	reeds="actor|props/flora/reeds_pond_lush_a.xml",
	fauna=[F("deer", 4, 3), F("deer_roe", 2, 3), F("boar", 3, 3), F("goose_greylag", 2, 3), F("mallard", 1, 3),
		F("heron_gray", 1, 1), F("fox_red", 1, 1), F("tiger", 1, 1)], colour=(96, 134, 72))
B["japan"] = dict(B["korea"],
	base=mix(("temperate_grass_02", 3), ("temp_grass_mossy", 2), ("temperate_grass_04", 2), ("temp_grass_plants", 1)),
	forest="temperate_forestfloor_02",
	trees=[T("pine_black", 3), T("cherry_blossom", 1), T("maple", 2), T("oak", 2), T("bamboo", 2), T("fir", 1)], forest_density=0.6,
	fauna=[F("deer", 5, 3), F("boar", 3, 3), F("macaque_barbary", 2, 3), F("goat", 1, 3), F("raccoon", 1, 1), F("fox_red", 1, 1),
		F("heron_gray", 1, 1), F("bear_black", 1, 1), F("wolf", 1, 2)], colour=(70, 126, 64))

# ---- South and South-East Asia
_ASIA_TROPIC = dict(
	base=mix(("tropic_grass_plants", 3), ("tropic_plants", 2), ("tropic_grass_b", 2), ("tropic_dirt_a_plants", 1)),
	forest="tropic_forestfloor_a", shore="tropic_beach_wet", beach="tropic_beach_wet", cliff="tropic_cliff_grass",
	trees=[T("tropic_rainforest", 4), T("banyan", 2), T("palm_tropical", 2), T("palm_areca", 1), T("bamboo", 2), T("teak", 1)],
	forest_density=0.75, scatter=0.03, fruit="gaia/fruit/banana", reeds="actor|props/flora/reeds_giant.xml",
	decor=[A("props/flora/shrub_tropic_plant_a", 3), A("props/flora/shrub_tropic_plant_b", 2), A("props/flora/ferns", 2),
		A("props/flora/grass_tropic_field_tall", 2)],
	stone="gaia/rock/tropical_large", metal="gaia/ore/tropical_large")
B["indochina_forest"] = dict(_ASIA_TROPIC,
	fauna=[F("deer", 4, 3), F("deer_red", 2, 3), F("boar", 3, 3), F("tapir_malayan", 1, 1), F("macaque_barbary", 2, 3),
		F("peacock", 2, 2), F("chicken", 2, 3), F("elephant_asian", 2, 2), F("bear_black", 1, 1), F("leopard", 1, 1),
		F("tiger", 1, 1)], colour=(52, 108, 50))
B["indochina_dry"] = dict(_ASIA_TROPIC,
	base=mix(("india_grass_01", 3), ("india_grass_dirt_01", 2), ("india_dirt_01", 1), ("savanna_grass_a", 2)),
	forest="india_forestfloor_01", shore="india_grass_mud_01", beach="india_mud_01", cliff="india_cliff_02",
	trees=[T("teak", 4), T("palm_palmyra", 2), T("banyan", 1), T("bamboo", 2), T("bush_tropic", 1)], forest_density=0.35,
	scatter=0.012, decor=[A("props/flora/grass_savanna", 3), A("props/flora/bush_tropic_a", 2), A("props/flora/grass_tropical", 2)],
	fauna=[F("deer", 5, 3), F("boar", 3, 3), F("peacock", 2, 2), F("chicken", 2, 3), F("elephant_asian", 2, 2),
		F("bear_black", 1, 1), F("leopard", 1, 1), F("tiger", 1, 1)],
	stone="gaia/rock/india_large", metal="gaia/ore/india_01", colour=(132, 140, 72))
B["asian_wetland"] = dict(_ASIA_TROPIC,
	base=mix(("tropic_swamp_a", 2), ("tropic_grass_c", 3), ("india_grass_mud_01", 2), ("tropic_mud_a", 1)),
	forest="tropic_plants", trees=[T("palm_tropical", 3), T("mangrove", 2), T("bamboo", 2), T("bush_tropic", 2)],
	forest_density=0.25, decor=[A("props/flora/reeds_giant", 2), A("props/flora/grass_tropic_field_tall", 3), A("props/flora/reeds_a", 2)],
	fauna=[F("deer", 3, 3), F("boar", 2, 3), F("mallard", 2, 3), F("egret_little", 2, 2), F("heron_gray", 1, 1),
		F("crocodile_nile", 2, 2), F("otter", 1, 1), F("elephant_asian", 1, 2)], colour=(96, 132, 72))
B["asian_mangrove"] = dict(B["asian_wetland"],
	base=mix(("tropic_beach_dry_plants", 3), ("tropic_dirt_a_plants", 2), ("tropic_swamp_a", 1)),
	forest="tropic_dirt_a_plants", trees=[T("mangrove", 6), T("palm_tropical", 1)], forest_density=0.6,
	reeds="actor|props/flora/reeds_beach.xml",
	decor=[A("props/flora/shrub_tropic_plant_b", 2), A("props/flora/reeds_beach_2", 2)],
	fauna=[F("deer", 2, 3), F("macaque_barbary", 2, 3), F("crocodile_nile", 2, 2), F("egret_little", 2, 2),
		F("monitor_nile", 1, 1), F("otter", 1, 1)], colour=(70, 110, 70))
B["java"] = dict(B["indochina_forest"],
	fauna=[F("deer", 4, 3), F("boar", 3, 3), F("buffalo_cape", 1, 3), F("macaque_barbary", 2, 3), F("peacock", 2, 2),
		F("chicken", 2, 3), F("tapir_malayan", 1, 1), F("panther_black", 1, 1), F("leopard", 1, 1), F("tiger", 1, 1)])
B["malaya"] = dict(B["indochina_forest"],
	fauna=[F("deer", 3, 3), F("boar", 3, 3), F("tapir_malayan", 2, 1), F("macaque_barbary", 2, 3), F("chicken", 2, 3),
		F("peacock", 1, 2), F("elephant_asian", 2, 2), F("bear_black", 1, 1), F("panther_black", 1, 1), F("tiger", 1, 1)])
B["philippines"] = dict(_ASIA_TROPIC,
	fauna=[F("deer", 4, 3), F("boar", 4, 3), F("macaque_barbary", 2, 3), F("chicken", 2, 3), F("buffalo_cape", 1, 3),
		F("monitor_nile", 1, 1), F("crocodile_nile", 1, 1)], colour=(54, 112, 52))
B["lanka_wet"] = dict(_ASIA_TROPIC,
	fauna=[F("deer", 4, 3), F("deer_red", 2, 3), F("boar", 3, 3), F("macaque_barbary", 2, 3), F("peacock", 2, 2),
		F("chicken", 2, 3), F("elephant_asian", 2, 2), F("bear_black", 1, 1), F("leopard", 1, 1)], colour=(52, 110, 50))
B["lanka_dry"] = dict(B["indochina_dry"],
	fauna=[F("deer", 5, 3), F("buffalo_cape", 1, 3), F("boar", 2, 3), F("peacock", 2, 2), F("chicken", 2, 3),
		F("elephant_asian", 2, 2), F("crocodile_nile", 1, 1), F("monitor_nile", 1, 1), F("bear_black", 1, 1),
		F("leopard", 1, 1)])

# ---- North America
B["eastern_forest"] = dict(
	base=mix(("temperate_grass_04", 3), ("temp_grass_plants", 2), ("temperate_grass_dirt_02", 2), ("temp_grass_long", 1)),
	forest="temperate_forestfloor_02", shore="temperate_grass_mud_01", beach="temperate_mud_01", cliff="temperate_cliff_01",
	trees=[T("oak", 4), T("maple", 3), T("euro_beech", 2), T("pine", 2), T("bush_temperate", 1)],
	forest_density=0.65, scatter=0.02, fruit="gaia/fruit/berry_03", reeds="actor|props/flora/cattails.xml",
	decor=[A("props/flora/ferns", 2), A("props/flora/bush_tempe_me_lush", 3), A("props/flora/grass_soft_large_tall", 2)],
	fauna=[F("deer_white_tailed", 5, 3), F("turkey", 3, 3), F("deer_red", 1, 3), F("bison", 1, 3), F("bison_female", 1, 3),
		F("raccoon", 1, 1), F("opossum", 1, 1), F("skunk", 1, 1), F("fox_gray", 1, 1), F("beaver_eurasian", 1, 1),
		F("bear_black", 1, 1), F("wolf", 1, 2), F("puma", 1, 1)],
	stone="gaia/rock/temperate_large", metal="gaia/ore/temperate_large", colour=(70, 118, 62))
B["appalachian_high"] = dict(B["eastern_forest"],
	base=mix(("alpine_grass_b", 2), ("temperate_grass_dirt_03", 2), ("new_alpine_grass_mossy", 2), ("alpine_forrestfloor", 1)),
	forest="alpine_forrestfloor", trees=[T("fir", 4), T("pine", 2), T("euro_birch", 2), T("maple", 1)],
	fauna=[F("deer_white_tailed", 4, 3), F("deer_red", 2, 3), F("turkey", 2, 3), F("bear_black", 1, 1), F("wolf", 1, 2),
		F("puma", 1, 1)], colour=(62, 104, 64))
B["great_lakes_forest"] = dict(B["eastern_forest"],
	trees=[T("maple", 3), T("oak", 2), T("euro_birch", 2), T("pine", 3), T("fir", 2)],
	fauna=[F("deer_white_tailed", 5, 3), F("moose", 2, 2), F("turkey", 2, 3), F("caribou", 1, 3), F("beaver_eurasian", 2, 1),
		F("goose_greylag", 1, 3), F("raccoon", 1, 1), F("otter", 1, 1), F("fox_red", 1, 1), F("bear_black", 1, 1),
		F("wolf", 1, 2)])
B["north_woods"] = dict(B["boreal"],
	fauna=[F("caribou", 4, 3), F("caribou_female", 2, 3), F("moose", 2, 2), F("deer_white_tailed", 2, 3), F("beaver_eurasian", 1, 1),
		F("otter", 1, 1), F("bear_black", 1, 1), F("wolf", 2, 2)])
B["prairie"] = dict(B["pontic_steppe"],
	base=mix(("steppe_grass_green_a", 3), ("temperate_grass_04", 2), ("steppe_grass_c", 2), ("steppe_grass_a", 1)),
	trees=[T("bush_temperate", 3), T("oak", 1), T("poplar", 2)], dry=False,
	decor=[A("props/flora/grass_steppe_field_tall", 4), A("props/flora/grass_field_flowering_tall", 2)],
	fauna=[F("bison", 6, 3), F("bison_female", 4, 3), F("deer_white_tailed", 3, 3), F("turkey", 1, 3), F("coyote", 1, 2),
		F("skunk", 1, 1), F("wolf", 2, 2)], colour=(130, 150, 80))
B["gulf_coast"] = dict(B["eastern_forest"],
	base=mix(("temperate_grass_01", 3), ("savanna_grass_a_wetseason", 2), ("temp_grass_wet", 2), ("tropic_grass_c", 1)),
	trees=[T("pine_maritime", 4), T("oak", 2), T("cypress_wild", 2), T("medit_fan_palm", 2), T("bush_tropic", 1)],
	forest_density=0.45, fruit="gaia/fruit/berry_03", reeds="actor|props/flora/reeds_pond_lush_b.xml",
	fauna=[F("deer_white_tailed", 5, 3), F("turkey", 3, 3), F("bison", 1, 3), F("raccoon", 1, 1), F("opossum", 1, 1),
		F("fox_gray", 1, 1), F("crocodile_american", 2, 2), F("bear_black", 1, 1), F("wolf", 1, 2), F("puma", 1, 1)],
	colour=(92, 128, 68))
B["everglades"] = dict(B["gulf_coast"],
	base=mix(("tropic_swamp_a", 2), ("savanna_grass_a_wetseason", 3), ("tropic_grass_c", 2), ("temp_grass_wet", 1)),
	forest="tropic_plants", trees=[T("cypress_wild", 3), T("mangrove", 3), T("medit_fan_palm", 2), T("palm_tropical", 1)],
	forest_density=0.35,
	fauna=[F("deer_white_tailed", 3, 3), F("crocodile_american", 3, 2), F("flamingo_greater", 2, 3), F("egret_little", 2, 2),
		F("heron_gray", 1, 1), F("raccoon", 1, 1), F("turtle_spanish_pond", 1, 1), F("puma", 1, 1)], colour=(96, 130, 82))
B["california_oak"] = dict(
	base=mix(("medit_grass_field_dry", 3), ("medit_grass_field_brown", 2), ("medit_grass_shrubs", 2), ("medit_dirt_d", 1)),
	forest="medit_grass_wild", shore="medit_sand_wet", beach="medit_sand", cliff="medit_cliff_grass",
	trees=[T("oak", 3), T("oak_holly", 3), T("bush_mediterranean", 3), T("pine", 1)], forest_density=0.25, scatter=0.014,
	fruit="gaia/fruit/berry_04", reeds="actor|props/flora/reeds_pond_lush_a.xml",
	decor=[A("props/flora/bush_medit_me_dry", 3), A("props/flora/grass_soft_dry_large", 3), A("geology/stone_granite_small", 1)],
	fauna=[F("deer_white_tailed_02", 4, 3), F("deer_red", 3, 3), F("turkey", 1, 3), F("fox_gray", 1, 1), F("skunk", 1, 1),
		F("raccoon", 1, 1), F("coyote", 1, 2), F("bear_brown", 1, 1), F("puma", 1, 1)],
	stone="gaia/rock/mediterranean_large", metal="gaia/ore/mediterranean_large", colour=(160, 150, 92))
B["pacific_conifer"] = dict(B["eastern_forest"],
	base=mix(("alpine_grass_b_wild", 2), ("temperate_grass_dirt_03", 2), ("temperate_forestfloor_01", 1), ("temp_grass_mossy", 2)),
	forest="temp_forestfloor_pine", trees=[T("fir", 4), T("pine", 3), T("pine_w", 2), T("oak", 1)], forest_density=0.65,
	fauna=[F("deer_white_tailed_02", 4, 3), F("deer_red", 3, 3), F("raccoon", 1, 1), F("skunk", 1, 1), F("bear_black", 1, 1),
		F("bear_brown", 1, 1), F("wolf", 1, 2), F("puma", 1, 1)], colour=(56, 98, 60))
B["great_basin"] = dict(B["desert"],
	base=mix(("desert_grass_a", 3), ("desert_sand_scrub", 2), ("steppe_dirt_b", 2), ("desert_dirt_rocks_1", 1)),
	cliff="desert_cliff_badlands", trees=[T("juniper_prickly", 3), T("bush_badlands", 3), T("pine", 1)], forest_density=0.08,
	fruit="gaia/fruit/berry_04",
	fauna=[F("deer_white_tailed_02", 4, 3), F("sheep", 2, 3), F("coyote", 1, 2), F("fox_gray", 1, 1), F("skunk", 1, 1),
		F("snake", 1, 1), F("puma", 1, 1)], colour=(186, 168, 124))
B["colorado_plateau"] = dict(B["great_basin"],
	base=mix(("desert_dirt_badlands", 2), ("desert_grass_a_stones", 2), ("savanna_dirt_rocks_a_red", 2), ("desert_sand_scrub", 2)),
	cliff="desert_cliff_badlands_3", trees=[T("juniper_prickly", 4), T("pine", 1), T("bush_badlands", 3)], forest_density=0.12,
	stone="gaia/rock/badlands_large", metal="gaia/ore/badlands_large", colour=(186, 132, 96))
B["ponderosa"] = dict(B["great_basin"],
	base=mix(("steppe_grass_dirt_66", 2), ("temperate_grass_dirt_03", 2), ("alpine_grass_d", 2), ("desert_grass_a", 1)),
	forest="temp_forestfloor_pine", trees=[T("pine", 5), T("pine_w", 2), T("juniper_prickly", 1)], forest_density=0.45,
	dry=False,
	fauna=[F("deer_white_tailed_02", 4, 3), F("deer_red", 3, 3), F("turkey", 2, 3), F("bear_black", 1, 1), F("puma", 1, 1),
		F("wolf", 1, 2)], colour=(96, 118, 74))
B["sonoran"] = dict(B["desert"],
	base=mix(("desert_sand_scrub", 3), ("desert_dirt_rocks_3_scrub", 2), ("desert_plants_a", 2), ("desert_dirt_rough_2", 1)),
	cliff="desert_cliff_badlands_2",
	trees=[T("flora_cactus_stenocerus_large", 3), T("flora_cactus_stenocerus_small", 3), T("acacia", 2), T("bush_badlands", 2)],
	forest_density=0.1, scatter=0.01, fruit="gaia/fruit/berry_04",
	decor=[A("props/flora/bush_desert_a", 3), A("props/flora/plant_desert_a", 2), A("geology/stone_desert_med", 1)],
	fauna=[F("deer_white_tailed_02", 3, 3), F("peccary", 3, 3), F("sheep", 1, 3), F("coyote", 1, 2), F("coati", 1, 2),
		F("fox_gray", 1, 1), F("snake", 1, 1), F("puma", 1, 1), F("jaguar", 1, 1)], colour=(196, 170, 118))
B["sierra_madre"] = dict(B["ponderosa"],
	trees=[T("pine", 4), T("oak", 3), T("juniper_prickly", 1)],
	fauna=[F("deer_white_tailed", 4, 3), F("turkey", 2, 3), F("peccary", 2, 3), F("coati", 1, 2), F("squirrel", 1, 1),
		F("bear_black", 1, 1), F("puma", 1, 1), F("jaguar", 1, 1)])

# ---- Mesoamerica and the Caribbean
_MAYA = [F("brocket_yucatan", 3, 2), F("deer_white_tailed", 4, 3), F("peccary", 3, 3), F("turkey", 2, 3), F("curassow", 1, 2),
	F("chachalaca", 1, 3), F("guan_crested", 1, 2), F("monkey_spider", 1, 3), F("monkey_howler", 1, 3), F("coati", 1, 3),
	F("tapir", 1, 1), F("iguana_green", 1, 1), F("basilisk", 1, 1), F("opossum", 1, 1), F("tamandua", 1, 1),
	F("boa_constrictor", 1, 1), F("ocelot", 1, 1), F("puma", 1, 1), F("jaguar", 1, 1)]
B["maya_forest"] = dict(base.REGIONS["varzea_forest"],
	base=mix(("tropic_grass_plants", 3), ("tropic_dirt_b_plants", 2), ("tropic_grass_a", 2), ("tropic_plants_b", 1)),
	forest="tropic_forestfloor_a",
	trees=[T("tropic_rainforest", 4), T("palm_tropical", 2), T("strangler", 2), T("palm_royal", 1), T("bush_tropic", 2)],
	forest_density=0.7, fauna=_MAYA, colour=(56, 112, 52))
B["yucatan_scrub"] = dict(B["maya_forest"],
	base=mix(("tropic_dirt_a_plants", 2), ("tropic_grass_c", 3), ("savanna_grass_a", 2), ("tropic_dirt_b", 1)),
	trees=[T("bush_tropic", 3), T("tropic_rainforest", 2), T("palm_tropical", 2), T("acacia", 1)], forest_density=0.4,
	fauna=[F("deer_white_tailed", 5, 3), F("turkey", 3, 3), F("peccary", 2, 3), F("brocket_yucatan", 2, 2), F("chachalaca", 1, 3),
		F("iguana_motagua", 1, 1), F("coati", 1, 3), F("jaguarundi", 1, 1), F("puma", 1, 1)], colour=(108, 132, 70))
B["maya_coast"] = dict(base.REGIONS["mangrove"],
	fauna=[F("flamingo_greater", 3, 3), F("crocodile_morelet", 2, 2), F("egret_little", 2, 2), F("heron_gray", 1, 1),
		F("iguana_green", 1, 1), F("otter_tropical", 1, 1)])
B["central_american_forest"] = dict(B["maya_forest"],
	fauna=[F("deer_white_tailed", 3, 3), F("peccary", 4, 3), F("brocket_red", 2, 2), F("curassow", 1, 2), F("guan_crested", 1, 2),
		F("monkey_spider", 1, 3), F("monkey_howler", 2, 3), F("coati", 1, 3), F("paca", 1, 1), F("tapir", 1, 1),
		F("anteater_02", 1, 1), F("iguana_green", 1, 1), F("basilisk", 1, 1), F("crocodile_american", 1, 1),
		F("boa_constrictor", 1, 1), F("margay", 1, 1), F("ocelot", 1, 1), F("jaguar", 1, 1)])
B["pine_oak_highland"] = dict(B["sierra_madre"],
	fauna=[F("deer_white_tailed", 4, 3), F("turkey", 2, 3), F("peccary", 2, 3), F("guan_crested", 1, 2), F("coati", 1, 2),
		F("squirrel", 1, 1), F("coyote", 1, 2), F("puma", 1, 1)])
B["antilles"] = dict(B["maya_forest"],
	trees=[T("tropic_rainforest", 3), T("palm_royal", 3), T("palm_tropical", 2), T("bush_tropic", 2)], forest_density=0.55,
	fauna=[F("paca", 4, 2), F("iguana_green", 3, 1), F("dog_native_american_02", 1, 2), F("chachalaca", 1, 3),
		F("crocodile_american", 1, 1), F("boa_constrictor", 1, 1)])
B["antilles_dry"] = dict(B["antilles"],
	base=mix(("tropic_dirt_a_plants", 2), ("savanna_grass_a", 2), ("tropic_grass_c", 3), ("tropic_beach_dry_plants", 1)),
	trees=[T("bush_tropic", 3), T("palm_tropical", 3), T("acacia", 1), T("flora_cactus_stenocerus_small", 1)], forest_density=0.25,
	fauna=[F("paca", 3, 2), F("iguana_green", 3, 1), F("flamingo_greater", 2, 3), F("crocodile_american", 1, 1)],
	colour=(130, 140, 80))

# ---- South America
B["pantanal"] = dict(base.REGIONS["campos"],
	fauna=[F("deer_white_tailed", 4, 3), F("peccary", 3, 3), F("rhea", 2, 3), F("caiman", 4, 2), F("tapir_lowland", 1, 1),
		F("otter_tropical", 1, 2), F("anteater_02", 1, 1), F("tinamou", 2, 3), F("curassow", 1, 2), F("stork_white", 1, 2),
		F("turtle_tracaja", 1, 1), F("monkey_howler", 1, 3), F("tapeti", 1, 2), F("jaguar_02", 1, 1)])
B["pantanal_forest"] = dict(base.REGIONS["varzea_forest"],
	fauna=[F("peccary", 4, 3), F("brocket_red", 2, 2), F("tapir_lowland", 2, 1), F("monkey_howler", 2, 3), F("coati", 2, 3),
		F("curassow", 1, 2), F("tamandua", 1, 1), F("boa_constrictor", 1, 1), F("ocelot", 1, 1), F("jaguar_02", 1, 1)])
B["cerrado"] = dict(base.REGIONS["campos"],
	base=mix(("savanna_grass_a", 3), ("savanna_dirt_a_red", 1), ("savanna_shrubs_a", 2), ("savanna_grass_b", 2)),
	forest="savanna_forestfloor_b_red", cliff="savanna_cliff_a_red",
	trees=[T("acacia", 2), T("bush_tropic", 3), T("palm_tropical", 1), T("baobab_2_young", 1)], forest_density=0.2,
	fauna=[F("rhea", 4, 3), F("deer_white_tailed", 3, 3), F("anteater_02", 1, 1), F("tinamou", 2, 3), F("peccary", 2, 3),
		F("tapeti", 1, 2), F("puma", 1, 1)], colour=(150, 140, 80))
B["puna"] = dict(
	base=mix(("steppe_grass_b", 3), ("alpine_grass_d", 2), ("steppe_grass_dirt_66", 2), ("alpine_grass_rocky", 1)),
	forest="steppe_grass_c", shore="steppe_river_rocks", beach="steppe_river_rocks_wet", cliff="alpine_cliff_b",
	trees=[T("bush_steppe_01", 3), T("bush_steppe_02", 2), T("podocarpus_lambertii", 1)], forest_density=0.06, scatter=0.004,
	fruit="gaia/fruit/berry_02", reeds="actor|props/flora/reeds_pond_dry.xml", dry=True, no_seal=True,
	decor=[A("props/flora/grass_steppe_field_tall", 3), A("props/flora/grass_soft_dry_tuft_a", 3), A("geology/stone_granite_small", 1)],
	fauna=[F("guanaco", 5, 3), F("llama", 3, 3), F("rhea", 2, 3), F("tinamou", 2, 3), F("deer_white_tailed", 1, 3),
		F("flamingo_greater", 2, 3), F("skunk", 1, 1), F("fox_gray", 1, 1), F("puma", 1, 1)],
	stone="gaia/rock/alpine_large", metal="gaia/ore/alpine_large", colour=(150, 144, 100))
B["coastal_desert"] = dict(B["desert"],
	base=mix(("desert_sand_smooth_b", 3), ("desert_dirt_rocks_1", 2), ("desert_sand_stones", 2), ("desert_pebbles_rough", 1)),
	trees=[T("bush_badlands", 2), T("acacia", 1)], forest_density=0.02, scatter=0.001, no_seal=False,
	fauna=[F("guanaco", 4, 3), F("tinamou", 1, 3), F("fox_gray", 1, 1)], colour=(204, 184, 140))
B["andean_valley"] = dict(B["nile"],
	base=mix(("medit_grass_field", 2), ("desert_grass_a", 2), ("temperate_grass_dirt_02", 2), ("medit_grass_wild", 1)),
	forest="medit_grass_wild", cliff="desert_cliff_badlands",
	trees=[T("acacia", 2), T("palm_tropical", 1), T("bush_mediterranean", 3), T("podocarpus_lambertii", 1)],
	fruit="gaia/fruit/berry_04", reeds="actor|props/flora/reeds_pond_lush_a.xml",
	decor=[A("props/flora/grass_field_lush_tall", 2), A("props/flora/reeds_a", 2), A("props/flora/bush_medit_me", 2)],
	fauna=[F("deer_white_tailed", 3, 3), F("llama", 3, 3), F("guanaco", 2, 3), F("tinamou", 2, 3), F("dog_native_american_02", 1, 2),
		F("skunk", 1, 1), F("puma", 1, 1)], colour=(120, 140, 80))
B["yungas"] = dict(base.REGIONS["varzea_forest"],
	trees=[T("tropic_rainforest", 4), T("podocarpus_lambertii", 2), T("palm_tropical", 1), T("strangler", 1), T("bush_tropic", 2)],
	fauna=[F("brocket_red", 3, 2), F("peccary", 3, 3), F("tapir_lowland", 1, 1), F("monkey_howler", 2, 3), F("coati", 2, 3),
		F("guan_crested", 1, 2), F("bear_black", 1, 1), F("jaguar_02", 1, 1), F("puma", 1, 1)])

# ---- Atlantic islands
B["canary_dry"] = dict(
	base=mix(("desert_dirt_rocks_2", 2), ("tropic_beach_volcanic", 1), ("desert_grass_a_stones", 2), ("desert_dirt_rough", 2)),
	forest="desert_sand_scrub", shore="tropic_beach_volcanic", beach="tropic_beach_volcanic", cliff="tropic_cliff_volcanic",
	trees=[T("bush_badlands", 3), T("date_palm", 2), T("tamarix", 1)], forest_density=0.05, scatter=0.004,
	fruit="gaia/fruit/fig", dry=True,
	decor=[A("props/flora/bush_desert_dry_a", 3), A("props/flora/plant_desert_a", 2), A("geology/stone_desert_med", 1)],
	fauna=[F("goat", 5, 3), F("lizard_ocellated", 2, 1), F("pig", 2, 2), F("hare_iberian", 1, 2), F("partridge", 1, 3)],
	stone="gaia/rock/desert_large", metal="gaia/ore/desert_large", colour=(160, 132, 104))
B["laurisilva"] = dict(B["canary_dry"],
	base=mix(("tropic_grass_plants", 2), ("temperate_grass_04", 2), ("temp_grass_mossy", 2), ("tropic_dirt_b_plants", 1)),
	forest="temperate_forestfloor_02", cliff="tropic_cliff_volcanic",
	trees=[T("oak_holly", 3), T("euro_beech", 2), T("cretan_date_palm_tall", 2), T("bamboo_dragon", 1), T("bush_temperate", 2)],
	forest_density=0.55, scatter=0.02, dry=False, fruit="gaia/fruit/berry_01",
	decor=[A("props/flora/ferns", 3), A("props/flora/bush_tempe_me_lush", 2), A("props/flora/shrub_tropic_plant_a", 1)],
	fauna=[F("goat", 4, 3), F("pig", 3, 2), F("lizard_ocellated", 1, 1), F("partridge", 1, 3)], colour=(64, 112, 60))
B["canary_pine"] = dict(B["canary_dry"],
	base=mix(("medit_dirt_c", 2), ("medit_grass_field_brown", 2), ("tropic_dirt_b", 1), ("medit_rocks_grass", 2)),
	forest="temp_forestfloor_pine", cliff="tropic_cliff_volcanic",
	trees=[T("pine", 5), T("pine_maritime", 2), T("juniper_prickly", 1)], forest_density=0.45, dry=False,
	fauna=[F("goat", 5, 3), F("partridge", 2, 3), F("lizard_ocellated", 1, 1)], colour=(116, 116, 80))
B["balearic"] = dict(B["maquis"],
	fauna=[F("goat", 4, 3), F("rabbit_european", 3, 3), F("partridge", 2, 3), F("boar", 1, 3), F("hare_iberian", 1, 2),
		F("turtle_spanish_pond", 1, 1), F("lizard_ocellated", 1, 1)])
B["cyprus"] = dict(B["maquis"],
	trees=[T("pine_black", 3), T("cedar_atlas_3_mature", 1), T("olive", 2), T("carob", 2), T("cypress", 1), T("bush_mediterranean", 3)],
	fauna=[F("goat", 4, 3), F("deer_fallow", 2, 3), F("boar", 2, 3), F("hare_iberian", 1, 2), F("partridge", 2, 3),
		F("snake_montpellier", 1, 1), F("fox_red", 1, 1)])
B["italian_maquis"] = dict(B["maquis"],
	trees=[T("aleppo_pine", 2), T("pine", 2), T("olive", 2), T("oak_holly", 3), T("cypress", 1), T("bush_mediterranean", 2)],
	fauna=[F("deer_red", 3, 3), F("deer_fallow", 2, 3), F("deer_roe", 2, 3), F("boar", 3, 3), F("hare_iberian", 1, 2),
		F("partridge", 2, 3), F("porcupine_crested", 1, 1), F("fox_red", 1, 1), F("wolf", 1, 2), F("bear_brown", 1, 1)],
	colour=(130, 140, 84))
B["apennine"] = dict(B["balkan_forest"],
	trees=[T("euro_beech", 4), T("oak", 2), T("pine_black", 2), T("fir", 2)],
	fauna=[F("deer_roe", 4, 3), F("deer_red", 3, 3), F("boar", 3, 3), F("goat", 1, 3), F("wolf", 1, 2), F("bear_brown", 1, 1)])

for _name, _region in B.items():
	base.REGIONS[_name] = _region
	base.PALETTE[_name] = _region["colour"]


# ------------------------------------------------------------------------------------------------
# Region functions. x, z: tile coordinates (z grows to the north), wobbled; e: height above water.

def zones(default, *rules):
	"""rules: (region, predicate(x, z, e, ctx)) applied in order, later ones on top."""
	def regions(x, z, crest, e, ctx):
		# Distances to water inside the playable circle only: the sea outside it is not a river bank.
		n = e.shape[0]
		zz, xx = np.mgrid[0:n, 0:n]
		wet = (e < 0) & ((xx - n / 2) ** 2 + (zz - n / 2) ** 2 < (n / 2 - 3) ** 2)
		ctx = dict(ctx, land_distance=ndimage.distance_transform_edt(~wet) * base.TILE if wet.any() else np.full(e.shape, 1e9))
		names = np.empty(x.shape, dtype=object)
		names[:] = default
		for region, predicate in rules:
			names[predicate(x, z, e, ctx)] = region
		return names
	return regions


def near_water(metres, below=99):
	return lambda x, z, e, ctx: (ctx["land_distance"] < metres) & (e < below)


def sea_coast(metres):
	return lambda x, z, e, ctx: (ctx["land_distance"] < metres) & ctx["open_sea"]


def above(height):
	return lambda x, z, e, ctx: e > height


def west_of_crest(margin=0):
	"""Needs crest in the config; uses the closure set by build through ctx."""
	return lambda x, z, e, ctx: x < ctx["crest"][np.clip(z.astype(int), 0, len(ctx["crest"]) - 1)] + margin


def where(f):
	return lambda x, z, e, ctx: f(x, z, e)


def with_crest(regions):
	def wrapped(x, z, crest, e, ctx):
		ctx = dict(ctx, crest=crest)
		return regions(x, z, crest, e, ctx)
	return wrapped


# ------------------------------------------------------------------------------------------------
# Climates: sky, sun and water.

CLIMATE = {
	"temperate": dict(sky="cumulus", water=dict(color=(0.22, 0.3, 0.34), tint=(0.28, 0.34, 0.36), murkiness=0.7, waviness=5),
		sun=dict(color=(1.0, 0.98, 0.92), elevation=0.7, rotation=-0.6, ambient=(0.4, 0.42, 0.48))),
	"atlantic": dict(sky="stratus", water=dict(color=(0.2, 0.28, 0.32), tint=(0.26, 0.32, 0.34), murkiness=0.7, waviness=6),
		sun=dict(color=(0.96, 0.96, 0.95), elevation=0.65, rotation=-0.7, ambient=(0.44, 0.46, 0.52))),
	"cold": dict(sky="overcast", water=dict(color=(0.18, 0.24, 0.3), tint=(0.24, 0.3, 0.34), murkiness=0.65, waviness=5),
		sun=dict(color=(0.95, 0.96, 1.0), elevation=0.55, rotation=-0.7, ambient=(0.44, 0.46, 0.54))),
	"medit": dict(sky="cirrus", water=dict(color=(0.16, 0.34, 0.46), tint=(0.22, 0.4, 0.46), murkiness=0.55, waviness=4),
		sun=dict(color=(1.08, 1.02, 0.92), elevation=0.8, rotation=-0.55, ambient=(0.42, 0.42, 0.46))),
	"desert": dict(sky="sunny", water=dict(color=(0.16, 0.36, 0.44), tint=(0.24, 0.4, 0.42), murkiness=0.6, waviness=3),
		sun=dict(color=(1.12, 1.04, 0.9), elevation=0.85, rotation=-0.5, ambient=(0.44, 0.42, 0.42))),
	"savanna": dict(sky="cumulus", water=dict(color=(0.3, 0.32, 0.24), tint=(0.36, 0.36, 0.26), murkiness=0.85, waviness=3),
		sun=dict(color=(1.1, 1.02, 0.88), elevation=0.85, rotation=-0.5, ambient=(0.42, 0.4, 0.4))),
	"tropical": dict(sky="cumulus", water=dict(color=(0.14, 0.36, 0.4), tint=(0.2, 0.42, 0.4), murkiness=0.6, waviness=3),
		sun=dict(color=(1.1, 1.04, 0.92), elevation=0.88, rotation=-0.5, ambient=(0.42, 0.44, 0.44))),
	"highland": dict(sky="cirrus", water=dict(color=(0.14, 0.26, 0.38), tint=(0.2, 0.32, 0.4), murkiness=0.5, waviness=4),
		sun=dict(color=(1.06, 1.04, 1.0), elevation=0.75, rotation=-0.6, ambient=(0.42, 0.44, 0.5))),
}

# Seas: fauna (template, weight, kind), fish near and far from the coast, seals.
SEAS = {
	"north_atlantic": dict(deep="temp_sea_rocks", fauna=[F("orca", 1, 2), F("whale_humpback", 1, 1), F("whale_fin", 1, 1), F("dolphin", 2, 3)],
		fish=["gaia/fish/generic", "gaia/fish/generic"], seal="gaia/fauna_seal_harbor"),
	"baltic": dict(deep="temp_sea_rocks", fauna=[F("dolphin", 1, 2)], fish=["gaia/fish/generic", "gaia/fish/generic"],
		seal="gaia/fauna_seal_harbor", offshore=30),
	"medit": dict(deep="medit_sea_depths", fauna=[F("dolphin", 3, 3), F("whale_fin", 1, 1)], fish=["gaia/fish/generic", "gaia/fish/tuna"],
		seal="gaia/fauna_seal_harbor"),
	"black_sea": dict(deep="medit_sea_depths", fauna=[F("dolphin", 2, 3)], fish=["gaia/fish/generic", "gaia/fish/tuna"], seal=None),
	"tropical": dict(deep="tropic_ocean_depths", fauna=[F("dolphin", 3, 3), F("whale_humpback", 1, 1), F("shark_hammerhead", 1, 1),
		F("shark_bull", 1, 1)], fish=["gaia/fish/generic", "gaia/fish/tuna"], seal=None),
	"red_sea": dict(deep="tropic_ocean_coral", fauna=[F("dolphin", 2, 3), F("shark_hammerhead", 1, 1)],
		fish=["gaia/fish/generic", "gaia/fish/tuna"], seal=None),
	"pacific": dict(deep="steppe_river_rocks_wet", fauna=[F("whale_humpback", 1, 1), F("whale_fin", 1, 1), F("orca", 1, 2),
		F("dolphin", 2, 3), F("shark", 1, 1)], fish=["gaia/fish/generic", "gaia/fish/tuna"], seal="gaia/fauna_seal_harbor"),
	"east_asia": dict(deep="temp_sea_rocks", fauna=[F("dolphin", 2, 3), F("whale_fin", 1, 1), F("whale_humpback", 1, 1)],
		fish=["gaia/fish/generic", "gaia/fish/tuna"], seal="gaia/fauna_seal_harbor"),
	"gulf": dict(deep="tropic_ocean_depths", fauna=[F("dolphin", 3, 3), F("shark_bull", 1, 1), F("shark_hammerhead", 1, 1)],
		fish=["gaia/fish/generic", "gaia/fish/tuna"], seal=None),
	"lake": dict(deep="steppe_river_rocks_wet", fauna=[], fish=["gaia/fish/generic", "gaia/fish/generic"], seal=None),
	"tropical_lake": dict(deep="savanna_riparian_wet", fauna=[], fish=["gaia/fish/tilapia", "gaia/fish/tilapia"], seal=None),
	"baikal": dict(deep="steppe_river_rocks_wet", fauna=[], fish=["gaia/fish/generic", "gaia/fish/generic"],
		seal="gaia/fauna_seal_harbor"),
	"caspian": dict(deep="steppe_river_rocks_wet", fauna=[], fish=["gaia/fish/generic", "gaia/fish/generic"],
		seal="gaia/fauna_seal_harbor"),
}

# The maps are 512 tiles wide, mostly sea: a quarter of the whales, dolphins and seals of the base pipeline.
for _sea in SEAS.values():
	_sea.setdefault("density", 0.25)

NO_SNOW = (999, 999)


def M(file, name, climate, sea, regions, description, snow=NO_SNOW, crest=(0, 2), animal="gaia/fauna_rabbit_european",
		highland=None, bases=None):
	config = dict(pmp=file + ".pmp", xml=file + ".xml", name=name, description=description, regions=regions,
		crest=crest, snow=snow, sea=SEAS[sea], starting_animal=animal, unique_bases=True, **CLIMATE[climate])
	if highland:
		config["highland_fauna"] = highland
	if bases:
		config["auto_bases"] = bases
	return config


HL_EUROPE = [F("deer_red", 3, 3), F("goat", 2, 3), F("wolf", 1, 2), F("bear_brown", 1, 1)]
HL_IBERIA = [F("goat_lusitanian", 3, 3), F("deer_roe", 2, 3), F("wolf_iberian", 1, 2), F("bear_cantabrian", 1, 1)]
HL_MEDIT = [F("goat", 4, 3), F("deer_red", 1, 3), F("wolf", 1, 2)]
HL_ATLAS = [F("macaque_barbary", 3, 3), F("goat", 3, 3), F("leopard", 1, 1)]
HL_CENTRAL_ASIA = [F("goat", 3, 3), F("marmot_alpine", 2, 2), F("deer_red", 2, 3), F("leopard_snow", 1, 1)]
HL_EAST_ASIA = [F("goat", 3, 3), F("deer", 2, 3), F("bear_black", 1, 1)]
HL_TROPIC_ASIA = [F("deer", 3, 3), F("boar", 2, 3), F("bear_black", 1, 1), F("leopard", 1, 1)]
HL_NORTH_AMERICA = [F("deer_red", 3, 3), F("sheep", 3, 3), F("bear_brown", 1, 1), F("puma", 1, 1)]
HL_ANDES = [F("guanaco", 4, 3), F("llama", 2, 3), F("puma", 1, 1)]
HL_MESOAMERICA = [F("deer_white_tailed", 3, 3), F("turkey", 2, 3), F("puma", 1, 1)]
HL_AFRICA = [F("goat", 3, 3), F("baboon", 3, 3), F("leopard", 1, 1)]

S = "gaia/fauna_"

MAPS = {
	# ---- Iberia and the Atlantic
	"rio_tejo": M("Rio Tejo", "Rio Tejo", "medit", "north_atlantic",
		zones("montado", ("iberian_mountain", above(14)), ("iberian_marsh", near_water(28, 3))),
		"The lower Tagus, heart of Lusitania: cork-oak montados, the marshes of the estuary and the granite "
		"hills of the interior. Red deer, Iberian boars, Sorraia horses and aurochs graze the plains, the lynx "
		"and the wolf hunt them, and flamingos and storks crowd the river flats.",
		animal=S + "partridge", highland=HL_IBERIA, bases=4),
	"serra_da_estrela": M("Serra da estrela", "Serra da Estrela", "highland", "lake",
		zones("montado", ("iberian_mountain", above(22)), ("iberian_marsh", near_water(16, 2))),
		"The Mons Herminius, highest range of Lusitania and refuge of Viriathus. Pine and oak forests climb "
		"from the montado to the bare granite plateau where snow lies in winter. Roe deer, boars, wolves "
		"and the Cantabrian bear live in its valleys.",
		snow=(78, 78), animal=S + "rabbit_european", highland=HL_IBERIA, bases=4),
	"columnas_de_hercules": M("columnas de hércules", "Columnas de Hércules", "medit", "medit",
		zones("montado", ("north_africa", where(lambda x, z, e: z < 250)), ("atlas_forest", lambda x, z, e, c: (z < 250) & (e > 22)),
			("iberian_mountain", lambda x, z, e, c: (z >= 250) & (e > 22))),
		"The Pillars of Hercules, gate between the Inner Sea and the Ocean. Turdetanian and Phoenician cities "
		"watch the strait from Iberia, Mauri kingdoms from Africa. Barbary macaques and lions live on one "
		"shore, lynxes and Iberian boars on the other; dolphins and tuna cross between them.",
		snow=(95, 95), animal=S + "partridge", highland=HL_MEDIT, bases=4),
	"baleares": M("baleares", "Baleares", "medit", "medit",
		zones("balearic", ("iberian_marsh", near_water(10, 1.5))),
		"Mallorca, Menorca and the Pityusic islands, land of the Talaiotic culture and its famous slingers. "
		"Holm oaks, wild olives and Aleppo pines cover the islands, where feral goats, rabbits and partridges "
		"are the only game. Monk seals rest in the coves.",
		snow=(95, 95), animal=S + "rabbit_european", highland=HL_MEDIT, bases=4),
	"canarias_1": M("Canarias 1", "Canarias I", "desert", "north_atlantic",
		zones("canary_dry"),
		"Lanzarote and Fuerteventura, the dry eastern Canaries of the Majos. Volcanic badlands and malpaís, "
		"few trees and much wind. Herds of goats and pigs brought by the first settlers, giant lizards, and "
		"monk seals and whales along the coasts.",
		snow=(95, 95), animal=S + "goat", highland=HL_MEDIT),
	"canarias_2": M("Canarias 2", "Canarias II", "atlantic", "north_atlantic",
		zones("laurisilva", ("canary_pine", above(28)), ("canary_dry", lambda x, z, e, c: (e < 10) & (z < 200))),
		"La Palma, La Gomera and El Hierro, the green western Canaries. The trade winds feed the laurel "
		"forests on the slopes, Canary pines rise above them, and the Guanche herders drive their goats "
		"between the ravines.",
		snow=(95, 95), animal=S + "goat", highland=HL_MEDIT),
	"canarias_3": M("Canarias 3", "Canarias III", "atlantic", "north_atlantic",
		zones("laurisilva", ("canary_dry", lambda x, z, e, c: e < 8), ("canary_pine", above(30))),
		"Tenerife and Gran Canaria, the central Canaries. The Teide volcano towers over pine forests, laurel "
		"woods and dry coasts. Two Guanche peoples, each with its kings, fight for pastures and springs.",
		snow=(76, 76), animal=S + "goat", highland=HL_MEDIT),
	"armorica": M("Armórica", "Armórica", "atlantic", "north_atlantic",
		zones("atlantic", ("moorland", above(16)), ("frisian_marsh", sea_coast(14))),
		"Armorica, \"the land by the sea\": Brittany and the Loire, land of the Veneti and their oak ships. "
		"Oak and beech forests, heaths and rocky coasts. Red deer, boars and aurochs fill the woods, seals "
		"the reefs.",
		animal=S + "rabbit_european", highland=HL_EUROPE),
	"gales": M("gales", "Gales", "atlantic", "north_atlantic",
		zones("atlantic", ("moorland", above(22)), ("frisian_marsh", sea_coast(10))),
		"Wales and the borders of Britannia, land of the Silures and the Ordovices, with the island of Mona, "
		"sanctuary of the druids. Wet oak woods in the valleys and moorland on the mountains of Eryri.",
		snow=(84, 84), animal=S + "rabbit_european", highland=HL_EUROPE, bases=4),
	"eriu": M("Eriu", "Ériu", "atlantic", "north_atlantic",
		zones("eriu", ("moorland", above(12)), ("frisian_marsh", near_water(16, 2))),
		"Ériu, the island at the edge of the world. Oak woods and bogs, green pastures and stony mountains; "
		"red deer, boars and wolves in the forests and seals on the coasts. The kings of the five provinces "
		"raid each other's cattle.",
		animal=S + "hare_iberian", highland=HL_EUROPE),
	"frisia": M("frisia", "Frísia", "atlantic", "baltic",
		zones("north_european", ("frisian_marsh", lambda x, z, e, c: (e < 1.8) | (c["land_distance"] < 30))),
		"The low coasts of the Frisii and the Chauci, behind the islands of the Wadden Sea: salt marshes, "
		"mounds raised against the tides, peat bogs and the forests of the Rhine. Geese and ducks in their "
		"thousands, seals on the sandbanks.",
		animal=S + "goose_greylag", highland=HL_EUROPE),
	"jutlandia": M("Jutlandia", "Jutlândia", "atlantic", "baltic",
		zones("north_european", ("frisian_marsh", sea_coast(18))),
		"Jutland and the Danish islands, homeland of the Cimbri, the Teutones and the Angles. Beech forests, "
		"heaths and fjords. Red and roe deer, aurochs and wisent in the woods, seals and porpoises in the straits.",
		animal=S + "goose_greylag", highland=HL_EUROPE),
	"baltico": M("baltico", "Báltico", "cold", "baltic",
		zones("north_european", ("boreal", where(lambda x, z, e: z > 330)), ("frisian_marsh", sea_coast(12))),
		"The amber coast of the Baltic: the forests of the Aesti and Venedi in the south, the rocky shores of "
		"Scandinavia in the north. Elk, wisent and aurochs in the forests, reindeer in the north, seals on "
		"the skerries.",
		animal=S + "goose_greylag", highland=HL_EUROPE),

	# ---- Mediterranean and the Black Sea
	"magna_graecia": M("Magna graecia", "Magna Graecia", "medit", "medit",
		zones("italian_maquis", ("apennine", above(30))),
		"Southern Italy and Sicily, where Greek colonies, Carthaginians, Samnites, Lucanians and Rome fight "
		"over the richest land of the West. Olive groves and maquis on the coasts, beech forests on the "
		"Apennines, and Etna smoking over Sicily.",
		snow=(80, 80), animal=S + "partridge", highland=HL_MEDIT),
	"macedonia": M("Macedonia", "Macedônia", "medit", "medit",
		zones("maquis", ("thracian_plain", lambda x, z, e, c: e < 6), ("balkan_forest", above(18))),
		"Macedonia, Thessaly and Chalcidice: the plains of the kings, the forests that built their fleets and "
		"Mount Olympus. Herodotus tells of the lions that attacked Xerxes' camels here; bears, wolves, aurochs "
		"and red deer roam the mountains.",
		snow=(76, 76), animal=S + "partridge", highland=HL_EUROPE),
	"tracia": M("Tracia", "Trácia", "temperate", "black_sea",
		zones("thracian_plain", ("balkan_forest", above(14)), ("maquis", lambda x, z, e, c: (z < 160) & (e < 14))),
		"Thrace, between the Haemus and the Hellespont, land of the Odrysian kings, of horse breeders and of "
		"gold. Wide grasslands with wild horses and aurochs, oak forests on the hills, Greek colonies on "
		"the coasts.",
		snow=(90, 90), animal=S + "partridge", highland=HL_EUROPE),
	"chipre": M("chipre", "Chipre", "medit", "medit",
		zones("cyprus", ("balkan_forest", above(36))),
		"Cyprus, island of copper and of Aphrodite, divided among city kingdoms of Greeks and Phoenicians. "
		"The pine and cedar forests of the Troodos, the plain of the Mesaoria and the long Karpas peninsula.",
		snow=(84, 84), animal=S + "partridge", highland=HL_MEDIT),
	"crimea": M("Crimea", "Crimeia", "medit", "black_sea",
		zones("pontic_steppe", ("maquis", lambda x, z, e, c: (z < 200) & (e > 4)), ("balkan_forest", above(24))),
		"The Tauric Chersonese: Scythian steppe in the north, Greek cities on the coasts and the Tauri in the "
		"mountains of the south. Saigas, wild horses and wolves on the plains, red deer and bears in the forests.",
		snow=(90, 90), animal=S + "hare_iberian", highland=HL_EUROPE),
	"caucaso": M("Cáucaso", "Cáucaso", "temperate", "black_sea",
		zones("pontic_steppe", ("caucasus_forest", above(10)), ("tugai", lambda x, z, e, c: (c["land_distance"] < 24) & (e < 4))),
		"The Caucasus between the Black Sea and the Caspian: Colchis and its golden fleece, Iberia and "
		"Albania, and the Sarmatian steppe to the north. Wisent, leopards and bears in the forests, saigas "
		"and wild horses on the plains.",
		snow=(58, 66), animal=S + "hare_iberian", highland=HL_CENTRAL_ASIA),

	# ---- North Africa and Egypt
	"kart_hadast": M("kart hadast", "Kart-Hadasht", "medit", "medit",
		zones("north_africa", ("atlas_forest", above(24)), ("nile", near_water(14, 2))),
		"The land of Carthage: the gulf of Tunis, the Cap Bon and the wheat fields of the Bagradas valley. "
		"Olive groves and fig trees, Numidian horsemen in the hills, and the North African elephants that "
		"Carthage trained for war.",
		snow=(95, 95), animal=S + "hare_iberian", highland=HL_ATLAS, bases=4),
	"numidia": M("Numidia", "Numídia", "medit", "medit",
		zones("north_africa", ("atlas_forest", above(22)), ("desert", lambda x, z, e, c: (z < 140) & (e < 22))),
		"Numidia, kingdom of Masinissa and Jugurtha: cedar forests on the Atlas and the Aurès, wheat plains, "
		"and the salt lakes at the edge of the desert. Lions, leopards, elephants and ostriches still live here.",
		snow=(95, 95), animal=S + "hare_iberian", highland=HL_ATLAS),
	"rusaddir": M("Rusaddir", "Rusaddir", "medit", "medit",
		zones("north_africa", ("atlas_forest", above(16))),
		"Rusaddir, Phoenician port on the coast of the Rif, among the Mauri. Lagoons, dry plains and the "
		"forested mountains of the Rif, home of Barbary macaques and leopards.",
		snow=(95, 95), animal=S + "hare_iberian", highland=HL_ATLAS),
	"egipto": M("Egipto", "Egito", "desert", "red_sea",
		zones("desert", ("nile", lambda x, z, e, c: (c["land_distance"] < 70) & ~c["open_sea"] & (e < 10) & (x < 330)),
			("nile", lambda x, z, e, c: (z > 360) & (e < 4))),
		"Egypt: the delta and the valley of the Nile, a green ribbon between the Libyan and Arabian deserts, "
		"with Sinai and the Red Sea to the east. Hippos and crocodiles in the river, gazelles, oryx and "
		"ostriches in the desert.",
		snow=(95, 95), animal=S + "goose_greylag", highland=[F("goat", 3, 3), F("gazelle", 2, 3), F("hyena", 1, 1)]),

	# ---- Sub-Saharan Africa
	"lago_chad": M("Lago Chad", "Lago Chade", "savanna", "tropical_lake",
		zones("sahel", ("sahel_wetland", near_water(60, 4)), ("guinea_savanna", where(lambda x, z, e: z < 150))),
		"Lake Chad and the rivers that feed it, crossroads of the Sahel. Dry savanna with acacias and baobabs, "
		"floodplains full of hippos, crocodiles and herds of topi, and lions, cheetahs and giraffes on the plains.",
		snow=(95, 95), animal=S + "guineafowl", highland=HL_AFRICA),
	"delta_del_rio_niger": M("Delta del Rio Niger", "Delta do Rio Níger", "tropical", "tropical",
		zones("guinea_savanna", ("african_rainforest", where(lambda x, z, e: z < 300)), ("african_mangrove", sea_coast(40))),
		"The delta of the Niger, a maze of creeks and mangroves, the rainforest behind it and the savanna "
		"further north. Chimpanzees, forest buffaloes, elephants and leopards, and crocodiles in every channel.",
		snow=(95, 95), animal=S + "guineafowl", highland=HL_AFRICA),
	"lago_victoria": M("Lago victoria", "Lago Vitória", "savanna", "tropical_lake",
		zones("east_african_savanna", ("lake_forest", near_water(60))),
		"Lake Victoria, source of the Nile. Forests and papyrus swamps around the lake, open savanna on the "
		"plateau where wildebeest, zebras and topi migrate under the eyes of lions and hyenas.",
		snow=(95, 95), animal=S + "guineafowl", highland=HL_AFRICA, bases=4),
	"rio_okavango": M("Rio Okavango", "Rio Okavango", "savanna", "tropical_lake",
		zones("kalahari", ("okavango", lambda x, z, e, c: (c["land_distance"] < 90) | (e < 3))),
		"The Okavango delta, a river that dies in the Kalahari: green channels and islands full of buffaloes, "
		"elephants, hippos and lions, surrounded by red sand where only the gemsbok and the meerkat live.",
		animal=S + "guineafowl", highland=HL_AFRICA),
	"costa_etiope": M("Costa etíope", "Costa Etíope", "desert", "red_sea",
		zones("afar", ("ethiopian_highland", above(20)), ("arabia", where(lambda x, z, e: (x > 300) & (z > 300)))),
		"The southern end of the Red Sea: the kingdom of Aksum on the Ethiopian highlands, the Afar desert, "
		"and Saba and Himyar across the strait. Baboons and kudus in the mountains, oryx and wild asses on "
		"the plains.",
		snow=(95, 95), animal=S + "guineafowl", highland=HL_AFRICA),

	# ---- Central Asia and Siberia
	"dahistan": M("Dahistán", "Dahistão", "desert", "caspian",
		zones("central_asian_desert", ("pontic_steppe", where(lambda x, z, e: z > 400)), ("tugai", near_water(40))),
		"Dahistan, on the south-east shore of the Caspian, land of the Dahae nomads and later of the Parthians. "
		"Deserts and salt flats, the reed thickets of the rivers where the Caspian tiger hunts, saigas, "
		"gazelles and onagers on the plains, and seals on the Caspian shore.",
		animal=S + "hare_iberian", highland=HL_CENTRAL_ASIA),
	"lago_balkhas": M("Lago Balkhas", "Lago Balkhash", "temperate", "lake",
		zones("kazakh_steppe", ("central_asian_desert", where(lambda x, z, e: (z < 300) & (z > 120))), ("tugai", near_water(50, 6)),
			("tian_shan", above(30))),
		"Lake Balkhash and the Seven Rivers, summer pastures of the Saka and the Wusun at the foot of the "
		"Tian Shan. Steppe and desert, the reed beds of the Ili with tigers and boars, and snow leopards in "
		"the mountains.",
		snow=(62, 62), animal=S + "hare_iberian", highland=HL_CENTRAL_ASIA),
	"lago_baikal": M("Lago Baikal", "Lago Baikal", "cold", "baikal",
		zones("taiga", ("siberian_steppe", lambda x, z, e, c: (z < 180) & (e < 16))),
		"Lake Baikal, the deepest lake in the world, among the taiga of Siberia. Elk, reindeer and red deer "
		"in the forests, the Baikal seal in the lake, and the herders of the steppe in the south.",
		snow=(56, 60), animal=S + "hare_iberian", highland=[F("caribou", 3, 3), F("goat", 2, 3), F("leopard_snow", 1, 1)]),

	# ---- East Asia
	"zhongyuan": M("Zhongyuan", "Zhongyuan", "temperate", "east_asia",
		zones("china_plain", ("loess", lambda x, z, e, c: (x < 200) & (e > 10)), ("loess", above(26))),
		"The Central Plain of the Yellow River, cradle of Chinese civilisation, where the Zhou, Qin and Han "
		"fought for the Mandate of Heaven. Fertile plains, the loess plateau to the west, and the Shandong "
		"hills by the sea. Deer and boars, and tigers and elephants still in the south.",
		snow=(70, 70), animal=S + "chicken", highland=HL_EAST_ASIA),
	"jiangnan": M("jiangnan", "Jiangnan", "tropical", "east_asia",
		zones("jiangnan", ("korea", above(28)), ("asian_wetland", near_water(24, 3))),
		"South of the Yangtze: lakes, rice paddies and bamboo hills, the land of the Wu and Yue kingdoms, with "
		"the island of Taiwan across the strait. Deer, macaques and alligators, and tigers in the hills.",
		snow=(90, 90), animal=S + "chicken", highland=HL_EAST_ASIA),
	"lingnan": M("Lingnan", "Lingnan", "tropical", "tropical",
		zones("lingnan", ("asian_wetland", near_water(24, 3)), ("jiangnan", above(24))),
		"Lingnan, south of the mountains: the Pearl River, the kingdom of Nanyue and the island of Hainan. "
		"Subtropical forests with elephants, tigers, peafowl and macaques, and crocodiles in the estuary.",
		snow=(95, 95), animal=S + "chicken", highland=HL_TROPIC_ASIA),
	"corea": M("Corea", "Coreia", "temperate", "east_asia",
		zones("korea", ("korea_lowland", lambda x, z, e, c: e < 5)),
		"The Korean peninsula of the Three Kingdoms, Goguryeo, Baekje and Silla. Pine and oak mountains "
		"over narrow valleys of rice; the Amur tiger and leopard hunt deer and boars.",
		snow=(70, 70), animal=S + "chicken", highland=HL_EAST_ASIA),
	"nipon": M("Nipon", "Nippon", "temperate", "east_asia",
		zones("japan", ("korea", above(26))),
		"Western Japan of the Yayoi and Kofun periods: Kyushu, Shikoku and Honshu around the Inland Sea. "
		"Forested mountains of pine, maple and bamboo, sika deer, boars, macaques, black bears and the "
		"Japanese wolf.",
		snow=(72, 72), animal=S + "chicken", highland=HL_EAST_ASIA),

	# ---- South and South-East Asia
	"sri_lanka": M("Sri Lanka", "Sri Lanka", "tropical", "tropical",
		zones("lanka_dry", ("lanka_wet", lambda x, z, e, c: (z < 260) & (x < 300)), ("lanka_wet", above(18)),
			("asian_mangrove", sea_coast(12))),
		"Lanka, the island of the Sinhalese kings of Anuradhapura. The dry plains of the north with their "
		"great reservoirs, the rainforests of the south-west and the central mountains. Elephants, leopards, "
		"sloth bears, peafowl and crocodiles.",
		snow=(95, 95), animal=S + "chicken", highland=HL_TROPIC_ASIA),
	"sudeste_asiatico": M("Sudeste Asiático", "Sudeste Asiático", "tropical", "tropical",
		zones("indochina_dry", ("indochina_forest", above(14)), ("asian_wetland", near_water(30, 3)), ("asian_mangrove", sea_coast(14))),
		"Mainland South-East Asia: the valleys of the Irrawaddy, the Chao Phraya and the Mekong, the kingdom "
		"of Funan and the Mon cities. Teak forests and rainforest, elephants, tigers and green peafowl.",
		snow=(95, 95), animal=S + "chicken", highland=HL_TROPIC_ASIA),
	"estrecho_de_malaca": M("Estrecho de Malaca", "Estreito de Malaca", "tropical", "tropical",
		zones("malaya", ("asian_mangrove", sea_coast(24))),
		"The Strait of Malacca between the Malay peninsula and Sumatra, highway of the spice trade. Rainforest "
		"and mangroves, tapirs, elephants, tigers and black panthers.",
		snow=(95, 95), animal=S + "chicken", highland=HL_TROPIC_ASIA),
	"java": M("Java", "Java", "tropical", "tropical",
		zones("java", ("asian_mangrove", sea_coast(14)), ("korea", above(40))),
		"Java and the southern coast of Borneo, lands of volcanoes and rice terraces. Javan tigers, leopards "
		"and black panthers, banteng, deer and peafowl in the forests.",
		snow=(95, 95), animal=S + "chicken", highland=HL_TROPIC_ASIA),
	"filipinas": M("Filipinas", "Filipinas", "tropical", "tropical",
		zones("philippines", ("asian_mangrove", sea_coast(12))),
		"The Philippine archipelago, from Luzon to Mindanao: forested volcanic islands, the barangays of the "
		"sea peoples, Philippine deer, warty pigs, tamaraw and crocodiles.",
		snow=(95, 95), animal=S + "chicken", highland=HL_TROPIC_ASIA),

	# ---- North America
	"apalaches": M("Apalaches", "Apalaches", "temperate", "north_atlantic",
		zones("eastern_forest", ("appalachian_high", above(22)), ("gulf_coast", lambda x, z, e, c: (z < 200) & (e < 8))),
		"The Appalachian mountains and the eastern woodlands, land of the Adena and Hopewell mound builders. "
		"Endless forests of oak and maple with white-tailed deer, turkeys, bison, black bears, wolves and cougars.",
		snow=(80, 80), animal=S + "turkey", highland=HL_NORTH_AMERICA),
	"grandes_lagos": M("Grandes Lagos", "Grandes Lagos", "temperate", "lake",
		zones("great_lakes_forest", ("north_woods", where(lambda x, z, e: z > 360)), ("prairie", where(lambda x, z, e: (z < 200) & (x < 200)))),
		"The Great Lakes, inland seas of fresh water among the forests of the Anishinaabe and the Haudenosaunee. "
		"Moose, caribou and beavers in the north, deer, turkeys and bison in the south.",
		animal=S + "turkey", highland=HL_NORTH_AMERICA),
	"costa_del_golfo": M("Costa del Golfo", "Costa do Golfo", "tropical", "gulf",
		zones("gulf_coast", ("everglades", where(lambda x, z, e: (x > 300) & (z < 220))), ("eastern_forest", where(lambda x, z, e: z > 400))),
		"The coast of the Gulf of Mexico from the Mississippi to Florida: pine savannas, cypress swamps and "
		"the Everglades, land of the Calusa and the mound builders. Alligators, white-tailed deer, turkeys "
		"and the Florida panther.",
		snow=(95, 95), animal=S + "turkey", highland=HL_NORTH_AMERICA),
	"california": M("California", "Califórnia", "medit", "pacific",
		with_crest(zones("california_oak", ("great_basin", lambda x, z, e, c: ~west_of_crest(10)(x, z, e, c)),
			("pacific_conifer", lambda x, z, e, c: west_of_crest(10)(x, z, e, c) & ((e > 24) | (z > 400))))),
		"California, from the redwood coast to the Sierra Nevada and the Great Basin beyond: oak savannas, "
		"chaparral and conifer forests, land of the Chumash, Ohlone and Miwok. Elk, deer, grizzly bears and "
		"cougars; sea lions, otters and whales on the coast.",
		snow=(66, 72), crest=(150, 330), animal=S + "turkey", highland=HL_NORTH_AMERICA),
	"gran_canon_del_colorado": M("Gran Cañón del colorado", "Grand Canyon", "desert", "lake",
		zones("colorado_plateau", ("ponderosa", above(40)), ("tugai", near_water(14, 6))),
		"The Grand Canyon of the Colorado and its plateaus, land of the Ancestral Puebloans. Red badlands and "
		"juniper scrub, ponderosa forests on the high rims, bighorns, mule deer and cougars.",
		snow=(96, 96), animal=S + "turkey", highland=HL_NORTH_AMERICA),
	"oasisamerica": M("Oasisamérica", "Oasisamérica", "desert", "pacific",
		zones("sonoran", ("sierra_madre", above(24)), ("andean_valley", near_water(24, 4))),
		"Oasisamerica: the Sonoran desert, the Gulf of California and the Sierra Madre, land of the Hohokam "
		"and Mogollon farmers. Cactus forests, peccaries, coatis and coyotes, and jaguars in the sierra.",
		snow=(76, 76), animal=S + "turkey", highland=HL_MESOAMERICA),

	# ---- Mesoamerica and the Caribbean
	"mayab": M("Mayab", "Mayab", "tropical", "gulf",
		zones("yucatan_scrub", ("maya_forest", where(lambda x, z, e: z < 260)), ("maya_coast", sea_coast(16))),
		"The Mayab, the Yucatán peninsula of the Maya: dry forest on limestone with cenotes in the north, "
		"tall rainforest in the south. Ocellated turkeys, brocket deer, peccaries, monkeys and jaguars, "
		"and flamingos on the lagoons.",
		snow=(95, 95), animal=S + "turkey", highland=HL_MESOAMERICA),
	"istmo_centroamericano": M("Istmo centroamericano", "Istmo Centro-Americano", "tropical", "tropical",
		zones("central_american_forest", ("pine_oak_highland", above(22)), ("maya_coast", sea_coast(12))),
		"The Central American isthmus between two oceans: volcanoes, cloud forests and rainforests, land of "
		"the Maya, the Lenca and the Chibcha. Tapirs, monkeys, jaguars and crocodiles.",
		snow=(95, 95), animal=S + "curassow", highland=HL_MESOAMERICA),
	"antillas_mayores_1": M("Antillas Mayores 1", "Antilhas Maiores I", "tropical", "tropical",
		zones("antilles", ("antilles_dry", lambda x, z, e, c: e < 4), ("maya_coast", sea_coast(8))),
		"Hispaniola, Puerto Rico and Jamaica, the islands of the Taíno caciques. Royal palms and rainforest, "
		"hutias, iguanas and crocodiles; the canoes of the Taíno and the Kalinago cross the straits.",
		snow=(95, 95), animal=S + "iguana_green", highland=HL_MESOAMERICA),
	"antillas_mayores_2": M("Antillas Mayores 2", "Antilhas Maiores II", "tropical", "tropical",
		zones("antilles", ("antilles_dry", lambda x, z, e, c: e < 4), ("maya_coast", sea_coast(8))),
		"Cuba, Jamaica and the windward coast of Hispaniola, land of the Taíno and of the older Guanahatabey. "
		"Savannas, rainforest and mangroves, hutias, iguanas, Cuban crocodiles and flamingos.",
		snow=(95, 95), animal=S + "iguana_green", highland=HL_MESOAMERICA),

	# ---- South America
	"pantanal": M("Pantanal", "Pantanal", "savanna", "tropical_lake",
		zones("pantanal", ("pantanal_forest", near_water(24)), ("cerrado", above(14))),
		"The Pantanal, the largest wetland in the world, where the rivers of the Paraguay basin flood the "
		"plains every year. Caimans by the thousand, capybaras, marsh deer, giant otters, tapirs and jaguars.",
		animal=S + "tinamou", highland=[F("rhea", 3, 3), F("deer_white_tailed", 2, 3), F("puma", 1, 1)]),
	"lago_titikaka": M("Lago Titikaka", "Lago Titicaca", "highland", "lake",
		zones("puna", ("andean_valley", near_water(30, 6))),
		"Lake Titicaca on the Altiplano, birthplace of Tiwanaku and of the Inca legends. Cold grasslands of "
		"ichu where llamas, vicuñas and rheas graze, Andean flamingos on the shores and snowy peaks around.",
		snow=(118, 118), animal=S + "tinamou", highland=HL_ANDES),
	"chala": M("Chala ", "Chala", "desert", "pacific",
		with_crest(zones("coastal_desert", ("andean_valley", near_water(60)), ("puna", above(38)),
			("yungas", lambda x, z, e, c: ~west_of_crest(14)(x, z, e, c) & (e < 38)))),
		"The Chala, the desert coast of Peru, cut by green river valleys of Nazca, Paracas and Moche farmers. "
		"The Andes rise behind it, and beyond them the cloud forests of the Amazon. Sea lions and whales "
		"in the cold Humboldt current.",
		snow=(76, 76), crest=(240, 480), animal=S + "tinamou", highland=HL_ANDES),
}


def run(key):
	config = MAPS[key]
	data = base.GameData()
	result = base.build(key, config, SRC, data)
	players = len({b[2] for b in result["bases"]})
	name = "%s_%dp" % (key, players)
	out = os.path.join(base.MOD, "maps", "skirmishes")
	base.write_pmp(os.path.join(out, name + ".pmp"), result["version"], result["patches"], result["height"],
		result["textures"], result["tiles"])
	preview_dir = os.path.join(base.MOD, "art", "textures", "ui", "session", "icons", "mappreview")
	base.write_preview(os.path.join(preview_dir, key + ".png"), result)
	base.write_scenario(os.path.join(out, name + ".xml"), key, config, result, key + ".png")
	fauna = {}
	for template, *_ in result["entities"]:
		if "fauna_" in template:
			fauna[template[11:]] = fauna.get(template[11:], 0) + 1
	return "%s: %d players, %d textures, %d entities, fauna %s" % (name, players, len(result["textures"]),
		len(result["entities"]), dict(sorted(fauna.items(), key=lambda kv: -kv[1])))


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--only", default="")
	parser.add_argument("--jobs", type=int, default=4)
	args = parser.parse_args()
	keys = [k for k in MAPS if not args.only or k in args.only.split(",")]
	for key in keys:
		for ext in ("pmp", "xml"):
			path = os.path.join(SRC, MAPS[key][ext])
			if not os.path.exists(path):
				raise SystemExit("missing " + path)
	with ProcessPoolExecutor(args.jobs) as pool:
		for line in pool.map(run, keys):
			print(line, flush=True)


if __name__ == "__main__":
	main()
