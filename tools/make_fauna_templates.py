#!/usr/bin/env python3
"""Write simulation/templates/gaia/fauna_<actor>.xml for the animals made by import_fauna_catalog.py.

Each template inherits a complete fauna template (behaviour, sounds, icon) and overrides the name,
the actor, the stats below and a footprint measured on the mesh. Existing templates are kept.
"""
import os
import struct

import numpy as np

MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# actor: (parent, generic name, scientific name, health, food or None, hack damage or None)
ANIMALS = {
	"moose": ("gaia/fauna_deer", "Moose", "Alces alces", 60, 300, None),
	"moose_female": ("gaia/fauna_deer", "Moose Cow", "Alces alces", 50, 250, None),
	"caribou": ("gaia/fauna_deer", "Caribou", "Rangifer tarandus", 40, 200, None),
	"caribou_female": ("gaia/fauna_deer", "Caribou Cow", "Rangifer tarandus", 35, 175, None),
	"brocket_red": ("gaia/fauna_deer", "Central American Red Brocket", "Mazama temama", 15, 75, None),
	"brocket_yucatan": ("gaia/fauna_deer", "Yucatan Brown Brocket", "Odocoileus pandora", 15, 75, None),
	"deer_white_tailed_02": ("gaia/fauna_deer_white_tailed", "White-Tailed Stag", "Odocoileus virginianus", None, None, None),
	"deer_white_tailed_02_female": ("gaia/fauna_deer_white_tailed", "White-Tailed Doe", "Odocoileus virginianus", None, None, None),
	"squirrel": ("gaia/fauna_rabbit", "Mexican Gray Squirrel", "Sciurus aureogaster", 3, 25, None),
	"tapeti": ("gaia/fauna_rabbit", "Tapeti", "Sylvilagus brasiliensis", 5, 50, None),
	"paca": ("gaia/fauna_rabbit", "Lowland Paca", "Cuniculus paca", 10, 100, None),
	"peccary": ("gaia/fauna_boar", "Collared Peccary", "Dicotyles tajacu", 35, 100, 8),
	"puma": ("gaia/fauna_jaguar", "Puma", "Puma concolor", 45, None, 25),
	"panther_black": ("gaia/fauna_jaguar", "Black Jaguar", "Panthera onca", 50, None, 30),
	"jaguar_02": ("gaia/fauna_jaguar", "Jaguar", "Panthera onca", None, None, None),
	"ocelot": ("gaia/fauna_fox_red", "Ocelot", "Leopardus pardalis", 25, None, 6),
	"margay": ("gaia/fauna_fox_red", "Margay", "Leopardus wiedii", 15, None, 3),
	"jaguarundi": ("gaia/fauna_fox_red", "Jaguarundi", "Herpailurus yagouaroundi", 18, None, 4),
	"coyote": ("gaia/fauna_wolf", "Coyote", "Canis latrans", 30, None, 7),
	"fox_gray_02": ("gaia/fauna_fox_gray", "Gray Fox", "Urocyon cinereoargenteus", None, None, None),
	"dog_native_american_02": ("gaia/fauna_dog_wolfhound", "Village Dog", "Canis familiaris", 30, None, 5),
	"raccoon": ("gaia/fauna_fox_red", "Raccoon", "Procyon lotor", 12, None, 2),
	"coati": ("gaia/fauna_fox_red", "White-Nosed Coati", "Nasua narica", 12, None, 2),
	"grison": ("gaia/fauna_fox_red", "Greater Grison", "Galictis vittata", 10, None, 3),
	"skunk": ("gaia/fauna_fox_red", "Hooded Skunk", "Mephitis macroura", 8, None, 1),
	"otter": ("gaia/fauna_fox_red", "River Otter", "Lontra canadensis", 12, None, 2),
	"otter_tropical": ("gaia/fauna_fox_red", "Neotropical Otter", "Lontra longicaudis", 12, None, 2),
	"opossum": ("gaia/fauna_fox_red", "Common Opossum", "Didelphis marsupialis", 8, None, 1),
	"tamandua": ("gaia/fauna_fox_red", "Northern Tamandua", "Tamandua mexicana", 15, None, 3),
	"anteater_02": ("gaia/fauna_fox_red", "Giant Anteater", "Myrmecophaga tridactyla", 40, None, 10),
	"boa_constrictor": ("gaia/fauna_fox_red", "Boa Constrictor", "Boa imperator", 20, None, 6),
	"caiman": ("gaia/fauna_crocodile_nile", "Spectacled Caiman", "Caiman crocodilus", 60, None, 18),
	"crocodile_american": ("gaia/fauna_crocodile_nile", "American Crocodile", "Crocodylus acutus", 100, None, 30),
	"crocodile_morelet": ("gaia/fauna_crocodile_nile", "Morelet's Crocodile", "Crocodylus moreletii", 80, None, 24),
	"iguana_green": ("gaia/fauna_rabbit", "Green Iguana", "Iguana iguana", 8, 50, None),
	"iguana_motagua": ("gaia/fauna_rabbit", "Motagua Spiny-Tailed Iguana", "Ctenosaura palearis", 8, 50, None),
	"basilisk": ("gaia/fauna_rabbit", "Striped Basilisk", "Basiliscus vittatus", 3, 20, None),
	"toad_cane": ("gaia/fauna_rabbit", "Cane Toad", "Rhinella horribilis", 3, 10, None),
	"monkey_spider": ("gaia/fauna_deer", "Geoffroy's Spider Monkey", "Ateles geoffroyi", 12, 60, None),
	"monkey_howler": ("gaia/fauna_deer", "Mantled Howler Monkey", "Alouatta palliata", 14, 70, None),
	"macaque_barbary": ("gaia/fauna_deer", "Barbary Macaque", "Macaca sylvanus", 14, 70, None),
	"chachalaca": ("gaia/fauna_rabbit", "Plain Chachalaca", "Ortalis vetula", 4, 40, None),
	"guan_crested": ("gaia/fauna_rabbit", "Crested Guan", "Penelope purpurascens", 5, 60, None),
	"curassow": ("gaia/fauna_rabbit", "Great Curassow", "Crax rubra", 6, 80, None),
	"curassow_female": ("gaia/fauna_rabbit", "Great Curassow Hen", "Crax rubra", 6, 80, None),
	"tinamou": ("gaia/fauna_rabbit", "Great Tinamou", "Tinamus major", 4, 40, None),
	"deer_red": ("gaia/fauna_deer", "Red Deer Stag", "Cervus elaphus", 30, 150, None),
	"deer_red_female": ("gaia/fauna_deer", "Red Deer Hind", "Cervus elaphus", 25, 100, None),
	"deer_fallow": ("gaia/fauna_deer", "Fallow Deer Buck", "Dama dama", 20, 100, None),
	"deer_fallow_female": ("gaia/fauna_deer", "Fallow Deer Doe", "Dama dama", 18, 80, None),
	"deer_roe": ("gaia/fauna_deer", "Roe Deer Buck", "Capreolus capreolus", 12, 60, None),
	"deer_roe_female": ("gaia/fauna_deer", "Roe Deer Doe", "Capreolus capreolus", 10, 50, None),
	"aurochs": ("gaia/fauna_boar", "Aurochs Bull", "Bos primigenius", 150, 400, 20),
	"aurochs_female": ("gaia/fauna_boar", "Aurochs Cow", "Bos primigenius", 120, 350, 15),
	"bison": ("gaia/fauna_boar", "European Bison Bull", "Bison bonasus", 160, 400, 20),
	"bison_female": ("gaia/fauna_boar", "European Bison Cow", "Bison bonasus", 130, 350, 15),
	"horse_sorraia": ("gaia/fauna_horse", "Sorraia Horse", "Equus ferus caballus", None, None, None),
	"badger": ("gaia/fauna_fox_red", "European Badger", "Meles meles", 15, None, 3),
	# The mallard template is kept by hand: it also floats and may cross water (see gaia/fauna_mallard.xml).
	"mallard": ("gaia/fauna_rabbit", "Mallard", "Anas platyrhynchos", 4, 40, None),
	"dolphin": ("gaia/fauna_shark", "Bottlenose Dolphin", "Tursiops truncatus", 80, None, None),
	"orca": ("gaia/fauna_shark", "Orca", "Orcinus orca", 200, None, None),
	"shark_hammerhead": ("gaia/fauna_shark", "Scalloped Hammerhead", "Sphyrna lewini", 120, None, None),
	"shark_bull": ("gaia/fauna_shark", "Bull Shark", "Carcharhinus leucas", 120, None, None),
}


