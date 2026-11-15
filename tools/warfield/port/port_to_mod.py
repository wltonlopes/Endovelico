#!/usr/bin/env python3
"""
Leva o Total Warfield para outro mod que já tem a campanha "grand_strategy"
(o Endovelico): campanha nova (exércitos, batalhas, cercos, conquista,
estandartes, mapa em blocos, animações), batalhões, batalha de campo,
interface da sessão e as ferramentas.

O que é do mod de destino fica como está: tribos, heróis (dados e
retratos), tipos de mapa, contornos das províncias (provinces.geojson),
o botão "Grand Strategy" do menu e o modo de batalha próprio dele.

Caminhos "campaigns/grand_strategy" viram "campaigns/grand_strategy"; a
pasta de dados da simulação continua "simulation/data/total_warfield".
As ferramentas vão para tools/warfield/ (um nível abaixo).

Depois de copiar, gere os batalhões das civs do destino:
    python3 <destino>/tools/warfield/gen_battalions.py

Uso: python3 tools/port/port_to_mod.py ../Endovelico [--dry-run]
Pode ser rodado de novo a qualquer momento para atualizar o destino.
"""
import argparse
import os
import re
import shutil

SRC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
TEXT = (".js", ".xml", ".json", ".py", ".sh", ".md", ".txt")

# Origem -> destino (relativos às pastas dos mods); "mirror" apaga no
# destino o que não existe mais na origem.
TREES = [
	("gui/campaigns/grand_strategy", "gui/campaigns/grand_strategy", True),
	("art/textures/ui/campaigns/grand_strategy/map", "art/textures/ui/campaigns/grand_strategy/map", True),
	("art/textures/ui/campaigns/grand_strategy/general", "art/textures/ui/campaigns/grand_strategy/general", True),
	("art/textures/ui/campaigns/grand_strategy/fx", "art/textures/ui/campaigns/grand_strategy/fx", True),
	("art/textures/ui/campaigns/grand_strategy/provinces", "art/textures/ui/campaigns/grand_strategy/provinces", True),
	("tools/map", "tools/warfield/map", False),
	("tools/art", "tools/warfield/art", False),
	("tools/test", "tools/warfield/test", False),
]
FILES = [
	# campanha: dados que não são do destino
	("campaigns/grand_strategy/data/province_buildings.json", "campaigns/grand_strategy/data/province_buildings.json"),
	("campaigns/grand_strategy/data/civ_fallback.json", "campaigns/grand_strategy/data/civ_fallback.json"),
	("campaigns/grand_strategy/data/map_tiles.json", "campaigns/grand_strategy/data/map_tiles.json"),
	("campaigns/grand_strategy/data/technologies.json", "campaigns/grand_strategy/data/technologies.json"),
	# simulação: batalhões
	("simulation/components/BattalionLeader.js", None),
	("simulation/components/BattalionMember.js", None),
	("simulation/components/BattalionTactics.js", None),
	("simulation/components/ZZ_TWDagger.js", None),
	("simulation/components/ZZ_TWStealth.js", None),
	("simulation/components/ZZ_TWGuiInterface.js", None),
	("simulation/components/ZZ_TWPromotion.js", None),
	("simulation/components/interfaces/TWBattalion.js", None),
	("simulation/helpers/TWBattalion.js", None),
	("simulation/helpers/ZZ_TWCommands.js", None),
	# batalha de campo
	("maps/random/tw_battlefield.js", None),
	("maps/random/tw_battlefield.json", None),
	("maps/scripts/TWFieldBattle.js", None),
	("maps/scripts/TWNavalBattle.js", None),
	("maps/random/tw_naval.js", None),
	("maps/random/tw_naval.json", None),
	("gamesettings/attributes/TotalWarfield.js", None),
	("gui/session/tw_battalion_selection.js", None),
	("gui/session/tw_battalion_tactics.js", None),
	("gui/session/tw_battle_status.js", None),
	# ferramentas
	("tools/gen_battalions.py", "tools/warfield/gen_battalions.py"),
	("tools/tw_templates.py", "tools/warfield/tw_templates.py"),
	("tools/port/port_to_mod.py", "tools/warfield/port/port_to_mod.py"),
	("README.md", "tools/warfield/README_total_warfield.md"),
]
# Gerados por mod (tools/warfield/art/gen_army_sprites.py no destino, com
# as civs e a arte dele): nem copiados nem apagados. A pasta dos sprites
# (art/.../army) e o army_sprites.json também ficam fora (TREES e FILES).
KEEP = {"army_sprites.xml"}

# Mixins dos batalhões (todos os tw_*.xml).
MIXINS = "simulation/templates/mixins"

# Textos da campanha que mudam de nome no destino.
RENAMES = [
	("campaigns/grand_strategy", "campaigns/grand_strategy"),
	('caption = "Grand Strategy";', 'caption = "Grand Strategy";'),
	("Welcome to Grand Strategy.", "Welcome to Grand Strategy."),
]


