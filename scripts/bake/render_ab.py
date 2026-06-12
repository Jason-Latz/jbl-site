"""Cycles A/B still renderer for The Desk room-concept bake-off.

Run headless via Blender (5.x):

  blender -b --python scripts/bake/render_ab.py -- \
    --glb bake/desk-void-light.glb --room void --theme light \
    --out bake/renders [--samples 384] [--exposure 0.0] [--save-blend]

Imports the GLB exported by /bake (real scene, real canvas textures, marker
empties), rebuilds the light rig for the requested room concept + theme in
Cycles, and renders one path-traced still. The GLB's KHR punctual lights
(the runtime spot/point lights that rode along in the export) are deleted —
Cycles gets its own physically-sized rig.

Coordinate note: glTF is Y-up, Blender is Z-up. The importer converts
geometry automatically; hand-placed light positions written in three.js
coordinates go through t2b() below.
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    parser.add_argument("--room", choices=["void", "window"], required=True)
    parser.add_argument("--theme", choices=["light", "dark"], required=True)
    parser.add_argument("--out", default="bake/renders")
    parser.add_argument("--samples", type=int, default=384)
    parser.add_argument("--resx", type=int, default=1536)
    parser.add_argument("--resy", type=int, default=960)
    parser.add_argument("--exposure", type=float, default=None)
    parser.add_argument("--lamp-watts", type=float, default=8.0)
    parser.add_argument("--save-blend", action="store_true")
    return parser.parse_args(argv)


def t2b(x, y, z):
    """three.js (Y-up) point -> Blender (Z-up) point."""
    return Vector((x, -z, y))


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def marker(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        raise RuntimeError(f"marker {name} missing from GLB")
    return obj.matrix_world.translation.copy()


def add_light(name, kind, location, energy, color, **props):
    data = bpy.data.lights.new(name, type=kind)
    data.energy = energy
    data.color = color
    for key, value in props.items():
        setattr(data, key, value)
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    return obj


def set_world(color, strength):
    world = bpy.data.worlds.new("BakeWorld")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs[0].default_value = (*color, 1.0)
    background.inputs[1].default_value = strength
    bpy.context.scene.world = world


def make_emissive(obj, strength):
    """Rewire a backdrop's principled material so its base-color texture
    emits light (mesh light through the window)."""
    for slot in obj.material_slots:
        material = slot.material
        if material is None or not material.use_nodes:
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        principled = next(
            (n for n in nodes if n.type == "BSDF_PRINCIPLED"), None
        )
        if principled is None:
            continue
        base = principled.inputs["Base Color"]
        emission_color = principled.inputs["Emission Color"]
        emission_strength = principled.inputs["Emission Strength"]
        if base.is_linked:
            links.new(base.links[0].from_socket, emission_color)
        else:
            emission_color.default_value = base.default_value
        emission_strength.default_value = strength


def main():
    args = parse_args()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    bpy.context.view_layer.update()

    scene = bpy.context.scene

    # The runtime lights that rode along in the export are not the rig.
    for obj in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    # ——— Camera from markers ———
    cam_pos = marker("MARKER_camPos")
    cam_target = marker("MARKER_camTarget")
    cam_data = bpy.data.cameras.new("HeroCam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(40.0)  # CAMERA.fov in layout.ts
    cam_obj = bpy.data.objects.new("HeroCam", cam_data)
    cam_obj.location = cam_pos
    scene.collection.objects.link(cam_obj)
    look_at(cam_obj, cam_target)
    scene.camera = cam_obj

    # ——— Light rig ———
    lamp_on = args.theme == "light"

    if lamp_on:
        head = marker("MARKER_lampHead")
        target = marker("MARKER_lampTarget")
        spot = add_light(
            "LampSpot",
            "SPOT",
            head,
            args.lamp_watts,
            (1.0, 0.78, 0.55),
            spot_size=1.24,  # runtime three.js half-angle 0.62
            spot_blend=0.85,
            shadow_soft_size=0.02,
        )
        look_at(spot, target)

    if args.room == "void":
        if args.theme == "light":
            key = add_light(
                "VoidKey", "AREA", t2b(1.5, 1.7, 1.3), 120.0,
                (1.0, 0.94, 0.87), size=1.5,
            )
            look_at(key, (0, 0, 0))
            fill = add_light(
                "VoidTopFill", "AREA", t2b(0.0, 2.2, 0.4), 35.0,
                (1.0, 0.93, 0.86), size=2.0,
            )
            look_at(fill, (0, 0, 0))
            set_world((0.35, 0.28, 0.2), 0.02)
        else:
            ember = add_light(
                "EmberFill", "AREA", t2b(0.0, 1.4, 0.3), 1.5,
                (1.0, 0.55, 0.3), size=1.2,
            )
            look_at(ember, (0, 0, 0))
            set_world((0.3, 0.18, 0.1), 0.015)
    else:  # window room
        night = bpy.data.objects.get("windowBackdropNight")
        day = bpy.data.objects.get("windowBackdropDay")
        if args.theme == "light":
            if night:
                night.hide_render = True
            if day:
                day.hide_render = False
                make_emissive(day, 5.0)
            sun_dir = t2b(-0.8, -0.45, -0.25)
            sun = add_light(
                "WindowSun", "SUN", t2b(2.5, 2.0, 0.4), 0.0,
                (1.0, 0.96, 0.9), angle=math.radians(3.0),
            )
            sun.data.energy = 2.5
            sun.rotation_euler = sun_dir.to_track_quat("-Z", "Y").to_euler()
            set_world((0.5, 0.45, 0.4), 0.05)
        else:
            if day:
                day.hide_render = True
            if night:
                night.hide_render = False
                make_emissive(night, 3.0)
            moon = add_light(
                "Moon", "AREA", t2b(2.3, 1.7, 0.1), 8.0,
                (0.7, 0.8, 1.0), size=0.8,
            )
            look_at(moon, (0, 0, 0))
            ember = add_light(
                "EmberFill", "AREA", t2b(0.0, 1.4, 0.3), 1.0,
                (1.0, 0.55, 0.3), size=1.2,
            )
            look_at(ember, (0, 0, 0))
            set_world((0.06, 0.08, 0.13), 0.02)

    # ——— Cycles on Metal ———
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = True
    scene.cycles.device = "GPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True

    scene.render.resolution_x = args.resx
    scene.render.resolution_y = args.resy
    scene.render.film_transparent = False

    try:
        scene.view_settings.view_transform = "Filmic"
        scene.view_settings.look = "Medium High Contrast"
    except Exception:
        pass  # AgX default is acceptable
    if args.exposure is not None:
        scene.view_settings.exposure = args.exposure
    elif args.theme == "dark":
        scene.view_settings.exposure = 0.6

    os.makedirs(args.out, exist_ok=True)
    scene.render.filepath = os.path.join(
        os.path.abspath(args.out), f"{args.room}-{args.theme}.png"
    )
    scene.render.image_settings.file_format = "PNG"

    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(
            filepath=os.path.join(
                os.path.abspath(args.out), f"{args.room}-{args.theme}.blend"
            )
        )

    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {scene.render.filepath}")


main()
