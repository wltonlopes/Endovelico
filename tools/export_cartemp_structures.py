"""Export the Carthaginian Empire (cartemp) buildings from the catalog .blend.

Usage:
  blender -b "referencias/A-Catálogo predios cart.blend" \
      --python tools/export_cartemp_structures.py [-- --no-ao] [-- --only name1,name2]

Each building in the catalog sits on a footprint plane ("Plano.*"). This script
joins the pieces of each building, centres it on its plane, scales it to game
size, adds prop points, bakes an AO map on a second UV channel and writes:
  art/meshes/structural/carthaginian_empire/<name>.dae
  art/meshes/structural/carthaginian_empire/<name>_palms.dae / dock_ship.dae
  art/textures/skins/structural/ao/cartemp/<name>_ao.png
  tools/cartemp_export_info.json  (footprints / heights, used for the templates)
"""

import bpy
import bmesh
import json
import math
import os
import sys
from mathutils import Matrix, Vector

MOD = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MESH_DIR = os.path.join(MOD, "art/meshes/structural/carthaginian_empire")
AO_DIR = os.path.join(MOD, "art/textures/skins/structural/ao/cartemp")
INFO = os.path.join(MOD, "tools/cartemp_export_info.json")

SCALE = 3.4          # catalog units -> game metres
AO_RES = 1024
AO_SAMPLES = 64
AO_DIST = 2.0

MAIN_MAT = "textura  cart nova "
PALM_MAT = "palmera datilera"
SHIP_MAT = "navío militar punico"

# name: (footprint plane, [objects], prop setup)
BUILDINGS = {
    "civil_centre": ("Plano.001", ['CartStoa.125', 'CartStoa.127', 'Circle_027.001', 'Civic_Centre.001', 'Columns.001', 'Cube_006.048', 'Cubo.013', 'kart_temple_b.076', 'kart_temple_b.084', 'Plane_000.004'], "projectile"),
    "temple": ("Plano.002", ['CartStoa.001', 'CartStoa.002', 'Circle_026.002', 'Cube.001', 'Cube_008.003', 'Cubo.008', 'kart_temple_b.001'], None),
    "embassy": ("Plano.003", ['CartStoa.003', 'Circle_023.001', 'Cube.019', 'Cube_006.002', 'Cubo.019', 'kart_temple_b.013', 'Plane_000.008'], None),
    "sentry_tower": ("Plano.004", ['Plane_001_001.001'], "projectile"),
    "stable": ("Plano.005", ['Cube_005'], None),
    "range": ("Plano.006", ['Cube_006'], None),
    "corral": ("Plano.007", ['Cube_007'], None),
    "temple_big": ("Plano.008", ['CartBlacksmith.135', 'CartStoa.004', 'CartStoa.054', 'Circle_024.004', 'Cube.009', 'Cube_000.009', 'Cube_006.006', 'Cube_008.002', 'Cubo.005', 'kart_temple_b.002', 'Plane_000.001'], None),
    "barracks": ("Plano.009", ['CartBlacksmith.209', 'Cube.004', 'Cube_006.004', 'kart_house_02.004'], None),
    "house_a": ("Plano.010", ['Cube.159', 'Cube_008.009', 'kart_house_02.006'], None),
    "farmstead": ("Plano.011", ['Cube.067', 'Cube_008.001'], None),
    "house_d": ("Plano.012", ['Cube.252', 'Cube_008.006', 'kart_house_02.008'], None),
    "fortress": ("Plano.013", ['wrld_barrel_a_003'], "projectile"),
    "house_b": ("Plano.014", ['Cube.062', 'Cube_008.010', 'kart_house_02.009'], None),
    "defense_tower": ("Plano.015", ['Plane_001'], "projectile"),
    "tophet": ("Plano.016", ['Cubo.001', 'kart_temple_b', 'Plane_000.010'], None),
    "wonder": ("Plano.017", ['structure_006', 'Plane_000', 'Circle_026', 'Circle_026.001', 'Circle_026.005', 'Circle_026.006', 'Circle_026.007', 'Circle_026.008'], None),
    "house_c": ("Plano.018", ['Cube.006', 'Cube_008.008', 'kart_house_02.007'], None),
    "arsenal": ("Plano.025", ['Cube_000'], None),
    "market": ("Plano.029", ['struct.316'], None),
    "dock": ("Plano.030", ['Cube.002', 'Cube_000.032', 'Kart_Bireme', 'kart_house_02.003', 'props.004'] + ['struct.%03d' % i for i in (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 114, 115, 116, 117, 118)], None),
    "palace": ("Plano.031", ['CartStoa.005', 'Circle_028.001', 'Circle_028.003', 'Cube_006.015', 'Cube_008.302', 'Cube_008.470', 'Cube_008.558', 'Cube_025.001', 'Cubo.014'], "projectile"),
    "storehouse": ("Plano.033", ['Cube.090'], None),
    "house_e": ("Plano.037", ['Box03.019', 'Cube.345', 'Cube_008.007'], None),
    "forge": ("Plano.041", ['CartBlacksmith.087', 'Cube.229', 'Cube_006.001', 'Cube_006.119', 'kart_house_02.002'], None),
    "wall_long": ("Plano.064", ['Cube_009'], "wall"),
    "wall_tower": ("Plano.065", ['Cube_012'], "projectile"),
    "wall_gate": ("Plano.066", ['Cube_011', 'Cube_014'], "wall"),
}
# Shorter wall pieces are made from the long wall, squeezed along X.
DERIVED_WALLS = {"wall_medium": 0.66, "wall_short": 0.4}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    no_ao = "--no-ao" in argv
    only = None
    if "--only" in argv:
        only = set(argv[argv.index("--only") + 1].split(","))
    return no_ao, only


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
    work = bpy.data.collections["cartemp_work"]
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
    work = bpy.data.collections["cartemp_work"]
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
    work = bpy.data.collections["cartemp_work"]
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
    work = bpy.data.collections["cartemp_work"]
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


