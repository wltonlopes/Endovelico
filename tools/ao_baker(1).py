bl_info = {
    "name": "0 A.D. AO Baker (Final)",
    "author": "Alisson Fabrini (ChatGPT)",
    "version": (1, 2, 0),
    "blender": (4, 5, 9),
    "location": "Render Properties > 0 A.D. AO Baker Pro",
    "description": "AO baker optimized for 0 A.D. assets: presets, analyze+clean and batch AO baking.",
    "category": "Render",
}

import bpy
import bmesh
import os
import time
import numpy as np



# ---------------------------
# Presets
# ---------------------------
PRESETS = {
    'STRUCTURE': dict(samples=256, distance=0.8, margin=8, resolution=2048),
    'PROP':      dict(samples=128, distance=0.4, margin=6, resolution=1024),
    'TERRAIN':   dict(samples=64,  distance=2.0, margin=10, resolution=4096),
}

# ---------------------------
# Helpers
# ---------------------------



def adjust_output_levels(img, out_black=0, out_white=255):
    """
    Equivalente ao PIL adjust_output_levels
    Funciona com bpy.types.Image
    """

    # Converter para range 0–1
    out_black /= 255.0
    out_white /= 255.0

    pixels = list(img.pixels)

    for i in range(0, len(pixels), 4):

        # RGB
        for c in range(3):
            v = pixels[i + c]

            # mapear intervalo
            v = out_black + v * (out_white - out_black)

            # clamp
            v = max(0.0, min(1.0, v))

            pixels[i + c] = v

        # Alpha permanece intacto

    img.pixels[:] = pixels
    img.update()



def ensure_cycles(scene, ao):
    scene.render.engine = 'CYCLES'
    cycles = scene.cycles
    cycles.samples = ao.samples
    cycles.use_adaptive_sampling = False
    # reduce bounces for fast AO bake
    try:
        cycles.max_bounces = 0
        cycles.diffuse_bounces = 0
        cycles.glossy_bounces = 0
        cycles.transmission_bounces = 0
        cycles.use_progressive_refine = False
    except Exception:
        pass

def create_or_get_image(name, size):
    # ensure image exists and correct size
    img = bpy.data.images.get(name)
    if img:
        try:
            if img.size[0] != size or img.size[1] != size:
                bpy.data.images.remove(img)
                img = bpy.data.images.new(name, width=size, height=size)
        except Exception:
            img = bpy.data.images.new(name, width=size, height=size)
    else:
        img = bpy.data.images.new(name, width=size, height=size)
    try:
        img.colorspace_settings.name = 'Non-Color'
    except Exception:
        pass
    return img

def ensure_image_node(material, img_name, size):
    material.use_nodes = True
    nt = material.node_tree
    nodes = nt.nodes

    # prefer node labeled AO_BAKE_TARGET
    tex_node = None
    for n in nodes:
        if n.type == 'TEX_IMAGE' and getattr(n, 'label', '') == 'AO_BAKE_TARGET':
            tex_node = n
            break
    if tex_node is None:
        tex_node = nodes.new('ShaderNodeTexImage')
        tex_node.label = 'AO_BAKE_TARGET'
        tex_node.name = 'AO_BAKE_TARGET'

    img = create_or_get_image(img_name, size)
    tex_node.image = img
    tex_node.interpolation = 'Smart'
    tex_node.extension = 'EXTEND'

    # mark active for bake
    try:
        nt.nodes.active = tex_node
    except Exception:
        # fallback: select it
        for n in nodes:
            n.select = False
        tex_node.select = True

    return tex_node

def apply_transforms(obj):
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    except Exception:
        pass

def triangulate_bmesh(obj):
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    try:
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.to_mesh(me)
        me.update()
    finally:
        bm.free()

# ---------------------------
# Mesh cleanup utilities
# ---------------------------

def clear_custom_normals(mesh):
    # Safely clear custom normals in Blender 4.5+
    # If mesh has no loops, skip
    if len(mesh.loops) == 0:
        return
    try:
        mesh.normals_split_custom_set(None)
    except Exception:
        # ignore if not available
        pass
    # We will force recalc via edit-mode operator (safe)
    # Caller should switch to edit mode to run normals_make_consistent

def merge_by_distance_op(obj, distance):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    # use the current operator name available in 4.5
    try:
        bpy.ops.mesh.merge_by_distance(distance=distance)
    except Exception:
        try:
            bpy.ops.mesh.remove_doubles(threshold=distance)
        except Exception:
            pass
    bpy.ops.object.mode_set(mode='OBJECT')

