#!/usr/bin/env python3
"""Pinheiro-bravo (Podocarpus lambertii) meshes, built from the atlas
art/textures/skins/gaia/podocarpus_lambertii.png (512 x 512):

  * a trunk that forks at about a third of the height into two to four limbs, which rise and spread,
    each with a few side branches (all woody tubes with the bark strip);
  * the crown as clumps of foliage around the ends of the limbs and branches: each clump a burst of
    branch cards in random directions, so the silhouette is dense but irregular, with gaps;
  * foliage normals out of the crown (tree_builder.Mesh.foliage_normals).

Writes art/meshes/gaia/podocarpus_lambertii_<n>.dae.
Usage: python3 tools/make_podocarpus.py
"""
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tree_builder import Mesh, normalize, region, write_dae  # noqa: E402

MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ATLAS = 512.0
BARK = region(370, 0, 512, 512, ATLAS)
# Branch sprites, all with the stem at the left. The rising one (cut polygon, more triangles) is used
# for one card in four.
BRANCH_FLAT = region(2, 19, 255, 150, ATLAS)     # near-horizontal branch, stem at the bottom left
BRANCH_MID = region(5, 129, 266, 262, ATLAS)     # horizontal branch, stem in the middle of the left side
BRANCH_RISING = region(5, 260, 266, 479, ATLAS)  # stem at the bottom left, foliage up and right
# The rising branch's rectangle holds two seeds in its bottom right: cut away, (s right, t up).
RISING_SHAPE = [(0, 1), (0, 0), (0.58, 0), (0.6, 0.37), (0.86, 0.37), (0.87, 0.53), (1, 0.53), (1, 1)]
SPRIG = region(254, 21, 353, 238, ATLAS)         # leafy sprig, stem at the bottom
SPRITES = [(BRANCH_FLAT, None, 0.5), (BRANCH_MID, None, 0.5), (BRANCH_FLAT, None, 0.5), (BRANCH_RISING, RISING_SHAPE, 0.85)]

# variant: (height, limbs, seed)
VARIANTS = {1: (16.8, 3, 21), 2: (19.8, 4, 22), 3: (13.2, 2, 23)}

UP = np.array([0, 0, 1.0])


def random_unit(rng):
	while True:
		v = np.array([rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)])
		if 0.1 < np.linalg.norm(v) <= 1:
			return v / np.linalg.norm(v)


def clump(mesh, centre, size, outward, rng, cards=8):
	"""A burst of branch cards around centre, leaning outward from the crown and upward."""
	for _ in range(cards):
		direction = normalize(random_unit(rng) + 1.2 * outward + 0.5 * UP)
		# The card's up: any vector across the direction, mostly upward.
		across = normalize(np.cross(direction, random_unit(rng)))
		if across[2] < 0:
			across = -across
		uv, shape, aspect = SPRITES[rng.randrange(len(SPRITES))]
		length = size * rng.uniform(0.8, 1.2)
		# The stem starts a little inside the clump.
		origin = np.asarray(centre) - direction * 0.25 * length - across * 0.3 * aspect * length
		mesh.card(origin, direction * length, across * aspect * length, uv, shape)


def build(height, limbs, seed):
	rng = random.Random(seed)
	mesh = Mesh()
	fork = height * rng.uniform(0.24, 0.3)
	lean = np.array([rng.uniform(-1, 1), rng.uniform(-1, 1), 0]) * 0.03 * height
	radius = 0.3 * height / 14
	trunk_top = lean * 0.4 + UP * fork
	mesh.tube([np.zeros(3), lean * 0.15 + UP * fork * 0.5, trunk_top], [radius * 1.5, radius * 1.05, radius * 0.9],
		BARK, sides=10, strip_length=2.5, close=False)
	crown_centre = UP * height * 0.6
	crown_radii = np.array([0.3, 0.3, 0.36]) * height
	clump_size = height * 0.2
	offset = rng.uniform(0, 2 * math.pi)
	tips = []
	for k in range(limbs):
		a = offset + 2 * math.pi * k / limbs + rng.uniform(-0.4, 0.4)
		out = np.array([math.cos(a), math.sin(a), 0])
		spread = rng.uniform(0.12, 0.2) * height
		top = height * rng.uniform(0.86, 0.97)
		control = [trunk_top, trunk_top + out * spread * 0.4 + UP * (top - fork) * 0.35,
			trunk_top + out * spread * 0.8 + UP * (top - fork) * 0.7, trunk_top * [1, 1, 0] + out * spread + UP * top]
		path = mesh.tube(control, [radius * 0.75, radius * 0.5, radius * 0.32, radius * 0.12], BARK, sides=6,
			strip_length=4.0)
		tips.append(path[-1])
		# Side branches from the limb, out and up, with a clump at each end.
		for _ in range(rng.randint(2, 4)):
			p = path[int(len(path) * rng.uniform(0.3, 0.8))]
			b = a + rng.uniform(-1.4, 1.4)
			side_out = np.array([math.cos(b), math.sin(b), 0])
			length = height * rng.uniform(0.12, 0.2)
			end = p + side_out * length + UP * length * rng.uniform(0.3, 0.7)
			mesh.tube([p, p + side_out * length * 0.5 + UP * length * 0.15, end], [radius * 0.22, radius * 0.14, radius * 0.06],
				BARK, sides=4, strip_length=6.0)
			tips.append(end)
	for tip in tips:
		outward = normalize((tip - crown_centre) / crown_radii)
		clump(mesh, tip, clump_size * rng.uniform(0.85, 1.15), outward, rng, cards=rng.randint(6, 9))
	# Fill the crown: smaller clumps between the tips, nearer its surface than its centre.
	# Even coverage: points of a Fibonacci sphere over the crown, skipping its underside.
	fill = int(len(tips) * 1.2) + 4
	golden = math.pi * (3 - math.sqrt(5))
	for i in range(fill):
		z = 1 - 2 * (i + 0.5) / fill
		if z < -0.55:
			continue
		r = math.sqrt(1 - z * z)
		d = np.array([r * math.cos(golden * i), r * math.sin(golden * i), z])
		point = crown_centre + d * crown_radii * rng.uniform(0.6, 0.9)
		clump(mesh, point, clump_size * 0.85, d, rng, cards=5)
	# A few sprigs standing out of the top.
	for _ in range(5):
		tip = tips[rng.randrange(len(tips))]
		d = normalize(random_unit(rng) * 0.4 + UP)
		across = normalize(np.cross(d, np.array([1.0, 0, 0])))
		w = height * 0.035
		mesh.card(tip - across * w, across * 2 * w, d * height * 0.09, SPRIG)
	mesh.foliage_normals(crown_centre, crown_radii, up_bias=0.35)
	return mesh


def main():
	directory = os.path.join(MOD, "art", "meshes", "gaia")
	for number, (height, limbs, seed) in VARIANTS.items():
		mesh = build(height, limbs, seed)
		name = "podocarpus_lambertii_%d" % number
		write_dae(os.path.join(directory, name + ".dae"), mesh, name)
		print("%s: %.1f m, %d vertices, %d triangles" % (name, height, len(mesh.positions), len(mesh.triangles)))


if __name__ == "__main__":
	main()
