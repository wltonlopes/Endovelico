import bpy
import os
import math
from mathutils import Vector

# =====================================================
# CONFIGURAÇÕES
# =====================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

AO_RESOLUTION = 1024
AO_SAMPLES = 128
AO_DISTANCE = 0.8
BAKE_MARGIN = 8

SMART_ANGLE = math.radians(66.0)
SMART_MARGIN = 0.001

USE_GPU = False  # coloque True se desejar tentar GPU

# =====================================================
# LIMPAR CENA
# =====================================================

def clear_scene():

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

    for collection in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for block in list(collection):
            try:
                collection.remove(block)
            except:
                pass


# =====================================================
# CONFIGURAR CYCLES
# =====================================================

def setup_cycles():

    scene = bpy.context.scene

    scene.render.engine = 'CYCLES'
    scene.cycles.samples = AO_SAMPLES

    scene.render.bake.margin = BAKE_MARGIN
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.max_ray_distance = AO_DISTANCE

    if USE_GPU:
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.refresh_devices()

            for t in ["OPTIX", "CUDA", "HIP"]:
                try:
                    prefs.compute_device_type = t
                    break
                except:
                    pass

            for device in prefs.devices:
                device.use = True

            scene.cycles.device = 'GPU'

        except Exception as e:
            print("GPU não disponível:", e)


# =====================================================
# UV2
# =====================================================

def recreate_uv2(obj):

    mesh = obj.data

    while len(mesh.uv_layers) < 2:
        mesh.uv_layers.new(name="UVMap_2")

    uv2 = mesh.uv_layers[1]

    mesh.uv_layers.active = uv2

    bpy.context.view_layer.objects.active = obj

    bpy.ops.object.mode_set(mode='EDIT')

    bpy.ops.mesh.select_all(action='SELECT')

    bpy.ops.uv.smart_project(
        angle_limit=SMART_ANGLE,
        island_margin=SMART_MARGIN,
        correct_aspect=True,
        scale_to_bounds=True
    )

    bpy.ops.object.mode_set(mode='OBJECT')


# =====================================================
# PROPS
# =====================================================

def ensure_props():

    meshes = [
        o for o in bpy.context.scene.objects
        if o.type == 'MESH'
    ]

    if not meshes:
        return

    min_v = Vector((999999,999999,999999))
    max_v = Vector((-999999,-999999,-999999))

    for obj in meshes:

        for corner in obj.bound_box:

            world = obj.matrix_world @ Vector(corner)

            min_v.x = min(min_v.x, world.x)
            min_v.y = min(min_v.y, world.y)
            min_v.z = min(min_v.z, world.z)

            max_v.x = max(max_v.x, world.x)
            max_v.y = max(max_v.y, world.y)
            max_v.z = max(max_v.z, world.z)

    center = (min_v + max_v) / 2

    existing = {
        obj.name
        for obj in bpy.data.objects
    }

    # prop_garrisoned
    if "prop_garrisoned" not in existing:

        empty = bpy.data.objects.new(
            "prop_garrisoned",
            None
        )

        empty.empty_display_type = 'ARROWS'

        empty.location = (
            center.x,
            center.y,
            0.1
        )

        bpy.context.collection.objects.link(empty)

        print("Criado prop_garrisoned")

    # prop_projectile
    if "prop_projectile" not in existing:

        empty = bpy.data.objects.new(
            "prop_projectile",
            None
        )

        empty.empty_display_type = 'ARROWS'

        empty.location = (
            center.x,
            center.y,
            max_v.z + 2.0
        )

        bpy.context.collection.objects.link(empty)

        print("Criado prop_projectile")


# =====================================================
# IMAGEM AO
# =====================================================

def create_ao_image(name):

    img = bpy.data.images.new(
        name=name,
        width=AO_RESOLUTION,
        height=AO_RESOLUTION,
        alpha=False
    )

    try:
        img.colorspace_settings.name = "Non-Color"
    except:
        pass

    return img


# =====================================================
# MATERIAIS
# =====================================================

