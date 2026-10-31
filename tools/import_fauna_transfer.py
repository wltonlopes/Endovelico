#!/usr/bin/env python3
"""Import animals whose rig the game has no animations for, or that have no rig at all.

import_fauna_catalog.py only handles meshes weighted to a vanilla skeleton at roughly the vanilla
proportions. This tool takes any catalog mesh and puts it on the skeleton of a similar vanilla animal:

  * meshes weighted to a skeleton the game cannot animate (turkey rig, hyena rig) are renamed to the
    target skeleton's bones (BONE_MAPS);
  * meshes without weights get the weights of the nearest point of the vanilla mesh, once both are
    stretched to the same bounding box ("transfer");
  * the rest pose of every bone is then moved to where the animal's own body puts that joint, and
    the vanilla animations are retargeted to the new bone lengths (rotations kept, offsets re-built),
    so long necks, long legs and short legs all bend at their own joints.

Writes, per animal (existing files are kept unless --force):
  art/meshes/skeletal/fauna/<actor>.pmd, art/animation/fauna/<actor>/*.psa,
  art/variants/fauna/<actor>.xml, art/textures/skins/skeletal/fauna/<actor>_*.png,
  art/actors/fauna/<actor>.xml

Usage:
  python3 tools/import_fauna_transfer.py --blend <file.blend> --textures <dir> [--only a,b] [--force]
"""
import argparse
import io
import os
import re
import struct
import sys

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_fauna_catalog import (BASE_ACTORS, MOD, PUBLIC_ZIP, Textures, Vanilla, bone_alias, build_mesh,  # noqa: E402
	dump_blend, fit_to_base, power_of_two, to_engine, write_pmd)

BASE_ACTORS.update({"wolf": "fauna/wolf.xml", "giraffe_adult": "fauna/giraffe_adult.xml"})

# Base mesh -> its skeleton.
SKELETONS = {"chicken": "BlenderChicken", "wolf": "Wolf", "giraffe_adult": "giraffe", "bull_a": "Bovidae_Skeleton",
	"tiger": "BlenderFeline", "animal_boar": "Boar_Armature", "bear": "Ursidae_Armature", "Croc": "Crocodile"}

# Catalog rig -> bones of the target skeleton.
BONE_MAPS = {
	"turkey_to_chicken": {
		"Root": "Body", "Hip": "Body", "SpineA": "Body", "SpineB": "Body",
		"NeckA": "Neck_Low", "NeckB": "Neck_Low", "NeckC": "Neck_High", "Head": "Head",
		"UpLeg_l": "Leg_L", "Leg_l": "Shin_L", "Feet_l": "Foot_L", "UpLeg_r": "Leg_R", "Leg_r": "Shin_R", "Feet_r": "Foot_R",
		"Clavicle_l": "Body", "Upper_Arm_l": "Body", "Arm_l": "Wing_L",
		"Clavicle_r": "Body", "Upper_Arm_r": "Body", "Arm_r": "Wing_R",
		"TailA": "Rear", "TailB": "Tail", "TailC": "Tail"},
	"hyena_to_wolf": {
		"Back": "Bone", "Queue": "Tail1", "Torso": "Bone_005", "Neck": "Neck2", "Head": "Head", "Jaw": "Jaw1",
		"Left_Ear": "Head", "Right_Ear": "Head",
		"Front_Leg_Cuisse_.L": "FrontLeg1_L", "Front_Leg_Ankle_.L": "FrontLeg2_L", "Front_Leg_Foot_.L": "FrontLeg3_L",
		"Front_Leg_Foot_.L_tip": "FrontToe_L",
		"Front_Leg_Cuisse_.R": "FrontLeg1_R", "Front_Leg_Ankle_.R": "FrontLeg2_R", "Front_Leg_Foot_.R": "FrontLeg3_R",
		"Front_Leg_Foot_.R_tip": "FrontToe_R",
		"Leg_Cuisse_.L": "BackLeg1_L", "Leg_Ankle_.L": "BackLeg2_L", "Leg_Foot_.L": "BackLeg3_L", "Leg_Foot_.L_tip": "BackToe_L",
		"Leg_Cuisse_.R": "BackLeg1_R", "Leg_Ankle_.R": "BackLeg2_R", "Leg_Foot_.R": "BackLeg3_R", "Leg_Foot_.R_tip": "BackToe_R"},
}

