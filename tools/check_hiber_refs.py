#!/usr/bin/env python3
"""Check every file the Hibernian civ refers to: actors, meshes, textures, variants, templates, icons."""
import glob, os, re, sys, zipfile
import xml.etree.ElementTree as ET
MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
Z = zipfile.ZipFile("/snap/0ad/current/binaries/data/mods/public/public.zip")
PUB = set(Z.namelist())
CIV, ART = "hiber", "hibernians"


def exists(path):
    return (os.path.exists(os.path.join(MOD, path)) or path in PUB or path + ".cached.pmd" in PUB
            or path + ".cached.dds" in PUB or path + ".cached.xmb" in PUB)


def read(path):
    p = os.path.join(MOD, path)
    if os.path.exists(p):
        return ET.parse(p).getroot()
    return ET.fromstring(Z.read(path)) if path in PUB else None


errors = []
seen = set()


def check_actor(path, origin):
    if path in seen:
        return
    seen.add(path)
    full = "art/actors/" + path
    if not exists(full):
        errors.append(f"actor {path} (from {origin})")
        return
    root = read(full)
    if root is None:
        return
    for m in root.iter("mesh"):
        if not exists("art/meshes/" + m.text.strip()):
            errors.append(f"mesh {m.text} in {path}")
    for t in root.iter("texture"):
        if not exists("art/textures/skins/" + t.get("file")):
            errors.append(f"texture {t.get('file')} in {path}")
    for p in root.iter("prop"):
        a = p.get("actor")
        if a and not a.startswith("particle/"):
            check_actor(a, path)
    for v in root.iter("variant"):
        if v.get("file") and not exists("art/variants/" + v.get("file")):
            errors.append(f"variant {v.get('file')} in {path}")


for f in glob.glob(f"{MOD}/art/actors/**/*.xml", recursive=True):
    rel = os.path.relpath(f, f"{MOD}/art/actors")
    if ART in rel or f"/{CIV}" in rel or f"{CIV}_" in rel:
        check_actor(rel, "scan")


def template_exists(name):
    return exists(f"simulation/templates/{name}.xml")


for f in glob.glob(f"{MOD}/simulation/templates/**/*.xml", recursive=True):
    rel = os.path.relpath(f, f"{MOD}/simulation/templates")
    if f"/{CIV}/" not in "/" + rel and f"{CIV}_" not in rel and not rel.endswith(f"/{CIV}.xml"):
        continue
    if "/tw/" in rel:
        continue
    root = ET.parse(f).getroot()
    parent = root.get("parent")
    if parent:
        for part in parent.split("|"):
            if not template_exists(part):
                errors.append(f"parent {part} of {rel}")
    for e in root.iter("Entities"):
        for tok in (e.text or "").split():
            tok = tok.lstrip("-").replace("{civ}", CIV)
            if "{" not in tok and not template_exists(tok):
                errors.append(f"trains {tok} in {rel}")
    for e in root.iter("Entity"):
        if e.text and e.text.strip() and e.tag == "Entity" and not template_exists(e.text.strip()):
            errors.append(f"promotion {e.text.strip()} in {rel}")
    for a in root.iter("Actor"):
        check_actor(a.text.strip(), rel)
    for a in root.iter("FoundationActor"):
        check_actor(a.text.strip(), rel)
    for i in root.iter("Icon"):
        if not exists("art/textures/ui/session/portraits/" + i.text.strip()):
            errors.append(f"icon {i.text} in {rel}")
    for a in root.iter("Auras"):
        for tok in (a.text or "").split():
            if not exists(f"simulation/data/auras/{tok}.json"):
                errors.append(f"aura {tok} in {rel}")

print("\n".join(sorted(set(errors))) or "all references found", f"\n({len(seen)} actors checked)")
