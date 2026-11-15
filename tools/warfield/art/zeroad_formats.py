"""Leitores dos formatos compilados do 0 A.D. (PMD, PSA) e do public.zip.

O public.zip só traz as versões em cache: `X.dae.cached.pmd` (malha),
`X.dae.cached.psa` (animação) e `X.cached.dds` (textura).
"""
import io
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
