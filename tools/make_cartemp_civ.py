#!/usr/bin/env python3
"""Generate the XML/JSON files for the Carthaginian Empire civ (code: cartemp).

Run after tools/export_cartemp_structures.py (it reads tools/cartemp_export_info.json).

  python3 tools/make_cartemp_civ.py [--public /snap/0ad/749/binaries/data/mods/public/public.zip]

Structures keep the gameplay values of the vanilla Carthaginian templates
(costs, trainers, techs), but with this civ's code, new meshes and footprints.
Units are thin wrappers around the vanilla Carthaginian units, so the new civ is
playable right away and does not touch the vanilla "cart" civ.
"""

import argparse
import copy
import json
import math
import shutil
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

MOD = Path(__file__).resolve().parent.parent
CIV = "cartemp"
ART = "carthaginian_empire"          # folder name used for meshes/actors
INFO = MOD / "tools/cartemp_export_info.json"

TEX_BASE = f"structural/{CIV}/struct.dds"
TEX_SPEC = "structural/kart_struct_spec.png"
TEX_NORM = "structural/kart_struct_norm.png"

# building -> (vanilla template it copies, mesh names, dirt decal, rubble, tweaks)
STRUCTURES = {
    "civil_centre": ("cart/civil_centre", ["civil_centre"], "rubble/rubble_kart_cc"),
    "house": ("cart/house", ["house_a", "house_b", "house_c", "house_d", "house_e"], "rubble/rubble_stone_3x3"),
    "storehouse": ("cart/storehouse", ["storehouse"], "rubble/rubble_stone_3x3"),
    "farmstead": ("cart/farmstead", ["farmstead"], "rubble/rubble_stone_4x2"),
    "corral": ("cart/corral", ["corral"], "rubble/rubble_stone_5x5"),
    "market": ("cart/market", ["market"], "rubble/rubble_stone_5x5"),
    "dock": ("cart/dock", ["dock"], "rubble/rubble_kart_dock"),
    "barracks": ("cart/barracks", ["barracks"], "rubble/rubble_stone_5x5"),
    "stable": ("cart/stable", ["stable"], "rubble/rubble_stone_5x5"),
    "range": ("cart/range", ["range"], "rubble/rubble_stone_5x5"),
    "forge": ("cart/forge", ["forge"], "rubble/rubble_stone_4x4"),
    "arsenal": ("cart/arsenal", ["arsenal"], "rubble/rubble_stone_5x5"),
    "temple": ("cart/temple", ["temple"], "rubble/rubble_stone_6x6"),
    "tophet": ("cart/tophet", ["tophet"], "rubble/rubble_stone_4x6"),
    "embassy": ("cart/embassy", ["embassy"], "rubble/rubble_stone_5x5"),
    "fortress": ("cart/fortress", ["fortress"], "rubble/rubble_stone_6x6"),
    "sentry_tower": ("cart/sentry_tower", ["sentry_tower"], "rubble/rubble_stone_2x2"),
    "defense_tower": ("cart/defense_tower", ["defense_tower"], "rubble/rubble_stone_2x2"),
    "wonder": ("cart/wonder", ["wonder"], "rubble/rubble_stone_6x6"),
    "wall_long": ("cart/wall_long", ["wall_long"], "rubble/rubble_stone_wall_long"),
    "wall_medium": ("cart/wall_medium", ["wall_medium"], "rubble/rubble_stone_wall_medium"),
    "wall_short": ("cart/wall_short", ["wall_short"], "rubble/rubble_stone_wall_short"),
    "wall_tower": ("cart/wall_tower", ["wall_tower"], "rubble/rubble_stone_wall_tower"),
    "wall_gate": ("cart/wall_gate", ["wall_gate"], "rubble/rubble_stone_wall_long"),
    # new buildings with no vanilla Carthaginian template
    "palace": (None, ["palace"], "rubble/rubble_kart_cc"),
    "temple_big": ("cart/temple", ["temple_big"], "rubble/rubble_stone_6x6"),
}
# vanilla templates copied as-is (only the civ changes)
PLAIN_COPIES = ["cart/field", "cart/outpost"]

