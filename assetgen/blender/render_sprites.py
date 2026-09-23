"""Blender (5.x) sprite renderer for AI-generated GLB assets.

blender -b -P render_sprites.py -- --glb in.glb --id trooper --kind unit --anim walk \
        --fit 0.95 --out ../../public/sprites --dirs 16 --frames 4 --teams 3d9bff,ff4d4d

Output: <out>/<id>.png (sheet: columns = directions, rows = team x frame) and <out>/<id>.json
(cell size, anchor = pixel of the ground centre, px per tile, layout). Also <id>_turn.png: a
24-frame turntable strip used for the HUD portrait.
"""
import bpy, bmesh, sys, os, json, math, argparse, time
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--glb", required=True)
ap.add_argument("--id", required=True)
ap.add_argument("--kind", default="unit")              # unit | building | resource
ap.add_argument("--anim", default="none")              # walk | quad | serpent | hover | vehicle | pulse | none
ap.add_argument("--fit", type=float, default=1.0)      # footprint in tiles (unit diameter / building size)
ap.add_argument("--depth", type=float, default=0)      # resource footprint depth (tiles) when not square
ap.add_argument("--yaw", type=float, default=0)        # degrees to rotate so model faces +X
ap.add_argument("--air", type=float, default=0)        # altitude (tiles) - rendered without ground shadow
ap.add_argument("--dirs", type=int, default=16)
ap.add_argument("--frames", type=int, default=4)
ap.add_argument("--teams", default="3d9bff,ff4d4d")
ap.add_argument("--ppt", type=float, default=48)       # pixels per tile
ap.add_argument("--samples", type=int, default=20)
ap.add_argument("--out", required=True)
ap.add_argument("--elev", type=float, default=48)
a = ap.parse_args(argv)
a.out = os.path.abspath(a.out); a.glb = os.path.abspath(a.glb)
os.makedirs(a.out, exist_ok=True)
T0 = time.time()

# ------------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev_type in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = dev_type
        prefs.get_devices()
        if any(d.type == dev_type for d in prefs.devices):
            for d in prefs.devices: d.use = d.type == dev_type
            scene.cycles.device = "GPU"
            break
    except Exception:
        continue
scene.cycles.samples = a.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.3
except Exception:
    pass

