#!/usr/bin/env python3
"""Own rig and animations for the turtles (Spanish pond turtle and the Amazon tracajá).

The catalog turtle sits on the crocodile skeleton, but its weights are broken: all four flippers
hang on the front-left leg bones and half the shell on the neck, so the crocodile animations (or any
other) tear it apart. This tool:

  * re-weights the mesh: the shell (carapace and plastron) is rigid on Spine1, the neck, head and
    lower jaw get their own bones, and each flipper its own three-bone chain, blended along its length;
  * moves the rest pose of those bones to the turtle's own joints (shoulders, hips, neck base);
  * writes turtle animations from that rest pose:
      walk / run  diagonal gait (front-left with back-right), flippers rowing forward and back,
                  the shell rocking a little; the "speed" attribute matches the stride so the
                  flippers do not slide;
      idle        breathing and looking around; hiding: head and legs pulled into the shell and
                  out again;
      death       the legs go limp and the turtle rolls over onto its back.

Reads tools/data/turtle_spanish_pond_catalog.pmd (the mesh as the catalog import made it) and writes
art/meshes/skeletal/fauna/turtle_spanish_pond.pmd, art/animation/fauna/turtle/*.psa and
art/variants/fauna/turtle.xml, shared by every actor in ACTORS (same mesh).

Usage: python3 tools/make_turtle_animations.py
"""
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_fauna_catalog import MOD, read_pmd, write_pmd  # noqa: E402
from make_ratite_animations import FRAME, bake, euler, keys, qconj, qmul, qrot, quat, write_psa  # noqa: E402

MESH = "turtle_spanish_pond"
SOURCE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "turtle_spanish_pond_catalog.pmd")

# Crocodile skeleton (vanilla "Crocodile"), in PMD order.
BONES = ["Main", "Spine1", "Neck", "TopJaw", "BottomJaw", "BottomJaw_helper",
	"FrontLKnee", "FrontLLeg", "FrontLFoot", "FrontRKnee", "FrontRLeg", "FrontRFoot",
	"Spine2", "BackLKnee", "BackLLeg", "BackLFoot", "BackRKnee", "BackRLeg", "BackRFoot",
	"Tail1", "Tail2", "Tail3"]
B = {name: i for i, name in enumerate(BONES)}
PARENT = {"Main": None, "Spine1": "Main", "Neck": "Spine1", "TopJaw": "Neck", "BottomJaw": "Neck",
	"BottomJaw_helper": "Neck", "Spine2": "Spine1", "Tail1": "Spine2", "Tail2": "Tail1", "Tail3": "Tail2"}
LEGS = {"FL": ("FrontL", "Spine1"), "FR": ("FrontR", "Spine1"), "BL": ("BackL", "Spine2"), "BR": ("BackR", "Spine2")}
for prefix, parent in LEGS.values():
	PARENT[prefix + "Knee"] = parent
	PARENT[prefix + "Leg"] = prefix + "Knee"
	PARENT[prefix + "Foot"] = prefix + "Leg"


def load_mesh(path):
	data = open(path, "rb").read()
	mesh = read_pmd(data)
	num_vertices, num_uv = struct.unpack_from("<II", data, 12)
	stride = 24 + 8 * num_uv + 20
	raw = np.frombuffer(data, np.uint8, num_vertices * stride, 20).reshape(num_vertices, stride)
	mesh["normals"] = raw[:, 12:24].copy().view("<f4").reshape(-1, 3).astype(float)
	mesh["uvs"] = raw[:, 24:32].copy().view("<f4").reshape(-1, 2).astype(float)
	offset = 20 + num_vertices * stride
	num_faces, = struct.unpack_from("<I", data, offset)
	mesh["faces"] = np.frombuffer(data, "<u2", num_faces * 3, offset + 4).reshape(-1, 3).astype(int)
	return mesh


