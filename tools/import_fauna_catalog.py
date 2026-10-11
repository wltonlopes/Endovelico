#!/usr/bin/env python3
"""Import the animal catalogs in referencias/*.blend as game-ready fauna.

The catalog meshes have no armature: they only carry the vertex groups of the vanilla skeleton
they were modelled on (deer, crocodile, bear, tiger...), usually at another size. A Collada export
would therefore give static meshes. This tool writes the engine's own formats instead:

  art/meshes/skeletal/fauna/<animal>.pmd     skinned mesh, rest pose taken from the vanilla base
                                             mesh and scaled to the animal's size
  art/animation/fauna/<base>_<pct>/*.psa     the base animal's animations at that size
  art/variants/fauna/<base>_<pct>.xml        animation list (same names and speeds as vanilla)
  art/textures/skins/skeletal/fauna/*.png    textures, resized to power-of-two
  art/actors/fauna/<animal>.xml              actor linking all of the above

Existing files are never overwritten unless --force is given.

Usage:
  python3 tools/import_fauna_catalog.py --textures <dirs with the catalog PNGs> [--public public.zip]
                                        [--only moose,puma] [--force] [--dry-run]
"""
import argparse
import difflib
import glob
import io
import os
import pickle
import re
import struct
import subprocess
import sys
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PUBLIC_ZIP = "/snap/0ad/current/binaries/data/mods/public/public.zip"

# Vanilla actor whose animations each base mesh uses.
BASE_ACTORS = {
	"deer_mesh": "fauna/deer.xml",
	"rabbit_01": "fauna/rabbit1.xml",
	"rabbit_02": "fauna/rabbit1.xml",
	"Croc": "fauna/crocodile.xml",
	"bear": "fauna/bear_brown.xml",
	"bear_polar": "fauna/bear_white.xml",
	"tiger": "fauna/tiger.xml",
	"shark": "fauna/shark.xml",
	"whale_fin": "fauna/whale_fin.xml",
	"chicken": "fauna/chicken.xml",
	"fox": "fauna/fox_red.xml",
	"wolfhound": "units/britons/wolfhound.xml",
	"animal_boar": "fauna/boar.xml",
	"mastiff": "fauna/mastiff.xml",
	"mastiff_no_spikes": "fauna/mastiff.xml",
}

# Catalog species (key derived from the texture name) -> actor name.
NAMES = {
	"alce": "moose", "caribu": "caribou", "ciervo_de_virginia_subespecie_thomasi": "deer_white_tailed",
	"mazama_temama": "brocket_red", "mazama_pandora": "brocket_yucatan", "ardilla": "squirrel",
	"tapeti": "tapeti", "tepezcuintle": "paca", "pecari": "peccary", "puma": "puma", "jaguar": "jaguar",
	"jaguarundi": "jaguarundi", "margay": "margay", "ocelote": "ocelot", "pantera_negra": "panther_black",
	"coyote": "coyote", "zorro_gris": "fox_gray", "perro_corral": "dog_native_american",
	"caiman": "caiman", "cocodrilo_narigudo": "crocodile_american", "cocodrilo_pantano": "crocodile_morelet",
	"iguana_comun": "iguana_green", "iguana_motagua": "iguana_motagua", "boa_constrictor": "boa_constrictor",
	"sapo_de_cana": "toad_cane", "basilisco": "basilisk", "mapache": "raccoon", "coati": "coati",
	"grison": "grison", "mofeta": "skunk", "nutria": "otter", "oso_hormiguero_gigante": "anteater",
	"tamandua": "tamandua", "zarigueya": "opossum", "delfin": "dolphin", "orca": "orca",
	"mono_arana": "monkey_spider", "mono_aullador": "monkey_howler", "mono_de_berberia": "macaque_barbary",
	"chacalaca": "chachalaca", "cojolite": "guan_crested", "pajuil_macho": "curassow",
	"pajuil_hembra": "curassow_female", "tinamu": "tinamou",
	"tiburon_martillo": "shark_hammerhead", "tiburon_sarda": "shark_bull", "ardilla": "squirrel",
}

