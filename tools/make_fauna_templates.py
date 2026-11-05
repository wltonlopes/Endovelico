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
	# Imported by import_fauna_transfer.py (skeletons of other animals, fitted to these meshes).
	"ostrich": ("gaia/fauna_gazelle", "Common Ostrich", "Struthio camelus", 40, 200, None),
	"ostrich_female": ("gaia/fauna_gazelle", "Common Ostrich Hen", "Struthio camelus", 35, 180, None),
	"rhea": ("gaia/fauna_gazelle", "Greater Rhea", "Rhea americana", 25, 120, None),
	"partridge": ("gaia/fauna_rabbit", "Red-Legged Partridge", "Alectoris rufa", 3, 30, None),
	"bongo": ("gaia/fauna_gazelle", "Bongo", "Tragelaphus eurycerus", 30, 150, None),
	"oryx": ("gaia/fauna_gazelle", "Gemsbok", "Oryx gazella", 30, 150, None),
	"oryx_arabian": ("gaia/fauna_gazelle", "Arabian Oryx", "Oryx leucoryx", 25, 120, None),
	"saiga": ("gaia/fauna_gazelle", "Saiga Antelope", "Saiga tatarica", 18, 90, None),
	"okapi": ("gaia/fauna_gazelle", "Okapi", "Okapia johnstoni", 35, 180, None),
	"hyena": ("gaia/fauna_wolf", "Spotted Hyena", "Crocuta crocuta", 40, None, 8),
	"buffalo_cape": ("gaia/fauna_boar", "African Buffalo", "Syncerus caffer", 180, 400, 22),
	"cheetah": ("gaia/fauna_jaguar", "Cheetah", "Acinonyx jubatus", 35, None, 12),
	"leopard": ("gaia/fauna_jaguar", "Leopard", "Panthera pardus", 45, None, 18),
	"leopard_snow": ("gaia/fauna_jaguar", "Snow Leopard", "Panthera uncia", 40, None, 15),
	"tapir_lowland": ("gaia/fauna_deer", "South American Tapir", "Tapirus terrestris", 60, 250, None),
	"tapir_malayan": ("gaia/fauna_deer", "Malayan Tapir", "Tapirus indicus", 70, 300, None),
	"gorilla": ("gaia/fauna_boar", "Western Gorilla", "Gorilla gorilla", 150, 300, 20),
	"chimpanzee": ("gaia/fauna_boar", "Chimpanzee", "Pan troglodytes", 50, 150, 8),
	"seal_harbor": ("gaia/fauna_walrus", "Harbor Seal", "Phoca vitulina", 40, 200, 5),
	# The walrus overrides the vanilla template of the same path: it must not use itself as parent.
	"walrus": ("template_unit_fauna_hunt_passive-defensive", "Walrus", "Odobenus rosmarus", 120, 300, 15),
	# Lusitania catalog (import_fauna_catalog.py and import_fauna_transfer.py).
	"goat_lusitanian": ("gaia/fauna_deer", "Portuguese Ibex", "Capra pyrenaica lusitanica", 30, 120, None),
	"goat_lusitanian_female": ("gaia/fauna_deer", "Portuguese Ibex Nanny", "Capra pyrenaica lusitanica", 25, 100, None),
	"donkey_iberian": ("gaia/fauna_donkey", "Iberian Donkey", "Equus asinus", None, None, None),
	"wild_ass_european": ("gaia/fauna_zebra", "Zebro", "Equus hydruntinus", 60, 200, None),
	"wolf_iberian": ("gaia/fauna_wolf", "Iberian Wolf", "Canis lupus signatus", None, None, None),
	"bear_cantabrian": ("gaia/fauna_bear_brown", "Cantabrian Brown Bear", "Ursus arctos pyrenaicus", None, None, None),
	"bear_cantabrian_cub": ("gaia/fauna_bear_brown", "Brown Bear Cub", "Ursus arctos pyrenaicus", 60, 150, 6),
	"boar_iberian": ("gaia/fauna_boar", "Iberian Wild Boar", "Sus scrofa castilianus", None, None, None),
	"boar_iberian_piglet": ("gaia/fauna_boar", "Wild Boar Piglet", "Sus scrofa castilianus", 15, 50, 2),
	"lynx_iberian": ("gaia/fauna_fox_red", "Iberian Lynx", "Lynx pardinus", 30, None, 8),
	"wildcat_european": ("gaia/fauna_fox_red", "European Wildcat", "Felis silvestris", 15, None, 4),
	"fox_red_iberian": ("gaia/fauna_fox_red", "Iberian Red Fox", "Vulpes vulpes silacea", None, None, None),
	"beaver_eurasian": ("gaia/fauna_rabbit", "Eurasian Beaver", "Castor fiber", 15, 80, None),
	"marmot_alpine": ("gaia/fauna_rabbit", "Alpine Marmot", "Marmota marmota", 8, 50, None),
	"polecat_european": ("gaia/fauna_fox_red", "European Polecat", "Mustela putorius", 8, None, 2),
	"weasel_least": ("gaia/fauna_fox_red", "Least Weasel", "Mustela nivalis", 4, None, 1),
	"hedgehog_european": ("gaia/fauna_rabbit", "European Hedgehog", "Erinaceus europaeus", 3, 10, None),
	"mouse_wood": ("gaia/fauna_rabbit", "Wood Mouse", "Apodemus sylvaticus", 1, 5, None),
	"hare_iberian": ("gaia/fauna_rabbit", "Iberian Hare", "Lepus granatensis", 6, 60, None),
	"rabbit_european": ("gaia/fauna_rabbit", "European Rabbit", "Oryctolagus cuniculus", None, None, None),
	"lizard_ocellated": ("gaia/fauna_rabbit", "Ocellated Lizard", "Timon lepidus", 3, 15, None),
	"frog_iberian": ("gaia/fauna_rabbit", "Iberian Frog", "Rana iberica", 1, 5, None),
	"frog_perez": ("gaia/fauna_rabbit", "Perez's Frog", "Pelophylax perezi", 1, 5, None),
	"turtle_spanish_pond": ("gaia/fauna_rabbit", "Spanish Pond Turtle", "Mauremys leprosa", 5, 20, None),
	"snake_montpellier": ("gaia/fauna_fox_red", "Montpellier Snake", "Malpolon monspessulanus", 6, None, 2),
	"rooster_iberian": ("gaia/fauna_chicken", "Iberian Rooster", "Gallus gallus domesticus", None, None, None),
	"hen_iberian": ("gaia/fauna_chicken", "Iberian Hen", "Gallus gallus domesticus", None, None, None),
	"capercaillie": ("gaia/fauna_rabbit", "Western Capercaillie", "Tetrao urogallus", 6, 60, None),
	"capercaillie_female": ("gaia/fauna_rabbit", "Western Capercaillie Hen", "Tetrao urogallus", 5, 50, None),
	"stork_white": ("gaia/fauna_rabbit", "White Stork", "Ciconia ciconia", 8, 60, None),
	"flamingo_greater": ("gaia/fauna_rabbit", "Greater Flamingo", "Phoenicopterus roseus", 8, 60, None),
	"egret_little": ("gaia/fauna_rabbit", "Little Egret", "Egretta garzetta", 5, 40, None),
	"heron_gray": ("gaia/fauna_rabbit", "Gray Heron", "Ardea cinerea", 6, 50, None),
	# Water birds float and cross water like the mallard.
	"goose_greylag": ("gaia/fauna_mallard", "Greylag Goose", "Anser anser", 6, 60, None),
	"mallard_02": ("gaia/fauna_mallard", "Mallard", "Anas platyrhynchos", None, None, None),
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
		identity = "    <GenericName>%s</GenericName>\n    <SpecificName>%s</SpecificName>" % (generic, specific)
		# Portraits rendered from the mesh (tools/render_fauna_icons.py).
		if os.path.exists(os.path.join(MOD, "art", "textures", "ui", "session", "portraits", "gaia", "fauna_%s.png" % actor)):
			identity += "\n    <Icon>gaia/fauna_%s.png</Icon>" % actor
		text += block("Identity", identity)
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