def prepare_materials(obj, image):

    if not obj.data.materials:
        mat = bpy.data.materials.new(obj.name)
        mat.use_nodes = True
        obj.data.materials.append(mat)

    for mat in obj.data.materials:

        if mat is None:
            continue

        mat.use_nodes = True

        nodes = mat.node_tree.nodes

        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image

        nodes.active = tex


# =====================================================
# BAKE
# =====================================================

def bake_object(obj, image):

    bpy.ops.object.select_all(action='DESELECT')

    obj.select_set(True)

    bpy.context.view_layer.objects.active = obj

    obj.data.uv_layers.active = obj.data.uv_layers[1]

    prepare_materials(obj, image)

    bpy.ops.object.bake(
        type='AO'
    )


# =====================================================
# JUNTAR MESHES
# =====================================================

def join_meshes():

    meshes = [
        o for o in bpy.context.scene.objects
        if o.type == 'MESH'
    ]

    if not meshes:
        return None

    bpy.ops.object.select_all(action='DESELECT')

    for obj in meshes:
        obj.select_set(True)

    bpy.context.view_layer.objects.active = meshes[0]

    if len(meshes) > 1:
        bpy.ops.object.join()

    return bpy.context.active_object


# =====================================================
# PROCESSAR DAE
# =====================================================

def process_dae(filepath):

    print("\n===========================")
    print("Processando:", filepath)

    clear_scene()

    bpy.ops.wm.collada_import(filepath=filepath)

    obj = join_meshes()

    if obj is None:
        print("Nenhuma malha encontrada.")
        return

    bpy.ops.object.select_all(action='DESELECT')

    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    try:
        bpy.ops.object.transform_apply(
            location=False,
            rotation=True,
            scale=True
        )
    except:
        pass

    apply_auto_smooth(obj, 30)

    print("MODIFICADORES FINAIS:")

    for m in obj.modifiers:
        print(
            m.name,
            m.type
        )

    ensure_props()

    recreate_uv2(obj)

    base = os.path.splitext(
        os.path.basename(filepath)
    )[0]

    image = create_ao_image(
        f"{base}_ao"
    )

    bake_object(obj, image)

    png_path = os.path.join(
        os.path.dirname(filepath),
        f"{base}_ao.png"
    )

    image.filepath_raw = png_path
    image.file_format = 'PNG'

    image.save()


    print("AO salvo:", png_path)

    # Aplicar Smooth by Angle antes do export
    for mod in list(obj.modifiers):

        if mod.type == 'NODES':

            try:
                bpy.ops.object.modifier_apply(
                    modifier=mod.name
                )

                print("Aplicado:", mod.name)

            except Exception as e:
                print("Falha ao aplicar:", mod.name)
                print(e)
    print("ANTES DO EXPORT:")

    for mod in obj.modifiers:
        print(mod.name, mod.type)
    bpy.ops.wm.collada_export(
        filepath=filepath
    )

    print("DAE exportado:", filepath)
    ##

def apply_auto_smooth(obj, angle=30):

    bpy.ops.object.select_all(action='DESELECT')

    obj.select_set(True)

    bpy.context.view_layer.objects.active = obj

    # Smooth by Angle
    bpy.ops.object.shade_auto_smooth(
        angle=math.radians(angle)
    )

    # Weighted Normals
    wn = obj.modifiers.new(
        name="WeightedNormals",
        type='WEIGHTED_NORMAL'
    )

    wn.keep_sharp = True

    print("Modificadores:")

    for mod in obj.modifiers:
        print(mod.name, mod.type)

# =====================================================
# MAIN
# =====================================================

setup_cycles()

dae_files = sorted([
    f for f in os.listdir(SCRIPT_DIR)
    if f.lower().endswith(".dae")
])

print(f"Encontrados {len(dae_files)} arquivos DAE")

for file in dae_files:

    path = os.path.join(
        SCRIPT_DIR,
        file
    )

    try:
        process_dae(path)

    except Exception as e:
        print("ERRO:", file)
        print(e)

print("\nFINALIZADO.")
