#!/usr/bin/env python3
"""Give a snake mesh its own spine rig and procedural snake animations.

A snake has no limbs, so no vanilla skeleton fits it: on the crocodile rig a boa walks on legs it
does not have. This tool keeps the mesh (positions, normals, UVs, faces) of an existing PMD and
replaces its skeleton with a chain of vertebrae along the body's centre line, then writes:

  walk / run   lateral undulation: a serpenoid wave runs from head to tail and the body slides
               along it, one wavelength per cycle, so the speed attribute matches the ground speed
  idle         the resting curve with the head swaying, and the head raised to look around
  attack       the fore body coils into an S and straightens into a strike
  death        the body writhes and rolls onto its back

Usage:
  python3 tools/make_snake_rig.py [--actor boa_constrictor] [--bones 20]
"""
import argparse
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_fauna_catalog import MOD, read_pmd, write_pmd  # noqa: E402
from import_fauna_transfer import lift_to_ground  # noqa: E402

FRAME_MS = 1000 / 30


def read_mesh(path):
	data = open(path, "rb").read()
	mesh = read_pmd(data)
	count, uv_sets = struct.unpack_from("<II", data, 12)
	stride = 24 + 8 * uv_sets + 20
	raw = np.frombuffer(data, dtype=np.uint8, count=count * stride, offset=20).reshape(count, stride)
	mesh["normals"] = raw[:, 12:24].copy().view("<f4").reshape(-1, 3).astype(float)
	mesh["uvs"] = raw[:, 24:32].copy().view("<f4").reshape(-1, 2).astype(float)
	offset = 20 + count * stride
	num_faces, = struct.unpack_from("<I", data, offset)
	mesh["faces"] = np.frombuffer(data, dtype="<u2", count=num_faces * 3, offset=offset + 4).reshape(-1, 3)
	return mesh


def centre_line(positions, samples=200):
	"""Points along the middle of the body from the head (-z) to the tail, evenly spaced along it."""
	z = positions[:, 2]
	edges = np.linspace(z.min(), z.max(), 41)
	points = []
	for low, high in zip(edges[:-1], edges[1:]):
		inside = (z >= low) & (z <= high)
		if inside.any():
			points.append(positions[inside].mean(0))
	points = np.array(points)
	# The ends of the body, not the middle of the end slices.
	points[0, 2], points[-1, 2] = z.min(), z.max()
	kernel = np.array([0.25, 0.5, 0.25])
	for axis in (0, 1):
		points[1:-1, axis] = np.convolve(points[:, axis], kernel, mode="valid")
	length = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))])
	s = np.linspace(0, length[-1], samples)
	return s, np.stack([np.interp(s, length, points[:, axis]) for axis in range(3)], 1)


def matrix_to_quat(m):
	"""Quaternions (x, y, z, w) of rotation matrices (..., 3, 3)."""
	w = np.sqrt(np.maximum(0, 1 + m[..., 0, 0] + m[..., 1, 1] + m[..., 2, 2])) / 2
	x = np.sqrt(np.maximum(0, 1 + m[..., 0, 0] - m[..., 1, 1] - m[..., 2, 2])) / 2
	y = np.sqrt(np.maximum(0, 1 - m[..., 0, 0] + m[..., 1, 1] - m[..., 2, 2])) / 2
	z = np.sqrt(np.maximum(0, 1 - m[..., 0, 0] - m[..., 1, 1] + m[..., 2, 2])) / 2
	x = np.copysign(x, m[..., 2, 1] - m[..., 1, 2])
	y = np.copysign(y, m[..., 0, 2] - m[..., 2, 0])
	z = np.copysign(z, m[..., 1, 0] - m[..., 0, 1])
	return np.stack([x, y, z, w], -1)


def rotation(yaw, pitch, roll):
	"""Ry(yaw) Rx(-pitch) Rz(roll) for arrays of angles: the frame of a body segment heading along +z,
	its front raised by pitch and rolled about itself by roll. Shape (n, 3, 3)."""
	def axis(angle, i, j):
		m = np.tile(np.eye(3), (len(angle), 1, 1))
		c, s = np.cos(angle), np.sin(angle)
		m[:, i, i], m[:, i, j], m[:, j, i], m[:, j, j] = c, -s, s, c
		return m
	# Ry: x' = x cos + z sin; Rx: y' = y cos - z sin; Rz: x' = x cos - y sin.
	return axis(yaw, 2, 0) @ axis(-pitch, 1, 2) @ axis(roll, 0, 1)


