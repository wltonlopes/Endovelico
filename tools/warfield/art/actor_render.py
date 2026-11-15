"""Renderizador por software de atores do 0 A.D. (malha + props + animação).

Resolve o XML do ator (grupos de variantes, arquivos de variante, props
presos aos pontos de encaixe, texturas, material) e desenha um quadro de
uma animação com z-buffer, luz difusa e a cor do jogador aplicada como no
shader do jogo (cor *= mix(corDoJogador, 1, alfa da textura)).
"""
import random
import xml.etree.ElementTree as ET

import numpy as np

from zeroad_formats import PublicArchive  # noqa: F401  (reexportado)

SKIPPED_ATTACHPOINTS = ("projectile", "garrisoned", "loaded-", "fire", "smoke", "sound")


class ActorPart:
    """Uma malha resolvida de um ator, com seus props (recursivo)."""

    def __init__(self):
        self.mesh = None
        self.textures = {}
        self.material = ""
        self.color = None
        self.animations = {}
        self.props = []  # (attachpoint, ActorPart)


def _variant_elements(archive, variant):
    """Elementos de uma variante, incluindo os do arquivo `file=` (se houver)."""
    elements = []
    if variant.get("file"):
        path = "art/variants/" + variant.get("file")
        if archive.has(path):
            root = ET.fromstring(archive.read(path))
            elements.extend(_variant_elements(archive, root))
    elements.extend(list(variant))
    return elements


def _variant_frequency(archive, variant):
    value = variant.get("frequency")
    if value is None and variant.get("file"):
        path = "art/variants/" + variant.get("file")
        if archive.has(path):
            value = ET.fromstring(archive.read(path)).get("frequency")
    return float(value or 0)


def _variant_mesh(archive, variant):
    for element in _variant_elements(archive, variant):
        if element.tag == "mesh" and element.text:
            return element.text.strip()
    return None


def _choose_variant(archive, group, selections, rng):
    """Como o jogo: nome selecionado primeiro; senão sorteio pela frequência."""
    variants = group.findall("variant")
    if not variants:
        return None
    # Arte de mod: só as variantes cuja malha existe já convertida.
    if hasattr(archive, "has_mesh"):
        usable = [v for v in variants if (lambda m: m is None or archive.has_mesh(m))(_variant_mesh(archive, v))]
        variants = usable or variants
    for variant in variants:
        if variant.get("name", "").lower() in selections:
            return variant
    weights = [_variant_frequency(archive, v) for v in variants]
    if sum(weights) <= 0:
        return variants[0]
    pick = rng.random() * sum(weights)
    for variant, weight in zip(variants, weights):
        pick -= weight
        if pick <= 0 and weight > 0:
            return variant
    return variants[-1]


def resolve_actor(archive, actor_path, selections=("idle", "base"), depth=0, rng=None):
    """Lê `art/actors/<actor_path>` e devolve um ActorPart."""
    if rng is None:
        rng = random.Random(actor_path)
    part = ActorPart()
    path = "art/actors/" + actor_path
    if depth > 6 or not archive.has(path):
        return None
    root = ET.fromstring(archive.read(path))
    props = {}
    for group in root.findall("group"):
        variant = _choose_variant(archive, group, selections, rng)
        if variant is None:
            continue
        for element in _variant_elements(archive, variant):
            if element.tag == "mesh" and element.text:
                part.mesh = element.text.strip()
            elif element.tag == "textures":
                for texture in element.findall("texture"):
                    part.textures[texture.get("name")] = texture.get("file")
            elif element.tag == "color" and element.text:
                part.color = [float(v) / 255 for v in element.text.split()]
            elif element.tag == "animations":
                for animation in element.findall("animation"):
                    name = animation.get("name", "").lower()
                    part.animations.setdefault(name, animation.get("file"))
            elif element.tag == "props":
                for prop in element.findall("prop"):
                    point = prop.get("attachpoint")
                    if prop.get("actor"):
                        props[point] = prop.get("actor")
                    else:
                        props.pop(point, None)
    material = root.find("material")
    part.material = material.text.strip() if material is not None and material.text else ""
    for point, actor in props.items():
        if point.startswith(SKIPPED_ATTACHPOINTS):
            continue
        child = resolve_actor(archive, actor, selections, depth + 1, rng)
        if child is not None:
            part.props.append((point, child))
    return part


