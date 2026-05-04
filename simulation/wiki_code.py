import os
import json
import xml.etree.ElementTree as ET

PLAYERS_DIR = "simulation/templates/special/players"
CIVS_DIR = "simulation/data/civs"
OUTPUT_DIR = "wiki_civs"

os.makedirs(OUTPUT_DIR, exist_ok=True)

def summarize(text, max_sentences=3):
    sentences = text.split(". ")
    return ". ".join(sentences[:max_sentences]).strip()

for file in os.listdir(PLAYERS_DIR):
    if not file.endswith(".xml"):
        continue

    # -------- XML --------
    tree = ET.parse(os.path.join(PLAYERS_DIR, file))
    root = tree.getroot()
    identity = root.find("Identity")

    civ_code = identity.find("Civ").text.strip()
    name = identity.find("GenericName").text.strip()
    history_node = identity.find("History")
    history = history_node.text.strip() if history_node is not None and history_node.text else "*(História não definida)*"
    short_history = summarize(history)

    # -------- JSON --------
    json_path = os.path.join(CIVS_DIR, f"{civ_code}.json")

    ai_names = []
    civ_bonuses = []
    team_bonuses = []

    if os.path.exists(json_path):
        with open(json_path, encoding="utf-8-sig") as f:
            data = json.load(f)

            ai_names = data.get("AINames", [])
            civ_bonuses = data.get("CivBonuses", [])
            team_bonuses = data.get("TeamBonuses", [])

    # -------- Markdown --------
    md = f"# {name}\n\n"

    md += "## História\n"
    md += short_history + "\n\n"

    md += "## Estruturas\n*(Em desenvolvimento)*\n\n"
    md += "## Unidades\n*(Em desenvolvimento)*\n\n"

    # ---- CIV BONUS ----
    md += "## Bônus da Civilização\n"
    if civ_bonuses:
        for b in civ_bonuses:
            md += f"- {b}\n"
    else:
        md += "*(Nenhum definido)*\n"

    # ---- TEAM BONUS ----
    md += "\n## Bônus de Equipe\n"
    if team_bonuses:
        for b in team_bonuses:
            md += f"- {b}\n"
    else:
        md += "*(Nenhum definido)*\n"

    # ---- AI NAMES ----
    md += "\n## IA Nomes\n"
    if ai_names:
        for n in ai_names:
            md += f"- {n}\n"
    else:
        md += "*(A definir)*\n"

    md += "\n## Tecnologias\n*(Em desenvolvimento)*\n"

    with open(f"{OUTPUT_DIR}/{civ_code}.md", "w", encoding="utf-8") as f:
        f.write(md)

print("Wiki limpa gerada.")