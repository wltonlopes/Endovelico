#!/usr/bin/env python3
"""Selection-panel portraits for fauna actors, rendered from their mesh and texture.

Renders each actor's rest pose in Blender (Cycles, three-quarter view, head to the left) and puts it
on the dark vignette of the vanilla animal portraits:
  art/textures/ui/session/portraits/gaia/fauna_<actor>.png   (256 x 256)
Templates point to it with <Icon>gaia/fauna_<actor>.png</Icon> (make_fauna_templates.py adds it).

Usage: python3 tools/render_fauna_icons.py bison,stork_white,...
"""
import os
import subprocess
import sys
import tempfile

MOD = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

BLENDER_SCRIPT = r'''
MOD = %r
import bpy, struct, os, sys, math
import numpy as np
import xml.etree.ElementTree as ET
from mathutils import Vector
OUT = os.environ["ICON_OUT"]
actors = os.environ["ICON_ACTORS"].split(",")

def read_pmd(path):
    d = open(path, "rb").read()
    n, nuv = struct.unpack_from("<II", d, 12); stride = 24 + 8*nuv + 20
    raw = np.frombuffer(d, np.uint8, n*stride, 20).reshape(n, stride)
    pos = raw[:, :12].copy().view("<f4").reshape(-1, 3)
    uv = raw[:, 24:32].copy().view("<f4").reshape(-1, 2)
    off = 20 + n*stride; nf, = struct.unpack_from("<I", d, off)
    faces = np.frombuffer(d, "<u2", nf*3, off+4).reshape(-1, 3)
    return pos, uv, faces

scene = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
scene.render.engine = "CYCLES"; scene.cycles.samples = 48; scene.cycles.device = "CPU"
scene.render.resolution_x = scene.render.resolution_y = 256
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.8, 0.85, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); scene.collection.objects.link(sun)
sun.data.energy = 4.0; sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-40))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50

for actor in actors:
    root = ET.parse(f"{MOD}/art/actors/fauna/{actor}.xml").getroot()
    mesh_file = root.find(".//mesh").text.strip(); tex = root.find(".//texture").get("file")
    pos, uv, faces = read_pmd(f"{MOD}/art/meshes/{mesh_file}")
    verts = [(p[0], p[2], p[1]) for p in pos]  # engine (x, y up, z) -> blender (x, y, z up)
    me = bpy.data.meshes.new(actor); me.from_pydata(verts, [], [tuple(int(i) for i in f[::-1]) for f in faces]); me.update()
    layer = me.uv_layers.new()
    for loop in me.loops: layer.data[loop.index].uv = (uv[loop.vertex_index][0], uv[loop.vertex_index][1])
    for poly in me.polygons: poly.use_smooth = False
    ob = bpy.data.objects.new(actor, me); scene.collection.objects.link(ob)
    mat = bpy.data.materials.new(actor); mat.use_nodes = True; nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 0.9
    img = nt.nodes.new("ShaderNodeTexImage"); img.image = bpy.data.images.load(f"{MOD}/art/textures/skins/{tex}")
    nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"]); nt.links.new(img.outputs["Alpha"], bsdf.inputs["Alpha"])
    me.materials.append(mat)
    # Frame the animal: three-quarter view from the front left, slightly above.
    P = np.array(verts); lo, hi = P.min(0), P.max(0); ctr = (lo + hi) / 2; size = np.linalg.norm(hi - lo)
    direction = Vector((1.0, -0.75, 0.35)).normalized()
    rot = (-direction).to_track_quat("-Z", "Y")
    cam.location = Vector(ctr) + direction * size * 3
    cam.rotation_euler = rot.to_euler()
    cam.data.type = "ORTHO"; cam.data.clip_end = size * 10
    # Tight framing: extent of the model seen from the camera.
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    rel = P - ctr
    u, v = rel @ np.array(right), rel @ np.array(up)
    shift_u, shift_v = (u.max() + u.min()) / 2, (v.max() + v.min()) / 2
    cam.location = cam.location + right * shift_u + up * shift_v
    cam.data.ortho_scale = max(np.ptp(u), np.ptp(v)) * 1.1
    light = (direction + Vector((0.3, -0.2, 0.9))).normalized()
    sun.rotation_euler = (-light).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = f"{OUT}/{actor}.png"
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    print("ICON", actor)
'''


def compose(src, dst):
	import numpy as np
	from PIL import Image, ImageFilter
	im = Image.open(src).convert("RGBA")
	y, x = np.mgrid[0:256, 0:256] / 255.0
	r = np.sqrt((x - 0.5) ** 2 + (y - 0.42) ** 2) / 0.72
	base = np.array([92, 80, 62]) * (1 - np.clip(r, 0, 1)[..., None]) ** 1.2 + np.array([18, 15, 12])
	bg = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
	# Soft contact shadow under the animal.
	shadow = Image.new("RGBA", im.size, (0, 0, 0, 0)); a = im.split()[3].filter(ImageFilter.GaussianBlur(6))
	shadow.putalpha(a.point(lambda v: v * 0.45)); bg.alpha_composite(shadow, (3, 4))
	bg.alpha_composite(im)
	bg.convert("RGB").save(dst)


def main():
	actors = [a for a in sys.argv[1].split(",") if a]
	with tempfile.TemporaryDirectory() as tmp:
		script = os.path.join(tmp, "render.py")
		with open(script, "w") as f:
			f.write(BLENDER_SCRIPT % MOD)
		subprocess.run(["blender", "-b", "--python", script], check=True, stdout=subprocess.DEVNULL,
			env=dict(os.environ, ICON_OUT=tmp, ICON_ACTORS=",".join(actors)))
		folder = os.path.join(MOD, "art", "textures", "ui", "session", "portraits", "gaia")
		os.makedirs(folder, exist_ok=True)
		for actor in actors:
			compose(os.path.join(tmp, actor + ".png"), os.path.join(folder, "fauna_%s.png" % actor))
			print("portrait", actor)


if __name__ == "__main__":
	main()