# Posed on skeletons whose animations cannot fit them (monkeys on the human rig, ground birds on the
# hawk rig), or already integrated in the mod from other sources.
SKIP_SKELETONS = {"Camelus": "already in the mod"}
EXCLUDE_OBJECTS = re.compile(r"^(f_armor|m_cotton|head_)", re.I)

# Animals the mod already has from another source: the catalog version is added beside them.
SECOND_VERSION = {"jaguar", "fox_gray", "deer_white_tailed", "dog_native_american", "anteater"}

# Models built on a rig whose animations cannot fit them are moved to another skeleton by renaming
# their vertex groups: the monkeys stand on all fours on the human rig and get the bear skeleton,
# the ground birds stand on the flying hawk rig and get the chicken skeleton.
RETARGET = {
	"Biped": ("Ursidae_Armature", {
		"hip": "Ursidae_Pelvis", "spine": "Ursidae_Spine", "spine1": "Ursidae_Spine_2", "chest": "Ursidae_Spine_3",
		"neck": "Ursidae_Neck", "head": "Ursidae_Head",
		"shoulder_%s": "Ursidae_Upperarm_%s", "arm_%s": "Ursidae_Arm_%s", "forearm_%s": "Ursidae_Forearm_%s",
		"hand_%s": "Ursidae_Paw_%s", "finger_%s": "Ursidae_Claw_%s", "fingertip_%s": "Ursidae_Claw_%s",
		"thigh_%s": "Ursidae_Foreleg_%s", "leg_%s": "Ursidae_Shin_%s", "foot_%s": "Ursidae_Foot_%s"}),
	"hawk": ("BlenderChicken", {
		"Body": "Body", "Head": "Head", "Tail": "Tail",
		"Humerus_%s": "Wing_%s", "Ulna_%s": "WingTip_%s", "Digit_%s": "WingTip_%s"}),
}


def retarget(obj, mapping):
	names = {}
	for source, target in mapping.items():
		for side in ("L", "R") if "%s" in source else ("",):
			names[source % side if side else source] = target % side if side else target
	obj["weights"] = [[(names[n], w) for n, w in row if n in names] for row in obj["weights"]]


def add_bird_legs(obj):
	"""The hawk rig has no legs: weight the legs of a standing bird to the chicken leg bones by height."""
	verts = np.asarray(obj["verts"])
	torso = np.array([bool(row) and max(row, key=lambda item: item[1])[0] == "Body" for row in obj["weights"]])
	centre = np.median(verts[torso, 0])
	half_width = np.abs(verts[torso, 0] - centre).max()
	# The belly is the lowest point of the torso on the midline, away from the vent and the tail.
	front, back = verts[torso, 1].min(), verts[torso, 1].max()
	middle = torso & (np.abs(verts[:, 0] - centre) < 0.15 * half_width) & (verts[:, 1] < front + 0.6 * (back - front))
	if not middle.any():
		return
	belly, ground = verts[middle, 2].min(), verts[torso, 2].min()
	if belly - ground < 0.05:
		return
	for i, (vertex, row) in enumerate(zip(verts, obj["weights"])):
		if vertex[2] >= belly or not row or max(row, key=lambda item: item[1])[0] != "Body":
			continue
		side = "L" if vertex[0] > centre else "R"
		depth = (belly - vertex[2]) / (belly - ground)
		if depth < 0.15:
			blend = depth / 0.15
			obj["weights"][i] = [("Body", 1 - blend), ("Leg_" + side, blend)]
		elif depth < 0.45:
			obj["weights"][i] = [("Leg_" + side, 1.0)]
		elif depth < 0.85:
			obj["weights"][i] = [("Shin_" + side, 1.0)]
		else:
			obj["weights"][i] = [("Foot_" + side, 1.0)]

