"""Cycles lightmap bake for The Desk (Stage C of the freeze-dry pipeline).

Imports the uv1 GLB produced by build_uv1.mjs (every primitive is a self-
contained "bake unit" with its own material + TEXCOORD_1 atlas), rebuilds the
APPROVED light rig from render_ab.py for the requested lamp state, and bakes the
diffuse lighting (direct+indirect, color OFF = irradiance only) into one image
per unit. The runtime multiplies its live albedo by these lightmaps and lerps
between the two states with the lamp toggle.

Run (headless, Metal GPU):
  /Applications/Blender.app/Contents/MacOS/Blender -b \
    --python scripts/bake/bake_lightmaps.py -- \
    --glb bake/desk-window-uv1.glb --rig bake/rig.json \
    --manifest bake/bake_manifest.json --state on \
    --out bake/lightmaps --res-cap 512 --samples 64

State 'on' = light theme (lamp lit + warm room practicals); 'off' = dark theme
(moonlit window + ember). Coordinates: rig.json holds three.js (Y-up) world
positions; t2b() swaps them into Blender's Z-up like render_ab does.
"""

import argparse
import json
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--glb", required=True)
    p.add_argument("--rig", required=True)
    p.add_argument("--manifest", required=True)
    p.add_argument("--state", choices=["on", "off"], required=True)
    p.add_argument("--out", default="bake/lightmaps")
    p.add_argument("--res-cap", type=int, default=512)
    p.add_argument("--res-min", type=int, default=64)
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--margin", type=int, default=8)
    p.add_argument("--lamp-watts", type=float, default=18.0)
    p.add_argument("--limit", type=int, default=0, help="bake only first N units (debug)")
    p.add_argument("--save-blend", action="store_true")
    return p.parse_args(argv)


def t2b(x, y, z):
    """three.js (Y-up) world point -> Blender (Z-up)."""
    return Vector((x, -z, y))


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def add_light(name, kind, location, energy, color, **props):
    data = bpy.data.lights.new(name, type=kind)
    data.energy = energy
    data.color = color
    for k, v in props.items():
        setattr(data, k, v)
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    return obj


def set_world(color, strength):
    world = bpy.data.worlds.new("BakeWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*color, 1.0)
    bg.inputs[1].default_value = strength
    bpy.context.scene.world = world


def build_rig(rig, state, lamp_watts):
    """Reproduce render_ab.py's window-room rig (the approved look)."""
    if state == "on":
        # lamp on + warm room practicals
        head = Vector(rig["MARKER_lampHead"])
        target = Vector(rig["MARKER_lampTarget"])
        spot = add_light(
            "LampSpot", "SPOT",
            t2b(head.x, head.y, head.z), lamp_watts, (1.0, 0.78, 0.55),
            spot_size=1.24, spot_blend=0.85, shadow_soft_size=0.02,
        )
        look_at(spot, t2b(target.x, target.y, target.z))
        key = add_light("RoomKey", "AREA", t2b(0.9, 1.8, 1.1), 40.0,
                        (1.0, 0.93, 0.85), size=1.5)
        look_at(key, (0, 0, 0))
        fill = add_light("RoomFill", "AREA", t2b(-0.9, 1.6, 0.9), 16.0,
                         (1.0, 0.9, 0.8), size=1.6)
        look_at(fill, (0, 0, 0))
        set_world((0.4, 0.33, 0.26), 0.04)
    else:
        # moonlit night + ember, lamp dark
        moon = add_light("Moon", "AREA", t2b(-0.3, 1.8, -1.9), 18.0,
                         (0.72, 0.8, 1.0), size=1.1)
        look_at(moon, t2b(0.1, 0, 0.2))
        ember = add_light("EmberFill", "AREA", t2b(0.0, 1.4, 0.4), 0.9,
                          (1.0, 0.55, 0.3), size=1.2)
        look_at(ember, (0, 0, 0))
        set_world((0.06, 0.08, 0.13), 0.02)


def setup_unit_image(mat, image):
    """Give a material a dedicated image-tex node and make it the bake target."""
    if not mat.use_nodes:
        mat.use_nodes = True
    tree = mat.node_tree
    node = tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    node.select = True
    tree.nodes.active = node
    return node


def main():
    args = parse_args()
    manifest = {m["unit"]: m for m in json.load(open(args.manifest))}
    rig = json.load(open(args.rig))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    bpy.context.view_layer.update()
    scene = bpy.context.scene

    # drop KHR punctual lights that rode along
    for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o, do_unlink=True)

    build_rig(rig, args.state, args.lamp_watts)

    # ——— Cycles / Metal ———
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    # Clamp bright indirect samples. Without this a single glossy/near-light
    # firefly survives the denoiser and bakes a hard white speck into a texel
    # (it recurred every bake because the Cycles seed is fixed) — Jason saw one
    # as a stray bright spot on the desk in front of the laptop. Diffuse GI we
    # actually want sits well under 3.0, so this only decapitates the spikes.
    scene.cycles.sample_clamp_indirect = 3.0

    bake = scene.render.bake
    bake.use_pass_direct = True
    bake.use_pass_indirect = True
    bake.use_pass_color = False
    bake.margin = args.margin
    bake.use_selected_to_active = False

    # ——— per-unit: image + active uv1 + bake-target node ———
    mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
    images = {}
    baked_objs = []
    n_units = 0
    for obj in mesh_objs:
        # activate the second UV layer (TEXCOORD_1 / lightmap uv)
        uvs = obj.data.uv_layers
        if len(uvs) >= 2:
            uvs.active_index = 1
        used = False
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None:
                continue
            unit = mat.name[:-4] if mat.name.endswith("_mat") else mat.name
            m = manifest.get(unit)
            res = m["res"] if m else args.res_cap
            res = max(args.res_min, min(args.res_cap, res))
            img = bpy.data.images.new(
                f"{unit}-{args.state}", width=res, height=res, float_buffer=True
            )
            img.colorspace_settings.name = "Non-Color"
            setup_unit_image(mat, img)
            images[unit] = img
            used = True
            n_units += 1
            if args.limit and n_units >= args.limit:
                break
        if used:
            baked_objs.append(obj)
        if args.limit and n_units >= args.limit:
            break

    print(f"BAKE: {n_units} units, state={args.state}, samples={args.samples}, res-cap={args.res_cap}")

    # select only the objects we set up (so --limit runs don't bake
    # materials with no active image node), bake in one pass.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in baked_objs:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = baked_objs[0]

    bpy.ops.object.bake(type="DIFFUSE")

    os.makedirs(args.out, exist_ok=True)
    for unit, img in images.items():
        img.filepath_raw = os.path.join(os.path.abspath(args.out), f"{unit}-{args.state}.png")
        img.file_format = "PNG"
        img.save()
    print(f"BAKE DONE: wrote {len(images)} lightmaps to {args.out}")

    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(
            filepath=os.path.join(os.path.abspath(args.out), f"bake-{args.state}.blend")
        )


main()
