#!/usr/bin/env python3
"""
Gera os batalhões do Total Warfield a partir das unidades das civilizações.

Para cada civ (simulation/data/civs/*.json dos mods lidos):
  - junta as unidades militares treinadas pelas construções da civ
    (Trainer/Entities, com {civ} trocado), sem heróis, navios, cerco,
    civis e animais; das patentes _b/_a/_e fica só a básica;
  - escreve simulation/templates/units/<civ>/tw/<unidade>.xml (líder do
    batalhão) e .../tw/m_<unidade>.xml (soldado);
  - escreve simulation/data/total_warfield/rosters/<civ>.json com o que a
    campanha precisa: categoria, tamanho, custo em ouro, manutenção,
    construção e nível de assentamento exigidos, estatísticas para a
    resolução automática e os heróis (generais) da civ.

Arquivos editados à mão depois de gerados não são sobrescritos (ficam
listados no fim como "mantidos"); use --force para regenerar tudo.

Uso:
    python3 tools/gen_battalions.py                 # civs do public
    python3 tools/gen_battalions.py --mod ../Endovelico --civs tupi,lusi
"""

import argparse
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tw_templates import TemplateLoader, find_public_zip  # noqa: E402

MOD_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MANIFEST = os.path.join(MOD_DIR, "tools", "warfield", "generated_manifest.json")

# Tamanho do batalhão (contando o líder), mixin e espaçamento por categoria.
CATEGORIES = {
    "infantry_melee":   {"size": 24, "columns": 8, "spacing": 2.2, "mixin": "tw_battalion_leader_infantry"},
    "infantry_ranged":  {"size": 20, "columns": 10, "spacing": 2.6, "mixin": "tw_battalion_leader_infantry"},
    "cavalry_melee":    {"size": 12, "columns": 6, "spacing": 3.6, "mixin": "tw_battalion_leader_cavalry"},
    "cavalry_ranged":   {"size": 12, "columns": 6, "spacing": 4.0, "mixin": "tw_battalion_leader_cavalry"},
    "champion_infantry": {"size": 16, "columns": 8, "spacing": 2.4, "mixin": "tw_battalion_leader_infantry"},
    "champion_cavalry": {"size": 10, "columns": 5, "spacing": 3.8, "mixin": "tw_battalion_leader_cavalry"},
    "chariot":          {"size": 6, "columns": 3, "spacing": 6.0, "mixin": "tw_battalion_leader_cavalry"},
    "elephant":         {"size": 4, "columns": 4, "spacing": 8.0, "mixin": "tw_battalion_leader_cavalry"},
    # Máquinas de cerco: não viram batalhão; cada "batalhão" são N máquinas
    # avulsas na batalha (maps/scripts/TWFieldBattle.js).
    "siege":            {"size": 2, "columns": 2, "spacing": 10.0, "mixin": None},
}

# Esquadras: cada "batalhão" naval são N navios do mesmo tipo, avulsos na
# batalha naval (maps/scripts/TWNavalBattle.js). Navios de guerra e o
# mercante (transporte). Barcos de pesca ficam de fora.
SQUADRON_SIZE = {"warship": 3, "transport": 2}
SHIP_ROLES = [("Fireship", "fire"), ("NavalSiege", "siege"), ("NavalRam", "ram"), ("ArrowShip", "arrow"),
              ("ScoutShip", "scout"), ("Warship", "warship"), ("Trader", "transport")]
