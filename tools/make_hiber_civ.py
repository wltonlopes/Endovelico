#!/usr/bin/env python3
"""Generate the Hibernian civ (code: hiber) of the mod, from Duileoga's design (forum post "Hibernios").

Run after:
  tools/export_hiber_structures.py   (building meshes, AO maps, tools/hiber_export_info.json)
  tools/make_hiber_textures.py       (unit textures cut from the unit atlas)
  tools/export_hiber_props.py        (new shield and carnyx meshes)

  python3 tools/make_hiber_civ.py

Structures: new meshes, gameplay of the vanilla Briton templates (plus four Hibernian buildings).
Units: vanilla meshes, animations and weapons (Briton/Gaulish/Germanic/Kushite actors as a base), with
the Hibernian body, head, cape, shield, carnyx and chariot textures; heads are the vanilla celtic head
meshes with the new textures. Templates wrap the vanilla Briton units or the generic unit templates.
"""

import copy
import json
import math
import shutil
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

MOD = Path(__file__).resolve().parent.parent
PUBLIC = "/snap/0ad/current/binaries/data/mods/public/public.zip"
CIV = "hiber"
ART = "hibernians"
INFO = MOD / "tools/hiber_export_info.json"

TEX_STRUCT = f"structural/{CIV}/struct.png"
SK = f"skeletal/{CIV}"            # body textures
PR = f"props/{CIV}"               # cape / shield / chariot textures


class Public:
    def __init__(self):
        self.z = zipfile.ZipFile(PUBLIC)
        self.names = set(self.z.namelist())

    def xml(self, path):
        return ET.fromstring(self.z.read(path))

    def template(self, name):
        return self.xml(f"simulation/templates/{name}.xml")

    def actor(self, name):
        return self.xml(f"art/actors/{name}.xml")

    def brit_units(self):
        pre = "simulation/templates/units/brit/"
        return sorted(n[len(pre):-4] for n in self.names if n.startswith(pre) and n.endswith(".xml"))


def write_xml(root, path):
    ET.indent(root, space="  ")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n",
                    encoding="utf-8")


def sub(parent, tag, text=None, **attrs):
    el = parent.find(tag)
    if el is None:
        el = ET.SubElement(parent, tag)
    el.attrib.update(attrs)
    if text is not None:
        el.text = text
    return el


def tokens(items):
    return "\n      " + "\n      ".join(items) + "\n    "


# ================================================================ structures

# name: (vanilla template copied, meshes, names (generic, specific), trainer list or None to keep)
U = "units/{civ}/"
STRUCTURES = {
    "civil_centre": ("brit/civil_centre", ["civil_centre"], ("Civic Center", "Rígdún"),
                     [U + "support_female_citizen", U + "infantry_spearman_b", U + "infantry_javelineer_b",
                      U + "cavalry_javelineer_b", U + "war_dog"]),
    "house": ("brit/house", ["house_a", "house_b", "house_c", "house_d"], ("House", "Tegos"), None),
    "storehouse": ("brit/storehouse", ["storehouse"], ("Storehouse", "Landā"), None),
    "farmstead": ("brit/farmstead", ["farmstead"], ("Farmstead", "Tegyā"), None),
    "corral": ("brit/corral", ["corral"], ("Corral", "Kruwos"), None),
    "dock": ("brit/dock", ["dock"], ("Dock", "Kawnos"),
             [U + "ship_fishing", U + "ship_merchant", U + "ship_arrow"]),
    "barracks": ("brit/barracks", ["barracks"], ("Barracks", "Koryotegos"),
                 [U + "infantry_spearman_b", U + "infantry_javelineer_b", U + "infantry_slinger_b"]),
    "range": ("brit/range", ["range"], ("Practice Range", "Légokoros"),
              [U + "infantry_javelineer_b", U + "infantry_slinger_b"]),
    "stable": ("brit/stable", ["stable"], ("Stable", "Krāfo"),
               [U + "cavalry_javelineer_b", U + "cavalry_spearman_b", U + "war_dog"]),
    "forge": ("brit/forge", ["forge"], ("Forge", "Gobanns"), None),
    "temple": ("brit/temple", ["temple"], ("Temple", "Nemed"), [U + "support_healer_b"]),
    "market": ("brit/market", ["market"], ("Market", "Ōinakos"), [U + "support_trader"]),
    "sentry_tower": ("brit/sentry_tower", ["sentry_tower"], ("Sentry Tower", "Brixs Kʷresnom"), None),
    "defense_tower": ("brit/defense_tower", ["defense_tower"], ("Defense Tower", "Brixs"), None),
    "fortress": ("brit/fortress", ["fortress"], ("Fortress", "Dūnom"), []),
    "arsenal": ("brit/arsenal", ["arsenal"], ("Siege Workshop", "Gnīmus"), [U + "siege_ram"]),
    "wonder": ("brit/wonder", ["wonder"], ("Royal Enclosure of Tara", "Ráth na Ríogh"), None),
    "wall_long": ("brit/wall_long", ["wall_long"], ("Stone Wall", "Dūn"), None),
    "wall_medium": ("brit/wall_medium", ["wall_medium"], ("Stone Wall", "Dūn"), None),
    "wall_short": ("brit/wall_short", ["wall_short"], ("Stone Wall", "Dūn"), None),
    "wall_tower": ("brit/wall_tower", ["wall_tower"], ("Wall Tower", "Brixs Dūn"), None),
    "wall_gate": ("brit/wall_gate", ["wall_gate"], ("Gate", "Dwer Dūn"), None),
    # Hibernian buildings
    "promontory": ("special", ["promontory"], ("Coastal Promontory Fort", "Trebā Enisīs"),
                   [U + "infantry_maceman_b", U + "cavalry_swordsman_b", U + "ship_fishing", U + "ship_merchant",
                    U + "ship_arrow"]),
    "ring_fort": ("special", ["ring_fort"], ("Ring Fort", "Rātis"),
                  [U + "infantry_axeman_b", U + "infantry_swordsman_b", U + "infantry_pikeman_b"]),
    "ritual_assembly": ("special", ["ritual_assembly"], ("Ritual Assembly", "Datlā"),
                        [U + "champion_infantry_spearman", U + "champion_infantry_javelineer",
                         U + "champion_infantry_trumpeter", U + "champion_chariot", U + "war_dog"]),
    "royal_enclosure": ("special", ["royal_enclosure"], ("Royal Ceremonial Enclosure", "Rīgon"),
                        [U + "hero_tuathal", U + "hero_fiachu", U + "hero_elim", U + "champion_healer"]),
}
# Hibernian technologies (simulation/data/technologies/hiber/)
RESEARCH = {"temple": ["hiber/brehon_laws"], "corral": ["hiber/borana_tax", "hiber/cattle_rent"]}
PLAIN_COPIES = {"brit/field": "ǵhórtos", "brit/outpost": None}