BLENDER_DUMP = r'''
import bpy, bmesh, os, pickle
out = {}
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    # Only mirror modifiers change the model: the armature ones have no armature left, and
    # subdivision or edge split would only add geometry.
    for m in o.modifiers:
        m.show_viewport = m.type == 'MIRROR'
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    M = o.matrix_world; N = M.to_3x3().inverted().transposed()
    names = [g.name for g in o.vertex_groups]
    uvl = me.uv_layers.active
    tris = []
    for p in me.polygons:
        tri = []
        for li in p.loop_indices:
            l = me.loops[li]
            tri.append((l.vertex_index, tuple((N @ l.normal).normalized()), tuple(uvl.data[li].uv) if uvl else (0.0, 0.0)))
        tris.append(tri)
    img = None
    mat = o.material_slots[0].material if o.material_slots and o.material_slots[0].material else None
    if mat and mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                img = os.path.basename(n.image.filepath) or n.image.name
    out[o.name] = dict(
        verts=[tuple(M @ v.co) for v in me.vertices],
        weights=[[(names[g.group], g.weight) for g in v.groups if g.weight > 0] for v in me.vertices],
        tris=tris, img=img, loc=tuple(o.location))
pickle.dump(out, open(os.environ['FAUNA_DUMP'], 'wb'))
'''


def slug(text):
	text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
	return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def species_key(image):
	"""'textura iguana común 2-CREACIÓN+.png' -> ('iguana_comun', '2')"""
	tokens = slug(os.path.splitext(image)[0]).replace("creacion", "_").split("_")
	tokens = [t for t in tokens if t and t not in ("textura", "nuevo", "png", "001")]
	numbers = [t for t in tokens if t.isdigit()]
	return "_".join(t for t in tokens if not t.isdigit()), (numbers[0] if numbers else "")


def bone_alias(name):
	return name.replace(".", "_").replace(" ", "_")


def to_engine(v):
	"""Blender (x, y, z) -> engine (x, z, y): Y up, left-handed."""
	return np.asarray(v, dtype=float)[..., [0, 2, 1]]


class Vanilla:
	def __init__(self, path):
		self.zip = zipfile.ZipFile(path)
		self.names = set(self.zip.namelist())
		self.skeletons = {}
		sources = [self.zip.read(n) for n in self.names if n.startswith("art/skeletons/") and n.endswith(".xml")]
		sources += [open(f, "rb").read() for f in glob.glob(os.path.join(MOD, "art", "skeletons", "*.xml"))]
		for data in sources:
			try:
				root = ET.fromstring(data)
			except ET.ParseError:
				continue
			for standard in root.findall("standard_skeleton"):
				self.skeletons.setdefault(standard.get("id"), {})["std"] = [b.get("name") for b in standard.iter("bone")]
			for skeleton in root.findall("skeleton"):
				entry = self.skeletons.setdefault(skeleton.get("target"), {}).setdefault("maps", {})
				for bone in skeleton.iter("bone"):
					target = bone.find("target")
					if target is not None and target.text:
						entry[bone.get("name")] = target.text.strip()
		self.bone_index = {}
		for sid, skeleton in self.skeletons.items():
			std = skeleton.get("std")
			if not std:
				continue
			index = {}
			for source, target in skeleton.get("maps", {}).items():
				if target in std:
					index[bone_alias(source)] = std.index(target)
			for i, name in enumerate(std):
				index.setdefault(bone_alias(name), i)
			# Collada exports prefix the bones with the armature name ("Boar_Head", "Fox_head").
			heads = [name.split("_")[0] + "_" for name in index if "_" in name]
			prefix = max(set(heads), key=heads.count) if heads else ""
			if prefix and heads.count(prefix) >= 0.8 * len(index):
				for name, i in list(index.items()):
					if not name.startswith(prefix):
						continue
					stripped = name[len(prefix):]
					while stripped.startswith(prefix):
						stripped = stripped[len(prefix):]
					index.setdefault(stripped, i)
				if sid == "fox_armature":
					index.setdefault("fox", index["Fox_pelvis"])
			self.bone_index[sid] = index
		self.bases = {}
		for name in sorted(self.names):
			if name.startswith("art/meshes/skeletal/") and name.endswith(".pmd") and name.count("/") == 3:
				mesh = read_pmd(self.zip.read(name))
				if mesh["bones"]:
					self.bases[os.path.basename(name).split(".")[0]] = mesh

	def skeleton_for(self, bone_names):
		names = {bone_alias(n) for n in bone_names}
		best = (0, None)
		for sid, index in self.bone_index.items():
			count = len(names & set(index))
			if count > best[0]:
				best = (count, sid)
		return best

	def animation(self, path):
		for candidate in ("art/animation/%s.dae.cached.psa" % path, "art/animation/%s.psa" % path):
			if candidate in self.names:
				return self.zip.read(candidate)
		return None

	def actor_animations(self, actor):
		"""All <animation> entries of an actor and the variant files it includes."""
		found, seen = [], set()

		def collect(root):
			for animation in root.iter("animation"):
				key = (animation.get("name", "").lower(), animation.get("id"), animation.get("file"))
				if key not in seen:
					seen.add(key)
					found.append(dict(animation.attrib))
			for variant in root.iter("variant"):
				name = "art/variants/" + variant.get("file", "")
				if variant.get("file") and name in self.names:
					collect(ET.fromstring(self.zip.read(name)))
		collect(ET.fromstring(self.zip.read("art/actors/" + actor)))
		return found