class Snake:
	def __init__(self, positions, num_bones):
		self.s, self.line = centre_line(positions)
		self.length = self.s[-1]
		tangent = np.gradient(self.line, self.s, axis=0)
		self.rest_yaw = np.unwrap(np.arctan2(tangent[:, 0], tangent[:, 2]))
		self.bone_s = np.linspace(0, self.length, num_bones)
		self.rest = np.stack([np.interp(self.bone_s, self.s, self.line[:, a]) for a in range(3)], 1)
		self.rest_rot = rotation(np.interp(self.bone_s, self.s, self.rest_yaw), np.zeros(num_bones), np.zeros(num_bones))

	def weights(self, positions):
		"""Each vertex on the two vertebrae around the point of the centre line nearest to it."""
		nearest = np.argmin(np.linalg.norm(positions[:, None, :] - self.line[None, ::2, :], axis=2), axis=1)
		s = self.s[::2][nearest]
		step = self.bone_s[1]
		low = np.clip((s // step).astype(int), 0, len(self.bone_s) - 2)
		t = np.clip((s - self.bone_s[low]) / step, 0, 1)
		indices = np.full((len(positions), 4), 255, dtype=int)
		weights = np.zeros((len(positions), 4))
		indices[:, 0], indices[:, 1] = low, low + 1
		weights[:, 0], weights[:, 1] = 1 - t, t
		return indices, weights

	def pose(self, yaw, pitch, roll):
		"""Bone keys for yaw, pitch and roll given at the centre line samples (head first).

		The curve is built from the tail forward, so a raised head lifts only the fore body, and is
		then turned and moved so the body keeps its place and heading."""
		cos_p = np.cos(pitch)
		tangent = np.stack([np.sin(yaw) * cos_p, np.sin(pitch), np.cos(yaw) * cos_p], 1)
		ds = np.diff(self.s)
		steps = 0.5 * (tangent[1:] + tangent[:-1]) * ds[:, None]
		curve = np.zeros_like(self.line)
		curve[-1] = self.line[-1]
		curve[:-1] = self.line[-1] - np.cumsum(steps[::-1], axis=0)[::-1]
		# Same heading as the resting body: head-to-tail chord on the ground plane.
		chord, rest_chord = curve[-1] - curve[0], self.line[-1] - self.line[0]
		turn = np.arctan2(rest_chord[0], rest_chord[2]) - np.arctan2(chord[0], chord[2])
		c, s = np.cos(turn), np.sin(turn)
		flat = curve - curve[-1]
		curve[:, 0], curve[:, 2] = (c * flat[:, 0] + s * flat[:, 2]), (-s * flat[:, 0] + c * flat[:, 2])
		curve[:, [0, 2]] += self.line[-1, [0, 2]]
		curve[:, [0, 2]] += self.line[:, [0, 2]].mean(0) - curve[:, [0, 2]].mean(0)
		at = lambda values: np.interp(self.bone_s, self.s, values)
		positions = np.stack([at(curve[:, a]) for a in range(3)], 1)
		frames = rotation(at(yaw) + turn, at(pitch), at(roll))
		bone_rot = np.einsum("nij,nkj->nik", frames, self.rest_rot)
		return np.hstack([positions, matrix_to_quat(bone_rot)])


def smooth(x):
	x = np.clip(x, 0, 1)
	return x * x * (3 - 2 * x)


def animations(snake, wavelength):
	"""name -> list of (yaw, pitch, roll) per frame, each an array over the centre line samples."""
	u = snake.s / snake.length
	head = np.exp(-(u / 0.12) ** 2)                        # 1 at the head, gone by a fifth of the body
	fore = smooth((0.4 - u) / 0.25)                        # front 40 %, fading out
	taper = 0.45 + 0.55 * smooth(u / 0.2)                  # small sway at the head, full behind
	rest = snake.rest_yaw
	result = {}

	def wave(amplitude, frames, cycles=1.0):
		out = []
		for f in range(frames):
			t = f / frames
			phase = 2 * np.pi * (snake.s / wavelength - cycles * t)
			# The resting S fades into the travelling wave, which carries the whole body.
			yaw = amplitude * taper * np.sin(phase) + np.mean(rest)
			out.append((yaw, -0.08 * head, np.zeros_like(u)))
		return out

	result["snake_walk"] = wave(0.50, 60)
	result["snake_run"] = wave(0.62, 40)

	frames = []
	for f in range(90):
		t = f / 90
		yaw = rest + 0.18 * head * np.sin(2 * np.pi * t)
		pitch = -(0.08 + 0.05 * np.sin(4 * np.pi * t)) * head
		frames.append((yaw, pitch, np.zeros_like(u)))
	result["snake_idle_01"] = frames

	frames = []
	for f in range(120):
		t = f / 120
		lift = smooth(t / 0.25) * smooth((1 - t) / 0.25)
		yaw = rest + lift * 0.45 * np.sin(2 * np.pi * t * 1.5) * head
		pitch = -lift * 0.55 * smooth((0.22 - u) / 0.12)
		frames.append((yaw, pitch, np.zeros_like(u)))
	result["snake_idle_02"] = frames

	frames = []
	for f in range(45):
		t = f / 45
		# Wind up (coil and raise), strike (straighten, which throws the head forward), recover.
		coil = smooth(t / 0.45) if t < 0.45 else (1 - smooth((t - 0.45) / 0.12)) if t < 0.6 else 0.0
		strike = smooth((t - 0.45) / 0.1) * (1 - smooth((t - 0.62) / 0.38))
		yaw = rest * (1 - 0.8 * fore * max(coil, strike)) + coil * 1.4 * fore * np.sin(2 * np.pi * u / 0.22)
		pitch = -(0.5 * coil + 0.15 * strike) * smooth((0.3 - u) / 0.2)
		frames.append((yaw, pitch, np.zeros_like(u)))
	result["snake_attack"] = frames

	frames = []
	for f in range(60):
		t = f / 60
		writhe = 0.7 * (1 - smooth(t / 0.8)) * np.sin(2 * np.pi * (2 * snake.s / wavelength - 3 * t))
		# The roll starts at the tail and reaches the head last.
		roll = 2.9 * smooth((t - 0.15 - 0.35 * (1 - u)) / 0.5)
		frames.append((rest + writhe, np.zeros_like(u), roll))
	result["snake_death"] = frames
	return result


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--actor", default="boa_constrictor")
	parser.add_argument("--bones", type=int, default=20)
	args = parser.parse_args()
	actor = args.actor

	mesh_path = os.path.join(MOD, "art", "meshes", "skeletal", "fauna", actor + ".pmd")
	mesh = read_mesh(mesh_path)
	positions = mesh["positions"] - np.array([0, mesh["positions"][:, 1].min(), 0])
	snake = Snake(positions, args.bones)
	indices, weights = snake.weights(positions)
	bones = [tuple(t) + (0.0, 0.0, 0.0, 1.0) for t in snake.rest]
	write_pmd(mesh_path, positions, mesh["normals"], mesh["uvs"], indices, weights, mesh["faces"], bones, [])
	# Bind rotations are the identity; the animation keys carry rotations relative to the curved rest.
	bind = np.hstack([snake.rest, np.tile([0, 0, 0, 1.0], (len(bones), 1))])

	# One wavelength of the resting curve: the body slides that far each cycle.
	# Smoothed over an eighth of the body so the small turns of the head do not count.
	window = max(3, len(snake.s) // 8)
	broad = np.convolve(snake.rest_yaw - snake.rest_yaw.mean(), np.ones(window) / window, mode="same")
	crossings = np.flatnonzero(np.diff(np.sign(broad)))
	wavelength = 2 * np.mean(np.diff(snake.s[crossings])) if len(crossings) > 2 else snake.length / 1.5
	names = {"snake_idle_01": ("Idle", None), "snake_idle_02": ("Idle", None), "snake_walk": ("Walk", "move"),
		"snake_run": ("Run", "move"), "snake_attack": ("attack_melee", None), "snake_death": ("Death", None)}
	lines = []
	for name, frames in animations(snake, wavelength).items():
		keys = np.array([snake.pose(yaw, pitch, roll) for yaw, pitch, roll in frames])
		data = struct.pack("<I", 0) + struct.pack("<fII", FRAME_MS, keys.shape[1], keys.shape[0]) + keys.astype("<f4").tobytes()
		data = b"PSSA" + struct.pack("<II", 1, len(data)) + data
		data = lift_to_ground(data, positions, indices, weights, bind)
		path = os.path.join(MOD, "art", "animation", "fauna", actor, name + ".psa")
		os.makedirs(os.path.dirname(path), exist_ok=True)
		with open(path, "wb") as f:
			f.write(data)
		label, kind = names[name]
		duration = len(frames) * FRAME_MS / 1000
		speed = 100 * duration / wavelength if kind == "move" else 100
		extra = ' event="0.55"' if label == "attack_melee" else ""
		lines.append('    <animation file="fauna/%s/%s.psa" name="%s" speed="%d"%s/>' % (actor, name, label, round(speed), extra))
	variant = os.path.join(MOD, "art", "variants", "fauna", actor + ".xml")
	with open(variant, "w", encoding="utf-8") as f:
		f.write('<?xml version="1.0" encoding="utf-8"?>\n<variant name="Base">\n  <animations>\n%s\n  </animations>\n</variant>\n' % "\n".join(lines))
	print("%s: %d bones, length %.2f, wavelength %.2f, %d animations" % (actor, len(bones), snake.length, wavelength, len(lines)))
	print("\n".join(lines))


if __name__ == "__main__":
	main()
