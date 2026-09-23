"""Blender 5.x: auto-rig + animate an AI-generated GLB, export a rigged GLB, render game sprite sheets.

blender -b -P rig_render.py -- --glb in.glb --id trooper --kind unit --fit 1.0 --gait biped \
    --yaw 90 --out-glb ../public/models/trooper.glb --out-sprites ../public/sprites

gait: biped | quad | hexa | serpent | vehicle | hover | flyer (hover + wing flap) | static | building
Animations exported (glTF animations): Idle, Walk (or Move), Attack. Sprite sheet rows = team x walk frames.
Shading: base colour texture also drives emission, so the concept art's baked lighting is preserved 1:1,
with real lights on top for form and cast shadows.
"""
import bpy, sys, os, json, math, argparse, time
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--glb", required=True); ap.add_argument("--id", required=True)
ap.add_argument("--kind", default="unit"); ap.add_argument("--gait", default="static")
ap.add_argument("--fit", type=float, default=1.0); ap.add_argument("--depth", type=float, default=0)
ap.add_argument("--yaw", type=float, default=0); ap.add_argument("--air", type=float, default=0)
ap.add_argument("--dirs", type=int, default=16); ap.add_argument("--frames", type=int, default=6)
ap.add_argument("--teams", default="3d9bff,ff4d4d"); ap.add_argument("--ppt", type=float, default=48)
ap.add_argument("--samples", type=int, default=32); ap.add_argument("--elev", type=float, default=48)
ap.add_argument("--emit", type=float, default=0.55)
ap.add_argument("--out-glb", default=""); ap.add_argument("--out-sprites", default="")
ap.add_argument("--no-sprites", action="store_true")
a = ap.parse_args(argv)
for k in ("glb", "out_glb", "out_sprites"):
    if getattr(a, k): setattr(a, k, os.path.abspath(getattr(a, k)))
T0 = time.time()

# ================================================================== scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = dev; prefs.get_devices()
        if any(d.type == dev for d in prefs.devices):
            for d in prefs.devices: d.use = d.type == dev
            scene.cycles.device = "GPU"; break
    except Exception: pass
scene.cycles.samples = a.samples
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"
try:
    scene.view_settings.view_transform = "Standard"   # no filmic curve: keep the concept's colours as painted
    scene.view_settings.look = "None"