# world: studio HDRI for reflections + dim ambient
world = bpy.data.worlds.new("W"); scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
bg = wn.get("Background") or wn.new("ShaderNodeBackground")
hdri_dir = os.path.join(os.path.dirname(bpy.app.binary_path), f"{bpy.app.version[0]}.{bpy.app.version[1]}", "datafiles", "studiolights", "world")
hdri = next((os.path.join(hdri_dir, f) for f in ("city.exr", "courtyard.exr", "forest.exr") if os.path.exists(os.path.join(hdri_dir, f))), None)
if hdri:
    env = wn.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(hdri)
    wl.new(env.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 0.8
out_node = wn.get("World Output") or wn.new("ShaderNodeOutputWorld")
wl.new(bg.outputs["Background"], out_node.inputs["Surface"])

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 3.6; sun.data.angle = math.radians(6)
sun.rotation_euler = (math.radians(40), math.radians(-28), math.radians(-35))  # light from upper-left of screen
scene.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 0.6; fill.rotation_euler = (math.radians(60), math.radians(30), math.radians(150))
scene.collection.objects.link(fill)
rim = bpy.data.objects.new("Rim", bpy.data.lights.new("Rim", "SUN"))
rim.data.energy = 2.2; rim.data.color = (0.65, 0.8, 1.0); rim.data.use_shadow = False
fill.data.use_shadow = False
rim.rotation_euler = (math.radians(-55), 0, 0)          # from behind/above the model, toward the camera
scene.collection.objects.link(rim)

# ------------------------------------------------------------------ import + normalise
bpy.ops.import_scene.gltf(filepath=a.glb)
meshes = [o for o in scene.objects if o.type == "MESH"]
for o in scene.objects: o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
for o in list(scene.objects):
    if o.type == "EMPTY" and o != obj:
        bpy.data.objects.remove(o)
obj.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
obj.rotation_euler = (0, 0, math.radians(a.yaw))
bpy.ops.object.transform_apply(rotation=True)
bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
size = mx - mn
if a.kind == "unit":
    s = a.fit / max(size.x, size.y)
elif a.kind == "resource" and a.depth:
    s = min(a.fit / size.x, a.depth / size.y)
else:
    s = a.fit / max(size.x, size.y)
obj.location = (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)
bpy.ops.object.transform_apply(location=True)
obj.scale = (s, s, s)
bpy.ops.object.transform_apply(scale=True)
height = size.z * s
me = obj.data
base_co = [v.co.copy() for v in me.vertices]
zmax = max(v.z for v in base_co) or 1
obj.data.shade_smooth() if hasattr(obj.data, "shade_smooth") else None
# TRELLIS exports metallicFactor 1.0 with no metallic map: everything becomes a dark mirror. Use satin metal.
for m in obj.data.materials:
    if not m or not m.use_nodes: continue
    b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not b: continue
    if not b.inputs["Metallic"].is_linked: b.inputs["Metallic"].default_value = 0.3
    if not b.inputs["Roughness"].is_linked: b.inputs["Roughness"].default_value = 0.55

# ------------------------------------------------------------------ team colour key (hue ~ blue)
def team_nodes(color_hex):
    col = tuple(int(color_hex[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)
    for m in obj.data.materials:
        if not m or not m.use_nodes: continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf: continue
        link = next((l for l in nt.links if l.to_socket == bsdf.inputs["Base Color"]), None)
        mix = nt.nodes.get("TEAM_MIX")
        if not mix:
            if not link: continue
            # lift dim AI textures (their concept lighting is baked in) so they read at sprite scale
            boost = nt.nodes.new("ShaderNodeHueSaturation")
            boost.inputs["Value"].default_value = 1.1
            boost.inputs["Saturation"].default_value = 1.08
            nt.links.new(link.from_socket, boost.inputs["Color"])
            src = boost.outputs["Color"]
            hsv = nt.nodes.new("ShaderNodeSeparateColor"); hsv.mode = "HSV"; hsv.name = "TEAM_HSV"
            nt.links.new(src, hsv.inputs[0])
            # mask = hue in [0.56, 0.72] * saturation > 0.35 * value > 0.12
            def rng(inp, lo, hi):
                r = nt.nodes.new("ShaderNodeMapRange"); r.inputs["From Min"].default_value = lo; r.inputs["From Max"].default_value = hi
                nt.links.new(inp, r.inputs["Value"]); return r
            h1 = nt.nodes.new("ShaderNodeMath"); h1.operation = "COMPARE"; h1.inputs[1].default_value = 0.64; h1.inputs[2].default_value = 0.08
            nt.links.new(hsv.outputs[0], h1.inputs[0])
            sat = rng(hsv.outputs[1], 0.3, 0.55)
            val = rng(hsv.outputs[2], 0.08, 0.2)
            m1 = nt.nodes.new("ShaderNodeMath"); m1.operation = "MULTIPLY"; nt.links.new(h1.outputs[0], m1.inputs[0]); nt.links.new(sat.outputs[0], m1.inputs[1])
            m2 = nt.nodes.new("ShaderNodeMath"); m2.operation = "MULTIPLY"; nt.links.new(m1.outputs[0], m2.inputs[0]); nt.links.new(val.outputs[0], m2.inputs[1])
            tint = nt.nodes.new("ShaderNodeMixRGB"); tint.blend_type = "MULTIPLY"; tint.inputs[0].default_value = 1; tint.name = "TEAM_TINT"
            vgain = nt.nodes.new("ShaderNodeMath"); vgain.operation = "MULTIPLY"; vgain.inputs[1].default_value = 1.6
            nt.links.new(hsv.outputs[2], vgain.inputs[0])
            nt.links.new(vgain.outputs[0], tint.inputs[1])
            mix = nt.nodes.new("ShaderNodeMixRGB"); mix.name = "TEAM_MIX"
            nt.links.new(m2.outputs[0], mix.inputs[0]); nt.links.new(src, mix.inputs[1]); nt.links.new(tint.outputs[0], mix.inputs[2])
            nt.links.new(mix.outputs[0], bsdf.inputs["Base Color"])
        nt.nodes["TEAM_TINT"].inputs[2].default_value = col

# ------------------------------------------------------------------ pose (procedural animation by vertex offsets)
def pose(phase):
    if a.anim in ("walk", "quad", "serpent", "vehicle"):
        co = []
        leg_h = height * (0.42 if a.anim == "walk" else 0.5)
        stride = max(size.x, size.y) * s * (0.1 if a.anim == "walk" else 0.08)
        bob = height * 0.02 * abs(math.sin(phase * 2 * math.pi))
        for v in base_co:
            x, y, z = v.x, v.y, v.z
            if a.anim == "walk" and z < leg_h:
                side = 1 if y > 0 else -1
                w = (1 - z / leg_h) ** 1.3
                x += math.sin((phase + (0.5 if side > 0 else 0)) * 2 * math.pi) * stride * w
                z += max(0, math.sin((phase + (0.5 if side > 0 else 0)) * 2 * math.pi)) * leg_h * 0.12 * w
            elif a.anim == "quad" and z < leg_h:
                diag = (1 if y > 0 else -1) * (1 if x > 0 else -1)
                w = (1 - z / leg_h) ** 1.2
                ph = phase + (0.5 if diag > 0 else 0)
                x += math.sin(ph * 2 * math.pi) * stride * w
                z += max(0, math.sin(ph * 2 * math.pi)) * leg_h * 0.14 * w
            elif a.anim == "serpent":
                y += math.sin(x / max(0.2, size.x * s) * 2 * math.pi * 0.8 - phase * 2 * math.pi) * size.y * s * 0.08 * (1 - z / zmax * 0.5)
            if a.anim != "vehicle":
                z += bob
            else:
                z += height * 0.012 * math.sin(phase * 4 * math.pi)
            co.extend((x, y, z))
        me.vertices.foreach_set("co", co)
        me.update()
    obj.location.z = a.air + (math.sin(phase * 2 * math.pi) * 0.06 if a.anim == "hover" else 0)
    obj.rotation_euler.x = math.sin(phase * 2 * math.pi) * 0.04 if a.anim == "hover" else 0
    for m in obj.data.materials:
        if not m or not m.use_nodes: continue
        b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b and a.anim == "pulse" and "Emission Strength" in b.inputs and b.inputs["Emission Color"].is_linked:
            b.inputs["Emission Strength"].default_value = 1.0 + 0.6 * math.sin(phase * 2 * math.pi)

# ------------------------------------------------------------------ camera + map projection
elev = math.radians(a.elev)
root = bpy.data.objects.new("Root", None); scene.collection.objects.link(root)
root.scale = (1, 1, 1)
spin = bpy.data.objects.new("Spin", None); scene.collection.objects.link(spin)
spin.parent = root
obj.parent = spin
if a.air <= 0:
    bpy.ops.mesh.primitive_plane_add(size=max(size.x, size.y) * s * 3 + 2)
    catcher = bpy.context.active_object
    catcher.is_shadow_catcher = True
    catcher.parent = root

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = "ORTHO"
cam.rotation_euler = (math.pi / 2 - elev, 0, 0)
cam.location = (0, -50 * math.cos(elev), 50 * math.sin(elev))

# cell sizing: project the model's bounding sphere for every direction
ext_w = max(size.x, size.y) * s * 1.15 + 0.3
top = (height + a.air) * math.cos(elev) + max(size.x, size.y) * s * 0.6
bottom = max(size.x, size.y) * s * 0.6 + 0.2
cell_w_t = max(ext_w, top + bottom) * 1.04
cell = int(math.ceil(cell_w_t * a.ppt / 4) * 4)
cam.data.ortho_scale = cell / a.ppt
anchor_y_px = cell / 2 + ((top - bottom) / 2) * a.ppt
cam.data.shift_y = (top - bottom) / 2 / (cell / a.ppt)
scene.render.resolution_x = scene.render.resolution_y = cell
scene.render.resolution_percentage = 100
anchor = (cell / 2, anchor_y_px)

# ------------------------------------------------------------------ render sheet
teams = [t for t in a.teams.split(",") if t] if a.kind != "resource" else ["000000"]
dirs = a.dirs if a.kind == "unit" else 1
frames = a.frames
import numpy as np
sheet = np.zeros((len(teams) * frames * cell, dirs * cell, 4), dtype=np.float32)
tmp = os.path.join(a.out, f"_{a.id}_tmp.png")
for ti, team in enumerate(teams):
    if a.kind != "resource": team_nodes(team)
    for f in range(frames):
        pose(f / frames)
        for d in range(dirs):
            ang = d / dirs * 2 * math.pi            # game facing: 0 = +x (east), clockwise on screen
            spin.rotation_euler = (0, 0, -ang)
            scene.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp, check_existing=False)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(cell, cell, 4)[::-1]
            bpy.data.images.remove(img)
            r0 = (ti * frames + f) * cell
            sheet[r0:r0 + cell, d * cell:(d + 1) * cell] = px

def save(arr, path):
    h, w = arr.shape[:2]
    im = bpy.data.images.new("sheet", width=w, height=h, alpha=True)
    im.pixels.foreach_set(arr[::-1].ravel())
    im.filepath_raw = path; im.file_format = "PNG"; im.save()
    bpy.data.images.remove(im)

save(sheet, os.path.join(a.out, f"{a.id}.png"))

# turntable portrait (24 frames, 128 px), first team colour
if a.kind != "resource":
    team_nodes(teams[0])
    pose(0)
    scene.render.resolution_x = scene.render.resolution_y = 128
    cam.data.shift_y = 0
    cam.rotation_euler = (math.radians(70), 0, 0)
    cam.location = (0, -50 * math.cos(math.radians(20)), 50 * math.sin(math.radians(20)) + (height + a.air) / 2)
    cam.data.ortho_scale = max(max(size.x, size.y) * s * 1.2, (height + a.air) * 1.25) * 1.05
    root.scale = (1, 1, 1)
    turn = np.zeros((128, 24 * 128, 4), dtype=np.float32)
    for i in range(24):
        spin.rotation_euler = (0, 0, i / 24 * 2 * math.pi + math.pi * 0.75)
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(tmp, check_existing=False)
        turn[:, i * 128:(i + 1) * 128] = np.array(img.pixels[:], dtype=np.float32).reshape(128, 128, 4)[::-1]
        bpy.data.images.remove(img)
    save(turn, os.path.join(a.out, f"{a.id}_turn.png"))
if os.path.exists(tmp): os.remove(tmp)

meta = {"id": a.id, "cell": cell, "anchor": anchor, "ppt": a.ppt, "dirs": dirs, "frames": frames, "teams": teams,
        "height": round(height, 3), "air": a.air, "anim": a.anim, "fit": a.fit, "secs": round(time.time() - T0, 1)}
json.dump(meta, open(os.path.join(a.out, f"{a.id}.json"), "w"))
print("SPRITE_DONE", json.dumps(meta))
