#!/usr/bin/env python3
"""Procedural animations for the ratites (ostrich, ostrich hen, rhea).

The meshes made by import_fauna_transfer.py sit on the vanilla chicken skeleton. The chicken
animations scaled up to a 2.5 m bird look wrong: short, fast steps whose feet slide on the ground,
a body that tips forward to feed, flapping wings. This tool writes new animations from the rest pose
of each mesh instead:

  * walk and run: the feet follow a stance/swing path solved with two-bone IK (hip to ankle, ankle
    to toes), the body bobs and rolls over the standing leg, and the neck nods in step. The stride
    length is matched to the movement speed through the "speed" attribute, so the feet do not slide:
    the engine plays move animations at (unit speed in m/s) * speed / 100, so speed = 100 * cycle
    length in seconds / stride in metres;
  * idle: breathing and looking around, grazing with the neck down to the ground, an alert pose with
    a wing shake;
  * attack: a forward kick; death: the legs fold under the body, then the bird rolls onto its side.

Writes art/animation/fauna/<actor>/ratite_*.psa and art/variants/fauna/<actor>.xml.

Usage: python3 tools/make_ratite_animations.py [--only ostrich,rhea]
"""
import argparse
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_fauna_catalog import MOD, read_pmd  # noqa: E402

ACTORS = ["ostrich", "ostrich_female", "rhea",
	# Lusitania catalog: wading and water birds on the same chicken skeleton.
	"stork_white", "flamingo_greater", "egret_little", "heron_gray", "goose_greylag", "mallard_02"]
BONES = ["Body", "Neck_Low", "Neck_High", "Head", "Leg_L", "Shin_L", "Foot_L", "Leg_R", "Shin_R", "Foot_R",
	"Rear", "Tail", "Wing_R", "WingTip_R", "Wing_L", "WingTip_L"]
B = {name: i for i, name in enumerate(BONES)}
PARENT = {"Body": None, "Neck_Low": "Body", "Neck_High": "Neck_Low", "Head": "Neck_High", "Leg_L": "Body",
	"Shin_L": "Leg_L", "Foot_L": "Shin_L", "Leg_R": "Body", "Shin_R": "Leg_R", "Foot_R": "Shin_R", "Rear": "Body",
	"Tail": "Rear", "Wing_R": "Body", "WingTip_R": "Wing_R", "Wing_L": "Body", "WingTip_L": "Wing_L"}

# Movement speeds of the templates (gaia/fauna_gazelle): 9 * 0.7 * 0.6 walking, 1.67 times that running.
WALK_SPEED = 3.78
RUN_SPEED = 6.31
FRAME = 1000 / 30


# Quaternions are stored x, y, z, w like the PMD and PSA files.
def quat(axis, degrees):
	axis = np.asarray(axis, float)
	half = np.radians(degrees) / 2
	return np.concatenate([axis / np.linalg.norm(axis) * np.sin(half), [np.cos(half)]])


def qmul(a, b):
	x1, y1, z1, w1 = a
	x2, y2, z2, w2 = b
	return np.array([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
		w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2])


def qrot(q, v):
	u, w = q[..., :3], q[..., 3:4]
	t = 2 * np.cross(u, v)
	return v + w * t + np.cross(u, t)


def qconj(q):
	return q * np.array([-1, -1, -1, 1])


def euler(pitch=0.0, yaw=0.0, roll=0.0):
	"""Pitch about x (positive lifts the front, the head points along -z), yaw about y, roll about z."""
	return qmul(quat([0, 1, 0], yaw), qmul(quat([1, 0, 0], pitch), quat([0, 0, 1], roll)))


def between(a, b):
	"""Shortest rotation taking the direction a to the direction b."""
	a = a / np.linalg.norm(a)
	b = b / np.linalg.norm(b)
	axis = np.cross(a, b)
	w = 1 + np.dot(a, b)
	if w < 1e-6:
		return quat([1, 0, 0], 180)
	q = np.concatenate([axis, [w]])
	return q / np.linalg.norm(q)