SHIP_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por tools/gen_battalions.py: navio de esquadra a partir de {base}. -->
<Entity parent="tw_ship|{base}"/>
"""

# Construção da campanha que libera cada estrutura do jogo. As que não
# estão aqui (templos especiais, ginásios...) liberam campeões: "fortress".
STRUCTURE_TO_BUILDING = {
    "civil_centre": "none",
    "military_colony": "none",
    "encampment": "none",
    "encampment_fortified": "none",
    "barracks": "barracks",
    "army_camp": "barracks",
    "range": "range",
    "stable": "stable",
    "elephant_stable": "elephant_stable",
    "fortress": "fortress",
    "arsenal": "siege_workshop",
    # Mercenários: contratados no mercado da província.
    "embassy": "market",
    "embassy_celtic": "market",
    "embassy_iberian": "market",
    "embassy_italic": "market",
}
BUILDING_PRIORITY = ["none", "barracks", "range", "stable", "market", "siege_workshop", "elephant_stable", "fortress"]

# Nível de assentamento (village < town < city) pelas exigências do template.
LEVEL_BY_TECH = {"phase_town": "town", "phase_city": "city"}
LEVELS = ["village", "town", "city"]

RANK_SUFFIX = re.compile(r"_(b|a|e)$")
# Classes de infantaria de choque (fazem carga) e de lanceiros (seguram carga).
SHOCK_CLASSES = {"Swordsman", "Axeman", "Maceman", "Clubman"}
BRACE_CLASSES = {"Spearman", "Pikeman"}


def unit_classes(t):
    return set(t.tokens("Identity/Classes")) | set(t.tokens("Identity/VisibleClasses"))


def categorize(t):
    cls = unit_classes(t)
    if "Siege" in cls:
        # Aríetes, catapultas, balistas e torres (navios ficam de fora antes).
        return "siege"
    if "Elephant" in cls:
        return "elephant"
    if "Chariot" in cls or "chariot" in t.text("Identity/GenericName").lower():
        return "chariot"
    champion = "Champion" in cls
    if "Cavalry" in cls:
        if champion:
            return "champion_cavalry"
        return "cavalry_ranged" if "Ranged" in cls else "cavalry_melee"
    if "Infantry" in cls:
        if champion:
            return "champion_infantry"
        return "infantry_ranged" if "Ranged" in cls else "infantry_melee"
    return None


def attack_stats(t):
    """Dano por segundo corpo a corpo e à distância (soma hack/pierce/crush)."""
    result = {"melee": 0.0, "ranged": 0.0, "range": 0.0}
    for kind in ("Melee", "Ranged"):
        node = t.child("Attack/" + kind)
        if node is None:
            continue
        damage = sum(t.number("Attack/%s/Damage/%s" % (kind, d)) for d in ("Hack", "Pierce", "Crush"))
        repeat = max(1.0, t.number("Attack/%s/RepeatTime" % kind, 1000.0)) / 1000.0
        result[kind.lower()] = round(damage / repeat, 2)
        if kind == "Ranged":
            result["range"] = t.number("Attack/Ranged/MaxRange")
    return result


def armor(t):
    values = [t.number("Resistance/Entity/Damage/" + d) for d in ("Hack", "Pierce")]
    return round(sum(values) / len(values), 1)


def required_level(t):
    level = "village"
    for tech in t.tokens("Identity/Requirements/Techs") + t.tokens("Identity/RequiredTechnology"):
        candidate = LEVEL_BY_TECH.get(tech)
        if candidate is None and tech:
            candidate = "city" if tech.startswith("unlock_champion") else "town"
        if candidate and LEVELS.index(candidate) > LEVELS.index(level):
            level = candidate
    return level


def collect_trainable(loader, civ):
    """{template: [estruturas]} das unidades que a civ treina."""
    trainable = {}
    for path in loader.list_files("simulation/templates/structures/%s/" % civ, ".xml"):
        name = path[len("simulation/templates/"):-4]
        t = loader.get(name)
        if t is None:
            continue
        structure = name.split("/")[-1]
        for ent in t.tokens("Trainer/Entities"):
            ent = ent.replace("{civ}", civ).replace("{native}", civ)
            if loader.exists(ent):
                trainable.setdefault(ent, set()).add(structure)
    return trainable


def campaign_building(structures, category):
    buildings = [STRUCTURE_TO_BUILDING.get(s, "fortress") for s in structures]
    buildings.sort(key=BUILDING_PRIORITY.index)
    return buildings[0]


# Formações culturais (além de normal, linha, coluna e aberta, que todos têm).
GREEK_PHALANX = {"athen", "spart", "mace", "sele", "ptol", "epir", "syrac", "bosp", "cyre", "bactr", "cart", "cartemp", "achae", "hasmo"}
HELLENISTIC_PIKES = {"mace", "sele", "ptol", "epir", "bactr", "bosp"}
SHIELD_WALL = {"germ", "sueb", "brit", "gaul", "daci"}
CHINESE = {"han", "gojo", "miny"}


def cultural_formations(civ, category, cls):
    """Formações extras do batalhão pela civ e pelo tipo de soldado."""
    melee_infantry = category in ("infantry_melee", "champion_infantry") and "Ranged" not in cls
    out = []
    if category in ("cavalry_melee", "champion_cavalry"):
        out.append("wedge")
        if civ in CHINESE:
            out.append("crane_wing")
    if melee_infantry and civ in GREEK_PHALANX and cls & {"Spearman", "Pikeman"}:
        out.append("phalanx")
    if melee_infantry and civ in HELLENISTIC_PIKES and "Pikeman" in cls:
        out.append("syntagma")
    if melee_infantry and civ == "rome" and "Swordsman" in cls:
        out.append("testudo")
    if melee_infantry and civ in SHIELD_WALL:
        out.append("shield_wall")
    if melee_infantry and civ in CHINESE:
        out.append("fish_scale")
    if category == "infantry_ranged" and civ in CHINESE or category == "champion_infantry" and "Ranged" in cls and civ in CHINESE:
        out.append("volley_ranks")
    return out


# Acompanhantes de batalhão (melhoramentos comprados na campanha).
ATTACHMENTS = {
    "priest": {"name": "Priest", "cost": 80, "upkeep": 4},
    "high_priest": {"name": "High Priest", "cost": 160, "upkeep": 8},
    "musician": {"name": "War Musician", "cost": 100, "upkeep": 5},
    "standard": {"name": "Standard Bearer", "cost": 90, "upkeep": 4},
}
MUSICIAN_WORDS = ("trumpet", "carnyx", "horn", "drum", "musician", "piper")
STANDARD_WORDS = ("standard bearer", "standard-bearer", "signifer", "aquilifer", "vexillarius", "draconarius", "banner bearer")


def find_attachments(loader, civ):
    """Unidades da civ que servem de acompanhante: {tipo: template}."""
    found = {}
    for path in loader.list_files("simulation/templates/units/%s/" % civ, ".xml"):
        name = path[len("simulation/templates/"):-4]
        if "/tw/" in name:
            continue
        t = loader.get(name)
        if t is None:
            continue
        cls = unit_classes(t)
        if "Hero" in cls:
            continue
        text = (t.text("Identity/GenericName") + " " + t.text("Identity/SpecificName") + " " + name).lower()
        if "Healer" in cls:
            kind = "high_priest" if "Champion" in cls or "champion" in name else "priest"
        elif any(word in text for word in MUSICIAN_WORDS):
            kind = "musician"
        elif any(word in text for word in STANDARD_WORDS):
            kind = "standard"
        else:
            continue
        # Patente básica primeiro (_b), depois a mais baixa existente.
        key = RANK_SUFFIX.sub("", name.split("/")[-1])
        rank = "bae".find(name[-1]) if RANK_SUFFIX.search(name) else -1
        best = found.get(kind)
        if best is None or (best[1] > rank >= 0) or (best[1] < 0 <= rank):
            found[kind] = (name, rank, t, key)
    return found


def file_hash(path):
    with open(path, "rb") as handle:
        return hashlib.sha1(handle.read()).hexdigest()


class Writer:
    """Escreve arquivos gerados sem pisar em edições feitas à mão."""

    def __init__(self, force):
        self.force = force
        self.manifest = {}
        if os.path.exists(MANIFEST):
            with open(MANIFEST) as handle:
                self.manifest = json.load(handle)
        self.kept = []
        self.written = 0

    def write(self, rel, content):
        path = os.path.join(MOD_DIR, rel)
        if os.path.exists(path) and not self.force:
            known = self.manifest.get(rel)
            if known is None or known != file_hash(path):
                with open(path, encoding="utf-8") as handle:
                    if handle.read() != content:
                        self.kept.append(rel)
                        return
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)
        self.manifest[rel] = file_hash(path)
        self.written += 1

    def save(self):
        with open(MANIFEST, "w") as handle:
            json.dump(self.manifest, handle, indent=1, sort_keys=True)


LEADER_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por tools/gen_battalions.py: líder do batalhão de {base}. -->
<Entity parent="{dagger}{mixin}|tw_battalion_leader|{base}">
  <BattalionLeader>
    <Size>{size}</Size>
    <Columns>{columns}</Columns>
    <Spacing>{spacing}</Spacing>
    <MemberTemplate>{member}</MemberTemplate>
    <Category>{category}</Category>
  </BattalionLeader>
  <BattalionTactics>
    <Formations datatype="tokens">{formations}</Formations>
  </BattalionTactics>
  <Identity>
    <SelectionGroupName>{leader}</SelectionGroupName>
  </Identity>
</Entity>
"""