def rig_mesh(mesh):
	"""New weights and rest positions. Returns (indices, weights, rest positions)."""
	pos = mesh["positions"]
	old = mesh["indices"][np.arange(len(pos)), mesh["weights"].argmax(1)]
	cx = np.median(pos[:, 0])
	# Any weight on a leg or head bone: works on the catalog weights (every flipper on the front-left
	# chain) and on the weights this tool writes, so running it again gives the same result.
	def touches(names):
		ids = [B[n] for n in names]
		return (np.isin(mesh["indices"], ids) & (mesh["weights"] > 0)).any(1)
	legs = touches([prefix + part for prefix, _ in LEGS.values() for part in ("Knee", "Leg", "Foot")])
	head = touches(["TopJaw", "BottomJaw"]) & ~legs & (old != B["Neck"])
	jaw = old == B["BottomJaw"]
	shell = ~legs & ~head
	shell_front = pos[shell & (np.abs(pos[:, 0] - cx) > 0.2), 2].min()
	neck = shell & (pos[:, 2] < shell_front + 0.05) & (np.abs(pos[:, 0] - cx) < 0.14)
	shell &= ~neck

	centre_y = 0.5 * (pos[shell, 1].min() + pos[shell, 1].max())
	shell_mid_z = 0.5 * (pos[shell, 2].min() + pos[shell, 2].max())
	rest = np.zeros((len(BONES), 3))
	rest[B["Spine1"]] = (cx, centre_y, shell_mid_z)
	rest[B["Spine2"]] = (cx, centre_y, pos[shell, 2].max() - 0.15)
	rest[B["Tail1"]] = (cx, centre_y, pos[shell, 2].max() - 0.05)
	rest[B["Tail2"]] = rest[B["Tail1"]] + (0, 0, 0.05)
	rest[B["Tail3"]] = rest[B["Tail2"]] + (0, 0, 0.05)
	neck_base = pos[neck].mean(0) if neck.any() else np.array([cx, centre_y, shell_front])
	rest[B["Neck"]] = (cx, neck_base[1], pos[neck | head, 2].max() + 0.02)
	head_back = pos[head, 2].max()
	rest[B["TopJaw"]] = (cx, pos[head & ~jaw, 1].mean(), head_back)
	rest[B["BottomJaw"]] = (cx, pos[jaw, 1].mean() if jaw.any() else pos[head, 1].min(), head_back)
	rest[B["BottomJaw_helper"]] = rest[B["BottomJaw"]]

	indices = np.full((len(pos), 4), 255, np.uint8)
	weights = np.zeros((len(pos), 4))

	def put(mask, bone_weights):
		for k, (bone, w) in enumerate(bone_weights):
			indices[mask, k] = B[bone]
			weights[mask, k] = w

	put(shell, [("Spine1", 1.0)])
	put(head & ~jaw, [("TopJaw", 1.0)])
	put(head & jaw, [("BottomJaw", 1.0)])
	# The neck bends from the shell to the head.
	if neck.any():
		z = pos[neck, 2]
		t = np.clip((rest[B["Neck"], 2] - z) / max(rest[B["Neck"], 2] - head_back, 1e-3), 0, 1)
		idx = np.flatnonzero(neck)
		for i, u in zip(idx, t):
			indices[i, :2] = (B["Neck"], B["TopJaw"])
			weights[i, :2] = (1 - 0.5 * u, 0.5 * u)

	# Front flippers ahead of the middle of the shell, hind flippers behind it.
	front = pos[:, 2] < shell_mid_z
	for key, (prefix, parent) in LEGS.items():
		side = 1 if prefix.endswith("L") else -1
		if key.startswith("F"):
			mask = legs & (np.sign(pos[:, 0] - cx) == side) & front
		else:
			mask = legs & (np.sign(pos[:, 0] - cx) == side) & ~front
		v = pos[mask]
		# Shoulder: the flipper points closest to the shell centre line; tip: the farthest.
		radial = np.abs(v[:, 0] - cx)
		shoulder = v[radial <= np.percentile(radial, 12)].mean(0)
		tip = v[radial >= np.percentile(radial, 90)].mean(0)
		axis = tip - shoulder
		length = np.linalg.norm(axis)
		rest[B[prefix + "Knee"]] = shoulder
		rest[B[prefix + "Leg"]] = shoulder + 0.4 * axis
		rest[B[prefix + "Foot"]] = shoulder + 0.75 * axis
		t = np.clip((v - shoulder) @ axis / length ** 2, 0, 1)
		for i, u in zip(np.flatnonzero(mask), t):
			if u < 0.15:
				# The root of the flipper blends into the shell.
				a = u / 0.15
				put_row = [(parent if parent != "Spine2" else "Spine1", 1 - a), (prefix + "Knee", a)]
			elif u < 0.4:
				a = np.clip((u - 0.3) / 0.1, 0, 1)
				put_row = [(prefix + "Knee", 1 - a), (prefix + "Leg", a)]
			elif u < 0.75:
				a = np.clip((u - 0.65) / 0.1, 0, 1)
				put_row = [(prefix + "Leg", 1 - a), (prefix + "Foot", a)]
			else:
				put_row = [(prefix + "Foot", 1.0)]
			indices[i] = 255
			weights[i] = 0
			for k, (bone, w) in enumerate(put_row):
				indices[i, k] = B[bone]
				weights[i, k] = w
	weights /= np.maximum(weights.sum(1, keepdims=True), 1e-9)
	unweighted = weights.sum(1) < 0.5
	put(unweighted, [("Spine1", 1.0)])
	return indices, weights, rest, {"legs": legs, "shell": shell, "head": head | neck}