def read_pmd(data):
	magic, version, _ = struct.unpack_from("<4sII", data, 0)
	assert magic == b"PSMD" and version == 4
	num_vertices, num_uv = struct.unpack_from("<II", data, 12)
	stride = 24 + 8 * num_uv + 20
	raw = np.frombuffer(data, dtype=np.uint8, count=num_vertices * stride, offset=20).reshape(num_vertices, stride)
	offset = 20 + num_vertices * stride
	num_faces, = struct.unpack_from("<I", data, offset)
	offset += 4 + num_faces * 6
	num_bones, = struct.unpack_from("<I", data, offset)
	offset += 4
	bones = [struct.unpack_from("<7f", data, offset + 28 * i) for i in range(num_bones)]
	offset += 28 * num_bones
	num_props, = struct.unpack_from("<I", data, offset)
	offset += 4
	props = []
	for _ in range(num_props):
		length, = struct.unpack_from("<I", data, offset)
		name = data[offset + 4:offset + 4 + length].decode()
		offset += 4 + length
		values = struct.unpack_from("<7fB", data, offset)
		offset += 29
		props.append((name, values[:3], values[3:7], values[7]))
	blend = 24 + 8 * num_uv
	return dict(
		positions=raw[:, :12].copy().view("<f4").reshape(-1, 3).astype(float),
		indices=raw[:, blend:blend + 4].copy(),
		weights=raw[:, blend + 4:blend + 20].copy().view("<f4").reshape(-1, 4).astype(float),
		bones=bones, props=props)


def write_pmd(path, positions, normals, uvs, indices, weights, faces, bones, props):
	body = struct.pack("<II", len(positions), 1)
	for p, n, uv, bi, bw in zip(positions, normals, uvs, indices, weights):
		body += struct.pack("<3f3f2f4B4f", *p, *n, *uv, *bi, *bw)
	body += struct.pack("<I", len(faces)) + b"".join(struct.pack("<3H", *f) for f in faces)
	body += struct.pack("<I", len(bones)) + b"".join(struct.pack("<7f", *b) for b in bones)
	body += struct.pack("<I", len(props))
	for name, translation, rotation, bone in props:
		encoded = name.encode()
		body += struct.pack("<I", len(encoded)) + encoded + struct.pack("<7fB", *translation, *rotation, bone)
	with open(path, "wb") as f:
		f.write(b"PSMD" + struct.pack("<II", 4, len(body)) + body)


def scale_psa(data, scale):
	"""Scale the bone translations of a PSA animation; rotations are unchanged."""
	length, = struct.unpack_from("<I", data, 12)
	offset = 16 + length
	_, num_bones, num_frames = struct.unpack_from("<fII", data, offset)
	offset += 12
	keys = np.frombuffer(data, dtype="<f4", count=num_bones * num_frames * 7, offset=offset).reshape(-1, 7).copy()
	keys[:, :3] *= scale
	return data[:offset] + keys.astype("<f4").tobytes() + data[offset + keys.nbytes:], num_bones


def bone_centroids(positions, weight_rows, num_bones):
	total = np.zeros((num_bones, 3))
	mass = np.zeros(num_bones)
	for position, row in zip(positions, weight_rows):
		for bone, weight in row:
			total[bone] += position * weight
			mass[bone] += weight
	return total, mass