SPECIAL = {   # cost, health, phase, territory root, tooltip, class
    "promontory": (dict(wood=250, stone=200), 2000, "phase_town", False,
                   "Train the warband (Wēnyos) and ships. Coastal stronghold of a chieftain.", "Promontory"),
    "ring_fort": (dict(wood=300, stone=100), 2000, "phase_town", False,
                  "Train the auxiliary warriors of the Ulaid, the Laigin and the Nagnatae.", "RingFort"),
    "ritual_assembly": (dict(wood=200, stone=300, metal=100), 2500, "phase_city", False,
                        "Assembly place of Dún Ailinne. Train champions, chariots and war hounds.", "RitualAssembly"),
    "royal_enclosure": (dict(stone=300, metal=300), 3000, "phase_city", True,
                        "Royal ceremonial enclosure of Uisnech and Rathcroghan. Train heroes and the bard. Territory root.",
                        "Palace"),
}


def tiles(m):
    return max(1, min(9, round(m / 4)))


def fndn(w, d):
    tw, td = round(w / 4), round(d / 4)
    if tw >= 10 or td >= 10:
        return "structures/fndn_12x12.xml"
    return f"structures/fndn_{max(1, tw)}x{max(1, td)}.xml"


def dirt(w, d):
    tw, td = tiles(w), tiles(d)
    if tw < 2 or td < 2:
        return "props/structures/decals/dirt_small.xml"
    return f"props/structures/decals/dirt_{tw}x{td}.xml"


def r05(x):
    return math.ceil(x * 2) / 2


def make_structure_actor(name, meshes, info):
    root = ET.Element("actor", version="1")
    ET.SubElement(root, "castshadow")
    if name == "dock":
        ET.SubElement(root, "float")
    base = ET.SubElement(ET.SubElement(root, "group"), "variant", frequency="1", name="Base")
    w = max(info[m]["width"] for m in meshes)
    d = max(info[m]["depth"] for m in meshes)
    if not name.startswith("wall") and name != "dock":
        ET.SubElement(ET.SubElement(base, "props"), "prop", actor=dirt(w, d), attachpoint="root")
    tex = ET.SubElement(base, "textures")
    ET.SubElement(tex, "texture", file=TEX_STRUCT, name="baseTex")
    ET.SubElement(tex, "texture", file="default_norm.png", name="normTex")
    ET.SubElement(tex, "texture", file="null_black.dds", name="specTex")
    g = ET.SubElement(root, "group")
    for m in meshes:
        v = ET.SubElement(g, "variant", frequency="1", name=m)
        ET.SubElement(v, "mesh").text = f"structural/{ART}/{m}.dae"
        ET.SubElement(ET.SubElement(v, "textures"), "texture", file=f"structural/ao/{CIV}/{m}_ao.png", name="aoTex")
    g = ET.SubElement(root, "group")
    ET.SubElement(g, "variant", frequency="1", name="ungarrisoned")
    v = ET.SubElement(g, "variant", name="garrisoned")
    ET.SubElement(ET.SubElement(v, "props"), "prop", actor=f"props/special/common/garrison_flag_{CIV}.xml",
                  attachpoint="garrisoned", selectable="false")
    size = "small" if w < 16 else ("medium" if w < 30 else "large")
    g = ET.SubElement(root, "group")
    ET.SubElement(g, "variant", name="alive", frequency="1")
    ET.SubElement(g, "variant", file=f"structures/destruction_{size}.xml")
    ET.SubElement(root, "material").text = "player_trans_ao_parallax_spec.xml"
    write_xml(root, MOD / f"art/actors/structures/{ART}/{name}.xml")


def special_template(name, trainer):
    cost, hp, phase, root_territory, tooltip, cls = SPECIAL[name]
    parent = "template_structure_special_palace" if name == "royal_enclosure" else "template_structure_special"
    root = ET.Element("Entity", parent=parent)
    c = ET.SubElement(root, "Cost")
    ET.SubElement(c, "BuildTime").text = "200"
    res = ET.SubElement(c, "Resources")
    for k, val in cost.items():
        ET.SubElement(res, k).text = str(val)
    sub(sub(root, "Health"), "Max", str(hp))
    ident = ET.SubElement(root, "Identity")
    ET.SubElement(ident, "Classes", datatype="tokens").text = "CivSpecific"
    ET.SubElement(ident, "VisibleClasses", datatype="tokens").text = cls
    ET.SubElement(ident, "Icon").text = {"royal_enclosure": "structures/hall.png", "ritual_assembly": "structures/monument.png",
        "ring_fort": "structures/military_settlement.png", "promontory": "structures/fortress.png"}[name]
    ET.SubElement(ident, "Tooltip").text = tooltip
    ET.SubElement(ET.SubElement(ident, "Requirements"), "Techs", datatype="tokens").text = phase
    if root_territory:
        ti = ET.SubElement(root, "TerritoryInfluence")
        ET.SubElement(ti, "Root").text = "true"
        ET.SubElement(ti, "Radius").text = "40"
        ET.SubElement(ti, "Weight").text = "40000"
    tr = ET.SubElement(root, "Trainer")
    ET.SubElement(tr, "BatchTimeModifier").text = "0.8"
    ET.SubElement(tr, "Entities", datatype="tokens", replace="").text = tokens(trainer)
    ET.SubElement(root, "ProductionQueue")
    sub(sub(root, "Vision"), "Range", "40")
    if name == "promontory":
        br = ET.SubElement(root, "BuildRestrictions")
        ET.SubElement(br, "PlacementType").text = "shore"
        ET.SubElement(br, "Category").text = "Dock"
    return root