NAMES = {
    "civil_centre": ("Civic Center", "Merkāz"),
    "house": ("House", "Bet"),
    "storehouse": ("Storehouse", "Bet Ōṣar"),
    "farmstead": ("Farmstead", "Ḥaṣer"),
    "corral": ("Corral", "Repet"),
    "market": ("Market", "Šūq"),
    "dock": ("Military Harbour", "Kōtōn"),
    "barracks": ("Barracks", "Maḥanēt"),
    "stable": ("Stable", "Urwat Sūsīm"),
    "range": ("Range", "Mašʿar"),
    "forge": ("Forge", "Bet Ḥaraš"),
    "arsenal": ("Arsenal", "Bet Nešeq"),
    "temple": ("Temple", "Maqdaš"),
    "tophet": ("Sacrificial Temple", "Tophet"),
    "embassy": ("Mercenary Stoa", "Bet Śakīrīm"),
    "fortress": ("Fortress", "Ḥamet"),
    "sentry_tower": ("Sentry Tower", "Mispeh"),
    "defense_tower": ("Defense Tower", "Migdal"),
    "wonder": ("Temple of Baal Hammon", "Bet Baʿal Ḥammon"),
    "wall_long": ("Long Wall", "Ḥōmah"),
    "wall_medium": ("Medium Wall", "Ḥōmah"),
    "wall_short": ("Short Wall", "Ḥōmah"),
    "wall_tower": ("Wall Tower", "Migdal"),
    "wall_gate": ("City Gate", "Šaʿar"),
    "palace": ("Palace of the Suffetes", "Bet Šōpṭīm"),
    "temple_big": ("Temple of Melqart", "Bet Melqart"),
}

PROJECTILE = {"civil_centre", "fortress", "sentry_tower", "defense_tower", "wall_tower", "palace"}


def parse():
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", default="/snap/0ad/749/binaries/data/mods/public/public.zip")
    return ap.parse_args()


class Public:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.names = set(self.z.namelist())

    def template(self, name):
        return ET.fromstring(self.z.read(f"simulation/templates/{name}.xml"))

    def unit_names(self):
        pre = "simulation/templates/units/cart/"
        return sorted(n[len(pre):-4] for n in self.names
                      if n.startswith(pre) and n.endswith(".xml"))


# ---------------------------------------------------------------- xml helpers

def sub(parent, tag, text=None, **attrs):
    el = parent.find(tag)
    if el is None:
        el = ET.SubElement(parent, tag)
    el.attrib.update(attrs)
    if text is not None:
        el.text = text
    return el


def drop(parent, tag):
    el = parent.find(tag)
    if el is not None:
        parent.remove(el)


def write_xml(root, path):
    ET.indent(root, space="  ")
    path.parent.mkdir(parents=True, exist_ok=True)
    data = ET.tostring(root, encoding="unicode")
    path.write_text('<?xml version="1.0" encoding="utf-8"?>\n' + data + "\n", encoding="utf-8")


def tiles(m):
    return max(1, min(9, round(m / 4)))


def fndn(w, d):
    """Closest vanilla foundation actor for a footprint in metres."""
    tw, td = round(w / 4), round(d / 4)
    if tw >= 10 or td >= 10:
        return "structures/fndn_12x12.xml"     # shipped by this mod
    return f"structures/fndn_{max(1, tw)}x{max(1, td)}.xml"


def dirt(w, d):
    tw, td = tiles(w), tiles(d)
    if tw < 2 or td < 2:
        return "props/structures/decals/dirt_small.xml"
    return f"props/structures/decals/dirt_{tw}x{td}.xml"


def r05(x):
    return math.ceil(x * 2) / 2


# ---------------------------------------------------------------- actors

def damage_group(size):
    g = ET.Element("group")
    ET.SubElement(g, "variant", name="alive", frequency="1")
    for f in ("light_damage", "medium_damage", "heavy_damage"):
        ET.SubElement(g, "variant", file=f"structures/cart/{f}.xml")
    ET.SubElement(g, "variant", file=f"structures/cart/destruction_{size}.xml")
    return g