# actor: (body object, extra parts, base mesh, weights: "own" | "transfer" | BONE_MAPS key, texture objects)
ANIMALS = {
	"ostrich": ("avestrúz", [], "chicken", "turkey_to_chicken", ["avestrúz", "avestrúz.002"]),
	"ostrich_female": ("avestrúz.001", [], "chicken", "turkey_to_chicken", ["avestrúz.001", "avestrúz.003"]),
	"rhea": ("ñandú", [], "chicken", "turkey_to_chicken", ["ñandú"]),
	"partridge": ("Partridge", [], "chicken", "transfer", ["Partridge"]),
	"bongo": ("bongo", [], "wolf", "own", ["bongo"]),
	"oryx": ("Oryx africano", [], "wolf", "own", ["Oryx africano"]),
	"oryx_arabian": ("Oryx arabigo", [], "wolf", "own", ["Oryx arabigo"]),
	"saiga": ("saiga", ["saiga.001"], "wolf", "transfer", ["saiga"]),
	"hyena": ("Final Hyena Mesh", [], "wolf", "hyena_to_wolf", ["Final Hyena Mesh"]),
	"okapi": ("okapi", [], "giraffe_adult", "own", ["okapi"]),
	"buffalo_cape": ("cafre.003", [], "bull_a", "own", ["cafre.003"]),
	"cheetah": ("guepardo", [], "tiger", "transfer", ["guepardo"]),
	"leopard": ("leopardo", [], "tiger", "transfer", ["leopardo"]),
	"leopard_snow": ("leopardo de las nieves", [], "tiger", "transfer", ["leopardo de las nieves"]),
	"tapir_lowland": ("tapir americano.002", [], "animal_boar", "transfer", ["tapir americano.002"]),
	"tapir_malayan": ("tapir malayo.001", [], "animal_boar", "transfer", ["tapir malayo.001"]),
	"gorilla": ("gorila", [], "bear", "transfer", ["gorila"]),
	"chimpanzee": ("chimpancé", [], "bear", "transfer", ["chimpancé"]),
	"seal_harbor": ("foca común", [], "Croc", "transfer", ["foca común"]),
	"walrus": ("walrus", [], "Croc", "transfer", ["walrus"]),
}


# Bones of the base mesh left out of the weight transfer: the wolf's long tail would take the back of
# the short-tailed saiga's legs.
# The crocodile's hind legs would land in the middle of a seal's body, so pinnipeds leave them out.
TRANSFER_IGNORE = {"saiga": r"^Tail[2-4]$", "seal_harbor": r"^Back[LR]", "walrus": r"^Back[LR]"}

# Bones of the base mesh moved along the body before the weight transfer: {bone: fraction of the
# animal's length from the snout}. On a seal the crocodile's front legs are the fore flippers and its
# hips go where the seal's hips are, so the rear body and the hind flippers ride on the tail.
TRANSFER_WARP = {
	"seal_harbor": {"FrontLKnee": 0.26, "BackLKnee": 0.72},
	"walrus": {"FrontLKnee": 0.30, "BackLKnee": 0.73},
}


# Quadrupeds whose legs are much longer or shorter than the base animal's: before the weight transfer
# the base mesh is warped so that its belly height and the positions of its fore and hind legs match
# the animal's, otherwise the top of long legs would get the weights of the base animal's chest.
# "profile" also matches the height of the shoulders and chest apart from the hips and groin, for
# animals whose back slopes (a gorilla stands high in front on its long arms).
ANATOMY_WARP = {"cheetah": "belly", "leopard": "belly", "leopard_snow": "belly", "gorilla": "profile"}

# Birds weighted on the turkey rig carry the whole visible leg on one bone; the leg is re-weighted by
# height so that it bends at the ankle (the joint halfway down an ostrich's leg).
BIRD_LEGS = {"ostrich", "ostrich_female", "rhea"}

# Animations kept on the ground frame by frame (actor: regex on the animation file name): the
# crocodile's death rolls onto its side and jumps, which on the tall, heavy walrus would put half the
# body underground and then throw it in the air.
GROUNDED = {"seal_harbor": r"death", "walrus": r"death",
	"ostrich": r"idle_02", "ostrich_female": r"idle_02", "rhea": r"idle_02"}

# Share of a bone's rotation (relative to its parent) kept from the base animation, per actor and
# animation file regex. The ostrich keeps its small wings folded where the chicken flaps them, and
# feeds by lowering its neck where the chicken tips its whole body forward.
_RATITE = [
	(r".", {"Wing_L": 0.15, "Wing_R": 0.15, "WingTip_L": 0.15, "WingTip_R": 0.15}),
	(r"idle_02", {"Body": 0.3, "Leg_L": 0.3, "Leg_R": 0.3, "Neck_Low": 1.5}),
]
ROTATION_SCALE = {"ostrich": _RATITE, "ostrich_female": _RATITE, "rhea": _RATITE}