def mesh_size(actor):
	"""Width, length and height of the actor's mesh."""
	with open(os.path.join(MOD, "art", "meshes", "skeletal", "fauna", actor + ".pmd"), "rb") as f:
		data = f.read()
	count, uv_sets = struct.unpack_from("<II", data, 12)
	stride = 24 + 8 * uv_sets + 20
	raw = np.frombuffer(data, dtype=np.uint8, count=count * stride, offset=20).reshape(count, stride)
	positions = raw[:, :12].copy().view("<f4").reshape(-1, 3)
	return 2 * np.abs(positions[:, 0]).max(), np.ptp(positions[:, 2]), positions[:, 1].max()


def block(tag, body):
	return "  <%s>\n%s\n  </%s>\n" % (tag, body, tag)


def main():
	written = 0
	for actor, (parent, generic, specific, health, food, hack) in ANIMALS.items():
		path = os.path.join(MOD, "simulation", "templates", "gaia", "fauna_%s.xml" % actor)
		if os.path.exists(path) or not os.path.exists(os.path.join(MOD, "art", "actors", "fauna", actor + ".xml")):
			print("skipped", actor)
			continue
		width, length, height = mesh_size(actor)
		text = '<?xml version="1.0" encoding="utf-8"?>\n<Entity parent="%s">\n' % parent
		if hack is not None:
			text += block("Attack", "    <Melee>\n      <Damage>\n        <Hack>%g</Hack>\n      </Damage>\n    </Melee>" % hack)
		text += block("Footprint", '    <Square width="%.1f" depth="%.1f"/>\n    <Height>%.1f</Height>' % (
			max(0.8, width + 0.3), max(1.0, 0.85 * length), max(0.5, height)))
		if health is not None:
			text += block("Health", "    <Max>%d</Max>" % health)
		text += block("Identity", "    <GenericName>%s</GenericName>\n    <SpecificName>%s</SpecificName>" % (generic, specific))
		if food is not None:
			text += block("ResourceSupply", "    <Max>%d</Max>" % food)
		text += block("StatusBars", "    <HeightOffset>%.1f</HeightOffset>" % (max(0.5, height) + 1.0))
		text += block("VisualActor", "    <Actor>fauna/%s.xml</Actor>" % actor)
		with open(path, "w", encoding="utf-8") as f:
			f.write(text + "</Entity>\n")
		written += 1
	print(written, "templates written")


if __name__ == "__main__":
	main()