def make_actor(name, meshes, info, decal):
    root = ET.Element("actor", version="1")
    ET.SubElement(root, "castshadow")
    if name == "dock":
        ET.SubElement(root, "float")
    base = ET.SubElement(ET.SubElement(root, "group"), "variant", frequency="1", name="Base")
    props = ET.SubElement(base, "props")
    if decal and not name.startswith("wall") and name != "dock":
        ET.SubElement(props, "prop", actor=decal, attachpoint="root")
    tex = ET.SubElement(base, "textures")
    ET.SubElement(tex, "texture", file=TEX_BASE, name="baseTex")
    ET.SubElement(tex, "texture", file=TEX_SPEC, name="specTex")
    ET.SubElement(tex, "texture", file=TEX_NORM, name="normTex")

    g = ET.SubElement(root, "group")
    for m in meshes:
        v = ET.SubElement(g, "variant", frequency="1", name=m)
        ET.SubElement(v, "mesh").text = f"structural/{ART}/{m}.dae"
        extras = info[m].get("extra", [])
        if extras:
            p = ET.SubElement(v, "props")
            for e in extras:
                ET.SubElement(p, "prop", actor=f"props/structures/{ART}/{e}.xml", attachpoint="root")
        t = ET.SubElement(v, "textures")
        ET.SubElement(t, "texture", file=f"structural/ao/{CIV}/{m}_ao.png", name="aoTex")

    g = ET.SubElement(root, "group")
    ET.SubElement(g, "variant", frequency="1", name="ungarrisoned")
    v = ET.SubElement(g, "variant", name="garrisoned")
    ET.SubElement(ET.SubElement(v, "props"), "prop", actor="props/special/common/garrison_flag_kart.xml",
                  attachpoint="garrisoned", selectable="false")

    if name == "house":
        g = ET.SubElement(root, "group")
        ET.SubElement(g, "variant", frequency="1", name="Idle")
    w = max(info[m]["width"] for m in meshes)
    size = "small" if w < 16 else ("medium" if w < 30 else "large")
    root.append(damage_group(size))
    ET.SubElement(root, "material").text = "player_trans_ao_parallax_spec.xml"
    write_xml(root, MOD / f"art/actors/structures/{ART}/{name}.xml")


def make_prop_actor(prop):
    root = ET.Element("actor", version="1")
    ET.SubElement(root, "castshadow")
    v = ET.SubElement(ET.SubElement(root, "group"), "variant", frequency="1", name="Base")
    ET.SubElement(v, "mesh").text = f"structural/{ART}/{prop}.dae"
    t = ET.SubElement(v, "textures")
    if prop.endswith("_palms"):
        ET.SubElement(t, "texture", file="gaia/palm_date_new_1.png", name="baseTex")
        material = "basic_trans.xml"
    else:
        ET.SubElement(t, "texture", file="structural/kart_bireme.png", name="baseTex")
        material = "player_trans.xml"
    ET.SubElement(root, "material").text = material
    write_xml(root, MOD / f"art/actors/props/structures/{ART}/{prop}.xml")


# ---------------------------------------------------------------- templates

def retarget_tokens(el):
    """Rewrite vanilla 'cart' paths inside a template to this civ."""
    for e in el.iter():
        if e.text and ("units/cart/" in e.text or "structures/cart/" in e.text):
            e.text = e.text.replace("units/cart/", f"units/{CIV}/").replace("structures/cart/", f"structures/{CIV}/")


def palace_template():
    root = ET.Element("Entity", parent="template_structure_special")
    root.append(ET.fromstring("""<Cost><BuildTime>300</BuildTime><Resources><stone>300</stone><metal>300</metal></Resources></Cost>"""))
    root.append(ET.fromstring("""<Health><Max>3000</Max></Health>"""))
    ident = ET.SubElement(root, "Identity")
    ET.SubElement(ident, "Classes", datatype="tokens").text = "ConquestCritical CivSpecific"
    ET.SubElement(ident, "VisibleClasses", datatype="tokens").text = "Palace"
    ET.SubElement(ident, "Icon").text = "structures/palace.png"
    ET.SubElement(ident, "Tooltip").text = "Seat of the Suffetes. Train Heroes. Territory root."
    # City Phase requirement comes from template_structure_special (Identity/Requirements).
    root.append(ET.fromstring("""<Loot><stone>60</stone><metal>60</metal></Loot>"""))
    root.append(ET.fromstring("""<TerritoryInfluence><Root>true</Root><Radius>40</Radius><Weight>40000</Weight></TerritoryInfluence>"""))
    root.append(ET.fromstring("""<Trainer><BatchTimeModifier>0.7</BatchTimeModifier><Entities datatype="tokens">
      units/{civ}/hero_hamilcar
      units/{civ}/hero_hannibal
      units/{civ}/hero_maharbal
    </Entities></Trainer>"""))
    root.append(ET.fromstring("""<Vision><Range>40</Range></Vision>"""))
    root.append(ET.fromstring("""<ProductionQueue/>"""))
    return root


