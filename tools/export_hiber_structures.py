"""Export the Hibernian (hiber) buildings from Duileoga's catalog .blend files.

Usage:
  blender -b ~/Downloads/"A-Catálogo predios hiber.blend" --python tools/export_hiber_structures.py -- [--no-ao] [--only a,b]
  blender -b ~/Downloads/"A-Edificios hiber EDITOR DE ESCENARIOS.blend" --python tools/export_hiber_structures.py -- --editor

Each building of the catalog sits on a footprint plane ("Plano.*"); every mesh whose centre lies on
that plane belongs to the building (the plane itself is left out, the game draws a dirt decal).
Pieces are joined, centred, scaled to game size, get prop points and a baked AO map, and are written to
  art/meshes/structural/hibernians/<name>.dae
  art/textures/skins/structural/ao/hiber/<name>_ao.png
  tools/hiber_export_info.json  (footprints / heights, read by tools/make_hiber_civ.py)
Same pipeline as tools/export_cartemp_structures.py.
"""

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Matrix, Vector

MOD = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MESH_DIR = os.path.join(MOD, "art/meshes/structural/hibernians")
AO_DIR = os.path.join(MOD, "art/textures/skins/structural/ao/hiber")
INFO = os.path.join(MOD, "tools/hiber_export_info.json")

SCALE = 3.4          # catalog units -> game metres (same catalog scale as cartemp)
AO_RES = 1024
AO_SAMPLES = 64
AO_DIST = 2.0

# name: (footprint plane, prop setup). The wonder has no plane: it is the box WONDER_BOX.
BUILDINGS = {
    "civil_centre": ("Plano.012", "projectile"),
    "house_a": ("Plano.038", None),
    "house_b": ("Plano.046", None),
    "house_c": ("Plano.006", None),
    "house_d": ("Plano.039", None),
    "storehouse": ("Plano.045", None),
    "farmstead": ("Plano.033", None),
    "corral": ("Plano.003", None),
    "dock": ("Plano.018", None),
    "barracks": ("Plano.024", None),
    "range": ("Plano.028", None),
    "stable": ("Plano.035", None),
    "forge": ("Plano.031", None),
    "temple": ("Plano.007", None),
    "market": ("Plano.026", None),
    "sentry_tower": ("Plano.048", "projectile"),
    "defense_tower": ("Plano.044", "projectile"),
    "fortress": ("Plano.010", "projectile"),
    "arsenal": ("Plano.017", None),
    "wall_long": ("Plano.004", "wall"),
    "wall_tower": ("Plano.047", "projectile"),
    "wall_gate": ("Plano.030", "wall"),
    "promontory": ("Plano.022", "projectile"),
    "royal_enclosure": ("Plano.032", "projectile"),
    "ritual_assembly": ("Plano.056", None),
    "ring_fort": ("Plano.037", "projectile"),
    "wonder": (None, "projectile"),
}
WONDER_BOX = (-1.0, 19.5, -0.5, 17.5)      # x0, x1, y0, y1 in catalog units
DERIVED_WALLS = {"wall_medium": 0.66, "wall_short": 0.4}

# Scenario editor pieces (other .blend): gaia decoratives.
EDITOR = {
    "stone_of_divisions": "Plano.017",     # Aill na Mireann
    "stone_ring": "Plano.037",             # karnom, Drombeg
    "wooden_ring": "Plano.004",            # kwresnom Temris
    "burial_mound": "Plano.007",           # Sidos
}
SKIP = ("head_male", "m_cotton", "Plano")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
    return "--no-ao" in argv, only, "--editor" in argv


