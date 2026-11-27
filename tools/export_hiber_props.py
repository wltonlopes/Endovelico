"""Export the new unit props of the Hibernian (hiber) civ from Duileoga's unit .blend files.

Usage:
  blender -b ~/Downloads/hiber/"X-Unidades hiber 1.blend" --python tools/export_hiber_props.py

The units of the .blend files are vanilla 0 A.D. meshes (bodies, heads, spears, javelins, swords,
slings, capes) whose UVs were moved into one big atlas; those are not exported, the actors use the
vanilla meshes with the textures cut by tools/make_hiber_textures.py. The props drawn by the author
(the oval shields and the carnyx) are new meshes and are written here:
  art/meshes/props/hiber/<name>.dae
Their UVs are remapped from the atlas to the cut texture (art/textures/skins/props/hiber/<texture>.png).

Frames: the shields are modelled in the 0 A.D. shield frame (x width, y height, z thickness, boss
towards -z, centred on the grip); Blender Z_UP exports need a +90 degree turn around X for that.
The carnyx is turned so that its tube points up (+Y in game) with the mouthpiece at the grip, like
the vanilla props/standard/celt_carnyx_a held at weapon_L.
"""

import bpy
import bmesh
import math
import os
from mathutils import Matrix, Vector

MOD = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(MOD, "art/meshes/props/hiber")
W, H = 7632, 4424                 # atlas size in pixels

# name: (vertex count, atlas x of the UV box (+-30 px), atlas crop (x0, y0) and texture size)
PROPS = {
    "shield_light_a": (72, 44, (0, 3930), (512, 512)),
    "shield_light_b": (109, 44, (0, 3930), (512, 512)),
    "shield_light_c": (183, 44, (0, 3930), (512, 512)),
    "shield_champion": (109, 1208, (1170, 3930), (1024, 512)),
    "carnyx": (352, 839, (820, 3980), (512, 512)),
}


def uv_box(o):
    uv = o.data.uv_layers.active
    us = [d.uv[0] for d in uv.data]
    vs = [d.uv[1] for d in uv.data]
    return min(us) * W, (1 - max(vs)) * H


def find(verts, ux):
    for o in sorted(bpy.data.objects, key=lambda o: o.name):
        if o.type == 'MESH' and len(o.data.vertices) == verts and o.data.uv_layers:
            x, _ = uv_box(o)
            if abs(x - ux) < 30:
                return o
    return None


def carnyx_frame(me):
    """Rotation putting the long axis of the tube along +Z (game +Y), bell up, grip at the origin."""
    pts = [v.co.copy() for v in me.vertices]
    c = sum(pts, Vector()) / len(pts)
    # principal axis by power iteration on the covariance
    cov = [[sum((p[i] - c[i]) * (p[j] - c[j]) for p in pts) for j in range(3)] for i in range(3)]
    a = Vector((0.3, 1.0, 0.7))
    for _ in range(50):
        a = Vector([sum(cov[i][j] * a[j] for j in range(3)) for i in range(3)]).normalized()
    # the bell (animal head) is the wide end: put it on +a
    proj = [(p - c).dot(a) for p in pts]
    lo, hi = min(proj), max(proj)
    width = lambda sel: max((((p - c) - a * (p - c).dot(a)).length for p, t in zip(pts, proj) if sel(t)), default=0)
    if width(lambda t: t < lo + 0.2 * (hi - lo)) > width(lambda t: t > hi - 0.2 * (hi - lo)):
        a = -a
        lo, hi = -hi, -lo
    rot = a.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
    grip = c + a * (lo + 0.12 * (hi - lo))          # vanilla carnyx: grip ~10% up the tube
    return rot @ Matrix.Translation(-grip)


def export(name, o, crop, size):
    me = o.data.copy()
    scale = o.matrix_world.to_scale()
    me.transform(Matrix.Diagonal((scale.x, scale.y, scale.z, 1.0)))
    if name == "carnyx":
        me.transform(carnyx_frame(me))           # now: tube along +Z, i.e. game +Y after export
    else:
        me.transform(Matrix.Rotation(math.radians(90), 4, 'X'))   # shield frame -> Blender Z_UP
    # atlas UVs -> UVs of the cut texture
    x0, y0 = crop
    tw, th = size
    uv = me.uv_layers.active
    for d in uv.data:
        px, py = d.uv[0] * W, (1 - d.uv[1]) * H
        d.uv = ((px - x0) / tw, 1 - (py - y0) / th)
    for n in [u.name for u in me.uv_layers if u != uv]:
        me.uv_layers.remove(me.uv_layers[n])
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for s in bpy.context.view_layer.objects:
        s.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.wm.collada_export(filepath=os.path.join(OUT, name + ".dae"), selected=True, apply_modifiers=False,
                              triangulate=True, use_texture_copies=False)
    xs = [v.co for v in me.vertices]
    print("exported", name, "from", o.name, "size", [round(max(v[i] for v in xs) - min(v[i] for v in xs), 2) for i in range(3)])


def main():
    os.makedirs(OUT, exist_ok=True)
    for o in bpy.data.objects:
        o.modifiers.clear() if o.type == 'MESH' else None
    for name, (verts, ux, crop, size) in PROPS.items():
        o = find(verts, ux)
        if o is None:
            print("!! not found", name)
            continue
        export(name, o, crop, size)


main()
