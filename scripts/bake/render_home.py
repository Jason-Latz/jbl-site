"""Render the homepage desk and its photographic prints with Blender/Cycles.

Keep the desktop camera framing and 16:10 crop aligned with the HTML sheet.
"""

import argparse
import json
from pathlib import Path
import math
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_ab import add_light, look_at, make_pure_emission, marker, set_world, t2b


def matte(name, color, roughness=0.73):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    return material, shader


def piece(name, location, dimensions, angle, material, edge):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = math.radians(angle)
    bevel = obj.modifiers.new("Cut edge", "BEVEL")
    bevel.width = edge
    bevel.segments = 3
    obj.data.materials.append(material)
    return obj


def photograph(path, x, y, width, angle, z, border):
    image = bpy.data.images.load(str(path), check_existing=True)
    height = width * image.size[1] / image.size[0]
    stock = piece(path.stem + " print", (x, y, z), (width + 0.012, height + 0.014, 0.0014),
                  angle, border, 0.00055)

    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y + 0.001, z + 0.00074))
    ink = bpy.context.object
    ink.name = path.stem + " emulsion"
    ink.dimensions = (width, height, 0)
    ink.rotation_euler.z = math.radians(angle)
    material, shader = matte(ink.name, (1, 1, 1), 0.66)
    texture = material.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    ink.data.materials.append(material)
    return stock


def surface_finish(name, color, roughness, metal=0, emission=0):
    material, shader = matte(name, color, roughness)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = emission
    return material


def controls(framing):
    case = surface_finish("Control rail · blackened brass", (0.062, 0.038, 0.024), 0.45, 0.72)
    face = surface_finish("Keycaps · satin bronze", (0.16, 0.093, 0.052), 0.42, 0.67)
    legends = surface_finish("Warm etched legends", (0.92, 0.73, 0.53), 0.55, emission=0.44)
    amber = surface_finish("Amber status LEDs", (1, 0.35, 0.08), 0.5, emission=1.8)
    labels = ("Desk", "Writings", "Travel", "Photography", "Experience")
    if framing == "mobile":
        layout = [(-0.171, 0.515), (0, 0.515), (0.171, 0.515), (-0.0855, 0.446), (0.0855, 0.446)]
        stations = [(0.515, 0.511), (0.446, 0.34)]
        width, height = 0.160, 0.049
    else:
        spacing = 0.202 if framing == "desktop" else 0.168
        layout = [((i - 2) * spacing, 0.511) for i in range(len(labels))]
        stations = [(0.511, spacing * 5)]
        width, height = spacing - 0.012, 0.050
    for y, rail_width in stations:
        piece("Control rail", (0, y, 0.025), (rail_width, 0.070, 0.040), 0, case, 0.009)

    keys = {}
    for label, (x, y) in zip(labels, layout):
        keys[label.lower()] = piece(label + " key", (x, y, 0.054), (width, height, 0.022), 0, face, 0.005)
        curve = bpy.data.curves.new(label, "FONT")
        curve.body = label.upper()
        curve.align_x = "CENTER"
        curve.align_y = "CENTER"
        curve.size = 0.018
        curve.space_character = 1.04
        curve.extrude = 0.00014
        curve.materials.append(legends)
        text = bpy.data.objects.new(label + " legend", curve)
        text.location = (x, y + 0.002, 0.0653)
        bpy.context.scene.collection.objects.link(text)
        piece(label + " edge light", (x, y - height * 0.34, 0.0653), (width * 0.15, 0.0018, 0.001), 0, amber, 0.0004)
    return keys


def move_prop(name, x, y, scale):
    prop = bpy.data.objects[name]
    prop.location.x = x
    prop.location.y = y
    prop.scale *= scale
    return prop


def bounds(scene, camera, obj):
    vertices = [
        world_to_camera_view(scene, camera, part.matrix_world @ Vector(vertex))
        for part in [obj, *obj.children_recursive] if part.type == "MESH"
        for vertex in part.bound_box
    ]
    left, right = min(v.x for v in vertices), max(v.x for v in vertices)
    top, bottom = 1 - max(v.y for v in vertices), 1 - min(v.y for v in vertices)
    return [round(v * 100, 4) for v in (left, top, right - left, bottom - top)]