except Exception: pass
world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
wn, wl = world.node_tree.nodes, world.node_tree.links
bg = wn.get("Background") or wn.new("ShaderNodeBackground")
hdri_dir = os.path.join(os.path.dirname(bpy.app.binary_path), f"{bpy.app.version[0]}.{bpy.app.version[1]}", "datafiles", "studiolights", "world")
hdri = next((os.path.join(hdri_dir, f) for f in ("city.exr", "courtyard.exr", "forest.exr") if os.path.exists(os.path.join(hdri_dir, f))), None)
if hdri:
    env = wn.new("ShaderNodeTexEnvironment"); env.image = bpy.data.images.load(hdri); wl.new(env.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 0.45
out_node = wn.get("World Output") or wn.new("ShaderNodeOutputWorld"); wl.new(bg.outputs["Background"], out_node.inputs["Surface"])
def sun(name, energy, rot, color=(1, 1, 1), shadow=True):
    o = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN")); o.data.energy = energy; o.data.color = color
    o.data.angle = math.radians(5); o.data.use_shadow = shadow; o.rotation_euler = rot; scene.collection.objects.link(o); return o
sun("Key", 2.4, (math.radians(40), math.radians(-28), math.radians(-35)))
sun("Rim", 1.6, (math.radians(-55), 0, 0), (0.65, 0.8, 1.0), False)

# ================================================================== import + normalise
bpy.ops.import_scene.gltf(filepath=a.glb)
meshes = [o for o in scene.objects if o.type == "MESH"]
for o in scene.objects: o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
# ---- remove reconstruction floaters: small detached fragments around the model
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
parts = [o for o in scene.objects if o.type == "MESH"]
def diag(o):
    b = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return (Vector((max(v.x for v in b), max(v.y for v in b), max(v.z for v in b))) - Vector((min(v.x for v in b), min(v.y for v in b), min(v.z for v in b)))).length
big = max(parts, key=lambda o: len(o.data.vertices))
nbig, dbig = len(big.data.vertices), diag(big)
removed = 0
for o in parts:
    if o is big: continue
    if len(o.data.vertices) < 0.02 * nbig and diag(o) < 0.15 * dbig:
        bpy.data.objects.remove(o); removed += 1
parts = [o for o in scene.objects if o.type == "MESH"]
for o in scene.objects: o.select_set(o in parts)
bpy.context.view_layer.objects.active = big
if len(parts) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
print("FLOATERS_REMOVED", removed)
for o in list(scene.objects):
    if o.type in ("EMPTY", "ARMATURE") and o != obj: bpy.data.objects.remove(o)
obj.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
co = np.empty(len(obj.data.vertices) * 3, dtype=np.float32); obj.data.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
co = (np.array(obj.matrix_world)[:3, :3] @ co.T).T + np.array(obj.matrix_world)[:3, 3]   # bake any leftover object transform
obj.matrix_world = np.eye(4).tolist() and __import__("mathutils").Matrix.Identity(4)
yr = math.radians(a.yaw); cy, sy = math.cos(yr), math.sin(yr)
co = np.stack([co[:, 0] * cy - co[:, 1] * sy, co[:, 0] * sy + co[:, 1] * cy, co[:, 2]], 1).astype(np.float32)
mn, mx = co.min(0), co.max(0); size = mx - mn
if a.kind == "resource" and a.depth: s = min(a.fit / size[0], a.depth / size[1])
else: s = a.fit / max(size[0], size[1])
co = (co - np.array([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]])) * s
obj.data.vertices.foreach_set("co", co.ravel()); obj.data.update()
H = float(co[:, 2].max()); L = float(co[:, 0].max() - co[:, 0].min()); W = float(co[:, 1].max() - co[:, 1].min())
for p in obj.data.polygons: p.use_smooth = True