def make_structure(pub, name, base, meshes, rubble, info):
    if base is None:
        root = palace_template()
    else:
        root = copy.deepcopy(pub.template(f"structures/{base}"))
    retarget_tokens(root)

    w = max(info[m]["width"] for m in meshes)
    d = max(info[m]["depth"] for m in meshes)
    h = max(info[m]["height"] for m in meshes)
    is_wall = name.startswith("wall_") and name != "wall_tower"
    fw, fd = r05(w), r05(d)
    if is_wall:
        fd = max(fd, 6.0)

    fp = sub(root, "Footprint")
    for c in list(fp):
        if c.tag in ("Square", "Circle"):
            fp.remove(c)
    fp.insert(0, ET.Element("Square", width=f"{fw:.1f}", depth=f"{fd:.1f}"))
    sub(fp, "Height", f"{h:.1f}")

    obs = root.find("Obstruction")
    if name == "wall_gate":
        side = round(fw * 0.27, 1)
        door = round(fw - 2 * side, 1)
        obs = sub(root, "Obstruction")
        for c in list(obs):
            obs.remove(c)
        o = ET.SubElement(obs, "Obstructions")
        ET.SubElement(o, "Right", width=f"{side}", depth=f"{fd - 1:.1f}", x=f"{(fw - side) / 2:.2f}", z="0")
        ET.SubElement(o, "Left", width=f"{side}", depth=f"{fd - 1:.1f}", x=f"{-(fw - side) / 2:.2f}", z="0")
        ET.SubElement(o, "Door", width=f"{door}", depth=f"{fd - 1:.1f}", x="0", z="0")
    else:
        obs = sub(root, "Obstruction")
        for c in list(obs):
            if c.tag == "Static":
                obs.remove(c)
        shrink = 0.5 if fw < 16 else 1.0
        obs.insert(0, ET.Element("Static", width=f"{fw - shrink:.1f}", depth=f"{fd - shrink:.1f}"))

    health = sub(root, "Health")
    sub(health, "SpawnEntityOnDeath", f"decay|{rubble}")

    ident = sub(root, "Identity")
    sub(ident, "Civ", CIV)
    gen, spec = NAMES[name]
    sub(ident, "GenericName", gen)
    sub(ident, "SpecificName", spec)
    sel = ident.find("SelectionGroupName")
    if sel is not None:
        ident.remove(sel)

    if name == "house":
        drop(root, "Upgrade")          # vanilla apartment upgrade has no mesh here
    if name == "temple_big":
        sub(ident, "Tooltip", "Train Champions and Healers. Heals garrisoned units.")
        req = sub(ident, "Requirements")
        sub(req, "Techs", "phase_city", datatype="tokens")
        sub(ident, "Classes", "CivSpecific", datatype="tokens")
        root.find("Trainer/Entities").text = """
      units/{civ}/champion_infantry
      units/{civ}/champion_pikeman
      units/{civ}/champion_cavalry
      units/{civ}/support_healer_b
    """
        res = sub(sub(root, "Cost"), "Resources")
        for c in list(res):
            res.remove(c)
        sub(res, "stone", "400")
        sub(res, "metal", "200")
    if name == "temple":
        # Champions move to the Temple of Melqart; the temple trains healers.
        drop(root, "Trainer")
    if name == "fortress":
        # Heroes are trained at the palace; the fortress gets the war elephants.
        root.find("Trainer/Entities").text = """
      units/{civ}/champion_elephant
    """
        wp = root.find("WallPiece/Length")
        if wp is not None:
            wp.text = f"{fw - 4:.1f}"
    if name.startswith("wall_"):
        wp = sub(root, "WallPiece")
        sub(wp, "Length", f"{w - (0.5 if name == 'wall_tower' else 0.0):.1f}")
        sb = sub(root, "StatusBars")
        sub(sb, "HeightOffset", f"{h + 1:.1f}")
        tp = root.find("TurretHolder/TurretPoints")
        if tp is not None:
            top = info[meshes[0]]["props"].get("prop_garrisoned", [0, 0, h - 2])[2]
            usable = (w / 2) - 2
            for p in list(tp):
                x = float(p.find("X").text)
                if abs(x) > usable:
                    tp.remove(p)
                else:
                    p.find("Y").text = f"{top:.1f}"
    if name in ("defense_tower", "sentry_tower", "civil_centre", "fortress"):
        sb = sub(root, "StatusBars")
        sub(sb, "HeightOffset", f"{h + 2:.1f}")

    va = sub(root, "VisualActor")
    sub(va, "Actor", f"structures/{ART}/{name}.xml")
    if not name.startswith("wall_") or name == "wall_tower":
        sub(va, "FoundationActor", fndn(fw, fd))
    else:
        fa = va.find("FoundationActor")
        if fa is not None:
            va.remove(fa)

    write_xml(root, MOD / f"simulation/templates/structures/{CIV}/{name}.xml")