def _sample_frame(animation, fraction):
    frames = animation["frames"]
    if len(frames) == 1:
        return frames[0]
    position = fraction * (len(frames) - 1)
    index = int(position)
    nxt = min(index + 1, len(frames) - 1)
    t = position - index
    if t < 1e-3:
        return frames[index]
    # Interpola as translações e escolhe a rotação mais próxima (basta para sprites).
    result = []
    for a, b in zip(frames[index], frames[nxt]):
        m = (a if t < 0.5 else b).copy()
        m[:3, 3] = a[:3, 3] * (1 - t) + b[:3, 3] * t
        result.append(m)
    return result


class Triangles:
    """Triângulos já posicionados no mundo, prontos para rasterizar."""

    def __init__(self):
        self.chunks = []

    def add(self, positions, normals, uvs, faces, texture, mode, tint):
        self.chunks.append((positions, normals, uvs, faces, texture, mode, tint))


def pose_actor(archive, part, animation_name, fraction, transform, out, player_color, parent_mesh=None):
    """Posiciona a malha do ator (e dos props) e acumula os triângulos em `out`."""
    if part.mesh is None:
        return
    try:
        mesh = archive.mesh(part.mesh)
    except KeyError:
        return
    positions = mesh["positions"]
    normals = mesh["normals"]
    skin = None
    if mesh["bind"]:
        animation = None
        file = part.animations.get(animation_name) or part.animations.get("idle")
        if file:
            try:
                animation = archive.animation(file)
            except KeyError:
                animation = None
        if animation is not None and len(animation["frames"][0]) == len(mesh["bind"]):
            pose = _sample_frame(animation, fraction)
        else:
            pose = mesh["bind"]
        skin = [p @ np.linalg.inv(b) for p, b in zip(pose, mesh["bind"])]
        bone_pose = pose
        skinned = np.zeros_like(positions)
        skinned_n = np.zeros_like(normals)
        hom = np.hstack([positions, np.ones((len(positions), 1))])
        for k in range(4):
            bones = mesh["bones"][:, k]
            weights = mesh["weights"][:, k]
            valid = bones != 255
            if not valid.any():
                continue
            for bone in np.unique(bones[valid]):
                sel = valid & (bones == bone)
                m = skin[bone]
                skinned[sel] += weights[sel, None] * (hom[sel] @ m.T)[:, :3]
                skinned_n[sel] += weights[sel, None] * (normals[sel] @ m[:3, :3].T)
        unweighted = mesh["weights"].sum(axis=1) < 1e-4
        skinned[unweighted] = positions[unweighted]
        skinned_n[unweighted] = normals[unweighted]
        positions, normals = skinned, skinned_n

    hom = np.hstack([positions, np.ones((len(positions), 1))])
    world = (hom @ transform.T)[:, :3]
    world_n = normals @ transform[:3, :3].T
    length = np.linalg.norm(world_n, axis=1, keepdims=True)
    world_n = world_n / np.maximum(length, 1e-6)

    material = part.material.lower()
    if material.startswith("player"):
        mode, tint = "player", player_color
    elif "objectcolor" in material and part.color:
        mode, tint = "player", part.color
    elif "trans" in material and not material.startswith("no_trans"):
        mode, tint = "alphatest", None
    else:
        mode, tint = "opaque", None
    texture = archive.texture(part.textures.get("baseTex", "")) if part.textures.get("baseTex") else None
    out.add(world, world_n, mesh["uvs"], mesh["faces"], texture, mode, tint)

    for point, child in part.props:
        prop = mesh["props"].get(point)
        if prop is None:
            continue
        matrix, bone = prop
        # O ponto de encaixe é relativo ao osso (pose animada do osso).
        if skin is not None and bone != 255 and bone < len(skin):
            local = bone_pose[bone] @ matrix
        else:
            local = matrix
        pose_actor(archive, child, animation_name, fraction, transform @ local, out, player_color)


