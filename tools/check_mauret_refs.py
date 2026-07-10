#!/usr/bin/env python3
"""Check Mauretania XML references used by this mod.

The script is intentionally narrow: it scans the Mauretania templates and
actors currently under active modding, then verifies referenced actors,
variants, meshes, textures, materials, and trained entities against this mod
and an optional 0 A.D. public mod directory.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET


DEFAULT_PUBLIC = Path("/snap/0ad/731/binaries/data/mods/public")
SCOPES = (
    Path("simulation/templates/structures/damar"),
    Path("simulation/templates/units/damar"),
    Path("art/actors/structures/damara"),
    Path("art/actors/units/damara"),
    Path("art/actors/props/units/elephant"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--public",
        type=Path,
        default=DEFAULT_PUBLIC,
        help="Path to the 0 A.D. public mod used as fallback.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Scan every XML file in the mod instead of only Mauretania scopes.",
    )
    return parser.parse_args()


def iter_xml_files(root: Path, scan_all: bool) -> list[Path]:
    if scan_all:
        return sorted(path for path in root.rglob("*.xml") if ".git" not in path.parts)

    files: list[Path] = []
    for scope in SCOPES:
        base = root / scope
        if base.exists():
            files.extend(path for path in base.rglob("*.xml"))
    return sorted(files)


class AssetIndex:
    def __init__(self, roots: tuple[Path, ...]) -> None:
        self.roots = roots
        self.zip_entries: dict[Path, set[str]] = {}
        for root in roots:
            zip_path = root / "public.zip"
            if not zip_path.exists():
                continue
            with zipfile.ZipFile(zip_path) as archive:
                self.zip_entries[zip_path] = set(archive.namelist())

    def exists(self, relpath: Path) -> bool:
        rel = relpath.as_posix()
        if any((root / relpath).exists() for root in self.roots if root):
            return True
        for root in self.roots:
            parent = root / relpath.parent
            if parent.exists() and any(parent.glob(f"{relpath.name}.cached.*")):
                return True
        return any(
            rel in entries or any(entry.startswith(f"{rel}.cached.") for entry in entries)
            for entries in self.zip_entries.values()
        )

    def describe_roots(self) -> str:
        labels = [str(path) for path in self.roots]
        labels.extend(str(path) for path in self.zip_entries)
        return ", ".join(labels)


def template_path(entity: str, civ: str) -> Path:
    entity = entity.replace("{civ}", civ)
    entity = entity.replace("{native}", civ)
    return Path("simulation/templates") / f"{entity}.xml"


def actor_path(value: str) -> Path:
    return Path("art/actors") / value


def variant_path(value: str) -> Path:
    return Path("art/variants") / value


def mesh_path(value: str) -> Path:
    return Path("art/meshes") / value


def texture_path(value: str) -> Path:
    return Path("art/textures/skins") / value


def material_path(value: str) -> Path:
    return Path("art/materials") / value


def rel_display(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def text_of(node: ET.Element | None) -> str:
    return (node.text or "").strip() if node is not None else ""


def add_missing(
    missing: list[str],
    kind: str,
    owner: Path,
    root: Path,
    value: str,
    relpath: Path,
    assets: AssetIndex,
) -> None:
    if "{" in value or value.startswith("-"):
        return
    if value and not assets.exists(relpath):
        missing.append(
            f"{rel_display(owner, root)}: missing {kind} '{value}' -> {relpath.as_posix()}"
        )


def collect_entity_tokens(node: ET.Element) -> list[str]:
    tokens: list[str] = []
    for entities in node.findall(".//Entities"):
        if (entities.get("datatype") or "") != "tokens":
            continue
        tokens.extend((entities.text or "").split())
    return tokens


def check_file(path: Path, root: Path, assets: AssetIndex) -> tuple[list[str], list[str]]:
    missing: list[str] = []
    suspicious: list[str] = []

    try:
        data = path.read_text(encoding="utf-8-sig")
        tree = ET.ElementTree(ET.fromstring(data))
    except ET.ParseError as err:
        return [f"{rel_display(path, root)}: XML parse error: {err}"], suspicious
    except UnicodeDecodeError as err:
        return [f"{rel_display(path, root)}: decode error: {err}"], suspicious

    doc = tree.getroot()
    civ = text_of(doc.find(".//Identity/Civ")) or "mauret"

    for actor in doc.findall(".//Actor"):
        value = text_of(actor)
        add_missing(missing, "actor", path, root, value, actor_path(value), assets)

    for actor in doc.findall(".//FoundationActor"):
        value = text_of(actor)
        add_missing(missing, "foundation actor", path, root, value, actor_path(value), assets)

    for prop in doc.findall(".//prop"):
        value = (prop.get("actor") or "").strip()
        if not value:
            continue
        add_missing(missing, "prop actor", path, root, value, actor_path(value), assets)

    for variant in doc.findall(".//variant"):
        value = (variant.get("file") or "").strip()
        if value:
            add_missing(missing, "variant", path, root, value, variant_path(value), assets)

    for mesh in doc.findall(".//mesh"):
        value = text_of(mesh)
        add_missing(missing, "mesh", path, root, value, mesh_path(value), assets)

    for texture in doc.findall(".//texture"):
        value = (texture.get("file") or "").strip()
        add_missing(missing, "texture", path, root, value, texture_path(value), assets)

    for material in doc.findall(".//material"):
        value = text_of(material)
        add_missing(missing, "material", path, root, value, material_path(value), assets)

    for entity in collect_entity_tokens(doc):
        if entity.endswith("_") or entity.endswith("/"):
            suspicious.append(f"{rel_display(path, root)}: suspicious entity token '{entity}'")
        add_missing(missing, "trained entity", path, root, entity, template_path(entity, civ), assets)

    for spawn in doc.findall(".//SpawnEntityOnDeath"):
        value = text_of(spawn)
        if not value:
            continue
        entity = value.split("|", 1)[-1]
        add_missing(missing, "death spawn", path, root, entity, template_path(entity, civ), assets)

    return missing, suspicious


def main() -> int:
    args = parse_args()
    root = Path.cwd()
    roots = tuple(path for path in (root, args.public) if path.exists())
    assets = AssetIndex(roots)

    files = iter_xml_files(root, args.all)
    missing: list[str] = []
    suspicious: list[str] = []
    for path in files:
        file_missing, file_suspicious = check_file(path, root, assets)
        missing.extend(file_missing)
        suspicious.extend(file_suspicious)

    print(f"Scanned XML files: {len(files)}")
    print(f"Reference roots: {assets.describe_roots()}")
    print()

    if missing:
        print(f"Missing references ({len(missing)}):")
        for item in missing:
            print(f"  - {item}")
    else:
        print("Missing references: none")

    print()

    if suspicious:
        print(f"Suspicious values ({len(suspicious)}):")
        for item in suspicious:
            print(f"  - {item}")
    else:
        print("Suspicious values: none")

    return 1 if missing or suspicious else 0


if __name__ == "__main__":
    raise SystemExit(main())
