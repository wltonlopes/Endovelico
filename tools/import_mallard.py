#!/usr/bin/env python3
"""Turn the static mallard Collada model into an animated fauna actor.

The model is a standing duck with its wings spread and no skeleton. This script makes two actors
through the same code as import_fauna_catalog.py:

  fauna/mallard.xml         wings folded against the body, weighted by region to the vanilla chicken
                            skeleton (legs, neck, head, tail, wings), with the chicken animations
  fauna/mallard_flying.xml  wings left spread, neck stretched forward and legs trailing, weighted
                            to the vanilla hawk skeleton, with the hawk flight animations

Usage: python3 tools/import_mallard.py <mallard.dae> <texture.png> [public.zip]
"""
import io
import os
import sys
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import import_fauna_catalog as fauna

NS = {"c": "http://www.collada.org/2005/11/COLLADASchema"}
SIZE = 0.55            # The model is 3 units tall, almost twice the vanilla chicken.
FLYING_SIZE = 0.7     # Vanilla birds in flight are drawn large to stay visible from the ground.
BODY_HALF_WIDTH = 0.6  # Vertices further out belong to the wings.
SHOULDER = np.array([0.5, -0.2, 1.5])
WING_FOLD = 1.6        # Distance from the shoulder at which the wing folds back on itself.
BELLY, NECK, NECK_MIDDLE, HEAD = 0.58, 1.75, 2.05, 2.35
REAR, TAIL = 0.4, 0.9


def load(path):
	geometry = ET.parse(path).getroot().find(".//c:geometry", NS)

	def source(suffix, stride):
		for element in geometry.iterfind(".//c:source", NS):
			if element.get("id").endswith(suffix):
				return np.array(element.find("c:float_array", NS).text.split(), dtype=float).reshape(-1, stride)
	triangles = geometry.find(".//c:triangles", NS)
	stride = 1 + max(int(i.get("offset")) for i in triangles.findall("c:input", NS))
	offsets = {i.get("semantic"): int(i.get("offset")) for i in triangles.findall("c:input", NS)}
	indices = np.array(triangles.find("c:p", NS).text.split(), dtype=int).reshape(-1, 3, stride)
	return source("positions", 3), source("map-0", 2), indices[:, :, offsets["VERTEX"]], indices[:, :, offsets["TEXCOORD"]]


def rig(positions):
	"""Fold the wings and return the new positions with one weight row per vertex."""
	folded = positions.copy()
	rows = []
	chord_front = positions[np.abs(positions[:, 0]) > BODY_HALF_WIDTH, 1].min()
	for i, (x, y, z) in enumerate(positions):
		side = "L" if x > 0 else "R"
		sign = 1 if x > 0 else -1
		if abs(x) > BODY_HALF_WIDTH:
			span = abs(x) - SHOULDER[0]
			outer = span > WING_FOLD
			along = 2 * WING_FOLD - span if outer else span
			folded[i] = (sign * (SHOULDER[0] + 0.06 + (0.03 if outer else 0)),
				SHOULDER[1] + 0.95 * along,
				SHOULDER[2] + 0.15 - 0.8 * (y - chord_front) - 0.15 * along)
			rows.append([("WingTip_" + side if outer else "Wing_" + side, 1.0)])
		elif z < BELLY:
			depth = (BELLY - z) / BELLY
			rows.append([("Leg_" + side if depth < 0.45 else "Shin_" + side if depth < 0.85 else "Foot_" + side, 1.0)])
		elif z > HEAD:
			rows.append([("Head", 1.0)])
		elif z > NECK_MIDDLE:
			rows.append([("Neck_High", 1.0)])
		elif z > NECK:
			rows.append([("Neck_Low", 1.0)])
		elif y > TAIL:
			rows.append([("Tail", 1.0)])
		elif y > REAR:
			blend = (y - REAR) / (TAIL - REAR)
			rows.append([("Rear", 0.5 + 0.5 * blend), ("Body", 0.5 - 0.5 * blend)])
		else:
			rows.append([("Body", 1.0)])
	return folded * SIZE, rows


def pitch(points, pivot, degrees):
	"""Rotate points forward (head towards -y) around the lateral axis through pivot (y, z)."""
	angle = np.radians(degrees)
	y, z = points[:, 1] - pivot[0], points[:, 2] - pivot[1]
	points[:, 1] = pivot[0] + y * np.cos(angle) - z * np.sin(angle)
	points[:, 2] = pivot[1] + y * np.sin(angle) + z * np.cos(angle)
	return points