def rotation_y(angle):
    c, s = np.cos(angle), np.sin(angle)
    m = np.eye(4)
    m[0, 0], m[0, 2] = c, s
    m[2, 0], m[2, 2] = -s, c
    return m


def rasterize(tris, size, scale, elevation, light, ground_y=0.0):
    """Desenha os triângulos numa imagem RGBA (float) de `size` x `size`.

    Projeção ortográfica: câmera ao sul, inclinada `elevation` radianos.
    `scale` é quantos pixels vale uma unidade do mundo. Os pés (y=0) ficam
    a 12% da borda de baixo.
    """
    image = np.zeros((size, size, 4), dtype=np.float32)
    depth = np.full((size, size), np.inf, dtype=np.float32)
    ce, se = np.cos(elevation), np.sin(elevation)
    cx, base = size / 2, size * 0.88
    for positions, normals, uvs, faces, texture, mode, tint in tris.chunks:
        if not len(faces):
            continue
        sx = cx + positions[:, 0] * scale
        sy = base - (positions[:, 1] * ce + positions[:, 2] * se) * scale
        sz = positions[:, 2] * ce - positions[:, 1] * se
        shade = 0.42 + 0.68 * np.clip(normals @ light, 0, 1)
        for a, b, c in faces:
            x0, x1, x2 = sx[a], sx[b], sx[c]
            y0, y1, y2 = sy[a], sy[b], sy[c]
            area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
            if abs(area) < 1e-9:
                continue
            minx = max(int(np.floor(min(x0, x1, x2))), 0)
            maxx = min(int(np.ceil(max(x0, x1, x2))), size - 1)
            miny = max(int(np.floor(min(y0, y1, y2))), 0)
            maxy = min(int(np.ceil(max(y0, y1, y2))), size - 1)
            if minx > maxx or miny > maxy:
                continue
            px, py = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
            w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area
            w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area
            w2 = 1 - w0 - w1
            inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not inside.any():
                continue
            z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c]
            region = depth[miny:maxy + 1, minx:maxx + 1]
            closer = inside & (z < region)
            if not closer.any():
                continue
            if texture is not None:
                u = w0 * uvs[a, 0] + w1 * uvs[b, 0] + w2 * uvs[c, 0]
                v = w0 * uvs[a, 1] + w1 * uvs[b, 1] + w2 * uvs[c, 1]
                th, tw = texture.shape[:2]
                tx = (np.mod(u, 1.0) * tw).astype(np.int32).clip(0, tw - 1)
                ty = (np.mod(1.0 - v, 1.0) * th).astype(np.int32).clip(0, th - 1)
                texel = texture[ty, tx]
            else:
                texel = np.ones(px.shape + (4,), dtype=np.float32) * 0.6
            rgb = texel[..., :3].copy()
            alpha = texel[..., 3]
            if mode == "player":
                t = np.asarray(tint, dtype=np.float32)
                rgb *= alpha[..., None] + (1 - alpha[..., None]) * t
            elif mode == "alphatest":
                closer &= alpha > 0.45
                if not closer.any():
                    continue
            s = w0 * shade[a] + w1 * shade[b] + w2 * shade[c]
            rgb *= s[..., None]
            target = image[miny:maxy + 1, minx:maxx + 1]
            target[closer, :3] = rgb[closer]
            target[closer, 3] = 1.0
            region[closer] = z[closer]
    return image