def smooth(t):
	t = np.clip(t, 0, 1)
	return t * t * (3 - 2 * t)


def keys(t, points):
	"""Smoothly interpolated value at t from [(time, value), ...]."""
	for (t0, v0), (t1, v1) in zip(points, points[1:]):
		if t <= t1:
			return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0)) if t1 > t0 else v1
	return points[-1][1]


class Rig:
	def __init__(self, actor):
		with open(os.path.join(MOD, "art", "meshes", "skeletal", "fauna", actor + ".pmd"), "rb") as f:
			self.mesh = read_pmd(f.read())
		self.rest = np.array(self.mesh["bones"])
		pos = self.rest[:, :3]
		self.pos = pos
		self.hip_height = pos[B["Leg_L"], 1]
		# Each leg has its own lengths: the two sides of the mesh are not exactly mirrored.
		self.thigh = {side: np.linalg.norm(pos[B["Shin_" + side]] - pos[B["Leg_" + side]]) for side in "LR"}
		self.shank = {side: np.linalg.norm(pos[B["Foot_" + side]] - pos[B["Shin_" + side]]) for side in "LR"}
		self.foot_height = pos[B["Foot_L"], 1]
		self.size = self.hip_height / 2.61
		indices, weights = self.mesh["indices"].astype(int), self.mesh["weights"]
		dominant = indices[np.arange(len(indices)), weights.argmax(1)]
		# The lower leg and toes of each side, kept above the ground by raising the foot.
		self.foot_mask = {side: np.isin(dominant, [B["Shin_" + side], B["Foot_" + side]]) for side in "LR"}

	def pose(self, body=(0, 0, 0), body_rot=None, local=None, feet=None, toes=None):
		"""pose_once, with each foot raised until its toes no longer go into the ground."""
		feet = {side: np.asarray(target, float) for side, target in (feet or {}).items()}
		frame = self.pose_once(body, body_rot, local, feet, toes)
		for _ in range(3):
			changed = False
			for side in feet:
				below = -self.lowest(frame, self.foot_mask[side])
				if below > 0:
					feet[side] = feet[side] + np.array([0, below, 0])
					changed = True
			if not changed:
				break
			frame = self.pose_once(body, body_rot, local, feet, toes)
		return frame

	def pose_once(self, body=(0, 0, 0), body_rot=None, local=None, feet=None, toes=None):
		"""Model-space bone transforms (16 x 7) of a pose.

		body: offset of the Body bone; body_rot: its rotation; local: {bone: rotation relative to the
		parent}; feet: {"L"/"R": target of the Foot bone}, reached with IK; toes: {"L"/"R": world rotation}."""
		local = local or {}
		world_rot = {}
		world_pos = {}
		for name in BONES:
			parent = PARENT[name]
			if parent is None:
				world_rot[name] = body_rot if body_rot is not None else np.array([0, 0, 0, 1.0])
				world_pos[name] = self.pos[B[name]] + np.asarray(body, float)
				continue
			world_rot[name] = qmul(world_rot[parent], local.get(name, np.array([0, 0, 0, 1.0])))
			world_pos[name] = world_pos[parent] + qrot(world_rot[parent], self.pos[B[name]] - self.pos[B[parent]])
		for side, target in (feet or {}).items():
			self.solve_leg(side, np.asarray(target, float), world_pos, world_rot)
		for side, rot in (toes or {}).items():
			world_rot["Foot_" + side] = rot
		frame = np.zeros((len(BONES), 7))
		for name in BONES:
			frame[B[name], :3] = world_pos[name]
			frame[B[name], 3:] = qmul(world_rot[name], self.rest[B[name], 3:])
		return frame

	def solve_leg(self, side, target, world_pos, world_rot):
		hip = world_pos["Leg_" + side]
		rest_hip, rest_ankle, rest_foot = (self.pos[B[n + "_" + side]] for n in ("Leg", "Shin", "Foot"))
		l1, l2 = self.thigh[side], self.shank[side]
		reach = target - hip
		d = max(np.linalg.norm(reach), abs(l1 - l2) + 1e-3)
		# Soft limit near full extension: a nearly straight leg would snap between bent and straight
		# from tiny moves of the hip; instead the foot is let up a little, smoothly.
		full = l1 + l2
		soft = 0.95 * full
		if d > soft:
			d = soft + (full - soft) * (1 - np.exp(-(d - soft) / (full - soft)))
		direction = reach / np.linalg.norm(reach)
		target = hip + direction * d
		a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
		h = np.sqrt(max(l1 * l1 - a * a, 0))
		# The ankle of a bird points backwards (+z).
		pole = np.array([0, 0, 1.0]) - direction * direction[2]
		pole /= np.linalg.norm(pole)
		ankle = hip + direction * a + pole * h
		thigh_rot = between(rest_ankle - rest_hip, ankle - hip)
		shank_rot = between(qrot(thigh_rot, rest_foot - rest_ankle), target - ankle)
		world_rot["Leg_" + side] = thigh_rot
		world_rot["Shin_" + side] = qmul(shank_rot, thigh_rot)
		world_pos["Shin_" + side] = ankle
		world_pos["Foot_" + side] = target
		world_rot["Foot_" + side] = world_rot["Shin_" + side]

	def skinned(self, frame, mask=slice(None)):
		positions, indices, weights = self.mesh["positions"][mask], self.mesh["indices"][mask].astype(int), self.mesh["weights"][mask]
		valid = indices < len(BONES)
		bones = np.where(valid, indices, 0)
		local = qrot(qconj(self.rest[bones, 3:]), positions[:, None, :] - self.rest[bones, :3])
		return (np.where(valid, weights, 0)[..., None] * (qrot(frame[bones, 3:], local) + frame[bones, :3])).sum(1)

	def lowest(self, frame, mask=slice(None)):
		"""Height of the lowest vertex of the skinned mesh."""
		return self.skinned(frame, mask)[:, 1].min()


