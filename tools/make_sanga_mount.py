#!/usr/bin/env python3
"""Build art/meshes/skeletal/sanga_cattle_mount.pmd from the vanilla sanga cattle mesh.

The vanilla mesh (public.zip: art/meshes/skeletal/sanga_cattle_a.dae.cached.pmd) only has the
"root" and "neck" prop points, so riders had to be attached to "root" and did not follow the
animal's back. This script copies the mesh and adds horse-style prop points bound to the
Bovidae skeleton:

  rider, saddle  spine bone, on the dip of the back (same seat depth as the vanilla horses)
  gear           spine bone, identity in bind pose: props modelled around the origin follow the back
  shield         spine bone, left flank behind the rider
  chest          front spine bone, below the neck
  head           head bone, identity in bind pose
  decals, rider_L, rider_R   root bone, on the ground (blood/dust decals, dismounted side props)

Usage: python3 tools/make_sanga_mount.py [path/to/public.zip]
"""
import os
import struct
import sys
import zipfile

import numpy as np

PUBLIC_ZIP = "/snap/0ad/current/binaries/data/mods/public/public.zip"
SOURCE = "art/meshes/skeletal/sanga_cattle_a.dae.cached.pmd"
TARGET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "art", "meshes", "skeletal", "sanga_cattle_mount.pmd")

# Bone indices of the Bovidae skeleton, in PMD order.
ROOT, SPINE, SPINE_FRONT, HEAD = 0, 2, 3, 9

# Seat: horses put the rider 0.10 below the top of the back, slightly pitched forward.
SEAT_POSITION = (0.0, 3.12, -0.30)
SEAT_ROTATION = (0.0278, 0.0, 0.0, 0.9996)  # World orientation of the vanilla horse seat.
SHIELD_ROTATION = (0.2239, -0.6707, 0.1864, 0.6821)  # World orientation of the vanilla horse shield point.
IDENTITY = (0.0, 0.0, 0.0, -1.0)


def quat_to_matrix(q):
	x, y, z, w = q
	return np.array([
		[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
		[2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
		[2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def matrix_to_quat(m):
	t = np.trace(m)
	if t > 0:
		s = np.sqrt(t + 1) * 2
		q = ((m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4)
	elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
		s = np.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
		q = (s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s)
	elif m[1, 1] > m[2, 2]:
		s = np.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
		q = ((m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s)
	else:
		s = np.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
		q = ((m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s)
	return tuple(float(c) for c in q)


def transform(translation, rotation):
	m = np.eye(4)
	m[:3, :3] = quat_to_matrix(rotation)
	m[:3, 3] = translation
	return m


def read_pmd(data):
	magic, version, _ = struct.unpack_from("<4sII", data, 0)
	assert magic == b"PSMD" and version == 4, "unexpected PMD header"
	offset = 12
	num_vertices, num_uv_sets = struct.unpack_from("<II", data, offset)
	offset += 8 + num_vertices * (24 + 8 * num_uv_sets + 20)
	num_faces, = struct.unpack_from("<I", data, offset)
	offset += 4 + num_faces * 6
	num_bones, = struct.unpack_from("<I", data, offset)
	offset += 4
	bones = [struct.unpack_from("<7f", data, offset + 28 * i) for i in range(num_bones)]
	offset += 28 * num_bones
	geometry = data[12:offset]
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
	assert offset == len(data), "trailing data in PMD"
	return geometry, bones, props


def write_pmd(path, geometry, props):
	body = geometry + struct.pack("<I", len(props))
	for name, translation, rotation, bone in props:
		encoded = name.encode()
		body += struct.pack("<I", len(encoded)) + encoded + struct.pack("<7fB", *translation, *rotation, bone)
	with open(path, "wb") as f:
		f.write(b"PSMD" + struct.pack("<II", 4, len(body)) + body)


def main():
	archive = sys.argv[1] if len(sys.argv) > 1 else PUBLIC_ZIP
	with zipfile.ZipFile(archive) as z:
		geometry, bones, props = read_pmd(z.read(SOURCE))

	def bound(name, bone, position, rotation):
		"""A prop point given by its bind pose transform in model space."""
		local = np.linalg.inv(transform(bones[bone][:3], bones[bone][3:])) @ transform(position, rotation)
		return (name, tuple(float(c) for c in local[:3, 3]), matrix_to_quat(local[:3, :3]), bone)

	x, y, z = SEAT_POSITION
	props += [
		bound("rider", SPINE, SEAT_POSITION, SEAT_ROTATION),
		bound("saddle", SPINE, SEAT_POSITION, SEAT_ROTATION),
		bound("gear", SPINE, (0, 0, 0), IDENTITY),
		bound("shield", SPINE, (0.70, y - 0.23, z + 1.30), SHIELD_ROTATION),
		bound("chest", SPINE_FRONT, (0, 2.0, -1.95), IDENTITY),
		bound("head", HEAD, (0, 0, 0), IDENTITY),
		bound("decals", ROOT, (0, 0, 0), IDENTITY),
		bound("rider_L", ROOT, (1.43, 0, 0), IDENTITY),
		bound("rider_R", ROOT, (-1.43, 0, 0), IDENTITY),
	]
	write_pmd(TARGET, geometry, props)
	print("wrote", os.path.normpath(TARGET), "with prop points:", ", ".join(p[0] for p in props))


if __name__ == "__main__":
	main()
