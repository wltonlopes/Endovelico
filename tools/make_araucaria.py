#!/usr/bin/env python3
"""Paraná pine (Araucaria angustifolia) meshes, built from the atlas
art/textures/skins/gaia/araucaria_angustifolia.png (256 x 256):

  * a tall, bare, slightly leaning trunk with a flared foot and a few dry branch stubs (the tree sheds
    its lower branches);
  * the candelabra crown: whorls of woody arms near the top, nearly level from the trunk and turning
    up at the ends, the lower arms longer, so that every tip ends near the same height (the flat,
    cup-shaped top); some arms are missing, as on real trees;
  * the needle tufts at the arm ends: upturned branch sprites (stem at their bottom left) in a V,
    and the top-view tuft lying over them, which is what the game camera sees;
  * foliage normals out of the crown (tree_builder.Mesh.foliage_normals).

Writes art/meshes/gaia/araucaria_angustifolia_<n>.dae.
Usage: python3 tools/make_araucaria.py
"""
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tree_builder import Mesh, normalize, region, write_dae  # noqa: E402

MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ATLAS = 256.0

BARK = region(187, 0, 255, 256, ATLAS)
BRANCH = region(11, 129, 115, 212, ATLAS)      # stem at the bottom left, tufts up and right
# The bottom right of the branch rectangle holds two pine cones: cut away, (s right, t up).
BRANCH_SHAPE = [(0, 1), (0, 0), (0.42, 0), (0.44, 0.33), (1, 0.56), (1, 1)]
TUFT_TOP = region(128, 14, 187, 75, ATLAS)     # needle tuft seen from above
TUFT_LONG = region(134, 77, 183, 153, ATLAS)   # needle tuft seen from the side

# variant: (height, whorls, arms per whorl, seed)
VARIANTS = {1: (21.6, 5, 6, 1), 2: (26.4, 6, 7, 2), 3: (17.4, 4, 5, 3)}

UP = np.array([0, 0, 1.0])


def tuft_top(mesh, centre, size, angle, lift=0.0, outward=None):
	"""Top-view tuft centred on centre, tilted down towards `outward` (the crown's dome)."""
	a = np.array([math.cos(angle), math.sin(angle), 0]) * size
	b = np.array([-math.sin(angle), math.cos(angle), 0]) * size
	if outward is not None:
		# Lower the edge that faces away from the trunk by a quarter of the size.
		o = normalize(outward)
		a = a - UP * 0.25 * np.dot(a, o)
		b = b - UP * 0.25 * np.dot(b, o)
	origin = np.asarray(centre) - 0.5 * a - 0.5 * b + UP * lift
	mesh.card(origin, a, b, TUFT_TOP)


def arm(mesh, origin, azimuth, length, lift, rng):
	"""A woody arm, nearly level and turning up at the end, with its needle tufts."""
	out = np.array([math.cos(azimuth), math.sin(azimuth), 0])
	o = np.asarray(origin, float)
	sag = rng.uniform(-0.06, 0.02) * length
	control = [o, o + out * 0.35 * length + UP * sag, o + out * 0.7 * length + UP * (sag + 0.12 * lift),
		o + out * length + UP * lift]
	mesh.tube(control[:3], [0.07 * length / 4, 0.045 * length / 4, 0.03 * length / 4], BARK, sides=4, strip_length=4.0)
	# Upturned tufts in a V over the outer half of the arm, the sprite's stem on the arm.
	start = control[1]
	reach = control[3] - start
	reach_level = reach - UP * reach[2]
	side = np.cross(UP, out)
	for roll in (-0.55, 0.55):
		up = normalize(UP * math.cos(roll) + side * math.sin(roll)) * (lift - sag) * 1.3
		mesh.card(start - UP * 0.1 * lift, reach_level * 1.1, up, BRANCH, BRANCH_SHAPE)
	# What the camera sees from above: a tuft at the tip and a smaller one before it.
	tuft_top(mesh, control[3] - UP * 0.1 * lift, 0.42 * length, azimuth + rng.uniform(0, math.pi), outward=out)
	tuft_top(mesh, control[2] + UP * 0.25 * lift, 0.34 * length, azimuth + rng.uniform(0, math.pi), outward=out)