class Turtle:
	def __init__(self, mesh, indices, weights, rest):
		self.positions = mesh["positions"]
		self.indices = indices.astype(int)
		self.weights = weights
		self.rest = rest
		self.rest_rot = np.tile([0, 0, 0, 1.0], (len(BONES), 1))
		self.legs = {key: (prefix, rest[B[prefix + "Foot"]] - rest[B[prefix + "Knee"]]) for key, (prefix, _) in LEGS.items()}

	def pose(self, body=(0, 0, 0), body_rot=None, local=None, move=None):
		"""Model-space bone transforms: local = {bone: rotation relative to the parent},
		move = {bone: offset in the parent's frame}."""
		local = local or {}
		move = move or {}
		world_rot, world_pos = {}, {}
		for name in BONES:
			parent = PARENT[name]
			if parent is None:
				world_rot[name] = body_rot if body_rot is not None else np.array([0, 0, 0, 1.0])
				world_pos[name] = self.rest[B[name]] + np.asarray(body, float)
				continue
			world_rot[name] = qmul(world_rot[parent], local.get(name, np.array([0, 0, 0, 1.0])))
			offset = self.rest[B[name]] - self.rest[B[parent]] + np.asarray(move.get(name, (0, 0, 0)), float)
			world_pos[name] = world_pos[parent] + qrot(world_rot[parent], offset)
		frame = np.zeros((len(BONES), 7))
		for name in BONES:
			frame[B[name], :3] = world_pos[name]
			frame[B[name], 3:] = world_rot[name]
		return frame

	def skinned(self, frame):
		valid = self.indices < len(BONES)
		bones = np.where(valid, self.indices, 0)
		local = self.positions[:, None, :] - self.rest[bones]
		return (np.where(valid, self.weights, 0)[..., None] * (qrot(frame[bones, 3:], local) + frame[bones, :3])).sum(1)

	def grounded(self, frame, lift_only=False):
		"""Moves the frame so the lowest vertex touches the ground (or only up, with lift_only)."""
		low = self.skinned(frame)[:, 1].min()
		if lift_only:
			low = min(low, 0.0)
		frame[:, 1] -= low
		return frame


def flipper(key, swing, lift, tuck=0.0):
	"""Rotations of one flipper chain. swing: + rows the tip forward; lift: + raises it; tuck: 0..1 pulls it in."""
	prefix = LEGS[key][0]
	side = 1 if prefix.endswith("L") else -1
	front = key.startswith("F")
	# Yaw about the vertical axis turns the flipper forward or back; roll about the body axis lifts it.
	knee = euler(yaw=side * swing - side * (35 if front else -35) * tuck, roll=side * (lift + 20 * tuck))
	leg = euler(roll=side * (0.4 * lift + 25 * tuck), yaw=-side * 0.2 * swing)
	foot = euler(roll=side * (0.2 * lift + 20 * tuck), pitch=0.0)
	return {prefix + "Knee": knee, prefix + "Leg": leg, prefix + "Foot": foot}


def gait(turtle, phase, swing_amp, lift_amp, rock):
	"""Diagonal gait: front-left with back-right, then front-right with back-left."""
	local = {}
	for key, offset in (("FL", 0.0), ("BR", 0.0), ("FR", 0.5), ("BL", 0.5)):
		p = (phase + offset) % 1.0
		if p < 0.6:
			# Stance: the flipper pushes back on the ground.
			u = p / 0.6
			swing = swing_amp * (1 - 2 * u)
			lift = -4.0
		else:
			# Recovery: lifted and brought forward.
			u = (p - 0.6) / 0.4
			swing = swing_amp * (-1 + 2 * (u * u * (3 - 2 * u)))
			lift = lift_amp * np.sin(np.pi * u)
		if key.startswith("B"):
			swing *= 0.8
		local.update(flipper(key, swing, lift))
	sway = np.sin(2 * np.pi * phase)
	bob = np.cos(4 * np.pi * phase)
	local["Neck"] = euler(pitch=2 * bob, yaw=-3 * sway)
	local["TopJaw"] = euler(pitch=-1.5 * bob)
	body_rot = euler(roll=rock * sway, yaw=1.5 * sway, pitch=0.6 * bob)
	frame = turtle.pose(body=(0, 0.015 + 0.006 * bob, 0), body_rot=body_rot, local=local)
	return turtle.grounded(frame)