def centre_xy(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return (min(c.x for c in cs) + max(c.x for c in cs)) / 2, (min(c.y for c in cs) + max(c.y for c in cs)) / 2


def plane_box(plane):
    cs = [plane.matrix_world @ v.co for v in plane.data.vertices]
    return min(c.x for c in cs), max(c.x for c in cs), min(c.y for c in cs), max(c.y for c in cs)


def pieces_in(box, taken, margin=0.3):
    x0, x1, y0, y1 = box
    out = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name.startswith(SKIP) or o.name in taken:
            continue
        cx, cy = centre_xy(o)
        if x0 - margin <= cx <= x1 + margin and y0 - margin <= cy <= y1 + margin:
            out.append(o)
    return out


def mesh_copy(src, offset, scale_x=1.0):
    """World-space copy of src (modifiers applied), centred on offset and scaled."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(src.evaluated_get(dg))
    m = (Matrix.Diagonal((SCALE * scale_x, SCALE, SCALE, 1.0))
         @ Matrix.Translation(-offset) @ src.matrix_world)
    me.transform(m)
    if m.determinant() < 0:
        me.flip_normals()
    # keep only the UV layer used for rendering, as "UVMap"
    uvs = me.uv_layers
    if len(uvs):
        keep = next((u for u in uvs if u.active_render), uvs[0]).name
        for n in [u.name for u in uvs if u.name != keep]:
            uvs.remove(uvs[n])
        uvs[0].name = "UVMap"
    return me


def build_object(name, sources, offset, mat_name, scale_x=1.0):
    """Join copies of the source objects into a new object in the work scene."""
    work = bpy.data.collections["hiber_work"]
    objs = []
    for s in sources:
        me = mesh_copy(s, offset, scale_x)
        if not len(me.vertices):
            continue
        o = bpy.data.objects.new(name, me)
        work.objects.link(o)
        objs.append(o)
    if not objs:
        return None
    if len(objs) > 1:
        select_only(objs, objs[0])
        bpy.ops.object.join()
    obj = objs[0]
    obj.name = name
    obj.data.name = name
    obj.data.materials.clear()
    obj.data.materials.append(bpy.data.materials[mat_name])
    # merge doubles from the joins would break UV seams, so only clean loose verts
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    # loose edges become <lines> in the .dae, which the game refuses ("mesh is made of triangles")
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES_FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def fix_orientation(obj, rays=12, margin=0.15):
    """Flip mesh parts whose faces point into solid geometry.

    Several catalog pieces are inside-out. That was hidden in Blender (no
    backface culling) but leaves holes in game and black AO. For every
    connected part, rays are cast from each face along its normal side and the
    opposite side; if the opposite side sees clearly more open space, the part
    is flipped. Custom normals are dropped and rebuilt with smooth-by-angle.
    """
    import random
    from mathutils.bvhtree import BVHTree
    rnd = random.Random(1)
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm)

    def openness(c, n):
        free = 0
        for _ in range(rays):
            d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
            if d.dot(n) < 0:
                d = -d
            if tree.ray_cast(c + n * 0.01, d, 8.0)[0] is None:
                free += 1
        return free / rays

    seen = set()
    flipped = 0
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        comp, stack = [], [f0]
        seen.add(f0.index)
        while stack:
            f = stack.pop()
            comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
        front = back = weight = 0.0
        for f in comp:
            a = f.calc_area()
            if a < 1e-6:
                continue
            c = f.calc_center_median()
            front += openness(c, f.normal) * a
            back += openness(c, -f.normal) * a
            weight += a
        if weight and (back - front) / weight > margin:
            for f in comp:
                f.normal_flip()
            flipped += 1
    bm.to_mesh(me)
    bm.free()
    if me.has_custom_normals:
        select_only([obj], obj)
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(30))
    print(f"  orientation: flipped {flipped} parts")


def ground_bounds(obj):
    """XY extents and height of the geometry above ground."""
    vs = [v.co for v in obj.data.vertices if v.co.z > -0.2]
    if not vs:
        vs = [v.co for v in obj.data.vertices]
    return (min(v.x for v in vs), max(v.x for v in vs),
            min(v.y for v in vs), max(v.y for v in vs), max(v.z for v in vs))


def roof_height(obj, x, y, top):
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    hit = tree.ray_cast(Vector((x, y, top + 5)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else top * 0.8


def add_props(obj, kind):
    kind = kind or 'plain'
    work = bpy.data.collections["hiber_work"]
    x0, x1, y0, y1, top = ground_bounds(obj)
    pts = {}
    if kind == "wall":
        z = roof_height(obj, 0, 0, top)
        pts["prop_garrisoned"] = (0, 0, z)
    else:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        pts["prop_garrisoned"] = (cx, cy, roof_height(obj, cx, cy, top) + 0.1)
        if kind == "projectile":
            pts["prop_projectile"] = (cx, cy, top + 1.0)
    for n, loc in pts.items():
        e = bpy.data.objects.new(n, None)
        e.location = loc
        e.parent = obj
        work.objects.link(e)
    return pts


def bake_ao(obj, out_png):
    work = bpy.data.collections["hiber_work"]
    scene = bpy.context.scene
    me = obj.data
    ao_uv = me.uv_layers.new(name="AO")
    me.uv_layers.active = ao_uv
    select_only([obj], obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003,
                             correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')

    img = bpy.data.images.new(os.path.basename(out_png), AO_RES, AO_RES, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    bake_mat = bpy.data.materials.new("bake_tmp")
    bake_mat.use_nodes = True
    node = bake_mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    bake_mat.node_tree.nodes.active = node
    real = me.materials[0]
    me.materials[0] = bake_mat

    # a ground plane so walls get darker at the base, like the vanilla AO maps
    gme = bpy.data.meshes.new("ground")
    gme.from_pydata([(-200, -200, 0), (200, -200, 0), (200, 200, 0), (-200, 200, 0)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("ground", gme)
    work.objects.link(ground)

    scene.render.engine = 'CYCLES'
    scene.cycles.samples = AO_SAMPLES
    scene.cycles.device = 'CPU'
    scene.render.bake.margin = 8
    scene.world.light_settings.distance = AO_DIST
    select_only([obj], obj)
    bpy.ops.object.bake(type='AO', margin=8, uv_layer="AO")
    img.filepath_raw = out_png
    img.file_format = 'PNG'
    img.save()
    me.materials[0] = real
    bpy.data.objects.remove(ground)
    bpy.data.materials.remove(bake_mat)
    bpy.data.images.remove(img)


def export_dae(obj, path):
    select_only([obj] + list(obj.children), obj)
    if True:
        bpy.ops.wm.collada_export(filepath=path, selected=True, include_children=True,
                                  apply_modifiers=True, triangulate=True,
                                  use_texture_copies=False, export_global_forward_selection='Y',
                                  export_global_up_selection='Z')


def clear_work():
    work = bpy.data.collections["hiber_work"]
    for o in list(work.objects):
        bpy.data.objects.remove(o)


def select_only(objs, active):
    vl = bpy.context.view_layer
    for o in vl.objects:
        if o.select_get():
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = active



def export_one(name, srcs, offset, props, info, no_ao, sx=1.0):
    print("=== exporting", name, [s.name for s in srcs])
    clear_work()
    main_obj = build_object(name, srcs, offset, MAT, sx)
    fix_orientation(main_obj)
    x0, x1, y0, y1, _ = ground_bounds(main_obj)
    shift = Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0.0))
    if abs(shift.x) > 1.0 or abs(shift.y) > 1.0:
        main_obj.data.transform(Matrix.Translation(-shift))
    pts = add_props(main_obj, props) if props else add_props(main_obj, None)
    x0, x1, y0, y1, top = ground_bounds(main_obj)
    info[name] = {"width": round(x1 - x0, 2), "depth": round(y1 - y0, 2), "height": round(top, 2),
                  "cx": round((x0 + x1) / 2, 2), "cy": round((y0 + y1) / 2, 2),
                  "props": {k: [round(c, 2) for c in v] for k, v in pts.items()}, "extra": []}
    if not no_ao:
        bake_ao(main_obj, os.path.join(AO_DIR, name + "_ao.png"))
    export_dae(main_obj, os.path.join(MESH_DIR, name + ".dae"))
    json.dump(info, open(INFO, "w"), indent=1)


def main():
    global MAT
    no_ao, only, editor = parse_args()
    os.makedirs(MESH_DIR, exist_ok=True)
    os.makedirs(AO_DIR, exist_ok=True)
    MAT = next(m.name for m in bpy.data.materials if "hiberni" in m.name)
    tex = os.path.join(MOD, "art/textures/skins/structural/hiber/struct.png")
    for img in bpy.data.images:
        if "FINAIS" in img.filepath:
            img.filepath = tex
    scene = bpy.context.scene
    for o in scene.objects:
        o.hide_render = True
        o.hide_set(True)
    work = bpy.data.collections.new("hiber_work")
    scene.collection.children.link(work)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("hiber_world")
    info = json.load(open(INFO)) if os.path.exists(INFO) else {}

    taken = set()
    jobs = []
    table = {k: (v, None) for k, v in EDITOR.items()} if editor else BUILDINGS
    for name, (plane_name, props) in table.items():
        if plane_name:
            plane = bpy.data.objects[plane_name]
            box = plane_box(plane)
        else:
            box = WONDER_BOX
        srcs = pieces_in(box, taken)
        taken.update(o.name for o in srcs)
        offset = Vector(((box[0] + box[1]) / 2, (box[2] + box[3]) / 2, 0.0))
        jobs.append((name, srcs, offset, props))
    left = [o.name for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith(SKIP) and o.name not in taken]
    print("NOT ASSIGNED:", left)
    for name, srcs, offset, props in jobs:
        if only and name not in only:
            continue
        if not srcs:
            print("!! no pieces for", name)
            continue
        export_one(("editor_" if editor else "") + name, srcs, offset, props, info, no_ao)
    if not editor:
        wall = next(j for j in jobs if j[0] == "wall_long")
        for name, f in DERIVED_WALLS.items():
            if not only or name in only:
                export_one(name, wall[1], wall[2], "wall", info, no_ao, f)
    print("DONE")


main()