MEMBER_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por tools/gen_battalions.py: soldado do batalhão de {base}. -->
<Entity parent="{dagger}tw_battalion_member|{base}">
  <Identity>
    <SelectionGroupName>{leader}</SelectionGroupName>
  </Identity>
</Entity>
"""


ATTACHMENT_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- Gerado por tools/gen_battalions.py: acompanhante de batalhão ({kind}) a partir de {base}. -->
<Entity parent="tw_battalion_attachment|{base}">
  <Identity>
    <Classes datatype="tokens">TWAttachment_{kind}</Classes>
  </Identity>
</Entity>
"""


def generate_civ(loader, civ, writer):
    trainable = collect_trainable(loader, civ)
    units = {}
    ships = {}
    heroes = []
    for template, structures in sorted(trainable.items()):
        t = loader.get(template)
        if t is None:
            continue
        cls = unit_classes(t)
        if "Hero" in cls:
            heroes.append({
                "template": template,
                "name": t.text("Identity/SpecificName") or t.text("Identity/GenericName"),
                "icon": t.text("Identity/Icon"),
                "cavalry": "Cavalry" in cls
            })
            continue
        if "Ship" in cls:
            if "Warship" in cls or "Trader" in cls:
                ships[template.split("/")[-1]] = (template, t, cls)
            continue
        if "Siege" in cls and "Ship" not in cls:
            pass
        elif "Soldier" not in cls or cls & {"Ship", "Siege", "Support", "Healer"}:
            continue
        category = categorize(t)
        if category is None:
            continue
        # Uma entrada por unidade (sem a patente): fica a patente mais baixa
        # treinada (_b antes de _a antes de _e), com todas as estruturas.
        key = template.split("/")[-1]
        unit_key = RANK_SUFFIX.sub("", key).replace("_packed", "")
        rank = "bae".find(key[-1]) if unit_key != key else -1
        previous = units.get(unit_key)
        if previous:
            structures = structures | previous[3]
            if previous[4] <= rank:
                units[unit_key] = previous[:3] + (structures, previous[4])
                continue
        units[unit_key] = (template, t, category, structures, rank)

    roster = {"civ": civ, "units": [], "heroes": heroes}
    for unit_key, (template, t, category, structures, _rank) in sorted(units.items()):
        spec = CATEGORIES[category]
        size = spec["size"]
        if category == "siege":
            resources = sum(max(0.0, t.number("Cost/Resources/" + r)) for r in ("food", "wood", "stone", "metal"))
            gold = int(round(resources * size / 8.0 / 10.0) * 10)
            attack = attack_stats(t)
            roster["units"].append({
                "key": unit_key,
                "template": template,
                "siege": True,
                "ram": "Ram" in unit_classes(t) or "ram" in unit_key,
                "baseTemplate": template,
                "name": t.text("Identity/GenericName"),
                "specificName": t.text("Identity/SpecificName"),
                "icon": t.text("Identity/Icon"),
                "category": "siege",
                "size": 1 if "tower" in unit_key else size,
                "cost": max(120, gold),
                "upkeep": max(10, int(round(gold * 0.06))),
                "building": "siege_workshop",
                "level": "town",
                "stats": {
                    "hp": t.number("Health/Max"),
                    "armor": armor(t),
                    "melee": attack["melee"],
                    "ranged": attack["ranged"],
                    "range": attack["range"],
                    "speed": t.number("UnitMotion/WalkSpeed"),
                },
            })
            continue
        leader = "units/%s/tw/%s" % (civ, unit_key)
        member = "units/%s/tw/m_%s" % (civ, unit_key)
        # Atiradores a pé (inclusive campeões) lutam de faca quando alcançados.
        attack_types = set(t.child("Attack").children) if t.has("Attack") else set()
        cls = unit_classes(t)
        dagger = "tw_dagger|" if "Infantry" in cls and "Ranged" in attack_types and "Melee" not in attack_types else ""
        # Carga: cavalaria de choque, elefantes e infantaria pesada de choque
        # (campeões corpo a corpo, espadachins, machadeiros, maceiros).
        # Lanceiros e piqueiros seguram a carga de frente.
        melee_only = "Melee" in attack_types and "Ranged" not in attack_types
        if category in ("cavalry_melee", "champion_cavalry", "elephant") and melee_only:
            dagger += "tw_charge_cavalry|"
        elif category in ("champion_infantry", "infantry_melee") and melee_only and (category == "champion_infantry" and not cls & BRACE_CLASSES or cls & SHOCK_CLASSES):
            dagger += "tw_charge_infantry|"
        if "Infantry" in cls and cls & BRACE_CLASSES:
            dagger += "tw_brace|"
        # Tropas leves (atiradores a pé) se ocultam paradas em bosque ou no alto.
        # Também guerrilheiros e escaramuçadores de elite pelo nome do modelo.
        if category == "infantry_ranged" or "Infantry" in cls and any(k in unit_key.lower() for k in ("guerril", "skirmish", "ambush", "scout")):
            dagger += "tw_stealth|"
        # Resistência extra (batalhas mais longas), em líder e soldados.
        dagger += "tw_tough_cavalry|" if spec["mixin"] == "tw_battalion_leader_cavalry" else "tw_tough_infantry|"
        formations = cultural_formations(civ, category, cls)
        writer.write("simulation/templates/%s.xml" % leader, LEADER_XML.format(
            base=template, mixin=spec["mixin"], dagger=dagger, formations=" ".join(formations), size=size, columns=spec["columns"],
            spacing=spec["spacing"], member=member, category=category, leader=leader))
        writer.write("simulation/templates/%s.xml" % member, MEMBER_XML.format(
            base=template, leader=leader, dagger=dagger.replace("tw_charge_cavalry|", "").replace("tw_charge_infantry|", "")))

        resources = sum(max(0.0, t.number("Cost/Resources/" + r)) for r in ("food", "wood", "stone", "metal"))
        gold = int(round(resources * size / 12.0 / 10.0) * 10)
        attack = attack_stats(t)
        roster["units"].append({
            "key": unit_key,
            "template": leader,
            "memberTemplate": member,
            "baseTemplate": template,
            "name": t.text("Identity/GenericName"),
            "specificName": t.text("Identity/SpecificName"),
            "icon": t.text("Identity/Icon"),
            "category": category,
            "size": size,
            "charge": "tw_charge" in dagger,
            "brace": "tw_brace" in dagger,
            "stealth": "tw_stealth" in dagger,
            "formations": formations,
            "cost": max(60, gold),
            "upkeep": max(5, int(round(gold * 0.08))),
            "building": campaign_building(structures, category),
            "level": required_level(t),
            "stats": {
                "hp": t.number("Health/Max"),
                "armor": armor(t),
                "melee": attack["melee"],
                "ranged": attack["ranged"],
                "range": attack["range"],
                "speed": t.number("UnitMotion/WalkSpeed"),
            },
        })
    attachments = {}
    for kind, (template, _rank, t, key) in sorted(find_attachments(loader, civ).items()):
        member = "units/%s/tw/att_%s" % (civ, kind)
        writer.write("simulation/templates/%s.xml" % member, ATTACHMENT_XML.format(base=template, kind=kind))
        attachments[kind] = dict(ATTACHMENTS[kind], template=member, baseTemplate=template,
                                 unitName=t.text("Identity/GenericName"), icon=t.text("Identity/Icon"))
    roster["attachments"] = attachments

    # Esquadras (Porto da campanha).
    for key, (template, t, cls) in sorted(ships.items()):
        role = next((r for c, r in SHIP_ROLES if c in cls), "warship")
        transport = role == "transport"
        size = SQUADRON_SIZE["transport" if transport else "warship"]
        resources = sum(max(0.0, t.number("Cost/Resources/" + r)) for r in ("food", "wood", "stone", "metal"))
        gold = int(round(resources * size / 4.0 / 10.0) * 10)
        attack = attack_stats(t) if t.has("Attack") else {"melee": 0, "ranged": 0, "range": 0}
        wrapper = "units/%s/tw/%s" % (civ, key)
        writer.write("simulation/templates/%s.xml" % wrapper, SHIP_XML.format(base=template))
        roster["units"].append({
            "key": key,
            "template": wrapper,
            "baseTemplate": template,
            "naval": True,
            "transport": transport,
            "role": role,
            "name": t.text("Identity/GenericName"),
            "specificName": t.text("Identity/SpecificName"),
            "icon": t.text("Identity/Icon"),
            "category": "ship",
            "size": size,
            "cost": max(100 if transport else 150, gold),
            "upkeep": max(6, int(round(gold * 0.05))),
            "building": "port",
            "level": "city" if role == "siege" else "town",
            "stats": {
                "hp": t.number("Health/Max") * 3,
                "armor": armor(t),
                "melee": attack["melee"],
                "ranged": attack["ranged"],
                "range": attack["range"],
                "speed": t.number("UnitMotion/WalkSpeed"),
                "capacity": t.number("GarrisonHolder/Max"),
            },
        })
    writer.write("simulation/data/total_warfield/rosters/%s.json" % civ,
                 json.dumps(roster, indent="\t", ensure_ascii=False) + "\n")
    return roster


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mod", action="append", default=[], help="pasta de outro mod a ler depois do public")
    parser.add_argument("--civs", default="", help="lista de civs separada por vírgulas (padrão: todas)")
    parser.add_argument("--force", action="store_true", help="sobrescreve também os arquivos editados à mão")
    args = parser.parse_args()

    loader = TemplateLoader([find_public_zip()] + args.mod + [MOD_DIR])
    civs = [p.split("/")[-1][:-5] for p in loader.list_files("simulation/data/civs/", ".json")]
    if args.civs:
        wanted = set(args.civs.split(","))
        civs = [c for c in civs if c in wanted]

    writer = Writer(args.force)
    for civ in civs:
        roster = generate_civ(loader, civ, writer)
        print("%-7s %2d batalhões, %d heróis, acompanhantes: %s" % (civ, len(roster["units"]), len(roster["heroes"]),
                                                               ",".join(roster.get("attachments", {})) or "-"))
    writer.save()
    print("%d arquivos escritos." % writer.written)
    if writer.kept:
        print("Mantidos (editados à mão; --force para regenerar):")
        for rel in writer.kept:
            print("  " + rel)


if __name__ == "__main__":
    main()