def build(height, whorls, per_whorl, seed):
	rng = random.Random(seed)
	mesh = Mesh()
	lean = np.array([rng.uniform(-1, 1), rng.uniform(-1, 1), 0]) * 0.012 * height
	trunk_top = height * 0.9

	def trunk_at(z):
		"""Centre of the trunk at height z: a slight lean, curving."""
		f = z / trunk_top
		return lean * f * f + np.array([0, 0, z])

	control = [trunk_at(z) for z in np.linspace(0, trunk_top, 5)]
	radius = 0.45 * height / 20
	mesh.tube(control, [radius * 1.6, radius * 0.95, radius * 0.75, radius * 0.5, radius * 0.25], BARK, sides=8,
		strip_length=4.0)
	# Dry stubs of shed branches along the bare trunk.
	for _ in range(rng.randint(3, 6)):
		z = rng.uniform(0.3, 0.6) * height
		a = rng.uniform(0, 2 * math.pi)
		out = np.array([math.cos(a), math.sin(a), 0])
		base = trunk_at(z) + out * radius * 0.6
		length = rng.uniform(0.4, 1.3)
		mesh.tube([base, base + out * length * 0.6 - UP * 0.1 * length, base + out * length - UP * 0.25 * length],
			[0.06, 0.04, 0.015], BARK, sides=4, strip_length=1.0)

	crown_bottom = height * 0.62
	for w in range(whorls):
		f = w / max(whorls - 1, 1)  # 0 lowest whorl, 1 top
		z = crown_bottom + (trunk_top - 0.8 - crown_bottom) * f
		length = height * (0.36 - 0.2 * f) * rng.uniform(0.9, 1.1)
		# Every tip ends near the crown top: the lower arms turn up more.
		lift = max(0.25 * length, trunk_top + 0.3 - z - 0.04 * length)
		offset = rng.uniform(0, 2 * math.pi)
		for b in range(per_whorl):
			if f < 0.9 and rng.random() < 0.3:
				continue  # a missing arm: an open crown, as on old trees
			a = offset + 2 * math.pi * b / per_whorl + rng.uniform(-0.25, 0.25)
			origin = trunk_at(z) + np.array([math.cos(a), math.sin(a), 0]) * radius * 0.4
			arm(mesh, origin, a, length * rng.uniform(0.85, 1.1), lift * rng.uniform(0.85, 1.05), rng)
	# Leader: young tufts at the top of the trunk.
	top = trunk_at(trunk_top)
	for k in range(4):
		a = 2 * math.pi * k / 4 + rng.uniform(-0.4, 0.4)
		out = np.array([math.cos(a), math.sin(a), 0])
		tuft_top(mesh, top + out * height * 0.05 - UP * 0.2, height * 0.07, a, outward=out)
	for k in range(2):
		a = math.pi * k / 2
		side = np.array([math.cos(a), math.sin(a), 0])
		w = height * 0.045
		mesh.card(top - side * w - UP * 0.4, side * 2 * w, UP * 2.2 * w, TUFT_LONG)

	crown_centre = trunk_at(trunk_top) - UP * height * 0.08
	mesh.foliage_normals(crown_centre, (height * 0.35, height * 0.35, height * 0.12), up_bias=0.45)
	return mesh


def main():
	directory = os.path.join(MOD, "art", "meshes", "gaia")
	os.makedirs(directory, exist_ok=True)
	for number, (height, whorls, per_whorl, seed) in VARIANTS.items():
		mesh = build(height, whorls, per_whorl, seed)
		name = "araucaria_angustifolia_%d" % number
		write_dae(os.path.join(directory, name + ".dae"), mesh, name)
		print("%s: %.1f m, %d vertices, %d triangles" % (name, height, len(mesh.positions), len(mesh.triangles)))


if __name__ == "__main__":
	main()