def identity():
	return np.array([0, 0, 0, 1.0])


def gait(rig, phase, stride, duty, lift, crouch, bob, lean, neck, wings, run=False):
	"""One frame of a walk or run cycle at phase 0..1 (left foot touches down at 0)."""
	s = rig.size
	excursion = stride * duty
	feet, toes = {}, {}
	heights = []
	for side, offset in (("L", 0.0), ("R", 0.5)):
		p = (phase + offset) % 1.0
		rest = rig.pos[B["Foot_" + side]]
		centre = rest[2] + 0.05 * s
		if p < duty:
			# Stance: the foot stays on the ground and moves back under the body.
			u = p / duty
			z = centre - excursion / 2 + excursion * u
			y = rig.foot_height
			# The heel lifts at the end of the stance, the toes stay down.
			heel = smooth((u - 0.75) / 0.25) * 0.12 * s
			y += heel
			toes[side] = euler(pitch=-35 * heel / (0.12 * s)) if heel > 0 else identity()
		else:
			# Swing: the foot is lifted, folded and brought forward.
			u = (p - duty) / (1 - duty)
			z = centre + excursion / 2 - excursion * smooth(u)
			y = rig.foot_height + lift * s * np.sin(np.pi * min(u * 1.15, 1.0)) ** 1.2
			toes[side] = euler(pitch=-40 * np.sin(np.pi * u))
		feet[side] = (rest[0], y, z)
		heights.append(p < duty)
	# Body: lowest just after each touch-down, highest at mid-stance (walk); a running bird is highest
	# in the flight phase.
	double = np.cos(4 * np.pi * phase)
	dy = -crouch * s + (bob * s * (-double if not run else double))
	roll = 3.0 * np.sin(2 * np.pi * phase) * (0.6 if run else 1.0)
	body_rot = euler(pitch=lean + 1.5 * double, roll=roll, yaw=2.0 * np.sin(2 * np.pi * phase))
	nod = np.sin(4 * np.pi * phase - 0.6)
	local = {
		"Neck_Low": euler(pitch=neck[0] + 4 * nod, roll=-roll * 0.5),
		"Neck_High": euler(pitch=neck[1] - 3 * nod),
		"Head": euler(pitch=neck[2] - 2 * nod - lean),
		"Rear": euler(pitch=2 * double),
		"Tail": euler(pitch=-4 * double),
		"Wing_L": euler(roll=wings[0] + wings[1] * np.sin(4 * np.pi * phase)),
		"Wing_R": euler(roll=-(wings[0] + wings[1] * np.sin(4 * np.pi * phase))),
		"WingTip_L": euler(roll=wings[0] * 0.4),
		"WingTip_R": euler(roll=-wings[0] * 0.4),
	}
	return rig.pose(body=(0, dy, 0), body_rot=body_rot, local=local, feet=feet, toes=toes)