def make_plain_copy(pub, base):
    root = copy.deepcopy(pub.template(f"structures/{base}"))
    retarget_tokens(root)
    sub(sub(root, "Identity"), "Civ", CIV)
    write_xml(root, MOD / f"simulation/templates/structures/{CIV}/{base.split('/')[1]}.xml")


def make_wallset():
    root = ET.fromstring(f"""<Entity parent="template_wallset">
  <Identity><Civ>{CIV}</Civ><SpecificName>Ḥōmah</SpecificName></Identity>
  <WallSet>
    <Templates>
      <Tower>structures/{CIV}/wall_tower</Tower>
      <Gate>structures/{CIV}/wall_gate</Gate>
      <WallLong>structures/{CIV}/wall_long</WallLong>
      <WallMedium>structures/{CIV}/wall_medium</WallMedium>
      <WallShort>structures/{CIV}/wall_short</WallShort>
    </Templates>
    <MaxTowerOverlap>0.90</MaxTowerOverlap>
    <MinTowerOverlap>0.05</MinTowerOverlap>
  </WallSet>
</Entity>""")
    write_xml(root, MOD / f"simulation/templates/structures/{CIV}/wallset_stone.xml")


# ---------------------------------------------------------------- units

EXTRA_BUILDINGS = ["palace", "temple_big", "tophet", "range", "embassy"]


def copy_retargeted(src, dst, skip=("Builder", "Trainer", "VisualActor", "Identity")):
    """Re-create in dst every element of src whose text points at a vanilla cart unit."""
    for child in src:
        if child.tag in skip:
            continue
        if child.text and "units/cart/" in child.text and len(child) == 0:
            el = sub(dst, child.tag, child.text.replace("units/cart/", f"units/{CIV}/"))
            el.attrib.update(child.attrib)
        elif len(child):
            holder = ET.Element(child.tag, child.attrib)
            copy_retargeted(child, holder, skip=())
            if len(holder):
                dst.append(holder)


def make_units(pub):
    names = pub.unit_names()
    for n in names:
        src = pub.template(f"units/cart/{n}")
        root = ET.Element("Entity", parent=f"units/cart/{n}")
        ident = ET.SubElement(root, "Identity")
        ET.SubElement(ident, "Civ").text = CIV
        group = n[:-2] + "_b" if n[-2:] in ("_a", "_e") else n
        ET.SubElement(ident, "SelectionGroupName").text = f"units/{CIV}/{group}"
        # promotions, pack/unpack, etc. that point at vanilla cart units
        copy_retargeted(src, root)
        # builder lists: drop vanilla cart-only buildings, add ours
        b = src.find("Builder/Entities")
        tokens = []
        if b is not None:
            tokens += ["-" + t for t in b.text.split() if "structures/cart/" in t]
        if n == "support_civilian" or (n.startswith("infantry_") and n.endswith("_b")):
            tokens += [f"structures/{CIV}/{x}" for x in EXTRA_BUILDINGS]
        if tokens:
            be = ET.SubElement(ET.SubElement(root, "Builder"), "Entities", datatype="tokens")
            be.text = "\n      " + "\n      ".join(tokens) + "\n    "
        write_xml(root, MOD / f"simulation/templates/units/{CIV}/{n}.xml")
    return names


# ---------------------------------------------------------------- civ data

