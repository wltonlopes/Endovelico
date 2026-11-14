"""Shared pieces for the procedural tree meshes (make_araucaria.py, make_podocarpus.py).

  Mesh          vertices, triangles and which vertices are foliage
  Mesh.card     a textured card (double sided), optionally cut to a polygon of the sprite
  Mesh.tube     a tapered tube along a smooth path, bark wrapped around and repeated along it
  Mesh.foliage_normals
                normals of the foliage pointing out of the crown (an ellipsoid), so the crown is
                shaded as one volume instead of as flat cards with dark backs
  write_dae     Collada file, Z up, metres
"""
import math

import numpy as np


def region(x0, y0, x1, y1, atlas):
	"""Atlas pixels -> (u0, v0, u1, v1), v up (Collada)."""
	return (x0 / atlas, 1 - y1 / atlas, x1 / atlas, 1 - y0 / atlas)


def normalize(v):
	v = np.asarray(v, float)
	n = np.linalg.norm(v)
	return v / n if n > 1e-9 else v


def catmull_rom(points, samples=8):
	"""Smooth curve through the control points."""
	p = [np.asarray(x, float) for x in points]
	if len(p) < 3:
		return np.array([p[0] + (p[-1] - p[0]) * t for t in np.linspace(0, 1, samples + 1)])
	p = [2 * p[0] - p[1]] + p + [2 * p[-1] - p[-2]]
	out = []
	for i in range(1, len(p) - 2):
		p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
		for t in np.linspace(0, 1, samples, endpoint=False):
			t2, t3 = t * t, t * t * t
			out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
	out.append(p[-2])
	return np.array(out)


class Mesh:
	def __init__(self):
		self.positions, self.normals, self.uvs, self.triangles, self.foliage = [], [], [], [], []

	def vertex(self, p, n, uv, foliage=False):
		self.positions.append(tuple(float(x) for x in p))
		self.normals.append(tuple(float(x) for x in n))
		self.uvs.append(tuple(float(x) for x in uv))
		self.foliage.append(foliage)
		return len(self.positions) - 1

	def card(self, origin, along, up, uv_rect, shape=None):
		"""Sprite card: its bottom-left at origin, the bottom edge along `along`, the left edge along `up`
		(both vectors carry the size). shape: polygon (s right, t up) of the sprite to keep, fanned from
		its first point."""
		u0, v0, u1, v1 = uv_rect
		origin, along, up = (np.asarray(x, float) for x in (origin, along, up))
		shape = shape or [(0, 0), (1, 0), (1, 1), (0, 1)]
		normal = normalize(np.cross(along, up))
		points = [origin + s * along + t * up for s, t in shape]
		uvs = [(u0 + s * (u1 - u0), v0 + t * (v1 - v0)) for s, t in shape]
		for sign in (1, -1):
			ids = [self.vertex(p, normal * sign, uv, True) for p, uv in zip(points, uvs)]
			for k in range(1, len(ids) - 1):
				tri = (ids[0], ids[k], ids[k + 1])
				self.triangles.append(tri if sign > 0 else (tri[0], tri[2], tri[1]))

	def tube(self, control, radii, bark, sides=8, strip_length=3.0, close=True):
		"""Tapered tube through the control points; radii: one per control point.

		The bark strip is mirrored around the tube (sides must be even) and along it (one strip every
		strip_length metres), so the texture is continuous without stretching."""
		curve = catmull_rom(control)
		seg = np.linalg.norm(np.diff(curve, axis=0), axis=1)
		dist = np.concatenate([[0], np.cumsum(seg)])
		total = dist[-1]
		# Rings at every half strip, so the mirrored v coordinate peaks only on rings.
		count = max(2, int(math.ceil(total / (strip_length / 2))))
		ss = np.linspace(0, total, count + 1)
		path = np.array([np.interp(ss, dist, curve[:, k]) for k in range(3)]).T
		control_dist = np.linspace(0, total, len(radii))
		rr = np.interp(ss, control_dist, radii)
		u0, v0, u1, v1 = bark
		# Frames by parallel transport.
		tangent = normalize(path[1] - path[0])
		ref = np.array([0, 0, 1.0]) if abs(tangent[2]) < 0.9 else np.array([1.0, 0, 0])
		normal = normalize(np.cross(tangent, ref))
		rings = []
		for i, (p, r, s) in enumerate(zip(path, rr, ss)):
			if 0 < i < len(path) - 1:
				new_tangent = normalize(path[i + 1] - path[i - 1])
			else:
				new_tangent = normalize(path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)])
			normal = normalize(normal - np.dot(normal, new_tangent) * new_tangent)
			binormal = np.cross(new_tangent, normal)
			x = (s / strip_length) % 2
			v = v0 + (v1 - v0) * (x if x <= 1 else 2 - x)
			ring = []
			for j in range(sides):
				a = 2 * math.pi * j / sides
				radial = math.cos(a) * normal + math.sin(a) * binormal
				ring.append(self.vertex(p + r * radial, radial, (u0 if j % 2 == 0 else u1, v)))
			# Repeat the first vertex to close the seam with the right u.
			ring.append(self.vertex(p + r * normal, normal, (u0, v)))
			rings.append(ring)
		for a, b in zip(rings, rings[1:]):
			for j in range(sides):
				self.triangles += [(a[j], a[j + 1], b[j + 1]), (a[j], b[j + 1], b[j])]
		if close:
			tip = self.vertex(path[-1] + normalize(path[-1] - path[-2]) * rr[-1], normalize(path[-1] - path[-2]), (u0, v0))
			last = rings[-1]
			for j in range(sides):
				self.triangles.append((last[j], last[j + 1], tip))
		return path

	def foliage_normals(self, centre, radii, up_bias=0.35):
		centre, radii = np.asarray(centre, float), np.asarray(radii, float)
		for i, is_leaf in enumerate(self.foliage):
			if not is_leaf:
				continue
			d = (np.asarray(self.positions[i]) - centre) / radii
			n = normalize(normalize(d) + np.array([0, 0, up_bias]))
			self.normals[i] = tuple(n)