def main():
    no_ao, only = parse_args()
    os.makedirs(MESH_DIR, exist_ok=True)
    os.makedirs(AO_DIR, exist_ok=True)
    scene = bpy.context.scene
    for o in scene.objects:          # keep the catalog out of the AO bake
        o.hide_render = True
        o.hide_set(True)
    work = bpy.data.collections.new("cartemp_work")
    scene.collection.children.link(work)
    if scene.world is None:
        scene.world = bpy.data.worlds.new("cartemp_world")

    info = json.load(open(INFO)) if os.path.exists(INFO) else {}
    jobs = [(n, v[0], v[1], v[2], 1.0, n) for n, v in BUILDINGS.items()]
    jobs += [(n, BUILDINGS["wall_long"][0], BUILDINGS["wall_long"][1], "wall", f, "wall_long")
             for n, f in DERIVED_WALLS.items()]

    for name, plane_name, obj_names, props, sx, _src in jobs:
        if only and name not in only:
            continue
        print("=== exporting", name)
        clear_work()
        plane = bpy.data.objects[plane_name]
        offset = Vector((plane.location.x, plane.location.y, 0.0))
        srcs = [bpy.data.objects[n] for n in obj_names]
        groups = {MAIN_MAT: [], PALM_MAT: [], SHIP_MAT: []}
        for s in srcs:
            mats = [m.name for m in s.data.materials if m]
            groups[mats[0] if mats else MAIN_MAT].append(s)

        main_obj = build_object(name, groups[MAIN_MAT], offset, MAIN_MAT, sx)
        fix_orientation(main_obj)
        # recentre when the footprint plane is not centred under the building
        x0, x1, y0, y1, _ = ground_bounds(main_obj)
        shift = Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0.0))
        if abs(shift.x) > 1.0 or abs(shift.y) > 1.0:
            main_obj.data.transform(Matrix.Translation(-shift))
            offset = offset + Vector((shift.x / (SCALE * sx), shift.y / SCALE, 0.0))
        pts = add_props(main_obj, props)
        x0, x1, y0, y1, top = ground_bounds(main_obj)
        entry = {"width": round(x1 - x0, 2), "depth": round(y1 - y0, 2), "height": round(top, 2),
                 "cx": round((x0 + x1) / 2, 2), "cy": round((y0 + y1) / 2, 2),
                 "props": {k: [round(c, 2) for c in v] for k, v in pts.items()}, "extra": []}
        if not no_ao:
            bake_ao(main_obj, os.path.join(AO_DIR, name + "_ao.png"))
        export_dae(main_obj, os.path.join(MESH_DIR, name + ".dae"))

        for mat, suffix in ((PALM_MAT, "_palms"), (SHIP_MAT, "_ship")):
            if groups[mat]:
                clear_work()
                po = build_object(name + suffix, groups[mat], offset, mat, sx)
                export_dae(po, os.path.join(MESH_DIR, name + suffix + ".dae"))
                entry["extra"].append(name + suffix)
        info[name] = entry
        json.dump(info, open(INFO, "w"), indent=1)
    print("DONE")


main()