def standing(rig, dy=0.0, body_rot=None, local=None, feet=None, toes=None):
	# Standing birds keep their legs slightly bent, out of the straight-leg limit of the IK.
	dy -= 0.06 * rig.size
	feet = feet or {}
	targets = {side: feet.get(side, rig.pos[B["Foot_" + side]]) for side in "LR"}
	# Toes flat on the ground unless told otherwise; left to the IK they would take the twist of the shank.
	toes = dict({side: identity() for side in "LR"}, **(toes or {}))
	return rig.pose(body=(0, dy, 0), body_rot=body_rot, local=local, feet=targets, toes=toes)


def breathe(t, period=1.6):
	return np.sin(2 * np.pi * t / period)


def anim_walk(rig, t, length):
	stride = 1.15 * rig.hip_height
	return gait(rig, t / length, stride, duty=0.62, lift=0.35, crouch=0.16, bob=0.04, lean=-2,
		neck=(0, 0, 0), wings=(2, 0.5))


def anim_run(rig, t, length, wings):
	stride = 1.33 * rig.hip_height
	return gait(rig, t / length, stride, duty=0.40, lift=0.75, crouch=0.24, bob=0.07, lean=-8,
		neck=(-22, -18, 30), wings=wings, run=True)


def anim_idle_look(rig, t, length):
	b = breathe(t)
	yaw = keys(t, [(0, 0), (500, 0), (900, 40), (1700, 40), (2200, -35), (3000, -35), (3500, 0), (length, 0)])
	tilt = keys(t, [(0, 0), (900, 0), (1200, -12), (1700, -12), (2000, 0), (length, 0)])
	local = {
		"Neck_Low": euler(pitch=1.0 * b),
		"Neck_High": euler(yaw=yaw * 0.35),
		"Head": euler(yaw=yaw * 0.65, roll=tilt),
		"Tail": euler(pitch=1.5 * b),
		"Wing_L": euler(roll=0.8 * b), "Wing_R": euler(roll=-0.8 * b),
	}
	return standing(rig, dy=0.01 * rig.size * b, body_rot=euler(pitch=0.6 * b), local=local)


def anim_idle_graze(rig, t, length):
	b = breathe(t)
	# 0: up, 1: head at the ground.
	down = keys(t, [(0, 0), (300, 0), (1100, 1), (length - 900, 1), (length - 150, 0), (length, 0)])
	peck = 0.0
	for start in (1350, 1900, 2650):
		peck = max(peck, np.sin(np.pi * np.clip((t - start) / 350, 0, 1)) if start < t < start + 350 else 0)
	sweep = keys(t, [(0, 0), (1100, 0), (2300, 18), (length - 900, 18), (length, 0)])
	body_rot = euler(pitch=-14 * down + 0.5 * b)
	local = {
		"Neck_Low": euler(pitch=-62 * down, yaw=sweep * 0.4),
		"Neck_High": euler(pitch=-58 * down + 8 * peck, yaw=sweep * 0.3),
		"Head": euler(pitch=40 * down - 25 * peck),
		"Rear": euler(pitch=6 * down),
		"Tail": euler(pitch=8 * down),
	}
	return standing(rig, dy=-0.05 * rig.size * down, body_rot=body_rot, local=local)