def standing(turtle, local=None, body_rot=None, move=None, dy=0.0):
	local = dict(local or {})
	for key in LEGS:
		if not any(name.startswith(LEGS[key][0]) for name in local):
			local.update(flipper(key, 0.0, -4.0))
	frame = turtle.pose(body=(0, dy, 0), body_rot=body_rot, local=local, move=move)
	return turtle.grounded(frame)


def anim_idle_look(turtle, t, length):
	b = np.sin(2 * np.pi * t / 2000)
	yaw = keys(t, [(0, 0), (700, 0), (1400, 28), (2400, 28), (3200, -24), (4200, -24), (4900, 0), (length, 0)])
	up = keys(t, [(0, 0), (1400, 0), (1800, 10), (2400, 10), (2700, 0), (length, 0)])
	local = {"Neck": euler(yaw=0.6 * yaw, pitch=up + 1.5 * b), "TopJaw": euler(yaw=0.4 * yaw, pitch=-0.5 * up)}
	return standing(turtle, local=local, body_rot=euler(pitch=0.4 * b))


def anim_idle_hide(turtle, t, length):
	# 0: out, 1: head and legs inside the shell.
	hide = keys(t, [(0, 0), (500, 0), (1100, 1), (length - 1500, 1), (length - 600, 0), (length, 0)])
	peek = keys(t, [(0, 0), (length - 2300, 0), (length - 1900, 0.35), (length - 1500, 0.0), (length, 0)])
	inside = max(0.0, hide - peek)
	head_back = 0.7 * (turtle.rest[B["Neck"], 2] - turtle.rest[B["TopJaw"], 2] + 0.25)
	local = {"Neck": euler(pitch=-6 * inside)}
	move = {"Neck": (0, -0.02 * inside, head_back * inside)}
	for key in LEGS:
		local.update(flipper(key, 0.0, -4.0 * (1 - inside), tuck=inside))
		prefix = LEGS[key][0]
		toward = -0.45 * turtle.legs[key][1]
		move[prefix + "Knee"] = toward * inside
	return standing(turtle, local=local, move=move, dy=-0.02 * inside)


def anim_idle_bask(turtle, t, length):
	"""Basking: neck stretched up, back flippers stretched out behind."""
	out = keys(t, [(0, 0), (700, 1), (length - 700, 1), (length, 0)])
	b = np.sin(2 * np.pi * t / 2400)
	local = {"Neck": euler(pitch=14 * out + 1.5 * b), "TopJaw": euler(pitch=-8 * out)}
	local.update(flipper("BL", -30 * out, 6 * out))
	local.update(flipper("BR", -30 * out, 6 * out))
	local.update(flipper("FL", 8 * out, -4))
	local.update(flipper("FR", 8 * out, -4))
	return standing(turtle, local=local, body_rot=euler(pitch=2 * out))


def anim_death(turtle, t, length):
	"""The legs flail, then the turtle rolls over onto its back."""
	flail = keys(t, [(0, 0), (150, 1), (650, 1), (800, 0), (length, 0)])
	roll = keys(t, [(0, 0), (550, 0), (1250, 1), (length, 1)])
	wave = np.sin(2 * np.pi * t / 160)
	local = {"Neck": euler(pitch=-15 * roll + 10 * flail * wave), "TopJaw": euler(pitch=8 * roll)}
	for key, sign in (("FL", 1), ("FR", -1), ("BL", -1), ("BR", 1)):
		local.update(flipper(key, 25 * flail * wave * sign, 15 * flail + 25 * roll))
	frame = turtle.pose(local=local)
	angle = 180 * roll
	if angle:
		turn = quat([0, 0, 1], angle)
		pivot = np.array([turtle.rest[B["Spine1"], 0], turtle.rest[B["Spine1"], 1], 0])
		frame[:, :3] = qrot(np.broadcast_to(turn, (len(frame), 4)), frame[:, :3] - pivot) + pivot
		frame[:, 3:] = np.array([qmul(turn, q) for q in frame[:, 3:]])
	return turtle.grounded(frame)