def make_structure(pub, name, base, meshes, names, trainer, info):
    root = special_template(name, trainer) if base == "special" else copy.deepcopy(pub.template(f"structures/{base}"))
    w = max(info[m]["width"] for m in meshes)
    d = max(info[m]["depth"] for m in meshes)
    h = max(info[m]["height"] for m in meshes)
    is_wall = name.startswith("wall_") and name != "wall_tower"
    fw, fd = r05(w), r05(d)
    if is_wall:
        fd = max(fd, 6.0)
    fp = sub(root, "Footprint", replace="")
    for c in list(fp):
        fp.remove(c)
    ET.SubElement(fp, "Square", width=f"{fw:.1f}", depth=f"{fd:.1f}")
    ET.SubElement(fp, "Height").text = f"{h:.1f}"
    obs = sub(root, "Obstruction")
    if name == "wall_gate":
        for c in list(obs):
            obs.remove(c)
        side = round(fw * 0.27, 1)
        door = round(fw - 2 * side, 1)
        o = ET.SubElement(obs, "Obstructions")
        ET.SubElement(o, "Right", width=f"{side}", depth=f"{fd - 1:.1f}", x=f"{(fw - side) / 2:.2f}", z="0")
        ET.SubElement(o, "Left", width=f"{side}", depth=f"{fd - 1:.1f}", x=f"{-(fw - side) / 2:.2f}", z="0")
        ET.SubElement(o, "Door", width=f"{door}", depth=f"{fd - 1:.1f}", x="0", z="0")
    else:
        for c in list(obs):
            if c.tag == "Static":
                obs.remove(c)
        shrink = 0.5 if fw < 16 else 1.0
        obs.insert(0, ET.Element("Static", width=f"{fw - shrink:.1f}", depth=f"{fd - shrink:.1f}"))
    ident = sub(root, "Identity")
    sub(ident, "Civ", CIV)
    sub(ident, "GenericName", names[0])
    sub(ident, "SpecificName", names[1])
    sel = ident.find("SelectionGroupName")
    if sel is not None:
        ident.remove(sel)
    if trainer is not None and base != "special":
        old = root.find("Trainer")
        if old is not None:
            root.remove(old)
        if trainer:
            ET.SubElement(ET.SubElement(root, "Trainer"), "Entities", datatype="tokens", replace="").text = tokens(trainer)
        else:
            ET.SubElement(root, "Trainer", disable="")
    if name in RESEARCH:
        res = ET.SubElement(root, "Researcher")
        ET.SubElement(res, "Technologies", datatype="tokens").text = tokens(RESEARCH[name])
    if name.startswith("wall_"):
        sub(sub(root, "WallPiece"), "Length", f"{w - (0.5 if name == 'wall_tower' else 0.0):.1f}")
        sub(sub(root, "StatusBars"), "HeightOffset", f"{h + 1:.1f}")
        tp = root.find("TurretHolder/TurretPoints")
        if tp is not None:
            top = info[meshes[0]]["props"].get("prop_garrisoned", [0, 0, h - 2])[2]
            for p in list(tp):
                if abs(float(p.find("X").text)) > (w / 2) - 2:
                    tp.remove(p)
                else:
                    p.find("Y").text = f"{top:.1f}"
    if name in ("defense_tower", "sentry_tower", "civil_centre", "fortress", "promontory", "ring_fort"):
        sub(sub(root, "StatusBars"), "HeightOffset", f"{h + 2:.1f}")
    va = sub(root, "VisualActor")
    sub(va, "Actor", f"structures/{ART}/{name}.xml")
    if not name.startswith("wall_") or name == "wall_tower":
        sub(va, "FoundationActor", fndn(fw, fd))
    else:
        fa = va.find("FoundationActor")
        if fa is not None:
            va.remove(fa)
    write_xml(root, MOD / f"simulation/templates/structures/{CIV}/{name}.xml")