def quat_rotate(q, v):
	"""Rotate the vectors v (..., 3) by the quaternions q (..., 4) stored x, y, z, w."""
	u, w = q[..., :3], q[..., 3:4]
	t = 2 * np.cross(u, v)
	return v + w * t + np.cross(u, t)


def quat_conj(q):
	return q * np.array([-1, -1, -1, 1])


def quat_mul(a, b):
	x1, y1, z1, w1 = np.moveaxis(a, -1, 0)
	x2, y2, z2, w2 = np.moveaxis(b, -1, 0)
	return np.stack([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
		w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2], -1)


def quat_power(q, factor):
	"""The rotation q scaled to factor times its angle, about the same axis."""
	q = np.where(q[..., 3:] < 0, -q, q)
	half = np.arccos(np.clip(q[..., 3:], -1, 1))
	axis = q[..., :3] / np.maximum(np.sin(half), 1e-8)
	return np.concatenate([axis * np.sin(factor * half), np.cos(factor * half)], -1)


def joint_estimates(positions, rows, parents, num_bones):
	"""Where the body puts each joint: the blend zone of a bone and its parent, else the closest points."""
	dominant = np.full(len(positions), -1)
	weight = np.zeros((len(positions), num_bones))
	for i, row in enumerate(rows):
		for bone, w in row:
			weight[i, bone] += w
		if row:
			dominant[i] = max(row, key=lambda item: item[1])[0]
	estimates = {}
	for bone in range(num_bones):
		own = dominant == bone
		if own.sum() < 2:
			continue
		parent = parents[bone]
		if parent is None:
			estimates[bone] = positions[own].mean(0)
			continue
		mixed = np.minimum(weight[:, bone], weight[:, parent])
		if (mixed > 0.1).sum() >= 3:
			estimates[bone] = (positions * mixed[:, None]).sum(0) / mixed.sum()
			continue
		other = dominant == parent
		if other.sum() < 2:
			# A parent without vertices (the bear's root): the bone's own region places it.
			estimates[bone] = positions[own].mean(0)
			continue
		distance, nearest = cKDTree(positions[other]).query(positions[own])
		close = distance <= np.percentile(distance, 15)
		estimates[bone] = 0.5 * (positions[own][close].mean(0) + positions[other][nearest[close]].mean(0))
	return estimates


def fit_rest_pose(base, base_rows, positions, rows, parents, scale):
	"""New bone positions: the scaled vanilla ones, moved by how far the animal's joints are from the vanilla joints."""
	num_bones = len(base["bones"])
	old = np.array([b[:3] for b in base["bones"]])
	base_est = joint_estimates(base["positions"], base_rows, parents, num_bones)
	new_est = joint_estimates(positions, rows, parents, num_bones)
	correction = np.zeros((num_bones, 3))
	known = np.zeros(num_bones, dtype=bool)
	for bone in range(num_bones):
		if bone in base_est and bone in new_est:
			correction[bone] = new_est[bone] - base_est[bone] * scale
			known[bone] = True
	# Bones without vertices (end bones, IK helpers) follow their nearest estimated ancestor.
	for bone in range(num_bones):
		if not known[bone]:
			parent = parents[bone]
			while parent is not None and not known[parent]:
				parent = parents[parent]
			if parent is not None:
				correction[bone] = correction[parent]
	return old * scale + correction


def retarget_psa(data, old_rest, new_rest, rotations, parents, scale):
	"""Rebuild the animation's bone positions from the new bone offsets; rotations are kept."""
	length, = struct.unpack_from("<I", data, 12)
	offset = 16 + length
	_, num_bones, num_frames = struct.unpack_from("<fII", data, offset)
	offset += 12
	keys = np.frombuffer(data, dtype="<f4", count=num_bones * num_frames * 7, offset=offset).reshape(num_frames, num_bones, 7).astype(float)
	result = keys.copy()
	inverse_rest = quat_conj(rotations)
	mean_scale = float(np.mean(scale))
	for bone in range(num_bones):
		parent = parents[bone]
		if parent is None:
			result[:, bone, :3] = keys[:, bone, :3] * scale + (new_rest[bone] - old_rest[bone] * scale)
			continue
		animated = quat_rotate(quat_conj(keys[:, parent, 3:]), keys[:, bone, :3] - keys[:, parent, :3])
		rest = quat_rotate(inverse_rest[parent], old_rest[bone] - old_rest[parent])
		local = quat_rotate(inverse_rest[parent], new_rest[bone] - new_rest[parent]) + (animated - rest) * mean_scale
		result[:, bone, :3] = result[:, parent, :3] + quat_rotate(result[:, parent, 3:], np.broadcast_to(local, animated.shape))
	return data[:offset] + result.astype("<f4").tobytes() + data[offset + keys.size * 4:], num_bones