def rig_flying(positions):
	"""Stretch the neck forward, trail the legs and weight the mesh to the hawk skeleton."""
	posed = positions.copy()
	neck = (np.abs(positions[:, 0]) <= BODY_HALF_WIDTH) & (positions[:, 2] > NECK)
	legs = (np.abs(positions[:, 0]) <= BODY_HALF_WIDTH) & (positions[:, 2] < BELLY)
	posed[neck] = pitch(posed[neck], (-0.65, NECK), 65)
	posed[legs] = pitch(posed[legs], (-0.2, BELLY), 75)
	rows = []
	for i, (x, y, z) in enumerate(positions):
		side = "L" if x > 0 else "R"
		span = abs(x) - SHOULDER[0]
		if abs(x) > BODY_HALF_WIDTH:
			rows.append([(("Humerus_" if span < 1.1 else "Ulna_" if span < 2.2 else "Digit_") + side, 1.0)])
		elif neck[i]:
			rows.append([("Head", 1.0)])
		elif y > TAIL and not legs[i]:
			rows.append([("Tail", 1.0)])
		else:
			rows.append([("Body", 1.0)])
	return posed * FLYING_SIZE, rows


def main():
	dae, texture = sys.argv[1], sys.argv[2]
	vanilla = fauna.Vanilla(sys.argv[3] if len(sys.argv) > 3 else fauna.PUBLIC_ZIP)
	build(vanilla, dae, texture, "mallard", rig, "BlenderChicken", "chicken", "fauna/chicken.xml")
	build(vanilla, dae, texture, "mallard_flying", rig_flying, "hawk", "hawk", "fauna/hawk.xml")


def build(vanilla, dae, texture, actor, rig_model, sid, base_name, base_actor):
	positions, uvs, faces, face_uvs = load(dae)
	positions, rows = rig_model(positions)

	# Smooth normals of the folded mesh.
	normals = np.zeros_like(positions)
	for a, b, c in faces:
		normal = np.cross(positions[b] - positions[a], positions[c] - positions[a])
		normals[[a, b, c]] += normal
	normals /= np.linalg.norm(normals, axis=1)[:, None] + 1e-9

	body = dict(verts=[tuple(p) for p in positions], weights=rows, img=os.path.basename(texture), loc=(0, 0, 0),
		tris=[[(int(v), tuple(normals[v]), tuple(uvs[t])) for v, t in zip(face, face_uv)] for face, face_uv in zip(faces, face_uvs)])
	index, base = vanilla.bone_index[sid], vanilla.bases[base_name]
	fit = fauna.fit_to_base(fauna.to_engine(body["verts"]), [[(index[n], w) for n, w in row] for row in rows], base)
	scale = round(float(fit["scale"]), 2)
	mesh = fauna.build_mesh(body, [], fit, base, index, scale, vanilla.skeletons[sid]["parents"])
	print("fit to %s: scale %.2f, residual %.3f, bones %d, vertices %d" % (base_name, scale, fit["residual"], fit["bones"], len(mesh[0])))

	def path(*parts):
		full = os.path.join(fauna.MOD, *parts)
		os.makedirs(os.path.dirname(full), exist_ok=True)
		return full

	bones = [tuple(np.array(b[:3]) * scale) + tuple(b[3:]) for b in base["bones"]]
	props = [(n, tuple(np.array(t) * scale), r, b) for n, t, r, b in base["props"]]
	fauna.write_pmd(path("art", "meshes", "skeletal", "fauna", actor + ".pmd"), *mesh, bones, props)

	tag = "%s_%03d" % (base_name, round(scale * 100))
	lines = []
	for animation in vanilla.actor_animations(base_actor):
		name = os.path.splitext(animation["file"])[0]
		data, _ = fauna.scale_psa(vanilla.animation(name), scale)
		with open(path("art", "animation", "fauna", tag, os.path.basename(name) + ".psa"), "wb") as f:
			f.write(data)
		attributes = dict(animation, file="fauna/%s/%s.psa" % (tag, os.path.basename(name)))
		lines.append("    <animation " + " ".join('%s="%s"' % item for item in attributes.items()) + "/>")
	with open(path("art", "variants", "fauna", tag + ".xml"), "w", encoding="utf-8") as f:
		f.write('<?xml version="1.0" encoding="utf-8"?>\n<variant name="Base">\n  <animations>\n%s\n  </animations>\n</variant>\n' % "\n".join(lines))

	picture = Image.open(texture).convert("RGBA")
	picture.resize((fauna.power_of_two(picture.width), fauna.power_of_two(picture.height)), Image.LANCZOS).save(
		path("art", "textures", "skins", "skeletal", "fauna", actor + ".png"), "PNG")

	with open(path("art", "actors", "fauna", actor + ".xml"), "w", encoding="utf-8") as f:
		f.write("""<?xml version="1.0" encoding="utf-8"?>
<actor version="1">
  <castshadow/>
  <group>
    <variant file="fauna/%s.xml" name="Base">
      <mesh>skeletal/fauna/%s.pmd</mesh>
    </variant>
  </group>
  <group>
    <variant name="%s" frequency="1">
      <textures>
        <texture file="skeletal/fauna/%s.png" name="baseTex"/>
      </textures>
    </variant>
  </group>
  <material>basic_trans.xml</material>
</actor>
""" % (tag, actor, actor, actor))
	print("wrote actor fauna/%s.xml with %d animations (%s)" % (actor, len(lines), tag))


if __name__ == "__main__":
	main()