def tools_one_level_deeper(rel, text):
	"""Ferramentas em tools/warfield/: um diretório a mais até a raiz do mod."""
	if not rel.startswith("tools/warfield/"):
		return text
	text = text.replace('MOD = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))', 'MOD = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))')
	text = text.replace('os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")',
		'os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")')
	text = text.replace('MOD = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))',
		'MOD = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))')
	text = text.replace('MOD_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))',
		'MOD_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))')
	text = text.replace('os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..",\n',
		'os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..",\n')
	text = text.replace('"tools", "warfield", "generated_manifest.json"', '"tools", "warfield", "generated_manifest.json"')
	text = text.replace('"tools", "warfield", "map", "source"', '"tools", "warfield", "map", "source"')
	text = text.replace('$(dirname "$0")/../../..', '$(dirname "$0")/../../../..')
	text = text.replace('$MOD/tools/warfield/test/', '$MOD/tools/warfield/test/')
	return text


def convert(rel_dest, data):
	if not rel_dest.endswith(TEXT):
		return data
	text = data.decode("utf-8")
	for old, new in RENAMES:
		text = text.replace(old, new)
	text = tools_one_level_deeper(rel_dest, text)
	return text.encode("utf-8")


class Copier:
	def __init__(self, dest, dry_run):
		self.dest = dest
		self.dry_run = dry_run
		self.written = 0
		self.same = 0
		self.removed = 0

	def copy(self, rel_src, rel_dest):
		with open(os.path.join(SRC, rel_src), "rb") as handle:
			data = convert(rel_dest, handle.read())
		target = os.path.join(self.dest, rel_dest)
		if os.path.exists(target):
			with open(target, "rb") as handle:
				if handle.read() == data:
					self.same += 1
					return
		self.written += 1
		if self.dry_run:
			print("  copiaria", rel_dest)
			return
		os.makedirs(os.path.dirname(target), exist_ok=True)
		with open(target, "wb") as handle:
			handle.write(data)
		shutil.copymode(os.path.join(SRC, rel_src), target)

	def tree(self, rel_src, rel_dest, mirror):
		base = os.path.join(SRC, rel_src)
		seen = set()
		for root, dirs, files in os.walk(base):
			dirs[:] = [d for d in dirs if d != "__pycache__"]
			for name in files:
				rel = os.path.relpath(os.path.join(root, name), base)
				seen.add(rel)
				if name in KEEP:
					continue
				self.copy(os.path.join(rel_src, rel), os.path.join(rel_dest, rel))
		if not mirror:
			return
		dest_base = os.path.join(self.dest, rel_dest)
		for root, dirs, files in os.walk(dest_base):
			for name in files:
				rel = os.path.relpath(os.path.join(root, name), dest_base)
				if rel not in seen and name not in KEEP:
					self.removed += 1
					print("  remove (não existe mais na origem):", os.path.join(rel_dest, rel))
					if not self.dry_run:
						os.remove(os.path.join(root, name))


def main():
	parser = argparse.ArgumentParser()
	parser.add_argument("dest", help="pasta do mod de destino (ex.: ../Endovelico)")
	parser.add_argument("--dry-run", action="store_true")
	args = parser.parse_args()
	dest = os.path.abspath(args.dest)
	if not os.path.exists(os.path.join(dest, "gui/campaigns/grand_strategy")):
		raise SystemExit("O destino não tem gui/campaigns/grand_strategy: " + dest)

	copier = Copier(dest, args.dry_run)
	for rel_src, rel_dest, mirror in TREES:
		copier.tree(rel_src, rel_dest, mirror)
	for rel_src, rel_dest in FILES:
		if os.path.exists(os.path.join(SRC, rel_src)):
			copier.copy(rel_src, rel_dest or rel_src)
	for name in sorted(os.listdir(os.path.join(SRC, MIXINS))):
		if name.startswith("tw_"):
			copier.copy(os.path.join(MIXINS, name), os.path.join(MIXINS, name))

	# A arte opaca do mapa agora vem dos blocos; as duas imagens gigantes
	# (uma delas escondida) saem da pasta carregada pelo jogo.
	art = os.path.join(dest, "art/textures/ui/campaigns/grand_strategy/art")
	source = os.path.join(dest, "tools/warfield/map/source")
	for name in ("campaign_map.png", "world_map.png"):
		path = os.path.join(art, name)
		if os.path.exists(path):
			print("  move para tools/warfield/map/source:", name)
			if not args.dry_run:
				os.makedirs(source, exist_ok=True)
				shutil.move(path, os.path.join(source, name))

	print("%d arquivos copiados, %d já iguais, %d removidos%s." % (copier.written, copier.same, copier.removed,
		" (simulação)" if args.dry_run else ""))


if __name__ == "__main__":
	main()