def bone_side(name):
	"""'L', 'R' or None, from whole name tokens: Leg_L, left_f_foot, Boar_Hip_Left, FrontLKnee."""
	for token in re.split(r"[_.\s]+", name):
		if token.lower() in ("l", "left") or re.fullmatch(r"(Front|Back)L[A-Z]\w*", token):
			return "L"
		if token.lower() in ("r", "right") or re.fullmatch(r"(Front|Back)R[A-Z]\w*", token):
			return "R"
	return None


def fix_sides(positions, indices, weights, std):
	"""Drop the weights a vertex has on bones of the other side of the body (mirror and painting slips)."""
	num_bones = len(std)
	sides = [bone_side(n) for n in std]
	sign = {}
	for side in "LR":
		bones = [b for b in range(num_bones) if sides[b] == side]
		mask = np.isin(indices, bones) & (weights > 0.5)
		if mask.any():
			sign[side] = np.sign(np.mean(positions[mask.any(1), 0]))
	if len(sign) < 2 or sign["L"] == sign["R"]:
		return 0
	width = np.abs(positions[:, 0]).max()
	changed = 0
	for i, (p, bi, bw) in enumerate(zip(positions, indices, weights)):
		if abs(p[0]) < 0.08 * width:
			continue
		here = "L" if np.sign(p[0]) == sign["L"] else "R"
		wrong = np.array([b < num_bones and sides[b] not in (None, here) for b in bi]) & (bw > 0)
		if wrong.any() and not wrong[bw > 0].all():
			bw[wrong] = 0
			bw /= bw.sum()
			bi[wrong] = 255
			changed += 1
	return changed


def split_midline(positions, normals, uvs, indices, weights, faces, std):
	"""A vertex welded between the left and right leg (mirror merge) gets one copy per side."""
	sides = np.array([bone_side(n) for n in std] + [None] * (256 - len(std)), dtype=object)
	both = [i for i, (bi, bw) in enumerate(zip(indices, weights)) if
		{"L", "R"} <= {sides[b] for b, w in zip(bi, bw) if w > 0.05}]
	if not both:
		return positions, normals, uvs, indices, weights, faces
	positions, normals, uvs = list(positions), list(normals), list(uvs)
	indices, weights, faces = [list(x) for x in indices], [list(x) for x in weights], [list(f) for f in faces]
	copies = {}
	for face in faces:
		centre = np.mean([positions[v][0] for v in face])
		for k, v in enumerate(face):
			if v not in both or abs(centre) < 1e-4:
				continue
			sign = np.sign(centre)
			if (v, sign) not in copies:
				# The side of a bone in engine x is read off the other vertices of that bone.
				keep = []
				for b, w in zip(indices[v], weights[v]):
					side_sign = np.sign(np.mean([positions[j][0] for j in range(len(positions)) if b in indices[j]])) if sides[b] else 0
					keep.append(w if sides[b] is None or side_sign == sign else 0.0)
				total = sum(keep)
				if total <= 0:
					continue
				copies[(v, sign)] = len(positions)
				positions.append(positions[v]); normals.append(normals[v]); uvs.append(uvs[v])
				indices.append([b if w > 0 else 255 for b, w in zip(indices[v], keep)])
				weights.append([w / total for w in keep])
			face[k] = copies[(v, sign)]
	return (np.array(positions), np.array(normals), np.array(uvs), np.array(indices), np.array(weights), faces)


