"""Render the homepage desk and its photographic prints with Blender/Cycles.

Keep the desktop camera framing and 16:10 crop aligned with the HTML sheet.
"""

import argparse
from pathlib import Path
import math
import sys

import bpy

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
    piece(path.stem + " print", (x, y, z), (width + 0.012, height + 0.014, 0.0014),
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

    edge, _ = matte("Cotton print stock", (0.78, 0.69, 0.55))
    if args.mobile:
        photograph(args.phoenix, -0.16, 0.12, 0.25, 13, 0.002, edge)
        photograph(args.switzerland, 0.10, 0.17, 0.20, -12, 0.004, edge)
        photograph(args.chicago, 0.145, -0.12, 0.19, 9, 0.0025, edge)
    else:
        photograph(args.phoenix, -0.17, 0.315, 0.208, 13, 0.002, edge)
        photograph(args.switzerland, 0.055, 0.304, 0.137, -11, 0.004, edge)
        photograph(args.chicago, 0.227, 0.302, 0.128, 10, 0.0025, edge)

    if not args.mobile:
        paper, surface = matte("Uncoated writing paper", (0.86, 0.77, 0.64), 0.88)
        nodes = paper.node_tree.nodes
        fibres = nodes.new("ShaderNodeTexNoise")
        fibres.inputs["Scale"].default_value = 250
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.10
        bump.inputs["Distance"].default_value = 0.0005
        paper.node_tree.links.new(fibres.outputs["Fac"], bump.inputs["Height"])
        paper.node_tree.links.new(bump.outputs["Normal"], surface.inputs["Normal"])
        piece("Writing sheet", (0.014, -0.137, 0.002), (0.70, 0.54, 0.0022), 0, paper, 0.0008)

    light = args.theme == "light"
    backdrop = bpy.data.objects.get("windowBackdropNight")
    if backdrop is not None:
        backdrop.visible_shadow = False
        make_pure_emission(backdrop, 3.0)
    if light:
        lamp = add_light("Lamp", "SPOT", marker("MARKER_lampHead"), 24, (1, 0.78, 0.56),
                         spot_size=1.24, spot_blend=0.81, shadow_soft_size=0.035)
        look_at(lamp, marker("MARKER_lampTarget"))
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
    scene.render.resolution_y = round(args.width * (5 / 3 if args.mobile else 10 / 16))
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
    parser.add_argument("--mobile", action="store_true", help="Omit the sheet for the mobile layout.")
    parser.add_argument("--cpu", action="store_true")
    render(parser.parse_args(sys.argv[sys.argv.index("--") + 1:]))