def remove_loose_op(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    try:
        bpy.ops.mesh.select_loose()
        bpy.ops.mesh.delete(type='VERT')
    except Exception:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')

def fix_non_manifold_bmesh(obj):
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    try:
        # dissolve small valence-2 verts
        verts_to_dissolve = [v for v in bm.verts if v.is_valid and len(v.link_edges) == 2 and not v.is_boundary]
        if verts_to_dissolve:
            try:
                bmesh.ops.dissolve_verts(bm, verts=verts_to_dissolve)
            except Exception:
                pass

        # remove doubles via bmesh
        try:
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00035)
        except Exception:
            pass

        # fill holes (boundary edges)
        boundary_edges = [e for e in bm.edges if e.is_boundary]
        if boundary_edges:
            try:
                bmesh.ops.holes_fill(bm, edges=boundary_edges)
            except Exception:
                pass

        # delete isolated verts
        loose = [v for v in bm.verts if len(v.link_edges) == 0]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')

        bm.to_mesh(me)
        me.update()
    finally:
        bm.free()

# ---------------------------
# Operators
# ---------------------------

class ZEROAD_OT_apply_preset(bpy.types.Operator):
    bl_idname = "zero_ad.apply_preset"
    bl_label = "Apply AO Preset"
    preset: bpy.props.EnumProperty(
        items=[('STRUCTURE','Structure',''),('PROP','Prop',''),('TERRAIN','Terrain','')],
        default='STRUCTURE'
    )
    def execute(self, context):
        ao = context.scene.zero_ad_ao
        p = PRESETS[self.preset]
        ao.samples = p['samples']
        ao.distance = p['distance']
        ao.margin = p['margin']
        ao.resolution = p['resolution']
        self.report({'INFO'}, f"Preset {self.preset} applied.")
        return {'FINISHED'}


class ZEROAD_OT_analyze_and_clean(bpy.types.Operator):
    bl_idname = "zero_ad.analyze_clean"
    bl_label = "Analyze & Auto-Clean"
    bl_description = "Analyze selected meshes and run safe cleanup operations"

    def execute(self, context):
        sel = [o for o in context.selected_objects if o.type == 'MESH']
        if not sel:
            self.report({'ERROR'}, 'Select mesh objects to analyze')
            return {'CANCELLED'}

        ao = context.scene.zero_ad_ao
        for obj in sel:
            apply_transforms(obj) if ao.apply_transforms_before_bake else None
            # clear custom normals
            clear_custom_normals(obj.data)
            # recalc normals via operator
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode='EDIT')
            try:
                bpy.ops.mesh.normals_make_consistent(inside=False)
            except Exception:
                pass
            bpy.ops.object.mode_set(mode='OBJECT')

            merge_by_distance_op(obj, ao.merge_threshold)
            remove_loose_op(obj)
            fix_non_manifold_bmesh(obj)

        self.report({'INFO'}, 'Analyze & Auto-Clean finished')
        return {'FINISHED'}