def clean_weights(positions, indices, weights, faces, base, rest):
	"""Move weights off bones the vanilla mesh never uses (their animation does not follow the body)
	and off bones no neighbouring vertex shares (stray picks that tear the mesh when animated)."""
	num_bones = len(base["bones"])
	used = np.zeros(num_bones, dtype=bool)
	for k in range(4):
		column = base["indices"][:, k]
		used[column[(column < num_bones) & (base["weights"][:, k] > 0)]] = True
	used_ids = np.flatnonzero(used)
	weld = {}
	vertex_key = [weld.setdefault(tuple(np.round(p, 4)), len(weld)) for p in positions]
	neighbours = [set() for _ in weld]
	for face in faces:
		for a in face:
			neighbours[vertex_key[a]].update(vertex_key[b] for b in face if b != a)
	for _ in range(2):
		strong = [set() for _ in weld]
		for i, (bi, bw) in enumerate(zip(indices, weights)):
			strong[vertex_key[i]].update(int(b) for b, w in zip(bi, bw) if b < num_bones and w > 0.25)
		for i, (bi, bw) in enumerate(zip(indices, weights)):
			total = {}
			near = set().union(*(strong[n] for n in neighbours[vertex_key[i]])) if neighbours[vertex_key[i]] else None
			for b, w in zip(bi, bw):
				if b >= num_bones or w <= 0:
					continue
				b = int(b)
				if not used[b]:
					b = int(used_ids[np.argmin(np.linalg.norm(rest[used_ids] - positions[i], axis=1))])
				if near is not None and b not in near and len(bw[bw > 0]) > 1 and b not in strong[vertex_key[i]]:
					continue
				total[b] = total.get(b, 0) + w
			if not total:
				continue
			top = sorted(total.items(), key=lambda item: -item[1])[:4]
			norm = sum(w for _, w in top)
			bi[:] = 255
			bw[:] = 0
			for k, (b, w) in enumerate(top):
				bi[k], bw[k] = b, w / norm


def lift_to_ground(data, positions, indices, weights, rest):
	"""Move each frame of a PSA up or down so the lowest vertex of the skinned mesh is at y = 0."""
	length, = struct.unpack_from("<I", data, 12)
	offset = 16 + length
	_, num_bones, num_frames = struct.unpack_from("<fII", data, offset)
	offset += 12
	keys = np.frombuffer(data, dtype="<f4", count=num_bones * num_frames * 7, offset=offset).reshape(num_frames, num_bones, 7).astype(float)
	valid = indices < num_bones
	bones = np.where(valid, indices, 0)
	local = quat_rotate(quat_conj(rest[bones, 3:]), positions[:, None, :] - rest[bones, :3])
	for frame in keys:
		skinned = (np.where(valid, weights, 0)[..., None] * (quat_rotate(frame[bones, 3:], local) + frame[bones, :3])).sum(1)
		frame[:, 1] -= skinned[:, 1].min()
	return data[:offset] + keys.astype("<f4").tobytes() + data[offset + keys.size * 4:]


def scale_rotations(data, rest, parents, std, factors):
	"""Scale the rotation of some bones relative to their rest pose; their children follow rigidly."""
	length, = struct.unpack_from("<I", data, 12)
	offset = 16 + length
	_, num_bones, num_frames = struct.unpack_from("<fII", data, offset)
	offset += 12
	keys = np.frombuffer(data, dtype="<f4", count=num_bones * num_frames * 7, offset=offset).reshape(num_frames, num_bones, 7).astype(float)
	result = keys.copy()
	for bone in range(num_bones):
		parent = parents[bone]
		factor = factors.get(std[bone], 1.0)
		if parent is None:
			if factor != 1.0:
				delta = quat_mul(keys[:, bone, 3:], quat_conj(rest[bone, 3:]))
				result[:, bone, 3:] = quat_mul(quat_power(delta, factor), rest[bone, 3:])
			continue
		local = quat_mul(quat_conj(keys[:, parent, 3:]), keys[:, bone, 3:])
		if factor != 1.0:
			rest_local = quat_mul(quat_conj(rest[parent, 3:]), rest[bone, 3:])
			change = quat_mul(quat_conj(rest_local), local)
			local = quat_mul(rest_local, quat_power(change, factor))
		result[:, bone, 3:] = quat_mul(result[:, parent, 3:], local)
		arm = quat_rotate(quat_conj(keys[:, parent, 3:]), keys[:, bone, :3] - keys[:, parent, :3])
		result[:, bone, :3] = result[:, parent, :3] + quat_rotate(result[:, parent, 3:], arm)
	return data[:offset] + result.astype("<f4").tobytes() + data[offset + keys.size * 4:]


def rows_by_index(base):
	num_bones = len(base["bones"])
	return [[(int(i), float(w)) for i, w in zip(bi, bw) if i < num_bones and w > 0] for bi, bw in zip(base["indices"], base["weights"])]


