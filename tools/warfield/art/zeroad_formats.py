"""Leitores dos formatos compilados do 0 A.D. (PMD, PSA) e do public.zip.

O public.zip só traz as versões em cache: `X.dae.cached.pmd` (malha),
`X.dae.cached.psa` (animação) e `X.cached.dds` (textura).
"""
import io
import os
import struct
import zipfile

import numpy as np
from PIL import Image


class PublicArchive:
    """Leitura dos arquivos de arte do public.zip, com cache em memória."""

    def __init__(self, path):
        self.zip = zipfile.ZipFile(path)
        self.names = set(self.zip.namelist())
        self.cache = {}

    def has(self, name):
        return name in self.names

    def read(self, name):
        if name not in self.cache:
            self.cache[name] = self.zip.read(name)
        return self.cache[name]

    def mesh(self, path):
        return read_pmd(self.read("art/meshes/" + path + ".cached.pmd"))

    def animation(self, path):
        return read_psa(self.read("art/animation/" + path + ".cached.psa"))

    def texture(self, path):
        """Textura RGBA (numpy float 0..1, HxWx4) ou None."""
        key = "tex:" + path
        if key not in self.cache:
            name = "art/textures/skins/" + path + ".cached.dds"
            img = None
            if name in self.names:
                try:
                    img = Image.open(io.BytesIO(self.read(name))).convert("RGBA")
                except Exception:
                    img = None
            self.cache[key] = None if img is None else np.asarray(img, dtype=np.float32) / 255.0
        return self.cache[key]


def quat_to_matrix(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ], dtype=np.float64)


def bone_matrix(translation, rotation):
    m = np.eye(4)
    m[:3, :3] = quat_to_matrix(rotation)
    m[:3, 3] = translation
    return m


class Reader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def take(self, fmt):
        size = struct.calcsize(fmt)
        values = struct.unpack_from("<" + fmt, self.data, self.pos)
        self.pos += size
        return values

    def u32(self):
        return self.take("I")[0]

    def string(self):
        length = self.u32()
        text = self.data[self.pos:self.pos + length].decode("latin-1")
        self.pos += length
        return text


def read_pmd(data):
    r = Reader(data)
    magic = data[:4]
    if magic != b"PSMD":
        raise ValueError("not a PMD file")
    r.pos = 4
    version = r.u32()
    r.u32()  # tamanho dos dados
    count = r.u32()
    uv_sets = r.u32() if version >= 4 else 1
    positions = np.zeros((count, 3))
    normals = np.zeros((count, 3))
    uvs = np.zeros((count, 2))
    bones = np.zeros((count, 4), dtype=np.int32)
    weights = np.zeros((count, 4))
    for i in range(count):
        values = r.take("6f")
        positions[i] = values[:3]
        normals[i] = values[3:]
        for k in range(uv_sets):
            uv = r.take("2f")
            if k == 0:
                uvs[i] = uv
        bones[i] = r.take("4B")
        weights[i] = r.take("4f")
    faces = np.array([r.take("3H") for _ in range(r.u32())], dtype=np.int32).reshape(-1, 3)
    bind = []
    for _ in range(r.u32()):
        values = r.take("7f")
        bind.append(bone_matrix(values[:3], values[3:]))
    props = {}
    if version >= 2:
        for _ in range(r.u32()):
            name = r.string()
            values = r.take("7f")
            bone = r.take("B")[0]
            props[name] = (bone_matrix(values[:3], values[3:]), bone)
    return {
        "positions": positions, "normals": normals, "uvs": uvs,
        "bones": bones, "weights": weights, "faces": faces,
        "bind": bind, "props": props,
    }


def read_psa(data):
    r = Reader(data)
    if data[:4] != b"PSSA":
        raise ValueError("not a PSA file")
    r.pos = 4
    r.u32()  # versão
    r.u32()  # tamanho
    name = r.string()
    frame_length = r.take("f")[0]
    bone_count = r.u32()
    frame_count = r.u32()
    frames = []
    for _ in range(frame_count):
        frame = []
        for _ in range(bone_count):
            values = r.take("7f")
            frame.append(bone_matrix(values[:3], values[3:]))
        frames.append(frame)
    return {"name": name, "frame_length": frame_length, "frames": frames}


class ModArchive(PublicArchive):
    """
    Arte de um mod por cima do public.zip, na ordem em que o jogo procura:
    arquivos soltos do mod (art/... em .pmd, .psa, .png, .dds), depois as
    conversões que o próprio jogo guardou no cache
    (~/.cache/0ad/<mod>/art/.../X.dae.<hash>.pmd|psa) e por fim o
    public.zip. Malhas e animações só em COLLADA (.dae) precisam ter sido
    carregadas uma vez pelo jogo (veja gen_army_sprites.py --warm-cache).
    """

    def __init__(self, public_zip, mod_dir, cache_dir=None):
        super().__init__(public_zip)
        self.mod_dir = mod_dir
        self.cache_dir = cache_dir
        self._cache_index = None

    def _mod_file(self, name):
        path = os.path.join(self.mod_dir, name)
        return path if os.path.isfile(path) else None

    def _cached(self, name, extension):
        """Conversão do jogo para `name` (ex.: art/meshes/x.dae -> .pmd), a mais nova."""
        if not self.cache_dir:
            return None
        if self._cache_index is None:
            self._cache_index = {}
            for root, _, files in os.walk(os.path.join(self.cache_dir, "art")):
                for file in files:
                    full = os.path.join(root, file)
                    rel = os.path.relpath(full, self.cache_dir).replace(os.sep, "/")
                    # x.dae.<hash>.pmd -> x.dae
                    parts = rel.rsplit(".", 2)
                    if len(parts) == 3:
                        key = (parts[0], "." + parts[2])
                        old = self._cache_index.get(key)
                        if old is None or os.path.getmtime(full) > os.path.getmtime(old):
                            self._cache_index[key] = full
        return self._cache_index.get((name, extension))

    def has(self, name):
        return self._mod_file(name) is not None or super().has(name)

    def read(self, name):
        path = self._mod_file(name)
        if path:
            if name not in self.cache:
                with open(path, "rb") as handle:
                    self.cache[name] = handle.read()
            return self.cache[name]
        return super().read(name)

    def _compiled(self, folder, path, extension, reader):
        name = folder + path
        if name.endswith(extension) and self._mod_file(name):
            return reader(self.read(name))
        cached = self._cached(name, extension)
        if cached:
            with open(cached, "rb") as handle:
                return reader(handle.read())
        if self._mod_file(name):
            raise KeyError("ainda não convertido pelo jogo: " + name)
        return None

    def mesh(self, path):
        found = self._compiled("art/meshes/", path, ".pmd", read_pmd)
        return found if found is not None else super().mesh(path)

    def has_mesh(self, path):
        try:
            return self.mesh(path) is not None
        except (KeyError, ValueError):
            return False

    def animation(self, path):
        found = self._compiled("art/animation/", path, ".psa", read_psa)
        return found if found is not None else super().animation(path)

    def texture(self, path):
        key = "tex:" + path
        if key not in self.cache:
            img = None
            name = "art/textures/skins/" + path
            source = self._mod_file(name) or self._cached(name, ".dds")
            try:
                if source:
                    img = Image.open(source).convert("RGBA")
            except Exception:
                img = None
            if img is None:
                self.cache[key] = super().texture(path)
            else:
                self.cache[key] = np.asarray(img, dtype=np.float32) / 255.0
        return self.cache[key]