def similarity(source, target, mass):
	"""Scale, rotation and translation with target ~ s * R * source + t."""
	mass = mass / mass.sum()
	mean_s = (source * mass[:, None]).sum(0)
	mean_t = (target * mass[:, None]).sum(0)
	x, y = source - mean_s, target - mean_t
	u, d, vt = np.linalg.svd((y * mass[:, None]).T @ x)
	sign = np.eye(3)
	if np.linalg.det(u) * np.linalg.det(vt) < 0:
		sign[2, 2] = -1
	return u @ sign @ vt


def fit_to_base(positions, weight_rows, base):
	"""Yaw (multiple of 90 degrees), uniform scale and offset placing the base skeleton inside the mesh."""
	num_bones = len(base["bones"])
	total, mass = bone_centroids(positions, weight_rows, num_bones)
	base_rows = [[(int(i), w) for i, w in zip(bi, bw) if i < num_bones and w > 0] for bi, bw in zip(base["indices"], base["weights"])]
	base_total, base_mass = bone_centroids(base["positions"], base_rows, num_bones)
	shared = (mass > 0.5) & (base_mass > 0.5)
	if shared.sum() < 4:
		return None
	source = base_total[shared] / base_mass[shared, None]
	target = total[shared] / mass[shared, None]
	weight = np.minimum(mass[shared], base_mass[shared])
	weight = weight / weight.sum()
	free = similarity(source, target, weight)
	yaw = np.round(np.arctan2(free[0, 2], free[2, 2]) / (np.pi / 2)) * (np.pi / 2)
	c, s = np.cos(yaw), np.sin(yaw)
	rotation = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
	mean_s = (source * weight[:, None]).sum(0)
	mean_t = (target * weight[:, None]).sum(0)
	x = (source - mean_s) @ rotation.T
	y = target - mean_t
	scale = (weight * (x * y).sum(1)).sum() / (weight * (x * x).sum(1)).sum()
	offset = mean_t - scale * rotation @ mean_s
	residual = np.sqrt((weight * ((y - scale * x) ** 2).sum(1)).sum()) / np.ptp(positions, axis=0).max()
	return dict(scale=scale, rotation=rotation, offset=offset, residual=residual, bones=int(shared.sum()))