def write_dae(path, mesh, name):
	pos = " ".join("%.4f %.4f %.4f" % p for p in mesh.positions)
	nrm = " ".join("%.4f %.4f %.4f" % n for n in mesh.normals)
	uvs = " ".join("%.5f %.5f" % uv for uv in mesh.uvs)
	idx = " ".join("%d %d %d" % (i, i, i) for tri in mesh.triangles for i in tri)
	n = len(mesh.positions)
	text = f"""<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <unit name="meter" meter="1"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_geometries>
    <geometry id="{name}-mesh" name="{name}">
      <mesh>
        <source id="{name}-pos">
          <float_array id="{name}-pos-array" count="{3 * n}">{pos}</float_array>
          <technique_common>
            <accessor source="#{name}-pos-array" count="{n}" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="{name}-nrm">
          <float_array id="{name}-nrm-array" count="{3 * n}">{nrm}</float_array>
          <technique_common>
            <accessor source="#{name}-nrm-array" count="{n}" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="{name}-uv">
          <float_array id="{name}-uv-array" count="{2 * n}">{uvs}</float_array>
          <technique_common>
            <accessor source="#{name}-uv-array" count="{n}" stride="2">
              <param name="S" type="float"/><param name="T" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <vertices id="{name}-vtx">
          <input semantic="POSITION" source="#{name}-pos"/>
        </vertices>
        <triangles count="{len(mesh.triangles)}">
          <input semantic="VERTEX" source="#{name}-vtx" offset="0"/>
          <input semantic="NORMAL" source="#{name}-nrm" offset="1"/>
          <input semantic="TEXCOORD" source="#{name}-uv" offset="2" set="1"/>
          <p>{idx}</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="{name}" name="{name}" type="NODE">
        <matrix sid="transform">1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</matrix>
        <instance_geometry url="#{name}-mesh" name="{name}"/>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene>
    <instance_visual_scene url="#Scene"/>
  </scene>
</COLLADA>
"""
	with open(path, "w") as f:
		f.write(text)