def yaw_matrix(quarter):
	c, s = np.cos(quarter * np.pi / 2), np.sin(quarter * np.pi / 2)
	return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def transfer_fit(points, base):
	"""Yaw and per-axis box mapping of the base mesh onto the animal, judged by how well the shapes overlap."""
	base_points = base["positions"]
	low_b, size_b = base_points.min(0), np.ptp(base_points, axis=0)
	best = None
	for quarter in range(4):
		rotation = yaw_matrix(quarter)
		rotated = points @ rotation
		low, size = rotated.min(0), np.ptp(rotated, axis=0)
		a = (rotated - low) / size
		b = (base_points - low_b) / size_b
		error = cKDTree(b).query(a)[0].mean() + cKDTree(a).query(b)[0].mean()
		if best is None or error < best[0]:
			best = (error, rotation, size / size_b, low - low_b * size / size_b)
	_, rotation, scale, shift = best
	return rotation, scale, shift


def warp_length(base, names, landmarks):
	"""Base positions moved along z so that each landmark bone sits at its fraction of the length."""
	positions = base["positions"].copy()
	low, high = positions[:, 2].min(), positions[:, 2].max()
	source, target = [0.0, 1.0], [0.0, 1.0]
	for bone, fraction in landmarks.items():
		source.append((base["bones"][names.index(bone)][2] - low) / (high - low))
		target.append(fraction)
	order = np.argsort(source)
	# Snout to tail runs along -z to +z in the base meshes.
	positions[:, 2] = low + (high - low) * np.interp((positions[:, 2] - low) / (high - low),
		np.array(source)[order], np.array(target)[order])
	return positions


def landmarks(points):
	"""Belly height, the positions of the fore and hind legs along the body (head towards -z), and the
	under side and top of the body over each pair of legs."""
	height = points[:, 1].max()
	low = points[:, 1] < 0.12 * height
	middle = 0.5 * (points[:, 2].min() + points[:, 2].max())
	front = np.median(points[low & (points[:, 2] < middle), 2])
	back = np.median(points[low & (points[:, 2] > middle), 2])
	span = back - front
	midline = np.abs(points[:, 0]) < 0.25 * np.abs(points[:, 0]).max()
	trunk = (points[:, 2] > front + 0.3 * span) & (points[:, 2] < back - 0.3 * span) & midline
	belly = points[trunk, 1].min()
	profile = {}
	for key, z in (("front", front), ("back", back)):
		near = np.abs(points[:, 2] - z) < 0.2 * span
		under = near & midline & (points[:, 1] > 0.15 * height)
		# The top is taken beside the midline, on the shoulders and hips, so that a head held above
		# the shoulders does not count.
		profile[key] = [0.0, points[under, 1].min(), points[near & ~midline, 1].max()]
	return dict(y=[0.0, belly, height], z=[points[:, 2].min(), front, back, points[:, 2].max()],
		y_front=profile["front"], y_back=profile["back"])


def interp_extrapolate(values, source, target):
	"""Piecewise-linear map through the landmarks, continuing the end segments beyond them."""
	result = np.interp(values, source, target)
	for end, inner, sign in ((0, 1, -1), (-1, -2, 1)):
		ratio = (target[end] - target[inner]) / (source[end] - source[inner])
		beyond = sign * (values - source[end]) > 0
		result[beyond] = target[end] + (values[beyond] - source[end]) * ratio
	return result


def warp_anatomy(base_points, placed, mode="belly"):
	"""Base positions moved piecewise-linearly so that its landmarks land on the animal's."""
	source, target = landmarks(base_points), landmarks(placed)
	warped = base_points.copy()
	warped[:, 0] *= np.abs(placed[:, 0]).max() / np.abs(base_points[:, 0]).max()
	warped[:, 2] = interp_extrapolate(base_points[:, 2], source["z"], target["z"])
	if mode == "profile":
		front = interp_extrapolate(base_points[:, 1], source["y_front"], target["y_front"])
		back = interp_extrapolate(base_points[:, 1], source["y_back"], target["y_back"])
		t = np.clip((base_points[:, 2] - source["z"][1]) / (source["z"][2] - source["z"][1]), 0, 1)
		warped[:, 1] = (1 - t) * front + t * back
	else:
		warped[:, 1] = interp_extrapolate(base_points[:, 1], source["y"], target["y"])
	return warped


def reweight_bird_legs(obj):
	"""Visible leg above the ankle on Leg, below on Shin, blended over the joint; the toes stay on Foot."""
	verts = np.asarray(obj["verts"])
	ground = verts[:, 2].min()
	body = [i for i, row in enumerate(obj["weights"]) if row and max(row, key=lambda t: t[1])[0] == "Body"]
	belly = verts[body, 2].min() - ground
	ankle, band = 0.5 * belly, 0.08 * belly
	for i, row in enumerate(obj["weights"]):
		if not row:
			continue
		top = max(row, key=lambda t: t[1])[0]
		if not top.startswith(("Leg_", "Shin_")):
			continue
		side = top[-1]
		h = verts[i, 2] - ground
		if h >= belly:
			continue
		rest = [(n, w) for n, w in row if not n.startswith(("Leg_", "Shin_"))]
		share = 1 - sum(w for _, w in rest)
		if h > ankle + band:
			legs = [("Leg_" + side, share)]
		elif h > ankle - band:
			t = (h - (ankle - band)) / (2 * band)
			legs = [("Leg_" + side, share * t), ("Shin_" + side, share * (1 - t))]
		else:
			legs = [("Shin_" + side, share)]
		obj["weights"][i] = rest + [item for item in legs if item[1] > 0]