# ================================================================== concept-faithful material
TEAM_READY = False
EXPORT_LINKS = []   # (node_tree, bsdf, original texture socket, team mix socket)
for m in obj.data.materials:
    if not m or not m.use_nodes: continue
    nt = m.node_tree
    b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not b: continue
    if not b.inputs["Metallic"].is_linked: b.inputs["Metallic"].default_value = 0.25
    if not b.inputs["Roughness"].is_linked: b.inputs["Roughness"].default_value = 0.55
    link = next((l for l in nt.links if l.to_socket == b.inputs["Base Color"]), None)
    if not link: continue
    src = link.from_socket
    # team colour key: saturated blue panels -> team colour (value preserved)
    hsv = nt.nodes.new("ShaderNodeSeparateColor"); hsv.mode = "HSV"; nt.links.new(src, hsv.inputs[0])
    hue = nt.nodes.new("ShaderNodeMath"); hue.operation = "COMPARE"; hue.inputs[1].default_value = 0.63; hue.inputs[2].default_value = 0.075; nt.links.new(hsv.outputs[0], hue.inputs[0])
    def ramp(inp, lo, hi):
        r = nt.nodes.new("ShaderNodeMapRange"); r.inputs["From Min"].default_value = lo; r.inputs["From Max"].default_value = hi; nt.links.new(inp, r.inputs["Value"]); return r.outputs[0]
    m1 = nt.nodes.new("ShaderNodeMath"); m1.operation = "MULTIPLY"; nt.links.new(hue.outputs[0], m1.inputs[0]); nt.links.new(ramp(hsv.outputs[1], 0.35, 0.6), m1.inputs[1])
    m2 = nt.nodes.new("ShaderNodeMath"); m2.operation = "MULTIPLY"; nt.links.new(m1.outputs[0], m2.inputs[0]); nt.links.new(ramp(hsv.outputs[2], 0.1, 0.25), m2.inputs[1])
    tint = nt.nodes.new("ShaderNodeMixRGB"); tint.blend_type = "MULTIPLY"; tint.inputs[0].default_value = 1; tint.name = "TEAM_TINT"
    vg = nt.nodes.new("ShaderNodeMath"); vg.operation = "MULTIPLY"; vg.inputs[1].default_value = 1.5; nt.links.new(hsv.outputs[2], vg.inputs[0]); nt.links.new(vg.outputs[0], tint.inputs[1])
    mix = nt.nodes.new("ShaderNodeMixRGB"); mix.name = "TEAM_MIX"; nt.links.new(m2.outputs[0], mix.inputs[0]); nt.links.new(src, mix.inputs[1]); nt.links.new(tint.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], b.inputs["Base Color"])
    EXPORT_LINKS.append((nt, b, src, mix.outputs[0]))
    # emission from the same texture: keeps the concept's painted light and shadow
    nt.links.new(mix.outputs[0], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = a.emit
    TEAM_READY = True

def set_team(hexcol):
    col = tuple(int(hexcol[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)
    for m in obj.data.materials:
        if m and m.use_nodes and "TEAM_TINT" in m.node_tree.nodes: m.node_tree.nodes["TEAM_TINT"].inputs[2].default_value = col

# ================================================================== auto-rig
arm = None; ACTIONS = {}
def components(mask_xy, res):
    """Connected components of occupied grid cells (4-neighbour flood fill)."""
    cells = {}
    for (x, y) in mask_xy: cells[(x, y)] = -1
    comps = []
    for k in list(cells):
        if cells[k] != -1: continue
        stack = [k]; cells[k] = len(comps); pts = [k]
        while stack:
            cx, cy = stack.pop()
            for n in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1), (cx + 1, cy + 1), (cx - 1, cy - 1), (cx + 1, cy - 1), (cx - 1, cy + 1)):
                if n in cells and cells[n] == -1: cells[n] = len(comps); stack.append(n); pts.append(n)
        comps.append(pts)
    return comps

bones = {}  # name -> (head, tail)
legs = []
if a.gait in ("biped", "quad", "hexa"):
    band = co[co[:, 2] < H * (0.18 if a.gait != "biped" else 0.22)]
    res = max(L, W) / 48
    grid = {(int(math.floor(p[0] / res)), int(math.floor(p[1] / res))) for p in band}
    comps = [c for c in components(grid, res) if len(c) >= 3]
    comps.sort(key=len, reverse=True)
    want = {"biped": 2, "quad": 4, "hexa": 6}[a.gait]
    comps = comps[:want]
    for c in comps:
        pts = np.array(c, dtype=np.float32) * res + res / 2
        legs.append((float(pts[:, 0].mean()), float(pts[:, 1].mean())))
    if len(legs) < 2:  # no separable feet: synthesise a stance from the footprint
        n = want
        for i in range(n):
            if a.gait == "biped": legs.append((0.0, (-1 if i == 0 else 1) * W * 0.18))
            else: legs.append(((i // 2) / max(1, n // 2 - 1) * L * 0.6 - L * 0.3 if n > 2 else 0.0, (-1 if i % 2 == 0 else 1) * W * 0.3))
legTop = H * (0.48 if a.gait == "biped" else 0.4)
bodyLow = legTop * 0.85 if legs else H * 0.15
bones["root"] = ((0, 0, 0), (0, 0, H * 0.12))
bones["body"] = ((0, 0, bodyLow), (0, 0, H * 0.85))
front = co[co[:, 0] > co[:, 0].max() - L * 0.3]
if len(front) > 20 and a.gait not in ("vehicle", "static", "building"):
    hz = float(np.percentile(front[:, 2], 70)); hx = float(front[:, 0].mean())
    bones["head"] = ((hx * 0.4, 0, hz), (hx + L * 0.12, 0, hz))
for i, (lx, ly) in enumerate(legs):
    bones[f"leg{i}_up"] = ((lx, ly, legTop), (lx, ly, legTop * 0.5))
    bones[f"leg{i}_lo"] = ((lx, ly, legTop * 0.5), (lx, ly, 0.001))
if a.gait == "flyer":
    for side, nm in ((1, "wingL"), (-1, "wingR")):
        bones[nm] = ((0, side * W * 0.12, H * 0.5), (0, side * W * 0.5, H * 0.5))

if a.kind == "unit" or a.gait == "building":
    arm_data = bpy.data.armatures.new("Rig"); arm = bpy.data.objects.new("Rig", arm_data); scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for nm, (h, t) in bones.items():
        eb = arm_data.edit_bones.new(nm); eb.head = h; eb.tail = t; eb.roll = 0
    for nm in bones:
        if nm != "root": arm_data.edit_bones[nm].parent = arm_data.edit_bones["root" if not nm.startswith("leg") or nm.endswith("_up") else nm.replace("_lo", "_up")]
    if "head" in bones: arm_data.edit_bones["head"].parent = arm_data.edit_bones["body"]
    for nm in bones:
        if nm.startswith("wing"): arm_data.edit_bones[nm].parent = arm_data.edit_bones["body"]
    bpy.ops.object.mode_set(mode="OBJECT")
    # ---- smooth distance-based skin weights (robust on any mesh)
    names = [n for n in bones if n != "root"]
    segs = np.array([[bones[n][0], bones[n][1]] for n in names], dtype=np.float32)
    A, B = segs[:, 0], segs[:, 1]
    AB = B - A
    t = np.clip(np.einsum("vbk,bk->vb", co[:, None, :] - A[None], AB) / np.maximum(1e-6, (AB * AB).sum(1))[None], 0, 1)
    closest = A[None] + t[..., None] * AB[None]
    d = np.linalg.norm(co[:, None, :] - closest, axis=2)
    sigma = max(L, W, H) * 0.12
    w = np.exp(-(d / sigma) ** 2)
    isleg = np.array([n.startswith("leg") for n in names])
    low = co[:, 2] < legTop
    if isleg.any():
        w[np.ix_(~low, isleg)] *= 0.02
        w[np.ix_(low, ~isleg)] *= 0.25
    w /= np.maximum(1e-8, w.sum(1, keepdims=True))
    top = np.argsort(-w, axis=1)[:, :3]
    for bi, nm in enumerate(names):
        vg = obj.vertex_groups.new(name=nm)
        sel = np.where((top == bi).any(1))[0]
        q = np.round(w[sel, bi] * 20) / 20
        for val in np.unique(q):
            if val <= 0: continue
            vg.add(sel[q == val].tolist(), float(val), "REPLACE")
    obj.vertex_groups.new(name="root")
    mod = obj.modifiers.new("Armature", "ARMATURE"); mod.object = arm
    obj.parent = arm

    # ---- keyframed actions
    arm.animation_data_create()
    FPS = 24; scene.render.fps = FPS
    def pb(n): p = arm.pose.bones[n]; p.rotation_mode = "XYZ"; return p
    def make(name, length, fn):
        act = bpy.data.actions.new(name); arm.animation_data.action = act
        for f in range(0, length + 1, 2):
            ph = f / length
            for p in arm.pose.bones: p.rotation_mode = "XYZ"; p.rotation_euler = (0, 0, 0); p.location = (0, 0, 0); p.scale = (1, 1, 1)
            fn(ph)
            for p in arm.pose.bones:
                p.keyframe_insert("rotation_euler", frame=f); p.keyframe_insert("location", frame=f); p.keyframe_insert("scale", frame=f)
        tr = arm.animation_data.nla_tracks.new(); tr.name = name
        tr.strips.new(name, 0, act); tr.mute = True
        arm.animation_data.action = None
        ACTIONS[name] = (act, length)
    S = lambda p: math.sin(p * 2 * math.pi)
    def idle(p):
        pb("body").scale = (1, 1 + 0.015 * S(p), 1)
        pb("body").rotation_euler = (0.02 * S(p), 0, 0)
        if "head" in bones: pb("head").rotation_euler = (0, 0.12 * S(p * 1), 0.05 * S(p * 2))
        if a.gait in ("hover", "flyer"): pb("root").location = (0, 0.05 * H * S(p), 0)
        if a.gait == "flyer": pb("wingL").rotation_euler = (0.15 * S(p), 0, 0); pb("wingR").rotation_euler = (-0.15 * S(p), 0, 0)
    def walk(p):
        n = len(legs)
        for i in range(n):
            if a.gait == "biped": ph = p + (0.5 if i % 2 else 0)
            elif a.gait == "quad": ph = p + (0.5 if (i % 2) ^ ((i // 2) % 2) else 0)
            else: ph = p + (0.5 if (i % 2) ^ ((i // 2) % 2) else 0)
            swing = 0.45 if a.gait == "biped" else 0.35
            pb(f"leg{i}_up").rotation_euler = (0, 0, swing * S(ph))
            pb(f"leg{i}_lo").rotation_euler = (0, 0, -max(0, S(ph + 0.25)) * swing * 1.3)
        bob = abs(S(p)) if a.gait == "biped" else abs(S(p * 2))
        pb("body").location = (0, 0.03 * H * bob, 0)
        pb("body").rotation_euler = (0.04 * S(p), 0, 0)
        if "head" in bones: pb("head").rotation_euler = (0, 0.05 * S(p * 2), 0)
        if a.gait == "serpent": pb("body").rotation_euler = (0, 0.25 * S(p), 0)
        if a.gait == "vehicle": pb("body").location = (0, 0.012 * H * S(p * 4), 0); pb("body").rotation_euler = (0, 0, 0.02 * S(p * 2))
        if a.gait in ("hover", "flyer"): pb("root").location = (0, 0.06 * H * S(p), 0); pb("body").rotation_euler = (0.05 * S(p), 0, 0.04 * S(p))
        if a.gait == "flyer": pb("wingL").rotation_euler = (0.55 * S(p), 0, 0); pb("wingR").rotation_euler = (-0.55 * S(p), 0, 0)
    def attack(p):
        k = math.sin(min(1, p * 2.5) * math.pi) if p < 0.4 else 0
        pb("body").rotation_euler = (0, 0, -0.18 * k)          # lunge / recoil forward
        pb("body").location = (0, -0.02 * H * k, 0)
        if "head" in bones: pb("head").rotation_euler = (0, 0, -0.35 * k)
        if a.gait == "flyer": pb("wingL").rotation_euler = (0.8 * k, 0, 0); pb("wingR").rotation_euler = (-0.8 * k, 0, 0)
        if a.gait in ("hover", "flyer"): pb("root").location = (0, 0.03 * H * S(p), 0)
    make("Idle", 48, idle)
    make("Walk", 24, walk)
    make("Attack", 20, attack)

# ================================================================== export rigged GLB
def export_wiring(direct):
    # glTF only understands image -> BSDF links; wire the texture straight in for export, team graph for renders
    for nt, b, tex, mix in EXPORT_LINKS:
        s_ = tex if direct else mix
        nt.links.new(s_, b.inputs["Base Color"]); nt.links.new(s_, b.inputs["Emission Color"])
if a.out_glb:
    export_wiring(True)
    os.makedirs(os.path.dirname(a.out_glb), exist_ok=True)
    for o in scene.objects: o.select_set(o == obj or o == arm)
    kw = dict(filepath=a.out_glb, export_format="GLB", use_selection=True, export_apply=False, export_yup=True)
    if arm: kw.update(export_animations=True, export_skins=True, export_animation_mode="NLA_TRACKS")
    try: bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop("export_animation_mode", None); bpy.ops.export_scene.gltf(**kw)
    export_wiring(False)
    print("GLB_DONE", a.out_glb)

if a.no_sprites or not a.out_sprites:
    print("RIG_DONE", json.dumps({"id": a.id, "legs": len(legs), "bones": list(bones), "secs": round(time.time() - T0, 1)})); sys.exit(0)

# ================================================================== render sprite sheets
os.makedirs(a.out_sprites, exist_ok=True)
elev = math.radians(a.elev)
spin = bpy.data.objects.new("Spin", None); scene.collection.objects.link(spin)
(arm or obj).parent = spin
spin.location.z = a.air
if a.air <= 0:
    bpy.ops.mesh.primitive_plane_add(size=max(L, W) * 3 + 2); c = bpy.context.active_object; c.is_shadow_catcher = True
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); scene.collection.objects.link(cam); scene.camera = cam
cam.data.type = "ORTHO"; cam.rotation_euler = (math.pi / 2 - elev, 0, 0); cam.location = (0, -50 * math.cos(elev), 50 * math.sin(elev))
ext = max(L, W)
top = (H + a.air) * math.cos(elev) + ext * 0.62; bottom = ext * 0.62 + 0.2
cell = int(math.ceil(max(ext * 1.2 + 0.3, top + bottom) * 1.04 * a.ppt / 4) * 4)
cam.data.ortho_scale = cell / a.ppt; cam.data.shift_y = (top - bottom) / 2 / (cell / a.ppt)
scene.render.resolution_x = scene.render.resolution_y = cell
anchor = (cell / 2, cell / 2 + (top - bottom) / 2 * a.ppt)
teams = [t for t in a.teams.split(",") if t] if a.kind != "resource" else ["000000"]
dirs = a.dirs if a.kind == "unit" else 1
move_act = "Walk"
frames = a.frames if (arm and a.kind == "unit" and a.gait not in ("static",)) else (2 if a.kind == "building" else 1)
def pose(fi):
    if not arm: return
    if a.kind == "unit" and frames > 1:
        act, ln = ACTIONS[move_act]; arm.animation_data.action = act; scene.frame_set(int(round(fi / frames * ln)))
    else:
        act, ln = ACTIONS["Idle"]; arm.animation_data.action = act; scene.frame_set(int(round(fi / max(1, frames) * ln)))
sheet = np.zeros((len(teams) * frames * cell, dirs * cell, 4), dtype=np.float32)
tmp = os.path.join(a.out_sprites, f"_{a.id}_tmp.png")
def shot():
    scene.render.filepath = tmp; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(tmp, check_existing=False); px = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[::-1]; bpy.data.images.remove(im); return px
for ti, team in enumerate(teams):
    if a.kind != "resource": set_team(team)
    for f in range(frames):
        pose(f)
        for d in range(dirs):
            spin.rotation_euler = (0, 0, -d / dirs * 2 * math.pi)
            r0 = (ti * frames + f) * cell
            sheet[r0:r0 + cell, d * cell:(d + 1) * cell] = shot()
def save(arr, path):
    h, w = arr.shape[:2]; im = bpy.data.images.new("s", width=w, height=h, alpha=True)
    im.pixels.foreach_set(arr[::-1].ravel()); im.filepath_raw = path; im.file_format = "PNG"; im.save(); bpy.data.images.remove(im)
save(sheet, os.path.join(a.out_sprites, f"{a.id}.png"))
if a.kind != "resource":
    set_team(teams[0]); pose(0)
    scene.render.resolution_x = scene.render.resolution_y = 128
    cam.data.shift_y = 0; cam.rotation_euler = (math.radians(70), 0, 0)
    cam.location = (0, -50 * math.cos(math.radians(20)), 50 * math.sin(math.radians(20)) + (H + a.air) / 2)
    cam.data.ortho_scale = max(ext * 1.2, (H + a.air) * 1.25) * 1.05
    turn = np.zeros((128, 24 * 128, 4), dtype=np.float32)
    for i in range(24):
        spin.rotation_euler = (0, 0, i / 24 * 2 * math.pi + math.pi * 0.75)
        turn[:, i * 128:(i + 1) * 128] = shot()
    save(turn, os.path.join(a.out_sprites, f"{a.id}_turn.png"))
if os.path.exists(tmp): os.remove(tmp)
meta = {"id": a.id, "cell": cell, "anchor": anchor, "ppt": a.ppt, "dirs": dirs, "frames": frames, "teams": teams, "height": round(H, 3), "air": a.air, "anim": a.gait, "fit": a.fit, "legs": len(legs), "secs": round(time.time() - T0, 1)}
json.dump(meta, open(os.path.join(a.out_sprites, f"{a.id}.json"), "w"))
print("SPRITE_DONE", json.dumps(meta))