def render(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.glb.resolve()))
    bpy.context.view_layer.update()
    scene = bpy.context.scene

    for obj in [item for item in bpy.data.objects if item.type == "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    for name in ("macbook", "notepad", "photoStack"):
        root = bpy.data.objects.get(name)
        if root is not None:
            root.hide_render = True
            for child in root.children_recursive:
                child.hide_render = True
    prop_camera = next((obj for obj in bpy.data.objects if obj.name.startswith("filmCamera") and obj.parent is None), None)
    if prop_camera is not None:
        prop_camera.location.x -= 0.27

    camera_data = bpy.data.cameras.new("Overhead desk")
    camera_data.type = "ORTHO"
    camera_data.sensor_fit = "VERTICAL"
    camera_data.ortho_scale = 1.12
    camera = bpy.data.objects.new("Overhead desk", camera_data)
    camera.location = t2b(0, 1.3, 0.001)
    scene.collection.objects.link(camera)
    look_at(camera, t2b(0, 0, 0))
    scene.camera = camera

    framing = args.framing
    lamp_origin = bpy.data.objects["lamp"].matrix_world.translation.copy()
    lamp_scale = {"desktop": 1, "tablet": 0.61, "mobile": 0.39}[framing]
    if prop_camera is not None and framing == "tablet":
        prop_camera.location.x = -0.195
        prop_camera.location.y = 0.365
    if prop_camera is not None and framing == "mobile":
        prop_camera.hide_render = True
        for part in prop_camera.children_recursive:
            part.hide_render = True
    edge, _ = matte("Cotton print stock", (0.78, 0.69, 0.55))
    objects = controls(framing)
    if framing == "mobile":
        objects.update(
            lamp=move_prop("lamp", -0.207, 0.295, lamp_scale),
            records=move_prop("turntable", -0.106, -0.213, 0.61),
            chess=move_prop("chessboard", 0.157, -0.272, 0.51),
            phoenix=photograph(args.phoenix, -0.145, 0.052, 0.159, 12, 0.002, edge),
            switzerland=photograph(args.switzerland, 0.122, 0.235, 0.139, -10, 0.004, edge),
            chicago=photograph(args.chicago, 0.145, 0.022, 0.111, 9, 0.0025, edge),
        )
    elif framing == "tablet":
        objects.update(
            lamp=move_prop("lamp", -0.391, 0.29, lamp_scale),
            records=move_prop("turntable", -0.258, -0.162, 0.83),
            chess=move_prop("chessboard", 0.261, -0.2, 0.77),
            phoenix=photograph(args.phoenix, 0.035, 0.28, 0.164, 13, 0.002, edge),
            switzerland=photograph(args.switzerland, 0.224, 0.29, 0.126, -11, 0.004, edge),
            chicago=photograph(args.chicago, 0.366, 0.263, 0.102, 9, 0.0025, edge),
        )
    else:
        objects.update(
            lamp=bpy.data.objects["lamp"],
            records=bpy.data.objects["turntable"],
            chess=bpy.data.objects["chessboard"],
            phoenix=photograph(args.phoenix, -0.17, 0.315, 0.208, 13, 0.002, edge),
            switzerland=photograph(args.switzerland, 0.055, 0.304, 0.137, -11, 0.004, edge),
            chicago=photograph(args.chicago, 0.227, 0.302, 0.128, 10, 0.0025, edge),
        )

    if framing == "desktop":
        paper, surface = matte("Uncoated writing paper", (0.86, 0.77, 0.64), 0.88)
        nodes = paper.node_tree.nodes
        fibres = nodes.new("ShaderNodeTexNoise")
        fibres.inputs["Scale"].default_value = 250
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.10
        bump.inputs["Distance"].default_value = 0.0005
        paper.node_tree.links.new(fibres.outputs["Fac"], bump.inputs["Height"])
        paper.node_tree.links.new(bump.outputs["Normal"], surface.inputs["Normal"])
        objects["sheet"] = piece("Writing sheet", (0.014, -0.137, 0.002), (0.70, 0.54, 0.0022), 0, paper, 0.0008)

    bpy.context.view_layer.update()
    light = args.theme == "light"
    backdrop = bpy.data.objects.get("windowBackdropNight")
    if backdrop is not None:
        backdrop.visible_shadow = False
        make_pure_emission(backdrop, 3.0)
    if light:
        position = objects["lamp"].matrix_world.translation.copy()
        head = position + (marker("MARKER_lampHead") - lamp_origin) * lamp_scale
        target = position + (marker("MARKER_lampTarget") - lamp_origin) * lamp_scale
        lamp = add_light("Lamp", "SPOT", head, 24 * lamp_scale ** 2, (1, 0.78, 0.56),
                         spot_size=1.24, spot_blend=0.81, shadow_soft_size=0.035 * lamp_scale)
        look_at(lamp, target)
    fill = add_light("Wall bounce", "AREA", t2b(0.48, 1.6, 0.60),
                     41 if light else 23, (1.0, 0.91, 0.79) if light else (1.0, 0.78, 0.63), size=1.64)
    look_at(fill, t2b(0.12, 0, 0.05))
    set_world((0.40, 0.33, 0.25), 0.05 if light else 0.035)

    scene.render.engine = "CYCLES"
    if not args.cpu:
        try:
            preferences = bpy.context.preferences.addons["cycles"].preferences
            preferences.compute_device_type = "METAL"
            preferences.get_devices()
            for device in preferences.devices:
                device.use = device.type == "METAL"
            if any(device.use for device in preferences.devices):
                scene.cycles.device = "GPU"
        except RuntimeError:
            pass
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.35 if light else 0.55

    scene.render.resolution_x = args.width
    scene.render.resolution_y = round(args.width * {"desktop": 10 / 16, "tablet": 1, "mobile": 5 / 3}[framing])
    if args.hotspots:
        args.hotspots.parent.mkdir(parents=True, exist_ok=True)
        args.hotspots.write_text(json.dumps({name: bounds(scene, camera, obj) for name, obj in objects.items()}, indent=2) + "\n")
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(args.output.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("glb", "chicago", "phoenix", "switzerland", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--theme", choices=("light", "dark"), default="light")
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--samples", type=int, default=96)
    parser.add_argument("--framing", choices=("desktop", "tablet", "mobile"), default="desktop")
    parser.add_argument("--hotspots", type=Path, help="Write projected object boxes as percentages of the image.")
    parser.add_argument("--cpu", action="store_true")
    render(parser.parse_args(sys.argv[sys.argv.index("--") + 1:]))