def anim_idle_alert(rig, t, length):
	b = breathe(t, 1.2)
	up = keys(t, [(0, 0), (400, 1), (length - 500, 1), (length, 0)])
	yaw = keys(t, [(0, 0), (600, 0), (900, -30), (1500, -30), (1800, 25), (2300, 25), (2600, 0), (length, 0)])
	shake = keys(t, [(0, 0), (2700, 0), (2850, 1), (3300, 1), (3450, 0), (length, 0)])
	flutter = shake * np.sin(2 * np.pi * t / 180)
	ruffle = 25 * shake + 10 * flutter
	local = {
		"Neck_Low": euler(pitch=10 * up + 1.0 * b),
		"Neck_High": euler(pitch=6 * up, yaw=yaw * 0.4),
		"Head": euler(pitch=-14 * up, yaw=yaw * 0.6),
		"Rear": euler(pitch=4 * shake + 3 * flutter),
		"Tail": euler(pitch=10 * shake + 6 * flutter, yaw=6 * flutter),
		"Wing_L": euler(roll=ruffle), "Wing_R": euler(roll=-ruffle),
		"WingTip_L": euler(roll=ruffle * 0.5), "WingTip_R": euler(roll=-ruffle * 0.5),
	}
	return standing(rig, dy=0.02 * rig.size * up, body_rot=euler(pitch=3 * up), local=local)


def anim_attack(rig, t, length):
	s = rig.size
	rest = rig.pos[B["Foot_R"]]
	# Wind up: the right leg rises forward with the toes curled; kick: it strikes forward and down.
	lift = keys(t, [(0, 0), (350, 1), (500, 1), (620, 0.25), (length - 250, 0), (length, 0)])
	reach = keys(t, [(0, 0), (350, 0.35), (500, 0.3), (620, 1.0), (length - 250, 0), (length, 0)])
	lean = keys(t, [(0, 0), (350, 8), (500, 10), (620, -4), (length, 0)])
	target = (rest[0], rig.foot_height + 1.1 * s * lift, rest[2] - 1.2 * s * reach)
	toes = {"R": euler(pitch=-60 * lift + 20 * max(reach - lift, 0))}
	local = {
		"Neck_Low": euler(pitch=-lean * 1.2), "Neck_High": euler(pitch=lean * 0.5), "Head": euler(pitch=-lean * 0.3),
		"Wing_L": euler(roll=30 * lift), "Wing_R": euler(roll=-30 * lift),
		"Tail": euler(pitch=lean),
	}
	return standing(rig, dy=-0.1 * s * lift, body_rot=euler(pitch=lean, roll=-4 * lift), local=local,
		feet={"R": target}, toes=toes)


def anim_death(rig, t, length):
	s = rig.size
	# 0..700: the legs fold and the bird sits on its ankles; 700..1300: it falls onto its side.
	sit = keys(t, [(0, 0), (150, 0.15), (700, 1), (length, 1)])
	fall = keys(t, [(0, 0), (650, 0), (1300, 1), (length, 1)])
	sink = rig.hip_height - (rig.hip_height - rig.foot_height) * 0.32
	dy = -sink * sit
	local = {
		"Neck_Low": euler(pitch=-15 * sit + 10 * fall, yaw=-10 * fall),
		"Neck_High": euler(pitch=-20 * sit + 5 * fall, yaw=-14 * fall),
		"Head": euler(pitch=20 * sit, yaw=-10 * fall, roll=40 * fall),
		"Wing_L": euler(roll=-10 * fall), "Wing_R": euler(roll=-25 * fall),
		"Tail": euler(pitch=-10 * fall),
	}
	feet = {side: rig.pos[B["Foot_" + side]] + np.array([0, 0, 0.25 * s * sit]) for side in "LR"}
	frame = standing(rig, dy=dy, body_rot=euler(pitch=-6 * sit), local=local, feet=feet)
	# The fall: the whole bird turns about its body axis, onto its left side (+x).
	angle = 80 * fall
	if angle:
		turn = quat([0, 0, 1], -angle)
		pivot = np.array([1.1 * rig.pos[B["Leg_L"], 0], 0, 0])
		frame[:, :3] = qrot(np.broadcast_to(turn, (len(frame), 4)), frame[:, :3] - pivot) + pivot
		frame[:, 3:] = np.array([qmul(turn, q) for q in frame[:, 3:]])
	frame[:, 1] -= rig.lowest(frame) if fall > 0 else min(rig.lowest(frame), 0)
	return frame