def transfer_weights(placed, base, scale, names, ignore=None, warp=None, anatomy=None):
	"""Weights of the base vertices nearest to each animal vertex, once both fill the same box."""
	base_rows = rows_by_index(base)
	keep = np.array([not ignore or not any(re.search(ignore, names[b]) and w > 0.3 for b, w in row) for row in base_rows])
	kept = np.flatnonzero(keep)
	if anatomy:
		extent = np.ptp(placed, axis=0)
		distance, nearest = cKDTree(warp_anatomy(base["positions"], placed, anatomy)[kept] / extent).query(placed / extent, k=4)
	else:
		base_positions = warp_length(base, names, warp) if warp else base["positions"]
		distance, nearest = cKDTree(base_positions[kept]).query(placed / scale, k=4)
	nearest = kept[nearest]
	rows = []
	for d, n in zip(distance, nearest):
		total = {}
		for dist, index in zip(d, n):
			for bone, w in base_rows[index]:
				total[bone] = total.get(bone, 0) + w / (dist + 1e-4)
		top = sorted(total.items(), key=lambda item: -item[1])[:4]
		norm = sum(w for _, w in top)
		rows.append([(names[b], w / norm) for b, w in top])
	return rows


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--blend", required=True)
	parser.add_argument("--textures", required=True, nargs="+")
	parser.add_argument("--public", default=PUBLIC_ZIP)
	parser.add_argument("--only", default="")
	parser.add_argument("--force", action="store_true")
	args = parser.parse_args()
	only = {n for n in args.only.split(",") if n}

	vanilla = Vanilla(args.public)
	textures = Textures(args.textures)
	objects = dump_blend(args.blend)
	written = []

	def target(*parts):
		return os.path.join(MOD, *parts)

	def save(path, data, mode="wb"):
		if os.path.exists(path) and not args.force:
			return
		os.makedirs(os.path.dirname(path), exist_ok=True)
		with open(path, mode, **({} if "b" in mode else {"encoding": "utf-8"})) as f:
			f.write(data)
		written.append(os.path.relpath(path, MOD))

	for actor, (body_name, part_names, base_name, weights, texture_objects) in ANIMALS.items():
		if only and actor not in only:
			continue
		if os.path.exists(target("art", "actors", "fauna", actor + ".xml")) and not args.force:
			print("skipped", actor, "(actor exists)")
			continue
		base = vanilla.bases[base_name]
		num_bones = len(base["bones"])
		sid = SKELETONS[base_name]
		std, parents = vanilla.skeletons[sid]["std"], vanilla.skeletons[sid]["parents"]
		index = vanilla.bone_index[sid]
		body = dict(objects[body_name])
		parts = [dict(objects[n]) for n in part_names]
		points = to_engine(body["verts"])

		if weights == "transfer":
			rotation, scale, shift = transfer_fit(points, base)
			offset = rotation @ shift
			body["weights"] = transfer_weights(points @ rotation - shift, base, scale, std,
				TRANSFER_IGNORE.get(actor), TRANSFER_WARP.get(actor), ANATOMY_WARP.get(actor))
		else:
			if weights in BONE_MAPS:
				mapping = BONE_MAPS[weights]
				for obj in [body] + parts:
					obj["weights"] = [[(mapping[n], w) for n, w in row if n in mapping] for row in obj["weights"]]
			if actor in BIRD_LEGS:
				reweight_bird_legs(body)
			rows = [[(index[bone_alias(n)], w) for n, w in row if bone_alias(n) in index] for row in body["weights"]]
			fit = fit_to_base(points, rows, base)
			rotation, offset = fit["rotation"], fit["offset"]
			scale = np.full(3, fit["scale"])
		for part in parts:
			if not any(part["weights"]):
				part["weights"] = [[] for _ in part["verts"]]

		fit = dict(rotation=rotation, offset=offset, scale=1.0)
		positions, normals, uvs, indices, weight_values, faces = build_mesh(body, parts, fit, base, index, 1.0, parents)
		fixed = fix_sides(positions, indices, weight_values, std)
		positions, normals, uvs, indices, weight_values, faces = split_midline(
			positions, normals, uvs, indices, weight_values, faces, std)
		# Stand on the ground.
		positions = positions - np.array([0, positions[:, 1].min(), 0])
		clean_weights(positions, indices, weight_values, faces, base, np.array([b[:3] for b in base["bones"]]) * scale)
		rows = [[(int(b), float(w)) for b, w in zip(bi, bw) if b < num_bones and w > 0] for bi, bw in zip(indices, weight_values)]
		new_rest = fit_rest_pose(base, rows_by_index(base), positions, rows, parents, scale)
		old_rest = np.array([b[:3] for b in base["bones"]])
		rotations = np.array([b[3:] for b in base["bones"]])
		bones = [tuple(t) + tuple(r) for t, r in zip(new_rest, rotations)]
		props = []
		for name, translation, rot, bone in base["props"]:
			moved = np.array(translation) * scale + (new_rest[bone] - old_rest[bone] * scale) if bone < num_bones else np.array(translation) * scale
			props.append((name, tuple(moved), rot, bone))

		mesh_path = target("art", "meshes", "skeletal", "fauna", actor + ".pmd")
		if args.force or not os.path.exists(mesh_path):
			os.makedirs(os.path.dirname(mesh_path), exist_ok=True)
			write_pmd(mesh_path, positions, normals, uvs, indices, weight_values, faces, bones, props)
			written.append(os.path.relpath(mesh_path, MOD))

		lines = []
		for animation in vanilla.actor_animations(BASE_ACTORS[base_name]):
			path = os.path.splitext(animation["file"])[0]
			data = vanilla.animation(path)
			if data is None:
				continue
			moved, anim_bones = retarget_psa(data, old_rest, new_rest, rotations, parents, scale)
			if anim_bones != num_bones:
				continue
			new_pose = np.hstack([new_rest, rotations])
			factors = {}
			for pattern, scales in ROTATION_SCALE.get(actor, []):
				if re.search(pattern, os.path.basename(path)):
					factors.update(scales)
			if factors:
				moved = scale_rotations(moved, new_pose, parents, std, factors)
			if actor in GROUNDED and re.search(GROUNDED[actor], os.path.basename(path)):
				moved = lift_to_ground(moved, positions, indices, weight_values, new_pose)
			attributes = dict(animation)
			attributes["file"] = "fauna/%s/%s.psa" % (actor, os.path.basename(path))
			save(target("art", "animation", "fauna", actor, os.path.basename(path) + ".psa"), moved)
			lines.append("    <animation " + " ".join('%s="%s"' % item for item in attributes.items()) + "/>")
		save(target("art", "variants", "fauna", actor + ".xml"),
			'<?xml version="1.0" encoding="utf-8"?>\n<variant name="Base">\n  <animations>\n%s\n  </animations>\n</variant>\n' % "\n".join(lines), "w")

		texture_entries = []
		for number, name in enumerate(texture_objects, 1):
			image = objects[name]["img"]
			source = textures.find(image)
			if not source:
				print("  %s: texture %r not found" % (actor, image))
				continue
			texture = "fauna/%s%s.png" % (actor, "_%d" % number if len(texture_objects) > 1 else "")
			picture = Image.open(source).convert("RGBA")
			buffer = io.BytesIO()
			picture.resize((power_of_two(picture.width), power_of_two(picture.height)), Image.LANCZOS).save(buffer, "PNG")
			save(target("art", "textures", "skins", "skeletal", texture), buffer.getvalue())
			texture_entries.append("skeletal/" + texture)

		texture_variants = "\n".join(
			'    <variant name="%s" frequency="1">\n      <textures>\n        <texture file="%s" name="baseTex"/>\n      </textures>\n    </variant>'
			% (os.path.splitext(os.path.basename(t))[0], t) for t in texture_entries)
		save(target("art", "actors", "fauna", actor + ".xml"), """<?xml version="1.0" encoding="utf-8"?>
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
""" % (actor, actor, texture_variants), "w")
		size = np.ptp(positions, axis=0)
		print("%-15s base=%-13s skeleton=%-17s scale=%s size=%s verts=%4d sidefix=%3d anims=%2d textures=%d" % (
			actor, base_name, sid, np.round(scale, 2), np.round(size, 2), len(positions), fixed, len(lines), len(texture_entries)))

	print("\n%d files written" % len(written))


if __name__ == "__main__":
	main()