def dump_blend(path):
	cache = os.path.join(tempfile.gettempdir(), "fauna_dump2_%s_%d.pkl" % (slug(os.path.basename(path)), int(os.path.getmtime(path))))
	if not os.path.exists(cache):
		with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as script:
			script.write(BLENDER_DUMP)
		subprocess.run(["blender", "-b", path, "--python", script.name], env=dict(os.environ, FAUNA_DUMP=cache),
			stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
		os.unlink(script.name)
	return pickle.load(open(cache, "rb"))


class Textures:
	def __init__(self, directories):
		self.files = {}
		for path in [p for directory in directories for p in glob.glob(os.path.join(directory, "*.png"))]:
			name = os.path.basename(path)
			name = name.split("_", 1)[1] if re.match(r"\d+_", name) else name
			name = re.split(r"\.(?:thumb\.)?png", name)[0]
			self.files[re.sub(r"[^a-z0-9]", "", name.lower())] = path

	def find(self, image):
		# The forum drops accented letters from file names instead of transliterating them.
		key = re.sub(r"[^a-z0-9]", "", os.path.splitext(image)[0].encode("ascii", "ignore").decode().lower())
		if key in self.files:
			return self.files[key]
		close = difflib.get_close_matches(key, list(self.files), n=1, cutoff=0.86)
		return self.files[close[0]] if close else None


def power_of_two(value):
	return int(min(1024, max(16, 2 ** round(np.log2(value)))))


def build_mesh(body, parts, fit, base, bone_index, scale):
	"""Merge the body and its rigid parts into PMD vertex and face arrays in skeleton space."""
	num_bones = len(base["bones"])
	inverse = fit["rotation"].T
	factor = scale / fit["scale"]

	def place(points):
		return ((to_engine(points) - fit["offset"]) @ inverse.T) * factor

	def rows_of(obj):
		rows = []
		for row in obj["weights"]:
			mapped = {}
			for name, weight in row:
				bone = bone_index.get(bone_alias(name))
				if bone is not None and bone < num_bones:
					mapped[bone] = mapped.get(bone, 0) + weight
			top = sorted(mapped.items(), key=lambda item: -item[1])[:4]
			total = sum(w for _, w in top)
			rows.append([(b, w / total) for b, w in top] if total > 0 else [])
		return rows

	body_positions = place(body["verts"])
	body_rows = rows_of(body)
	weighted = [i for i, row in enumerate(body_rows) if row]
	tree = cKDTree(body_positions[weighted])
	for i, row in enumerate(body_rows):
		if not row:
			body_rows[i] = body_rows[weighted[tree.query(body_positions[i])[1]]]

	objects = [(body, body_positions, body_rows)]
	for part in parts:
		positions = place(part["verts"])
		distance, nearest = tree.query(positions)
		anchor = body_rows[weighted[nearest[np.argmin(distance)]]]
		# Parts weighted to this skeleton (the monkey heads) keep their weights, the others are rigid.
		own = rows_of(part)
		if len({bone for row in own for bone, _ in row}) >= 3:
			objects.append((part, positions, [row or anchor for row in own]))
		else:
			objects.append((part, positions, [anchor] * len(positions)))

	vertices, lookup, faces = [], {}, []
	for number, (obj, positions, rows) in enumerate(objects):
		for triangle in obj["tris"]:
			corner_ids = []
			for vertex, normal, uv in triangle:
				n = to_engine(normal) @ inverse.T
				key = (number, vertex, tuple(np.round(n, 3)), tuple(np.round(uv, 5)))
				if key not in lookup:
					lookup[key] = len(vertices)
					vertices.append((positions[vertex], n, uv, rows[vertex]))
				corner_ids.append(lookup[key])
			a, b, c = (vertices[i][0] for i in corner_ids)
			facing = np.dot(np.cross(b - a, c - a), sum(vertices[i][1] for i in corner_ids))
			# Vanilla meshes wind their triangles clockwise around the normal.
			faces.append(corner_ids if facing <= 0 else [corner_ids[0], corner_ids[2], corner_ids[1]])
	positions = np.array([v[0] for v in vertices])
	normals = np.array([v[1] for v in vertices])
	uvs = np.array([v[2] for v in vertices])
	indices = np.full((len(vertices), 4), 255, dtype=int)
	weights = np.zeros((len(vertices), 4))
	for i, (_, _, _, row) in enumerate(vertices):
		for k, (bone, weight) in enumerate(row):
			indices[i, k] = bone
			weights[i, k] = weight
	return positions, normals, uvs, indices, weights, faces


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--textures", required=True, nargs="+", help="directories holding the catalog texture PNGs")
	parser.add_argument("--public", default=PUBLIC_ZIP)
	parser.add_argument("--blends", nargs="*", default=sorted(glob.glob(os.path.join(MOD, "referencias", "*.blend"))))
	parser.add_argument("--only", default="", help="comma separated actor names")
	parser.add_argument("--force", action="store_true", help="overwrite existing files")
	parser.add_argument("--dry-run", action="store_true")
	args = parser.parse_args()
	only = {n for n in args.only.split(",") if n}

	vanilla = Vanilla(args.public)
	textures = Textures(args.textures)
	written, skipped = [], []

	def target(*parts):
		return os.path.join(MOD, *parts)

	def save(path, data, mode="wb"):
		if os.path.exists(path) and not args.force:
			return False
		if not args.dry_run:
			os.makedirs(os.path.dirname(path), exist_ok=True)
			with open(path, mode, **({} if "b" in mode else {"encoding": "utf-8"})) as f:
				f.write(data)
		written.append(os.path.relpath(path, MOD))
		return True

	species = {}
	for blend in args.blends:
		objects = dump_blend(blend)
		bodies, loose = [], []
		for name, obj in objects.items():
			obj["name"] = name
			if EXCLUDE_OBJECTS.match(name) or not obj["img"] or len(obj["verts"]) < 3:
				continue
			used = {n for row in obj["weights"] for n, _ in row}
			count, sid = vanilla.skeleton_for(used) if len(obj["verts"]) >= 90 else (0, None)
			# A body is weighted to most of its skeleton; pieces such as the monkey heads (bear head
			# bones only) are parts of the body next to them.
			if count >= 5 and count >= 0.4 * len(vanilla.skeletons[sid]["std"]):
				if sid in RETARGET:
					sid, mapping = RETARGET[sid]
					retarget(obj, mapping)
					if sid == "BlenderChicken":
						add_bird_legs(obj)
				obj["skeleton"] = sid
				bodies.append(obj)
			else:
				loose.append(obj)
		if not bodies:
			continue
		# Rigid parts (antlers, whiskers, claws, crests) belong to the closest body.
		owner_points = np.concatenate([np.asarray(b["verts"]) for b in bodies])
		owner_ids = np.concatenate([np.full(len(b["verts"]), i) for i, b in enumerate(bodies)])
		tree = cKDTree(owner_points)
		for body in bodies:
			body["parts"] = []
		for part in loose:
			distance, nearest = tree.query(np.asarray(part["verts"]))
			body = bodies[owner_ids[nearest[np.argmin(distance)]]]
			if distance.min() < 0.5 * np.ptp(np.asarray(body["verts"]), axis=0).max():
				if part["img"] == body["img"]:
					body["parts"].append(part)
				else:
					skipped.append("part %r of %r uses another texture (%s)" % (part["name"], body["name"], part["img"]))

		for body in bodies:
			if body["skeleton"] in SKIP_SKELETONS:
				skipped.append("%r: %s" % (body["name"], SKIP_SKELETONS[body["skeleton"]]))
				continue
			sid = body["skeleton"]
			index = vanilla.bone_index[sid]
			num_bones = len(vanilla.skeletons[sid]["std"])
			positions = to_engine(body["verts"])
			rows = [[(index[bone_alias(n)], w) for n, w in row if bone_alias(n) in index] for row in body["weights"]]
			best = None
			for base_name, base in vanilla.bases.items():
				if len(base["bones"]) != num_bones or base_name not in BASE_ACTORS:
					continue
				fit = fit_to_base(positions, rows, base)
				if fit and (best is None or fit["residual"] < best[1]["residual"]):
					best = (base_name, fit)
			if best is None:
				skipped.append("%r: no vanilla base mesh for skeleton %s" % (body["name"], sid))
				continue
			base_name, fit = best
			scale = 1.0 if abs(fit["scale"] - 1) <= 0.03 else round(float(fit["scale"]), 2)
			mesh = build_mesh(body, body["parts"], fit, vanilla.bases[base_name], index, scale)
			key, number = species_key(body["img"])
			# Copies of one animal differ only in texture or in small parts such as whiskers; antlers
			# (large parts) make a separate variant.
			antlers = sum(1 for part in body["parts"] if len(part["verts"]) >= 30)
			signature = (base_name, scale, len(body["tris"]), antlers)
			candidate = dict(signature=signature, base=base_name, scale=scale, mesh=mesh, fit=fit,
				images={body["img"]: number}, source=body["name"], parts=len(body["parts"]), antlers=antlers)
			entry = species.setdefault(key, [])
			for position, variant in enumerate(entry):
				if variant["signature"] == signature:
					if candidate["parts"] > variant["parts"]:
						candidate["images"].update(variant["images"])
						entry[position] = candidate
					else:
						variant["images"].setdefault(body["img"], number)
					break
			else:
				entry.append(candidate)

	variant_files = {}
	for key in sorted(species):
		name = NAMES.get(key, key)
		if name in SECOND_VERSION:
			name += "_02"
		if os.path.exists(target("art", "actors", "fauna", name + ".xml")) and not args.force:
			skipped.append("%s: art/actors/fauna/%s.xml already exists" % (species[key][0]["source"], name))
			continue
		variants = sorted(species[key], key=lambda v: (-v["antlers"], -v["scale"]))
		for position, variant in enumerate(variants):
			if position == 0:
				actor = name
			elif variants[0]["antlers"] and not variant["antlers"] and not any(v is not variant and not v["antlers"] for v in variants):
				actor = name + "_female"
			else:
				actor = name + "_" + "bcdefgh"[position - 1]
			if only and actor not in only:
				continue
			actor_path = target("art", "actors", "fauna", actor + ".xml")
			base, scale = variant["base"], variant["scale"]
			base_mesh = vanilla.bases[base]

			# Textures
			texture_entries = []
			for image, number in sorted(variant["images"].items(), key=lambda item: item[1]):
				source = textures.find(image)
				if not source:
					skipped.append("%s: texture %r not found" % (actor, image))
					continue
				texture = "fauna/%s%s.png" % (actor, "_" + number if number else ("" if len(variant["images"]) == 1 else "_" + str(len(texture_entries) + 1)))
				picture = Image.open(source).convert("RGBA")
				size = (power_of_two(picture.width), power_of_two(picture.height))
				buffer = io.BytesIO()
				picture.resize(size, Image.LANCZOS).save(buffer, "PNG")
				save(target("art", "textures", "skins", "skeletal", texture), buffer.getvalue())
				texture_entries.append("skeletal/" + texture)
			if not texture_entries:
				continue

			# Mesh
			positions, normals, uvs, indices, weights, faces = variant["mesh"]
			bones = [tuple(np.array(b[:3]) * scale) + tuple(b[3:]) for b in base_mesh["bones"]]
			props = [(n, tuple(np.array(t) * scale), r, b) for n, t, r, b in base_mesh["props"]]
			mesh_path = target("art", "meshes", "skeletal", "fauna", actor + ".pmd")
			if not args.dry_run and (args.force or not os.path.exists(mesh_path)):
				os.makedirs(os.path.dirname(mesh_path), exist_ok=True)
				write_pmd(mesh_path, positions, normals, uvs, indices, weights, faces, bones, props)
			written.append(os.path.relpath(mesh_path, MOD))

			# Animations
			tag = "%s_%03d" % (base.lower(), round(scale * 100))
			if tag not in variant_files:
				lines = []
				for animation in vanilla.actor_animations(BASE_ACTORS[base]):
					path = os.path.splitext(animation["file"])[0]
					data = vanilla.animation(path)
					if data is None:
						continue
					scaled, anim_bones = scale_psa(data, scale)
					if anim_bones != len(bones):
						continue
					attributes = dict(animation)
					if scale != 1.0:
						attributes["file"] = "fauna/%s/%s.psa" % (tag, os.path.basename(path))
						save(target("art", "animation", "fauna", tag, os.path.basename(path) + ".psa"), scaled)
					lines.append("    <animation " + " ".join('%s="%s"' % item for item in attributes.items()) + "/>")
				save(target("art", "variants", "fauna", tag + ".xml"),
					'<?xml version="1.0" encoding="utf-8"?>\n<variant name="Base">\n  <animations>\n%s\n  </animations>\n</variant>\n' % "\n".join(lines), "w")
				variant_files[tag] = len(lines)

			# Actor
			texture_variants = "\n".join(
				'    <variant name="%s" frequency="1">\n      <textures>\n        <texture file="%s" name="baseTex"/>\n      </textures>\n    </variant>'
				% (os.path.splitext(os.path.basename(t))[0], t) for t in texture_entries)
			save(actor_path, """<?xml version="1.0" encoding="utf-8"?>
<actor version="1">
  <castshadow/>
  <group>
    <variant file="fauna/%s.xml" name="Base">
      <mesh>skeletal/fauna/%s.pmd</mesh>
    </variant>
  </group>
  <group>
%s
  </group>
  <material>basic_trans.xml</material>
</actor>
""" % (tag, actor, texture_variants), "w")
			print("%-22s base=%-10s scale=%.2f fit=%.3f bones=%2d verts=%4d tris=%4d parts=%2d anims=%2d textures=%d  (%s)" % (
				actor, base, scale, variant["fit"]["residual"], variant["fit"]["bones"], len(positions), len(faces),
				variant["parts"], variant_files[tag], len(texture_entries), variant["source"]))

	print("\n%d files %s" % (len(written), "would be written" if args.dry_run else "written"))
	if skipped:
		print("\nSkipped:")
		for line in sorted(set(skipped)):
			print("  " + line)


if __name__ == "__main__":
	main()
