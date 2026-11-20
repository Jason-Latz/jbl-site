"""Render the seven homepage keycaps as a two-column transparent atlas."""

import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_ab import add_light, look_at, set_world
from render_home import matte, piece


def material(name, color, roughness, metal=0, emission=0):
    result, shader = matte(name, color, roughness)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = emission
    return result


def keycap(label, x, y, materials):
    socket, copper, diffuser, enamel, lettering = materials
    layers = [
        (socket, 0.027, 1.48, 0.50, 0.060, 0.061),
        (copper, 0.066, 1.42, 0.45, 0.037, 0.048),
        (diffuser, 0.084, 1.38, 0.416, 0.015, 0.045),
        (enamel, 0.101, 1.345, 0.380, 0.024, 0.042),
    ]
    for finish, z, width, height, depth, edge in layers:
        # Apply the rounded XY profile to a deeper blank, then flatten it.
        cap = piece(f"{label} {finish.name}", (x, y, z), (width, height, 2 * edge + 0.01),
                    0, finish, edge)
        cap.modifiers[0].segments = 6
        cap.scale.z = depth / (2 * edge + 0.01)

    curve = bpy.data.curves.new(label, "FONT")
    curve.body = label
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = 0.141
    curve.space_character = 1.10
    curve.extrude = 0.0018
    curve.bevel_depth = 0.0007
    curve.materials.append(lettering)
    text = bpy.data.objects.new(f"{label} raised lettering", curve)
    text.location = (x, y, 0.115)
    bpy.context.scene.collection.objects.link(text)


def render(output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    width, height = 1.6, 0.66
    camera_data = bpy.data.cameras.new("Keycap product camera")
    camera_data.type = "ORTHO"
    camera_data.sensor_fit = "HORIZONTAL"
    camera_data.ortho_scale = width * 2
    camera = bpy.data.objects.new("Keycap product camera", camera_data)
    camera.location = (0, -2.45, 6.8)
    scene.collection.objects.link(camera)
    look_at(camera, Vector((0, 0, 0.067)))
    scene.camera = camera
    pitch = (6.8 - 0.067) / math.hypot(6.8 - 0.067, 2.45)

    materials = (
        material("Black rubber socket", (0.022, 0.016, 0.013), 0.7),
        material("Aged copper", (0.36, 0.14, 0.054), 0.32, metal=0.80),
        material("Amber edge light", (1.0, 0.32, 0.08), 0.38, emission=3.3),
        material("Satin graphite enamel", (0.057, 0.036, 0.025), 0.43, metal=0.2),
        material("Ivory lettering", (1.0, 0.80, 0.52), 0.42, emission=0.22),
    )
    labels = ("JASON LATZ", "DESK", "WRITINGS", "TRAVEL", "PHOTOGRAPHY", "EXPERIENCE", "LAMP")
    for index, label in enumerate(labels):
        keycap(label, (index % 2 - 0.5) * width, (1.5 - index // 2) * height / pitch, materials)

    key = add_light("Softbox", "AREA", (-1.4, -1.1, 2.0), 155, (1, 0.83, 0.65), size=2.6)
    look_at(key, Vector((0, 0, 0)))
    fill = add_light("Back strip", "AREA", (1.5, 1.9, 1.15), 100, (1, 0.70, 0.42), size=1.8)
    look_at(fill, Vector((0, 0, 0)))
    set_world((0.37, 0.29, 0.22), 0.13)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 528
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "AgX"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(output.resolve())
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    render(parser.parse_args(sys.argv[sys.argv.index("--") + 1:]).output)