class ZEROAD_OT_batch_bake(bpy.types.Operator):
    bl_idname = "zero_ad.batch_bake"
    bl_label = "Bake AO (Progress)"

    _timer = None
    start_time = 0
    baking = False
    obj = None
    img = None

    # --------------------------------------------------
    # CREATE TRANSPARENT IMAGE
    # --------------------------------------------------
    def create_transparent_image(self, name, res):

        img = bpy.data.images.new(
            name=name,
            width=res,
            height=res,
            alpha=True
        )

        # RGBA transparente
        pixels = [0.0, 0.0, 0.0, 0.0] * (res * res)
        img.pixels = pixels

        return img

    # --------------------------------------------------
    # START BAKE
    # --------------------------------------------------
    def start_bake(self, context):

        scene = context.scene
        ao = scene.zero_ad_ao

        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 64

        obj = context.active_object


        if not obj or obj.type != 'MESH':
            self.report({'ERROR'}, "Active mesh required")
            return False

        self.obj = obj

        # selecionar somente ele
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        context.view_layer.objects.active = obj

        # material
        if not obj.data.materials:
            mat = bpy.data.materials.new(name=f"AO_{obj.name}")
            mat.use_nodes = True
            obj.data.materials.append(mat)
        else:
            mat = obj.data.materials[0]
            mat.use_nodes = True

        nodes = mat.node_tree.nodes

        # imagem transparente
        img_name = f"{obj.name}_ao"
        self.img = self.create_transparent_image(
            img_name,
            ao.resolution
        )

        tex = nodes.new("ShaderNodeTexImage")
        tex.image = self.img
        nodes.active = tex

        bake = context.scene.render.bake
        bake.use_selected_to_active = False
        bake.margin = ao.margin

        # DISTÂNCIA DO AO (novo local)
        bake.max_ray_distance = ao.distance

        # iniciar bake
        bpy.ops.object.bake(
            'INVOKE_DEFAULT',
            type='AO',
            use_clear=False
        )

        self.start_time = time.time()
        self.baking = True

        return True

    # --------------------------------------------------
    # MODAL LOOP (FAKE MULTITHREAD)
    # --------------------------------------------------
    def modal(self, context, event):

        if event.type == 'TIMER':

            if self.baking:

                elapsed = time.time() - self.start_time

                # estimativa simples
                progress = min(elapsed / 10.0, 0.95)

                context.workspace.status_text_set(f"Baking AO... {int(progress*100)}%")

                # bake terminou quando não está mais em render
                if not bpy.app.is_job_running("OBJECT_BAKE"):
                    self.finish(context)
                    return {'FINISHED'}

        return {'PASS_THROUGH'}

    # --------------------------------------------------
    # FINALIZAÇÃO
    # --------------------------------------------------
    def finish(self, context):

        output_dir = os.path.expanduser("~/Documentos")
        os.makedirs(output_dir, exist_ok=True)

        filepath = os.path.join(
            output_dir,
            f"{self.img.name}.png"
        )

        self.img.filepath_raw = filepath
        self.img.file_format = 'PNG'
        adjust_output_levels(self.img, 30, 220)
        self.img.scale(1024, 1024)
        self.img.save()

        self.report({'INFO'}, f"Saved → {filepath}")


        context.window_manager.event_timer_remove(self._timer)
        context.workspace.status_text_set(None)

    # --------------------------------------------------
    # EXECUTE
    # --------------------------------------------------
    def execute(self, context):

        wm = context.window_manager


        if not self.start_bake(context):
            return {'CANCELLED'}

        self._timer = wm.event_timer_add(
            0.1,
            window=context.window
        )

        wm.modal_handler_add(self)

        return {'RUNNING_MODAL'}


# ---------------------------
# UI / Properties
# ---------------------------

class ZEROAD_AO_Props(bpy.types.PropertyGroup):

    home_dir = os.path.expanduser('~')
    output_dir = os.path.join(home_dir, "Documentos")

    samples: bpy.props.IntProperty(name='Samples', default=128, min=4, max=4096)
    resolution: bpy.props.IntProperty(name='Resolution', default=2048, min=64, max=8192)
    margin: bpy.props.IntProperty(name='Margin', default=8, min=0, max=64)
    distance: bpy.props.FloatProperty(name='AO Distance', default=0.6, min=0.01, max=10.0)
    image_name: bpy.props.StringProperty(name='Image Base Name', default='AO_BAKE')
    output_directory: bpy.props.StringProperty(name='Output Dir', subtype='DIR_PATH', default=output_dir)
    apply_transforms_before_bake: bpy.props.BoolProperty(name='Apply Transforms', default=True)
    triangulate_before_bake: bpy.props.BoolProperty(name='Triangulate Before Bake', default=True)
    merge_threshold: bpy.props.FloatProperty(name='Merge Threshold', default=0.0005, min=0.0, max=0.01)

class ZEROAD_PT_panel(bpy.types.Panel):
    bl_label = '0 A.D. AO Baker Pro'
    bl_idname = 'ZEROAD_PT_panel'
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = 'render'

    def draw(self, context):
        layout = self.layout
        ao = context.scene.zero_ad_ao

        row = layout.row()
        row.prop(ao, 'resolution')
        row.prop(ao, 'samples')

        layout.prop(ao, 'distance')
        layout.prop(ao, 'margin')

        layout.prop(ao, 'image_prefix')
        layout.prop(ao, 'output_directory')

        layout.separator()
        layout.label(text='Presets')
        row = layout.row(align=True)
        row.operator('zero_ad.apply_preset', text='Structure').preset = 'STRUCTURE'
        row.operator('zero_ad.apply_preset', text='Prop').preset = 'PROP'
        row.operator('zero_ad.apply_preset', text='Terrain').preset = 'TERRAIN'

        layout.separator()
        layout.operator('zero_ad.analyze_clean', icon='MOD_NORMALEDIT')
        layout.operator('zero_ad.batch_bake', icon='RENDER_STILL')

# ---------------------------
# Register
# ---------------------------

classes = (
    ZEROAD_AO_Props,
    ZEROAD_OT_apply_preset,
    ZEROAD_OT_analyze_and_clean,
    ZEROAD_OT_batch_bake,
    ZEROAD_PT_panel,
)

def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.zero_ad_ao = bpy.props.PointerProperty(type=ZEROAD_AO_Props)

def unregister():
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
    del bpy.types.Scene.zero_ad_ao

if __name__ == '__main__':
    register()
