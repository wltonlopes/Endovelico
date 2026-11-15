"""
Leitura de templates de simulação do 0 A.D. a partir dos mods instalados.

Resolve a herança como o motor (CParamNode::ApplyLayer):
  - parent="a|b|c": "c" é a base; "b" e depois "a" são aplicados por cima.
    Cada componente é procurado em templates/<nome>.xml e depois em
    templates/mixins/<nome>.xml.
  - disable="" remove o nó; replace="" troca o nó inteiro;
    datatype="tokens" junta listas ("-token" remove); merge="" só altera se
    o nó já existir.

Os mods são lidos na ordem dada (o último vence), como -mod=public -mod=x.
Uso típico:
    loader = TemplateLoader([public_zip_path, "<mod folder>"])
    node = loader.get("units/rome/infantry_spearman_b")
    node.text("Identity/GenericName")
"""

import os
import zipfile
import xml.etree.ElementTree as ET

PUBLIC_ZIP_CANDIDATES = [
    "/snap/0ad/current/binaries/data/mods/public/public.zip",
    "/snap/0ad/751/binaries/data/mods/public/public.zip",
    "/usr/share/games/0ad/mods/public/public.zip",
    "/usr/share/0ad/data/mods/public/public.zip",
]


def find_public_zip():
    for path in PUBLIC_ZIP_CANDIDATES:
        if os.path.exists(path):
            return path
    raise FileNotFoundError("public.zip do 0 A.D. não encontrado: " + ", ".join(PUBLIC_ZIP_CANDIDATES))


class Node:
    """Nó de parâmetros já resolvido (subconjunto do CParamNode)."""

    def __init__(self, name):
        self.name = name
        self.value = ""
        self.attrs = {}
        self.children = {}  # ordem de inserção preservada

    def child(self, path):
        node = self
        for part in path.split("/"):
            if not part:
                continue
            node = node.children.get(part)
            if node is None:
                return None
        return node

    def text(self, path, default=""):
        node = self.child(path)
        if node is None:
            return default
        return node.value.strip()

    def number(self, path, default=0.0):
        try:
            return float(self.text(path, ""))
        except ValueError:
            return default

    def tokens(self, path):
        return self.text(path).split()

    def has(self, path):
        return self.child(path) is not None


def _apply_layer(node, element):
    """Aplica um elemento XML (camada filha) sobre `node`."""
    if element.text is not None and element.text.strip() != "" or not list(element):
        text = (element.text or "")
        if element.get("datatype") == "tokens":
            old = node.value.split()
            for token in text.split():
                if token.startswith("-"):
                    token = token[1:]
                    old = [t for t in old if t != token]
                elif token not in old:
                    old.append(token)
            node.value = " ".join(old)
        elif element.get("op") in ("add", "mul", "mul_round") and text.strip() != "":
            try:
                old_value = float(node.value.strip() or 0)
                delta = float(text)
                if element.get("op") == "add":
                    result = old_value + delta
                elif element.get("op") == "mul":
                    result = old_value * delta
                else:
                    result = round(old_value * delta)
                node.value = ("%g" % result)
            except ValueError:
                node.value = text
        elif text.strip() != "" or not node.children:
            node.value = text
    for key, value in element.attrib.items():
        if key in ("disable", "replace", "merge", "filtered", "datatype", "op"):
            if key == "datatype":
                node.attrs[key] = value
            continue
        node.attrs[key] = value

    for sub in element:
        name = sub.tag
        if "disable" in sub.attrib:
            node.children.pop(name, None)
            continue
        if "merge" in sub.attrib and name not in node.children:
            continue
        if "replace" in sub.attrib or name not in node.children:
            node.children[name] = Node(name)
        _apply_layer(node.children[name], sub)


class TemplateLoader:
    def __init__(self, sources):
        """`sources`: caminhos de .zip ou pastas de mod, do mais baixo ao mais alto."""
        self.sources = []
        for src in sources:
            if src.endswith(".zip"):
                self.sources.append(("zip", zipfile.ZipFile(src)))
            else:
                self.sources.append(("dir", src))
        self.cache = {}
        self.xml_cache = {}

    def read_file(self, path):
        """Conteúdo do arquivo no mod de maior prioridade que o tiver."""
        for kind, src in reversed(self.sources):
            if kind == "zip":
                try:
                    return src.read(path)
                except KeyError:
                    continue
            else:
                full = os.path.join(src, path)
                if os.path.isfile(full):
                    with open(full, "rb") as handle:
                        return handle.read()
        return None

    def list_files(self, prefix, suffix=""):
        found = set()
        for kind, src in self.sources:
            if kind == "zip":
                for name in src.namelist():
                    if name.startswith(prefix) and name.endswith(suffix):
                        found.add(name)
            else:
                base = os.path.join(src, prefix)
                if not os.path.isdir(base):
                    continue
                for root, _dirs, files in os.walk(base):
                    for name in files:
                        rel = os.path.relpath(os.path.join(root, name), src)
                        if rel.startswith(prefix) and rel.endswith(suffix):
                            found.add(rel.replace(os.sep, "/"))
        return sorted(found)

    def _xml(self, name):
        if name in self.xml_cache:
            return self.xml_cache[name]
        data = None
        for path in ("simulation/templates/%s.xml" % name, "simulation/templates/mixins/%s.xml" % name):
            data = self.read_file(path)
            if data is not None:
                break
        root = ET.fromstring(data) if data is not None else None
        self.xml_cache[name] = root
        return root

    def exists(self, name):
        return self._xml(name) is not None

    def get(self, name):
        """Template resolvido (Node) ou None."""
        if name in self.cache:
            return self.cache[name]
        self.cache[name] = None  # evita ciclos
        parts = name.split("|")
        if len(parts) > 1:
            base = self.get("|".join(parts[1:]))
            layer = self._xml(parts[0])
            if base is None or layer is None:
                return None
            node = _clone(base)
            _apply_layer(node, layer)
            self.cache[name] = node
            return node

        root = self._xml(name)
        if root is None:
            return None
        parent = root.get("parent")
        node = _clone(self.get(parent)) if parent else Node("Entity")
        if parent and node is None:
            return None
        _apply_layer(node, root)
        self.cache[name] = node
        return node


def _clone(node):
    if node is None:
        return None
    copy = Node(node.name)
    copy.value = node.value
    copy.attrs = dict(node.attrs)
    for key, child in node.children.items():
        copy.children[key] = _clone(child)
    return copy