def make_civ_files():
    civ = {
        "Code": CIV,
        "Culture": "cart",
        "Music": [
            {"File": "Mediterranean_Waves.ogg", "Type": "peace"},
            {"File": "Harsh_Lands_Rugged_People.ogg", "Type": "peace"},
            {"File": "Peaks_of_Atlas.ogg", "Type": "peace"},
            {"File": "From_Every_Corner.ogg", "Type": "peace"},
        ],
        "CivBonuses": [
            {
                "Name": "Thalassocracy",
                "History": "From the Kothon of Carthage the Punic fleets ruled the trade routes of the western Mediterranean.",
                "Description": "Trade ships are available in the Village Phase.",
            },
            {
                "Name": "Mercenary Armies",
                "History": "Carthage paid Libyan, Iberian, Celtic and Italic warriors to fight its wars, led by Punic generals.",
                "Description": "Mercenaries are trained at the Mercenary Stoa.",
            },
        ],
        "WallSets": ["structures/wallset_palisade", f"structures/{CIV}/wallset_stone"],
        "StartEntities": [
            {"Template": f"structures/{CIV}/civil_centre"},
            {"Template": f"units/{CIV}/support_civilian", "Count": 4},
            {"Template": f"units/{CIV}/infantry_spearman_b", "Count": 2},
            {"Template": f"units/{CIV}/infantry_archer_b", "Count": 2},
            {"Template": f"units/{CIV}/cavalry_javelineer_b"},
        ],
        "AINames": ["Hamilcar Barca", "Hannibal Barca", "Hasdrubal the Fair", "Mago Barca",
                    "Hanno the Great", "Himilco", "Maharbal", "Bomilcar", "Gisco", "Hasdrubal Gisco"],
        "SkirmishReplacements": {
            "skirmish/units/default_infantry_ranged_b": f"units/{CIV}/infantry_archer_b",
            "skirmish/units/default_infantry_melee_b": f"units/{CIV}/infantry_spearman_b",
            "skirmish/units/default_cavalry": f"units/{CIV}/cavalry_javelineer_b",
            "skirmish/structures/default_house_10": f"structures/{CIV}/house",
            "skirmish/structures/default_house_5": f"structures/{CIV}/house",
            "skirmish/structures/default_wall_tower": f"structures/{CIV}/wall_tower",
            "skirmish/structures/default_wall_gate": f"structures/{CIV}/wall_gate",
            "skirmish/structures/default_wall_short": f"structures/{CIV}/wall_short",
            "skirmish/structures/default_wall_medium": f"structures/{CIV}/wall_medium",
            "skirmish/structures/default_wall_long": f"structures/{CIV}/wall_long",
        },
        "SelectableInGameSetup": True,
    }
    p = MOD / f"simulation/data/civs/{CIV}.json"
    p.write_text(json.dumps(civ, indent="\t", ensure_ascii=False) + "\n", encoding="utf-8")

    player = ET.fromstring(f"""<Entity parent="template_player">
  <Auras datatype="tokens">
    teambonuses/cart_player_teambonus
  </Auras>
  <Identity>
    <Civ>{CIV}</Civ>
    <GenericName>Carthaginian Empire</GenericName>
    <History>At the height of its power in the 3rd century BC, Carthage ruled an empire stretching from the Libyan coast to Iberia, Sardinia and western Sicily. Governed by elected Suffetes and a merchant aristocracy, the Punic capital built its might on the great circular military harbour, the Kothon, on vast mercenary armies, and on generals such as Hamilcar and Hannibal Barca, who carried the war against Rome across the Alps.</History>
    <Icon>emblems/emblem_carthaginians.png</Icon>
  </Identity>
  <Player>
    <Formations datatype="tokens">
      special/formations/phalanx
    </Formations>
  </Player>
</Entity>""")
    write_xml(player, MOD / f"simulation/templates/special/players/{CIV}.xml")
    rally = ET.fromstring(f"""<Entity parent="special/rallypoint"><Identity><Civ>{CIV}</Civ></Identity></Entity>""")
    write_xml(rally, MOD / f"simulation/templates/special/rallypoints/{CIV}.xml")


def main():
    args = parse()
    pub = Public(args.public)
    info = json.loads(INFO.read_text())

    tex = MOD / f"art/textures/skins/structural/{CIV}/struct.dds"
    tex.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(MOD / "referencias/kart_struct (1).dds", tex)

    for name, (base, meshes, rubble) in STRUCTURES.items():
        missing = [m for m in meshes if m not in info]
        if missing:
            print("skip", name, "- not exported:", missing)
            continue
        w = max(info[m]["width"] for m in meshes)
        d = max(info[m]["depth"] for m in meshes)
        make_actor(name, meshes, info, dirt(w, d))
        for m in meshes:
            for e in info[m].get("extra", []):
                make_prop_actor(e)
        make_structure(pub, name, base, meshes, rubble, info)
    for base in PLAIN_COPIES:
        make_plain_copy(pub, base)
    make_wallset()
    units = make_units(pub)
    make_civ_files()
    print(f"structures: {len(STRUCTURES) + len(PLAIN_COPIES)}, units: {len(units)}")


if __name__ == "__main__":
    main()