def make_tracaja_textures():
	"""Yellow-spotted river turtle (tracajá, Podocnemis unifilis): the dark catalog textures with a
	slate-grey shell and the yellow head spots of the species."""
	from PIL import Image, ImageDraw, ImageEnhance
	directory = os.path.join(MOD, "art", "textures", "skins", "skeletal", "fauna")
	written = []
	for number, source in ((1, 3), (2, 2)):
		image = Image.open(os.path.join(directory, "%s_%d.png" % (MESH, source))).convert("RGB")
		w, h = image.size
		image = ImageEnhance.Color(image).enhance(0.45)
		image = ImageEnhance.Brightness(image).enhance(0.78)
		pixels = np.asarray(image).astype(float)
		# Shell (top right of the UV map): darker and cooler.
		shell = (slice(0, int(0.52 * h)), slice(int(0.4 * w), w))
		pixels[shell] = pixels[shell] * np.array([0.8, 0.84, 0.92])
		image = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8))
		draw = ImageDraw.Draw(image)
		# Head top (top left): the yellow spots.
		spots = [(0.13, 0.05, 0.022), (0.22, 0.03, 0.02), (0.3, 0.07, 0.018), (0.18, 0.11, 0.016), (0.08, 0.1, 0.015), (0.27, 0.13, 0.014)]
		for x, y, r in spots:
			draw.ellipse([(x - r) * w, (y - r * 0.8) * h, (x + r) * w, (y + r * 0.8) * h], fill=(214, 178, 58))
		path = os.path.join(directory, "turtle_tracaja_%d.png" % number)
		image.save(path)
		written.append("skeletal/fauna/turtle_tracaja_%d.png" % number)
	return written


def main():
	mesh_path = os.path.join(MOD, "art", "meshes", "skeletal", "fauna", MESH + ".pmd")
	# Always rebuilt from the catalog mesh (as import_fauna_catalog.py made it), so running the tool
	# again gives the same files.
	mesh = load_mesh(SOURCE)
	indices, weights, rest, parts = rig_mesh(mesh)
	bones = [tuple(r) + (0.0, 0.0, 0.0, 1.0) for r in rest]
	write_pmd(mesh_path, mesh["positions"], mesh["normals"], mesh["uvs"], indices, weights, mesh["faces"], bones, mesh["props"])
	turtle = Turtle(mesh, indices, weights, rest)

	# Stride: how far the turtle moves in one cycle, from how far a front flipper tip rows back.
	swing_walk, swing_run = 26.0, 34.0
	reach = np.linalg.norm(turtle.legs["FL"][1][[0, 2]])
	stride_walk = 2 * reach * np.sin(np.radians(swing_walk)) * 1.6
	stride_run = 2 * reach * np.sin(np.radians(swing_run)) * 1.6
	walk_cycle, run_cycle = 1400.0, 800.0
	animations = [
		("turtle_idle_look", "Idle", 5600.0, True, 100, lambda t: anim_idle_look(turtle, t, 5600.0)),
		("turtle_idle_hide", "Idle", 5200.0, True, 100, lambda t: anim_idle_hide(turtle, t, 5200.0)),
		("turtle_idle_bask", "Idle", 5000.0, True, 100, lambda t: anim_idle_bask(turtle, t, 5000.0)),
		("turtle_walk", "Walk", walk_cycle, True, 100 * walk_cycle / 1000 / stride_walk,
			lambda t: gait(turtle, t / walk_cycle, swing_walk, 14.0, 3.0)),
		("turtle_run", "Run", run_cycle, True, 100 * run_cycle / 1000 / stride_run,
			lambda t: gait(turtle, t / run_cycle, swing_run, 20.0, 4.5)),
		("turtle_death", "Death", 1800.0, False, 100, lambda t: anim_death(turtle, t, 1800.0)),
	]
	lines = []
	for file, name, length, loop, speed, function in animations:
		frames = bake(function, length, loop)
		write_psa(os.path.join(MOD, "art", "animation", "fauna", "turtle", file + ".psa"), frames, file)
		lines.append('    <animation file="fauna/turtle/%s.psa" name="%s" speed="%d"/>' % (file, name, round(speed)))
	with open(os.path.join(MOD, "art", "variants", "fauna", "turtle.xml"), "w", encoding="utf-8") as f:
		f.write('<?xml version="1.0" encoding="utf-8"?>\n<variant name="Base">\n  <animations>\n%s\n  </animations>\n</variant>\n'
			% "\n".join(lines))
	make_tracaja_textures()
	print("shell %d, head %d, flippers %d vertices; walk stride %.2f m, run stride %.2f m" % (
		parts["shell"].sum(), parts["head"].sum(), parts["legs"].sum(), stride_walk, stride_run))


if __name__ == "__main__":
	main()