def write_psa(path, frames, name):
	frames = np.asarray(frames, "<f4")
	encoded = name.encode()
	body = struct.pack("<I", len(encoded)) + encoded + struct.pack("<fII", FRAME, frames.shape[1], frames.shape[0])
	body += frames.tobytes()
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, "wb") as f:
		f.write(b"PSSA" + struct.pack("<II", 1, len(body)) + body)


def bake(function, length, loop):
	count = int(round(length / FRAME))
	times = [i * length / count for i in range(count + 1)]
	frames = [function(t) for t in times]
	if loop:
		frames[-1] = frames[0]
	return frames


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--only", default="")
	args = parser.parse_args()
	only = {n for n in args.only.split(",") if n}
	for actor in ACTORS:
		if only and actor not in only:
			continue
		rig = Rig(actor)
		walk_cycle, run_cycle = 1000.0, 600.0
		walk_stride, run_stride = 1.15 * rig.hip_height, 1.33 * rig.hip_height
		# (file, animation name, length in ms, loop, speed attribute, function)
		animations = [
			("ratite_idle_look", "Idle", 4200.0, True, 100, lambda t: anim_idle_look(rig, t, 4200.0)),
			("ratite_idle_graze", "Idle", 4000.0, True, 100, lambda t: anim_idle_graze(rig, t, 4000.0)),
			("ratite_idle_alert", "Idle", 3800.0, True, 100, lambda t: anim_idle_alert(rig, t, 3800.0)),
			("ratite_walk", "Walk", walk_cycle, True, 100 * walk_cycle / 1000 / walk_stride,
				lambda t: anim_walk(rig, t, walk_cycle)),
			("ratite_run_01", "Run", run_cycle, True, 100 * run_cycle / 1000 / run_stride,
				lambda t: anim_run(rig, t, run_cycle, (20, 4))),
			("ratite_run_02", "Run", run_cycle, True, 100 * run_cycle / 1000 / run_stride,
				lambda t: anim_run(rig, t, run_cycle, (42, 8))),
			("ratite_attack", "attack_melee", 1000.0, False, 100, lambda t: anim_attack(rig, t, 1000.0)),
			("ratite_death", "Death", 1600.0, False, 100, lambda t: anim_death(rig, t, 1600.0)),
		]
		lines = []
		for file, name, length, loop, speed, function in animations:
			frames = bake(function, length, loop)
			write_psa(os.path.join(MOD, "art", "animation", "fauna", actor, file + ".psa"), frames, file)
			lines.append('    <animation file="fauna/%s/%s.psa" name="%s" speed="%d"/>' % (actor, file, name, round(speed)))
		with open(os.path.join(MOD, "art", "variants", "fauna", actor + ".xml"), "w", encoding="utf-8") as f:
			f.write('<?xml version="1.0" encoding="utf-8"?>\n<variant name="Base">\n  <animations>\n%s\n  </animations>\n</variant>\n'
				% "\n".join(lines))
		print("%-15s hip=%.2f walk stride=%.2f run stride=%.2f" % (actor, rig.hip_height, walk_stride, run_stride))


if __name__ == "__main__":
	main()