def make_plain_copies(pub):
    for base, specific in PLAIN_COPIES.items():
        root = copy.deepcopy(pub.template(f"structures/{base}"))
        ident = sub(root, "Identity")
        sub(ident, "Civ", CIV)
        if specific:
            sub(ident, "SpecificName", specific)
        write_xml(root, MOD / f"simulation/templates/structures/{CIV}/{base.split('/')[1]}.xml")
    root = ET.fromstring(f"""<Entity parent="template_wallset">
  <Identity><Civ>{CIV}</Civ><SpecificName>Dūn</SpecificName></Identity>
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


# Scenario editor pieces: gaia decoratives with the new meshes.
EDITOR = {
    "stone_of_divisions": ("Stone of Divisions", "Aill na Míreann"),
    "stone_ring": ("Stone Circle", "Kārnom"),
    "burial_mound": ("Burial Mound", "Sīdos"),
    "wooden_ring": ("Timber Circle", "Kʷresnom Temris"),
}


def make_editor_pieces(info):
    for name, (gen, spec) in EDITOR.items():
        key = "editor_" + name
        if key not in info:
            continue
        make_structure_actor(key, [key], info)
        e = info[key]
        root = ET.fromstring(f"""<Entity parent="template_structure_special">
  <Footprint replace=""><Square width="{r05(e['width']):.1f}" depth="{r05(e['depth']):.1f}"/><Height>{e['height']:.1f}</Height></Footprint>
  <Identity><Civ>gaia</Civ><GenericName>{gen}</GenericName><SpecificName>{spec}</SpecificName></Identity>
  <VisualActor><Actor>structures/{ART}/{key}.xml</Actor></VisualActor>
</Entity>""")
        # decorative: no cost, no production, not capturable, any territory
        for xml in ("<Cost disable=''/>", "<Trainer disable=''/>", "<ProductionQueue disable=''/>", "<Capturable disable=''/>",
                    "<TerritoryInfluence disable=''/>", "<BuildRestrictions><Territory>own neutral enemy</Territory></BuildRestrictions>",
                    "<Health><Max>5000</Max></Health>"):
            root.append(ET.fromstring(xml))
        write_xml(root, MOD / f"simulation/templates/other/{CIV}_{name}.xml")


# ================================================================ unit actors

HEAD_MALE = f"props/units/heads/{CIV}/head_male.xml"
HEAD_FEMALE = f"props/units/heads/{CIV}/head_female.xml"
HEAD_PRIEST = f"props/units/heads/{CIV}/head_priest.xml"


def head_actor(path, meshes, textures):
    root = ET.Element("actor", version="1")
    ET.SubElement(root, "castshadow")
    g = ET.SubElement(root, "group")
    for i, m in enumerate(meshes):
        ET.SubElement(ET.SubElement(g, "variant", frequency="1", name=f"mesh_{i + 1}"), "mesh").text = m
    g = ET.SubElement(root, "group")
    for t in textures:
        v = ET.SubElement(g, "variant", frequency="1", name=Path(t).stem)
        tx = ET.SubElement(v, "textures")
        ET.SubElement(tx, "texture", file=t, name="baseTex")
    g = ET.SubElement(ET.SubElement(root, "group"), "variant")
    tx = ET.SubElement(g, "textures")
    ET.SubElement(tx, "texture", file="default_norm.png", name="normTex")
    ET.SubElement(tx, "texture", file="null_black.dds", name="specTex")
    ET.SubElement(root, "material").text = "player_trans_norm_spec.xml"
    write_xml(root, MOD / f"art/actors/{path}")


def make_heads():
    male = [f"props/head/{CIV}/male_{i}.png" for i in range(1, 19)]
    head_actor(HEAD_MALE, ["props/new/head_longhair.dae"], male)
    head_actor(HEAD_FEMALE, ["props/new/dudette_head_a.dae", "props/new/head_female_d.dae"],
               [f"props/head/{CIV}/female_{i}.png" for i in range(1, 7)])
    head_actor(HEAD_PRIEST, ["props/new/head_longhair.dae"], [f"props/head/{CIV}/priest_{i}.png" for i in (1, 2)])
    for i, name in ((1, "fiachu"), (2, "elim"), (3, "tuathal")):
        head_actor(f"props/units/heads/{CIV}/head_hero_{name}.xml", ["props/new/head_longhair.dae"],
                   [f"props/head/{CIV}/hero_{i}.png"])


def make_capes(pub):
    """Cape actors: the vanilla animated capes with the Hibernian plaids and pelts."""
    sets = {
        "light_melee": 4, "light_ranged": 4, "auxiliary": 4, "champion_bard": 4, "champion_carnyx": 4,
        "heavy": 4, "champion_melee": 4, "champion_ranged": 4, "priest": 1, "hero_1": 1, "hero_2": 1, "hero_3": 1,
    }
    for rider in (False, True):
        src = pub.actor("props/units/capes/rider/cape_med_player" if rider else "props/units/capes/cape_med_player")
        for name, n in sets.items():
            root = copy.deepcopy(src)
            files = ([f"{PR}/cape_{name}.png"] if name.startswith("hero_") else
                     [f"{PR}/cape_{name}_{k}.png" for k in range(1, n + 1)])
            if name.startswith("hero_"):
                files = [f"{PR}/cape_hero_{name[-1]}.png"]
            base = root.find("group/variant")
            tx = base.find("textures")
            if tx is not None:
                for t in list(tx):
                    if t.get("name") == "baseTex":
                        tx.remove(t)
            g = ET.Element("group")
            for f in files:
                ET.SubElement(ET.SubElement(ET.SubElement(g, "variant", frequency="1", name=Path(f).stem), "textures"),
                              "texture", file=f, name="baseTex")
            root.insert(list(root).index(root.find("group")) + 1, g)
            if name == "heavy":   # pelts: the ragged cape of the vanilla pelt capes
                base.find("mesh").text = "props/new/capes/cape_hd_ragged.dae"
            write_xml(root, MOD / f"art/actors/props/units/capes/{CIV}/{'rider_' if rider else ''}cape_{name}.xml")


def make_prop_actors():
    for name, tex in (("shield_light_a", "shield_light"), ("shield_light_b", "shield_light"),
                      ("shield_light_c", "shield_light"), ("shield_champion", "shield_champion"), ("carnyx", "carnyx")):
        root = ET.Element("actor", version="1")
        ET.SubElement(root, "castshadow")
        v = ET.SubElement(ET.SubElement(root, "group"), "variant", frequency="1", name="Base")
        ET.SubElement(v, "mesh").text = f"props/{CIV}/{name}.dae"
        tx = ET.SubElement(v, "textures")
        ET.SubElement(tx, "texture", file=f"{PR}/{tex}.png", name="baseTex")
        ET.SubElement(tx, "texture", file="default_norm.png", name="normTex")
        ET.SubElement(tx, "texture", file="null_black.dds", name="specTex")
        ET.SubElement(root, "material").text = "player_trans_norm_spec.xml"
        folder = "props/units/shields" if name.startswith("shield") else "props/units"
        write_xml(root, MOD / f"art/actors/{folder}/{CIV}_{name}.xml")


def shield(name):
    return f"props/units/shields/{CIV}_{name}.xml"


CARNYX = f"props/units/{CIV}_carnyx.xml"


def body_variants(files):
    g = ET.Element("group")
    for f in files:
        v = ET.SubElement(g, "variant", frequency="1", name=Path(f).stem)
        tx = ET.SubElement(v, "textures")
        ET.SubElement(tx, "texture", file=f, name="baseTex")
        ET.SubElement(tx, "texture", file="default_norm.png", name="normTex")
        ET.SubElement(tx, "texture", file="null_black.dds", name="specTex")
    return g


def attachpoints(variant):
    return {p.get("attachpoint") for p in variant.iter("prop")}


def retexture(pub, src, out, bodies=None, mesh=None, head=HEAD_MALE, shields=(), cape=None, swap=None,
              chassis=None, drop=("helmet",)):
    """Copy a vanilla actor and give it the Hibernian look.

    bodies: body texture files; head: head prop actor; shields: shield prop actors (variants), None keeps
    the vanilla ones, () removes them; cape: cape prop actor at root; swap: {vanilla actor: new actor}
    for props such as riders, drivers or the carnyx; chassis: chariot texture.
    """
    root = copy.deepcopy(pub.actor(src))
    swap = swap or {}
    groups = root.findall("group")
    base = groups[0].find("variant")         # vanilla convention: first variant of the first group
    for g in groups:
        vs = g.findall("variant")
        if not vs:
            continue
        aps = [attachpoints(v) for v in vs]
        is_tex = any(v.find("textures/texture[@name='baseTex']") is not None for v in vs) and base not in vs
        if bodies and is_tex:
            root.insert(list(root).index(g), body_variants(bodies))
            root.remove(g)
            continue
        if all(a == {"shield"} for a in aps) and shields is not None:
            root.remove(g)
            continue
        if all(a and a <= set(drop) for a in aps):
            root.remove(g)
            continue
    for v in root.iter("variant"):
        props = v.find("props")
        if props is None:
            continue
        for p in list(props):
            a = p.get("actor")
            if p.get("attachpoint") == "head" and head and "heads" in a:
                p.set("actor", head)
            elif p.get("attachpoint") in drop:
                props.remove(p)
            elif p.get("attachpoint") == "shield" and shields is not None:
                props.remove(p)
            elif a in swap:
                if swap[a] is None:
                    props.remove(p)
                else:
                    p.set("actor", swap[a])
    if base is not None:
        if mesh:
            if base.find("mesh") is None:
                m = ET.Element("mesh")
                base.insert(0, m)
            base.find("mesh").text = mesh
        bt = base.find("textures/texture[@name='baseTex']")
        if bodies and bt is not None and not chassis:
            base.find("textures").remove(bt)
            group = next(g for g in root.findall("group") if base in g.findall("variant"))
            root.insert(list(root).index(group) + 1, body_variants(bodies))
        if chassis:
            base.find("textures/texture[@name='baseTex']").set("file", chassis)
        if bodies:   # specular masks drawn for the vanilla textures do not fit the new ones
            for t in base.iter("texture"):
                if t.get("name") == "specTex":
                    t.set("file", "null_black.dds")
        props = base.find("props")
        if props is None:
            props = ET.SubElement(base, "props")
        if cape:
            ET.SubElement(props, "prop", actor=cape, attachpoint="root")
    if shields:
        g = ET.Element("group")
        for s in shields:
            v = ET.SubElement(g, "variant", frequency="1", name=Path(s).stem)
            ET.SubElement(ET.SubElement(v, "props"), "prop", actor=s, attachpoint="shield")
        root.insert(list(root).index(groups[0]) + 1, g)
    write_xml(root, MOD / f"art/actors/units/{ART}/{out}.xml")
    return f"units/{ART}/{out}.xml"


def tex(name, n=4, rank=None):
    r = f"_{rank}" if rank else ""
    return [f"{SK}/{name}{r}_{k}.png" for k in range(1, n + 1)]


CAPE = lambda name, rider=False: f"props/units/capes/{CIV}/{'rider_' if rider else ''}cape_{name}.xml"
RANK_SHIELD = {"b": [shield("shield_light_a")], "a": [shield("shield_light_b")], "e": [shield("shield_light_c")]}
NEW = "skeletal/new/"


def make_unit_actors(pub):
    A = {}
    for r in "bae":
        cape = (lambda n, rider=False: CAPE(n, rider)) if r == "e" else (lambda n, rider=False: None)
        A[f"infantry_spearman_{r}"] = retexture(pub, f"units/britons/infantry_spearman_{r}", f"infantry_spearman_{r}",
            tex("light_melee", rank=r), NEW + "m_pants.dae", shields=RANK_SHIELD[r], cape=cape("light_melee"))
        A[f"infantry_javelineer_{r}"] = retexture(pub, f"units/britons/infantry_javelinist_{r}", f"infantry_javelineer_{r}",
            tex("light_ranged", rank=r), NEW + "m_pants.dae", shields=RANK_SHIELD[r], cape=cape("light_ranged"))
        A[f"infantry_slinger_{r}"] = retexture(pub, f"units/britons/infantry_slinger_{r}", f"infantry_slinger_{r}",
            tex("light_ranged", rank=r), NEW + "m_pants.dae", shields=(), cape=cape("light_ranged"))
        A[f"infantry_axeman_{r}"] = retexture(pub, "units/germans/infantry_axeman_c", f"infantry_axeman_{r}",
            tex("auxiliary", rank=r), NEW + "m_pants_loose_02.dae", shields=RANK_SHIELD[r], cape=cape("auxiliary"))
        A[f"infantry_swordsman_{r}"] = retexture(pub, f"units/gauls/infantry_swordsman_{r}", f"infantry_swordsman_{r}",
            tex("auxiliary", rank=r), NEW + "m_pants_loose_02.dae", shields=RANK_SHIELD[r], cape=cape("auxiliary"))
        A[f"infantry_pikeman_{r}"] = retexture(pub, f"units/kushites/infantry_pikeman_{r}", f"infantry_pikeman_{r}",
            tex("auxiliary", rank=r), NEW + "m_pants_loose_02.dae", shields=None, cape=cape("auxiliary"),
            drop=("helmet", "armpad_L"))
        A[f"infantry_maceman_{r}"] = retexture(pub, "units/germans/infantry_clubman", f"infantry_maceman_{r}",
            tex("heavy"), NEW + "m_pants.dae", shields=[shield("shield_light_c")], cape=CAPE("heavy"),
            swap={"props/units/capes/cape_med_pelt.xml": CAPE("heavy")})
        rider = A[f"cavalry_javelineer_{r}_r"] = retexture(pub, f"units/britons/cavalry_javelinist_{r}_r",
            f"cavalry_javelineer_{r}_r", tex("light_ranged", rank=r), NEW + "m_pants.dae", shields=RANK_SHIELD[r],
            cape=cape("light_ranged", True))
        A[f"cavalry_javelineer_{r}"] = retexture(pub, f"units/britons/cavalry_javelinist_{r}_m", f"cavalry_javelineer_{r}_m",
            swap={f"units/britons/cavalry_javelinist_{r}_r.xml": rider})
        rider = retexture(pub, "units/gauls/cavalry_spearman_c_r", f"cavalry_spearman_{r}_r", tex("light_melee", rank=r),
            NEW + "m_pants.dae", shields=RANK_SHIELD[r], cape=cape("light_melee", True))
        A[f"cavalry_spearman_{r}"] = retexture(pub, "units/gauls/cavalry_spearman_c_m", f"cavalry_spearman_{r}_m",
            swap={"units/gauls/cavalry_spearman_c_r.xml": rider})
        rider = retexture(pub, f"units/britons/cavalry_swordsman_{r}_r", f"cavalry_swordsman_{r}_r", tex("heavy"),
            NEW + "m_pants.dae", shields=[shield("shield_light_c")], cape=CAPE("heavy", True))
        A[f"cavalry_swordsman_{r}"] = retexture(pub, f"units/britons/cavalry_swordsman_{r}_m", f"cavalry_swordsman_{r}_m",
            swap={f"units/britons/cavalry_swordsman_{r}_r.xml": rider})
        A[f"support_healer_{r}"] = retexture(pub, "units/celts/healer", f"support_healer_{r}", tex("priest", 3),
            NEW + "m_armor_dress.dae", head=HEAD_PRIEST, cape=CAPE("priest"))
    champ = [shield("shield_champion")]
    A["champion_infantry_spearman"] = retexture(pub, "units/gauls/infantry_spearman_c", "champion_infantry_spearman",
        tex("champion_melee"), NEW + "m_pants.dae", shields=champ, cape=CAPE("champion_melee"))
    A["champion_infantry_javelineer"] = retexture(pub, "units/britons/infantry_javelinist_e", "champion_infantry_javelineer",
        tex("champion_ranged"), NEW + "m_pants.dae", shields=champ, cape=CAPE("champion_ranged"))
    A["champion_infantry_trumpeter"] = retexture(pub, "units/gauls/infantry_carnyx_c", "champion_infantry_trumpeter",
        tex("champion_carnyx"), NEW + "m_pants_loose_02.dae", shields=None, cape=CAPE("champion_carnyx"),
        swap={"props/units/celt_carnyx_01.xml": CARNYX, "props/units/celt_carnyx_02.xml": CARNYX})
    A["champion_healer"] = retexture(pub, "units/celts/healer", "champion_healer", tex("champion_bard"),
        NEW + "m_pants_loose_02.dae", cape=CAPE("champion_bard"))
    A["support_female_citizen"] = retexture(pub, "units/celts/female_citizen", "female_citizen", tex("female"),
        NEW + "f_armor_dress.dae", head=HEAD_FEMALE)
    A["support_civilian"] = retexture(pub, "units/celts/citizen_male", "citizen_male", tex("civilian", 2),
        NEW + "m_tunic_short.dae")
    A["war_dog"] = retexture(pub, "units/britons/wolfhound", "war_dog", tex("war_dog", 3), head=None)
    # chariots: vanilla celtic chariot with the Hibernian chassis, rider and charioteer
    driver = retexture(pub, "units/britons/chariot_javelinist_c_d", "chariot_driver", [f"{SK}/civilian_4.png"],
                       NEW + "m_tunic_short.dae")
    rider = retexture(pub, "units/britons/chariot_javelinist_c_r", "chariot_javelinist_r", tex("champion_ranged"),
                      NEW + "m_pants.dae", shields=champ, cape=CAPE("champion_ranged", True))
    A["champion_chariot"] = retexture(pub, "units/britons/chariot_javelinist_c_m", "chariot_javelinist_m",
        chassis=f"{PR}/chariot_champion.png",
        swap={"units/britons/chariot_javelinist_c_r.xml": rider, "units/britons/chariot_javelinist_c_d.xml": driver})
    hero_r = retexture(pub, "units/britons/chariot_javelinist_c_r", "hero_elim_r", [f"{SK}/hero_3.png"],
                       NEW + "m_pants.dae", head=f"props/units/heads/{CIV}/head_hero_elim.xml", shields=champ,
                       cape=CAPE("hero_3", True))
    A["hero_elim"] = retexture(pub, "units/britons/chariot_javelinist_c_m", "hero_elim_m", chassis=f"{PR}/chariot_hero.png",
        swap={"units/britons/chariot_javelinist_c_r.xml": hero_r, "units/britons/chariot_javelinist_c_d.xml": driver})
    trader_driver = retexture(pub, "units/britons/chariot_javelinist_c_d", "trader_driver", [f"{SK}/civilian_3.png"],
                              NEW + "m_tunic_short.dae")
    A["support_trader"] = retexture(pub, "units/britons/chariot_javelinist_c_m", "trader", chassis=f"{PR}/chariot_trader.png",
        swap={"units/britons/chariot_javelinist_c_d.xml": trader_driver, "units/britons/chariot_javelinist_c_r.xml": None,
              "units/britons/chariot_javelinist_c_h2.xml": None})
    hero_r = retexture(pub, "units/britons/hero_cavalry_swordsman_cunobelin_r", "hero_fiachu_r", [f"{SK}/hero_1.png"],
                       NEW + "m_pants.dae", head=f"props/units/heads/{CIV}/head_hero_fiachu.xml",
                       shields=champ, cape=CAPE("hero_1", True))
    A["hero_fiachu"] = retexture(pub, "units/britons/hero_cavalry_swordsman_cunobelin_m", "hero_fiachu_m",
        swap={"units/britons/hero_cavalry_swordsman_cunobelin_r.xml": hero_r})
    A["hero_tuathal"] = retexture(pub, "units/britons/infantry_slinger_e", "hero_tuathal", [f"{SK}/hero_2.png"],
        NEW + "m_pants.dae", head=f"props/units/heads/{CIV}/head_hero_tuathal.xml", shields=(), cape=CAPE("hero_2"))
    return A


def _remove_none_props(path):
    root = ET.parse(path).getroot()
    for props in root.iter("props"):
        for p in list(props):
            if p.get("actor") in (None, "None"):
                props.remove(p)
    write_xml(root, path)


# ================================================================ unit templates

# new units: name -> (parent, generic, specific, icon, ranked)
NEW_UNITS = {
    "infantry_spearman_b": ("template_unit_infantry_melee_spearman", "Hibernian Spearman", "Īwernī Gaisatāros",
                            "units/brit/infantry_spearman.png", True),
    "infantry_javelineer_b": ("template_unit_infantry_ranged_javelineer", "Hibernian Skirmisher", "Īwernī Gablācos",
                              "units/brit/infantry_javelinist.png", True),
    "infantry_slinger_b": ("template_unit_infantry_ranged_slinger", "Hibernian Slinger", "Īwernī Telmisāros",
                           "units/gaul/infantry_slinger.png", True),
    "infantry_maceman_b": ("template_unit_infantry_melee_maceman", "Warband Warrior", "Wēnyos",
                           "units/germ/infantry_clubman.png", True),
    "infantry_axeman_b": ("template_unit_infantry_melee_axeman", "Ulaid Warrior", "Ulutos Suwiros",
                          "units/germ/infantry_axeman.png", True),
    "infantry_swordsman_b": ("template_unit_infantry_melee_swordsman", "Laigin Warrior", "Legenion Suwiros",
                             "units/gaul/infantry_swordsman.png", True),
    "infantry_pikeman_b": ("template_unit_infantry_melee_pikeman", "Nagnatae Warrior", "Gnātos Suwiros",
                           "units/kush/infantry_pikeman.png", True),
    "cavalry_javelineer_b": ("template_unit_cavalry_ranged_javelineer", "Hibernian Mounted Skirmisher", "Īwernī Gablārēdos",
                             "units/brit/cavalry_javelinist.png", True),
    "cavalry_spearman_b": ("template_unit_cavalry_melee_spearman", "Hibernian Mounted Spearman", "Īwernī Gaisarēdos",
                           "units/germ/cavalry_spearman.png", True),
    "cavalry_swordsman_b": ("template_unit_cavalry_melee_swordsman", "Warband Horseman", "Wēnyorēdos",
                            "units/brit/cavalry_swordsman.png", True),
    "champion_infantry_spearman": ("template_unit_champion_infantry_spearman", "Hibernian Champion", "Kawāros",
                                   "units/gaul/champion_infantry.png", False),
    "champion_infantry_javelineer": ("template_unit_champion_infantry_javelineer", "Hibernian Aristocrat", "Aryos",
                                     "units/brit/champion_javelineer.png", False),
    "champion_infantry_trumpeter": ("template_unit_champion_infantry_trumpeter", "Hibernian Carnyx Bearer", "Karnos",
                                    "units/gaul/champion_swordsman_carnyx.png", False),
    "champion_healer": ("template_unit_champion_support_healer", "Hibernian Bard", "Welīts",
                        "units/celt/support_healer.png", False),
    "hero_tuathal": ("template_unit_hero_infantry_javelineer", "Túathal Techtmar", "Tuathal Teachtmhar",
                     "units/brit/hero_caratacos.png", False),
    "hero_fiachu": ("template_unit_hero_cavalry_swordsman", "Fíachu Finnolach", "Fiacha Finnfolaidh",
                    "units/brit/hero_cunobelin.png", False),
}
# vanilla Briton units wrapped: name -> (generic, specific) overrides; None keeps the vanilla identity
WRAPPED = {
    "support_female_citizen": ("Hibernian Woman", "Īwernī Benā"),
    "support_female_citizen_house": ("Hibernian Woman", "Īwernī Benā"),
    "support_civilian": ("Hibernian Freeman", "Īwernī Wiros"),
    "support_civilian_house": ("Hibernian Freeman", "Īwernī Wiros"),
    "support_healer_b": ("Druid", "Druwidos"),
    "support_healer_a": None, "support_healer_e": None,
    "support_trader": ("Trader", "Kwennāios"),
    "war_dog": ("War Hound", "Kūna"),
    "champion_chariot": ("Hibernian War Chariot", "Īwernī Uɸorēdos"),
    "hero_boudicca": ("Elim mac Conrach", "Elim mac Conrach"),
    "ship_fishing": ("Fishing Boat", "Korukos Eiskos"),
    "ship_merchant": ("Merchant Ship", "Longāwreikos"),
    "ship_arrow": ("Warship", "Longākoryos"),
    "ship_fire": None, "ship_scout": None, "siege_ram": ("Battering Ram", "Retios Toglāros"),
}
UNIT_ACTOR = {   # template -> actor key (make_unit_actors)
    "support_female_citizen_house": "support_female_citizen", "support_civilian_house": "support_civilian",
    "hero_boudicca": "hero_elim",
}
AURAS = {"hero_tuathal": "units/heroes/brit_hero_caratacos", "hero_fiachu": "units/heroes/brit_hero_cunobelin",
         "hero_elim": "units/heroes/brit_hero_boudicca", "champion_healer": "units/hiber/bards"}
BARDS = "units/hiber/bards"          # druids and the bard: heroes +10 health, +10% attack (team bonus)
# Karpaton: war chariots carry up to 3 infantry, like a siege tower
CHARIOT_GARRISON = """<GarrisonHolder>
    <Max>3</Max>
    <EjectHealth>0.1</EjectHealth>
    <EjectClassesOnDestroy datatype="tokens">Unit</EjectClassesOnDestroy>
    <List datatype="tokens">Infantry</List>
    <BuffHeal>0</BuffHeal>
    <LoadingRange>3</LoadingRange>
  </GarrisonHolder>"""


def unit_root(parent):
    return ET.Element("Entity", parent=parent)


def identity(root, generic, specific, icon=None, group=None):
    ident = ET.SubElement(root, "Identity")
    ET.SubElement(ident, "Civ").text = CIV
    if group:
        ET.SubElement(ident, "SelectionGroupName").text = group
    if generic:
        ET.SubElement(ident, "GenericName").text = generic
    if specific:
        ET.SubElement(ident, "SpecificName").text = specific
    if icon:
        ET.SubElement(ident, "Icon").text = icon
    return ident


def actor_for(A, key):
    return A.get(key)


def make_units(pub, A):
    written = []
    out = MOD / f"simulation/templates/units/{CIV}"
    brit = set(pub.brit_units())
    # 1. new units (ranked ones get _a and _e)
    for name, (parent, gen, spec, icon, ranked) in NEW_UNITS.items():
        if not parent.startswith("template_"):
            continue
        base = name[:-2] if ranked else name
        root = unit_root(parent)
        ident = identity(root, gen, spec, icon, f"units/{CIV}/{name}" if ranked else None)
        if name.startswith("champion"):
            ET.SubElement(ET.SubElement(ident, "Requirements"), "Techs", datatype="tokens").text = "phase_city"
        if name.startswith(("cavalry_spearman", "cavalry_swordsman", "infantry_maceman")):
            ET.SubElement(ET.SubElement(ident, "Requirements"), "Techs", datatype="tokens").text = "phase_town"
        if name in AURAS:
            root.insert(0, ET.fromstring(f'<Auras datatype="tokens">{AURAS[name]}</Auras>'))
        if name == "hero_tuathal":   # a slinger hero: sling stones are not drawn
            root.append(ET.fromstring("""<Attack><Ranged><AttackName>Sling</AttackName><Projectile><ActorName disable=""/></Projectile></Ranged></Attack>"""))
        if ranked:
            ET.SubElement(ET.SubElement(root, "Promotion"), "Entity").text = f"units/{CIV}/{base}_a"
        ET.SubElement(ET.SubElement(root, "VisualActor"), "Actor").text = A[name]
        write_xml(root, out / f"{name}.xml")
        written.append(name)
        if ranked:
            for r, rank, nxt in (("a", "Advanced", f"units/{CIV}/{base}_e"), ("e", "Elite", None)):
                root = unit_root(f"units/{CIV}/{base}_{'b' if r == 'a' else 'a'}")
                ET.SubElement(ET.SubElement(root, "Identity"), "Rank").text = rank
                if nxt:
                    ET.SubElement(ET.SubElement(root, "Promotion"), "Entity").text = nxt
                else:
                    ET.SubElement(root, "Promotion", disable="")
                ET.SubElement(ET.SubElement(root, "VisualActor"), "Actor").text = A[f"{base}_{r}"]
                write_xml(root, out / f"{base}_{r}.xml")
                written.append(f"{base}_{r}")
    # 2. Briton units wrapped (only the ones the civ uses)
    for name, names in WRAPPED.items():
        if name not in brit:
            continue
        src = pub.template(f"units/brit/{name}")
        root = unit_root(f"units/brit/{name}")
        ident = identity(root, *(names or (None, None)))
        if name == "hero_boudicca":
            ET.SubElement(ident, "Icon").text = "units/brit/hero_boudicca.png"
            root.insert(0, ET.fromstring(f'<Auras datatype="tokens" replace="">{AURAS["hero_elim"]}</Auras>'))
        if name.startswith("support_healer"):
            root.insert(0, ET.fromstring(f'<Auras datatype="tokens">{BARDS}</Auras>'))
        if name in ("champion_chariot", "hero_boudicca"):
            root.append(ET.fromstring(CHARIOT_GARRISON))
        prom = src.find("Promotion/Entity")
        if prom is not None:
            ET.SubElement(ET.SubElement(root, "Promotion"), "Entity").text = prom.text.replace("units/brit/", f"units/{CIV}/")
        key = UNIT_ACTOR.get(name, name)
        if key in A:
            ET.SubElement(ET.SubElement(root, "VisualActor"), "Actor").text = A[key]
        write_xml(root, out / f"{name}.xml")
        written.append(name)
    # hero Elim keeps the Briton chariot hero gameplay under his own name
    shutil.copyfile(out / "hero_boudicca.xml", out / "hero_elim.xml")
    (out / "hero_boudicca.xml").unlink()
    written.remove("hero_boudicca")
    written.append("hero_elim")
    # scouts of the mod (cavalry_scout is a mod template for every civ)
    if (MOD / "simulation/templates/units/brit/cavalry_scout.xml").exists():
        root = unit_root("units/brit/cavalry_scout")
        identity(root, None, None)
        write_xml(root, out / "cavalry_scout.xml")
        written.append("cavalry_scout")
    return written


# ================================================================ civ data

def make_civ_files():
    civ = {
        "Code": CIV,
        "Culture": "celt",
        "Music": [{"File": f, "Type": "peace"} for f in
                  ("The_Fledgling_Kingdom.ogg", "Highland_Mist.ogg", "Celtica.ogg", "Albian_Nocturne.ogg", "Whistler.ogg")],
        "CivBonuses": [
            {"Name": "Curadmír (The Hero's Portion)",
             "History": "At the feast the best cut of the pig went to the greatest warrior, and heroes fought for the honour.",
             "Description": "Heroes +0.5% attack for each enemy unit they kill, up to 40 kills (+20%)."},
            {"Name": "Crech (Cattle Raids)",
             "History": "Wealth and status in Ériu were counted in cattle, won and lost in endless raids.",
             "Description": "Each head of cattle you own yields 1 metal per minute, up to 50 heads."},
            {"Name": "Karpaton (War Chariots)",
             "History": "Irish heroes rode to battle in chariots and leapt down to fight on foot.",
             "Description": "War chariots carry up to 3 infantry, which can dismount at any time."},
            {"Name": "Deas Celtica",
             "History": "The druids, keepers of law, lore and sacrifice, stood beside the warriors of Ériu.",
             "Description": "Druids increase attack rates of soldiers near them by 5%."},
        ],
        "WallSets": ["structures/wallset_palisade", f"structures/{CIV}/wallset_stone"],
        "StartEntities": [
            {"Template": f"structures/{CIV}/civil_centre"},
            {"Template": f"units/{CIV}/support_female_citizen", "Count": 4},
            {"Template": f"units/{CIV}/infantry_spearman_b", "Count": 2},
            {"Template": f"units/{CIV}/infantry_javelineer_b", "Count": 2},
            {"Template": f"units/{CIV}/cavalry_javelineer_b"},
            {"Template": f"units/{CIV}/war_dog"},
        ],
        "AINames": ["Eochaid Feidlech", "Eochaid Airem", "Eterscél", "Nuadu Necht", "Conaire Mór", "Lugaid Riab nDerg",
                    "Conchobar Abradruad", "Crimthann Nia Náir", "Cairbre Cinnchait", "Feradach Finnfechtnach",
                    "Fíatach Finn", "Fiacha Finnfolaidh", "Elim mac Conrach", "Tuathal Teachtmhar"],
        "SkirmishReplacements": {
            "skirmish/units/default_infantry_ranged_b": f"units/{CIV}/infantry_javelineer_b",
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
    teambonuses/hiber_player_teambonus
    teambonuses/hiber_player_teambonus_duel
    teambonuses/hiber_player_teambonus_bards
  </Auras>
  <Identity>
    <Civ>{CIV}</Civ>
    <GenericName>Hibernians</GenericName>
    <SpecificName>Īwernī</SpecificName>
    <History>Ériu, the Hibernia of the Romans, was never conquered by Rome. Between 100 BC and AD 100 the island was a patchwork of small kingdoms (túatha) under the high kings of Tara, cattle-raiding warrior aristocracies bound by the oral Brehon laws, the poetry of the bards and the rites of the druids at royal sites such as Emain Macha, Rathcroghan, Uisnech and Dún Ailinne. Ring forts, crannogs and coastal promontory forts guarded its farms and herds.</History>
    <Icon>emblems/emblem_britons.png</Icon>
  </Identity>
</Entity>""")
    write_xml(player, MOD / f"simulation/templates/special/players/{CIV}.xml")
    rally = ET.fromstring(f"""<Entity parent="special/rallypoint"><Identity><Civ>{CIV}</Civ></Identity></Entity>""")
    write_xml(rally, MOD / f"simulation/templates/special/rallypoints/{CIV}.xml")
    # Battle mode army catalog
    cat_path = MOD / "simulation/data/battle_mode/army_catalog.json"
    if cat_path.exists():
        text = cat_path.read_text(encoding="utf-8")
        if f'"{CIV}":' not in text:
            entries = [("infantry_spearman_b", "infantry", 10, 30), ("infantry_javelineer_b", "ranged", 10, 30),
                       ("infantry_slinger_b", "ranged", 10, 30), ("infantry_maceman_b", "infantry", 12, 20),
                       ("infantry_swordsman_b", "infantry", 12, 20), ("cavalry_javelineer_b", "cavalry", 15, 20),
                       ("cavalry_swordsman_b", "cavalry", 16, 15), ("champion_infantry_spearman", "champion", 22, 10),
                       ("champion_infantry_javelineer", "champion", 22, 10), ("champion_chariot", "champion", 33, 8),
                       ("siege_ram", "siege", 45, 4), ("hero_tuathal", "hero", 75, 1), ("hero_fiachu", "hero", 75, 1),
                       ("hero_elim", "hero", 100, 1)]
            body = ",\n".join(f'\t\t\t{{ "Template": "units/{CIV}/{t}", "Category": "{c}", "Cost": {co}, "Max": {mx} }}'
                              for t, c, co, mx in entries)
            anchor = '\t\t"chibc": ['
            if anchor in text:
                text = text.replace(anchor, f'\t\t"{CIV}": [\n{body}\n\t\t],\n' + anchor, 1)
                cat_path.write_text(text, encoding="utf-8")


def main():
    pub = Public()
    info = json.loads(INFO.read_text())
    for name, (base, meshes, names, trainer) in STRUCTURES.items():
        missing = [m for m in meshes if m not in info]
        if missing:
            print("skip", name, "- not exported:", missing)
            continue
        make_structure_actor(name, meshes, info)
        make_structure(pub, name, base, meshes, names, trainer, info)
    make_plain_copies(pub)
    make_editor_pieces(info)
    make_heads()
    make_capes(pub)
    make_prop_actors()
    A = make_unit_actors(pub)
    units = make_units(pub, A)
    make_civ_files()
    print(f"structures: {len(STRUCTURES) + len(PLAIN_COPIES)}, unit actors: {len(A)}, unit templates: {len(units)}")


if __name__ == "__main__":
    main()
