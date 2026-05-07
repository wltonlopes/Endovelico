#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
=========================================================
 ENDOVELICO AUTO WIKI GENERATOR
=========================================================

Gerador automático de Wiki Markdown para mods do 0 A.D.

Funcionalidades:
✓ Lê civilizações via special/players
✓ Lê civ.json
✓ Lê unidades
✓ Lê estruturas
✓ Resolve herança de templates
✓ Resolve {civ}
✓ Detecta tecnologias
✓ Detecta unidades treináveis
✓ Detecta auras
✓ Detecta classes
✓ Resume histórias
✓ Tolera XMLs incompletos
✓ Tolera JSONs inválidos
✓ Evita loops de herança
✓ Ignora templates abstratos
✓ Compatível com mixins
✓ Compatível com templates derivados

Saída:
wiki_civs/<civ>.md

=========================================================
"""

import os
import re
import json
import xml.etree.ElementTree as ET
from collections import defaultdict

# =========================================================
# CONFIG
# =========================================================

MOD_PATH = "/CAMINHO/DO/Endovelico"

TEMPLATES_PATH = os.path.join(MOD_PATH, "simulation/templates")

UNITS_PATH = os.path.join(TEMPLATES_PATH, "units")
STRUCTURES_PATH = os.path.join(TEMPLATES_PATH, "structures")

PLAYERS_DIR = os.path.join(
    TEMPLATES_PATH,
    "special/players"
)

CIVS_DIR = os.path.join(
    MOD_PATH,
    "simulation/data/civs"
)

OUTPUT_DIR = os.path.join(
    MOD_PATH,
    "wiki_civs"
)

os.makedirs(OUTPUT_DIR, exist_ok=True)

# =========================================================
# CACHE
# =========================================================

template_cache = {}

# =========================================================
# HELPERS
# =========================================================

def safe_text(node, default=""):

    if node is None:
        return default

    if node.text is None:
        return default

    return node.text.strip()


def xpath_text(root, xpath, default=""):

    if root is None:
        return default

    node = root.find(xpath)

    return safe_text(node, default)


def clean_tokens(text):

    if text is None:
        return []

    if not isinstance(text, str):
        return []

    text = text.strip()

    if not text:
        return []

    return [
        token.strip()
        for token in re.split(r"\s+", text)
        if token.strip()
    ]


def summarize(text, max_sentences=3):

    if not text:
        return "*(Sem descrição)*"

    text = text.replace("\n", " ")

    sentences = re.split(
        r'(?<=[.!?])\s+',
        text
    )

    return " ".join(
        sentences[:max_sentences]
    ).strip()


def parse_xml(path):

    try:
        tree = ET.parse(path)
        return tree.getroot()

    except ET.ParseError:
        print(f"[XML INVÁLIDO] {path}")
        return None

    except Exception as e:
        print(f"[ERRO XML] {path}: {e}")
        return None

# =========================================================
# TEMPLATE CACHE
# =========================================================

def build_template_cache():

    for rootdir, _, files in os.walk(TEMPLATES_PATH):

        for file in files:

            if not file.endswith(".xml"):
                continue

            full = os.path.join(rootdir, file)

            rel = os.path.relpath(
                full,
                TEMPLATES_PATH
            )

            rel = rel.replace("\\", "/")
            rel = rel.replace(".xml", "")

            template_cache[rel] = full


def load_template(template_name):

    path = template_cache.get(template_name)

    if not path:
        return None

    return parse_xml(path)

# =========================================================
# ABSTRACT TEMPLATES
# =========================================================

def is_abstract(template_name):

    if template_name.startswith("template_"):
        return True

    if "/template_" in template_name:
        return True

    if "mixins/" in template_name:
        return True

    return False

# =========================================================
# HERANÇA
# =========================================================

def inherit_identity(root, visited=None):

    if visited is None:
        visited = set()

    data = {
        "civ": "",
        "generic": "",
        "specific": "",
        "tooltip": "",
        "classes": [],
        "visible_classes": []
    }

    if root is None:
        return data

    parent = root.attrib.get("parent")

    # =====================================================
    # HERDAR DO PAI
    # =====================================================

    if parent:

        if parent in visited:
            return data

        visited.add(parent)

        parent_root = load_template(parent)

        if parent_root is not None:

            pdata = inherit_identity(
                parent_root,
                visited
            )

            data.update(pdata)

    # =====================================================
    # DADOS LOCAIS
    # =====================================================

    identity = root.find("Identity")

    if identity is not None:

        civ = xpath_text(identity, "Civ")

        if civ:
            data["civ"] = civ

        generic = xpath_text(identity, "GenericName")

        if generic:
            data["generic"] = generic

        specific = xpath_text(identity, "SpecificName")

        if specific:
            data["specific"] = specific

        tooltip = xpath_text(identity, "Tooltip")

        if tooltip:
            data["tooltip"] = tooltip

        classes = clean_tokens(
            xpath_text(identity, "Classes")
        )

        if classes:
            data["classes"] = classes

        visible = clean_tokens(
            xpath_text(identity, "VisibleClasses")
        )

        if visible:
            data["visible_classes"] = visible

    return data

# =========================================================
# AURAS
# =========================================================

def get_auras(root):

    if root is None:
        return []

    auras = root.find("Auras")

    if auras is None:
        return []

    return clean_tokens(auras.text)

# =========================================================
# TRAINER
# =========================================================

def get_trained_entities(root, civ):

    if root is None:
        return []

    trainer = root.find("Trainer")

    if trainer is None:
        return []

    entities = trainer.find("Entities")

    if entities is None:
        return []

    if not entities.text:
        return []

    result = []

    for ent in clean_tokens(entities.text):

        ent = ent.replace("{civ}", civ)

        ent = ent.replace(".xml", "")

        ent = ent.replace("units/", "")

        result.append(ent)

    return result

# =========================================================
# RESEARCHER
# =========================================================

def get_techs(root, civ):

    if root is None:
        return []

    researcher = root.find("Researcher")

    if researcher is None:
        return []

    technologies = researcher.find("Technologies")

    if technologies is None:
        return []

    if not technologies.text:
        return []

    result = []

    for tech in clean_tokens(technologies.text):

        tech = tech.replace("{civ}", civ)

        result.append(tech)

    return result

# =========================================================
# CLASSIFICAÇÃO
# =========================================================

def classify_entity(identity):

    classes = (
        identity["classes"]
        + identity["visible_classes"]
    )

    classes = set(classes)

    mapping = {
        "Hero": "Hero",
        "Champion": "Champion",
        "Infantry": "Infantry",
        "Cavalry": "Cavalry",
        "Siege": "Siege",
        "Support": "Support",
        "Worker": "Worker",
        "FemaleCitizen": "Female Citizen",
        "Ship": "Ship",
        "Trader": "Trader",
        "Elephant": "Elephant",
        "Archer": "Archer",
        "Javelin": "Javelin",
        "Slinger": "Slinger",
        "Spearman": "Spearman",
        "Sword": "Sword"
    }

    tags = []

    for key, label in mapping.items():

        if key in classes:
            tags.append(label)

    return sorted(set(tags))

# =========================================================
# SCAN TEMPLATES
# =========================================================

def scan_templates(basepath):

    results = []

    for rootdir, _, files in os.walk(basepath):

        for file in files:

            if not file.endswith(".xml"):
                continue

            full = os.path.join(rootdir, file)

            root = parse_xml(full)

            if root is None:
                continue

            rel = os.path.relpath(
                full,
                basepath
            )

            rel = rel.replace("\\", "/")
            rel = rel.replace(".xml", "")

            if is_abstract(rel):
                continue

            identity = inherit_identity(root)

            civ = identity.get("civ", "")

            if not civ:
                continue

            results.append({
                "template": rel,
                "identity": identity,
                "auras": get_auras(root),
                "trained": get_trained_entities(root, civ),
                "techs": get_techs(root, civ),
                "categories": classify_entity(identity),
                "parent": root.attrib.get("parent", "")
            })

    return results

# =========================================================
# BUILD CACHE
# =========================================================

print("Construindo cache...")
build_template_cache()

# =========================================================
# LOAD DATA
# =========================================================

print("Lendo unidades...")
units = scan_templates(UNITS_PATH)

print("Lendo estruturas...")
structures = scan_templates(STRUCTURES_PATH)

# =========================================================
# UNIT LOOKUP
# =========================================================

unit_lookup = {}

for unit in units:

    short = unit["template"].split("/")[-1]

    unit_lookup[short] = unit

# =========================================================
# ORGANIZAÇÃO POR CIV
# =========================================================

civs = defaultdict(lambda: {
    "units": [],
    "structures": [],
    "techs": set()
})

for unit in units:

    civ = unit["identity"]["civ"]

    civs[civ]["units"].append(unit)

for structure in structures:

    civ = structure["identity"]["civ"]

    civs[civ]["structures"].append(structure)

    for tech in structure["techs"]:
        civs[civ]["techs"].add(tech)

# =========================================================
# PLAYER XML
# =========================================================

for file in os.listdir(PLAYERS_DIR):

    if not file.endswith(".xml"):
        continue

    full = os.path.join(PLAYERS_DIR, file)

    root = parse_xml(full)

    if root is None:
        continue

    identity = root.find("Identity")

    if identity is None:
        continue

    civ_code = xpath_text(identity, "Civ", "unknown")

    if civ_code == "unknown":
        continue

    civ_name = xpath_text(
        identity,
        "GenericName",
        civ_code.upper()
    )

    history = xpath_text(
        identity,
        "History",
        "*(História não definida)*"
    )

    short_history = summarize(history)

    # =====================================================
    # JSON
    # =====================================================

    json_path = os.path.join(
        CIVS_DIR,
        f"{civ_code}.json"
    )

    data = {}

    if os.path.exists(json_path):

        try:

            with open(
                json_path,
                encoding="utf-8-sig"
            ) as f:

                data = json.load(f)

        except Exception as e:

            print(f"[JSON ERRO] {json_path}: {e}")

            data = {}

    ai_names = data.get("AINames", [])
    civ_bonuses = data.get("CivBonuses", [])
    team_bonuses = data.get("TeamBonuses", [])

    # =====================================================
    # MARKDOWN
    # =====================================================

    md = []

    md.append(f"# {civ_name}\n")

    # =====================================================
    # HISTÓRIA
    # =====================================================

    md.append("## História\n")

    md.append(short_history + "\n")

    # =====================================================
    # BÔNUS CIV
    # =====================================================

    md.append("## Bônus da Civilização\n")

    if civ_bonuses:

        for b in civ_bonuses:

            if isinstance(b, dict):

                name = b.get("Name", "Bonus")
                desc = b.get("Description", "")

                md.append(
                    f"- **{name}**: {desc}"
                )

            else:
                md.append(f"- {b}")

    else:
        md.append("*(Nenhum definido)*")

    # =====================================================
    # TEAM BONUS
    # =====================================================

    md.append("\n## Bônus de Equipe\n")

    if team_bonuses:

        for b in team_bonuses:

            if isinstance(b, dict):

                name = b.get("Name", "Bonus")
                desc = b.get("Description", "")

                md.append(
                    f"- **{name}**: {desc}"
                )

            else:
                md.append(f"- {b}")

    else:
        md.append("*(Nenhum definido)*")

    # =====================================================
    # AI NAMES
    # =====================================================

    md.append("\n## Nomes da IA\n")

    if ai_names:

        for n in sorted(ai_names, key=str):

            if isinstance(n, dict):

                md.append(
                    f"- {n.get('Name', 'Unknown')}"
                )

            else:
                md.append(f"- {n}")

    else:
        md.append("*(A definir)*")

    # =====================================================
    # ESTRUTURAS
    # =====================================================

    md.append("\n## Estruturas\n")

    civ_structures = sorted(
        civs[civ_code]["structures"],
        key=lambda x: (
            x["identity"]["specific"]
            or x["identity"]["generic"]
            or x["template"]
        )
    )

    if civ_structures:

        for structure in civ_structures:

            ident = structure["identity"]

            name = (
                ident["specific"]
                or ident["generic"]
                or structure["template"]
            )

            md.append(f"### {name}")

            if ident["generic"]:
                md.append(
                    f"**Nome genérico:** "
                    f"{ident['generic']}"
                )

            if ident["tooltip"]:
                md.append(
                    f"**Descrição:** "
                    f"{ident['tooltip']}"
                )

            all_classes = sorted(set(
                ident["classes"]
                + ident["visible_classes"]
            ))

            if all_classes:

                md.append(
                    f"**Classes:** "
                    f"{', '.join(all_classes)}"
                )

            if structure["trained"]:

                md.append(
                    "\n#### Unidades treináveis\n"
                )

                for trained in structure["trained"]:

                    short = trained.split("/")[-1]

                    trained_unit = unit_lookup.get(short)

                    if trained_unit:

                        uident = trained_unit["identity"]

                        uname = (
                            uident["specific"]
                            or uident["generic"]
                            or short
                        )

                        line = f"- **{uname}**"

                        categories = trained_unit["categories"]

                        if categories:

                            line += (
                                f" "
                                f"({', '.join(categories)})"
                            )

                        md.append(line)

                    else:
                        md.append(f"- {short}")

            md.append("")

    else:
        md.append("*(Nenhuma estrutura encontrada)*")

    # =====================================================
    # UNIDADES
    # =====================================================

    md.append("\n## Unidades\n")

    civ_units = sorted(
        civs[civ_code]["units"],
        key=lambda x: (
            x["identity"]["specific"]
            or x["identity"]["generic"]
            or x["template"]
        )
    )

    if civ_units:

        for unit in civ_units:

            ident = unit["identity"]

            name = (
                ident["specific"]
                or ident["generic"]
                or unit["template"]
            )

            md.append(f"### {name}")

            if ident["generic"]:

                md.append(
                    f"**Nome genérico:** "
                    f"{ident['generic']}"
                )

            if unit["categories"]:

                md.append(
                    f"**Categoria:** "
                    f"{', '.join(unit['categories'])}"
                )

            all_classes = sorted(set(
                ident["classes"]
                + ident["visible_classes"]
            ))

            if all_classes:

                md.append(
                    f"**Classes:** "
                    f"{', '.join(all_classes)}"
                )

            if unit["auras"]:

                md.append("\n**Auras:**")

                for aura in unit["auras"]:
                    md.append(f"- {aura}")

            md.append("")

    else:
        md.append("*(Nenhuma unidade encontrada)*")

    # =====================================================
    # TECNOLOGIAS
    # =====================================================

    md.append("\n## Tecnologias\n")

    techs = sorted(civs[civ_code]["techs"])

    if techs:

        for tech in techs:
            md.append(f"- {tech}")

    else:
        md.append("*(Nenhuma tecnologia encontrada)*")

    # =====================================================
    # SAVE
    # =====================================================

    output_file = os.path.join(
        OUTPUT_DIR,
        f"{civ_code}.md"
    )

    with open(
        output_file,
        "w",
        encoding="utf-8"
    ) as f:

        f.write("\n".join(md))

    print(f"[OK] {output_file}")

print("\n===================================")
print(" WIKI GERADA COM SUCESSO")
print("===================================")
print(f"Saída: {OUTPUT_DIR}")
