#!/usr/bin/env python3
"""Render every generated GLB into game sprite sheets with Blender (parallel), then write the manifest.

    python render_all.py [--only id1,id2] [--jobs 3] [--yaw 0]
Reads out/trellis/glb/*.glb, writes ../public/sprites/<id>.png|json and manifest.json.
"""
import argparse, json, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
GLB = HERE / "out" / "trellis" / "glb"
OUT = HERE.parent / "public" / "sprites"
SCRIPT = HERE / "blender" / "render_sprites.py"

# game collision radius (tiles) -> visual footprint; anim type; hover altitude
UNITS = {
    "rigger": (0.375, "walk", 0), "trooper": (0.375, "walk", 0), "breacher": (0.5625, "walk", 0), "mender": (0.4, "walk", 0),
    "scorcher": (0.5, "vehicle", 0), "juggernaut": (0.875, "vehicle", 0), "juggernaut_sieged": (0.875, "none", 0),
    "wasp": (0.625, "hover", 1.1), "dreadnought": (1.25, "hover", 1.5), "titan": (1.3, "walk", 0),
    "grub": (0.375, "quad", 0), "drover": (0.9, "hover", 1.3), "skitterling": (0.35, "quad", 0), "carapid": (0.625, "quad", 0),
    "quillback": (0.625, "serpent", 0), "wyvern": (0.6, "hover", 1.2), "behemoth": (1.0, "quad", 0), "matron": (0.6, "quad", 0),
    "gravemaw": (1.3, "hover", 1.7),
    "acolyte": (0.375, "hover", 0.45), "vindicator": (0.5, "walk", 0), "seeker": (0.625, "quad", 0), "bulwark": (0.75, "quad", 0),
    "strider": (1.0, "quad", 0), "radiant": (0.9, "hover", 1.2), "empyrean": (1.4, "hover", 1.6), "hierophant": (1.2, "walk", 0),
}
BUILD5 = {"bastion", "citadel", "stronghold", "nest", "sanctum", "throne", "core", "radiantcore", "exaltedcore"}
BUILD2 = {"habitat", "turret", "thorn", "obelisk", "spire"}


def spec(aid):
    if aid in UNITS:
        r, anim, air = UNITS[aid]
        frames = 1 if anim == "none" else (2 if anim == "vehicle" else 4)
        return ["--kind", "unit", "--fit", str(round(r * 2 * 1.35, 3)), "--anim", anim, "--air", str(air), "--frames", str(frames), "--dirs", "16"]
    if aid == "mineral":
        return ["--kind", "resource", "--fit", "2.1", "--depth", "1.3", "--frames", "1", "--dirs", "1"]
    if aid == "geyser":
        return ["--kind", "resource", "--fit", "3.1", "--frames", "1", "--dirs", "1"]
    size = 5 if aid in BUILD5 else 2 if aid in BUILD2 else 3
    return ["--kind", "building", "--fit", str(size * 0.98), "--anim", "pulse", "--frames", "2", "--dirs", "1"]


def render(aid, yaw, samples):
    glb = GLB / f"{aid}.glb"
    cmd = ["blender", "-b", "-P", str(SCRIPT), "--", "--glb", str(glb), "--id", aid, "--out", str(OUT), "--yaw", str(yaw), "--samples", str(samples), *spec(aid)]
    t = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True)
    ok = "SPRITE_DONE" in r.stdout
    print(f"{'ok ' if ok else 'ERR'} {aid:18s} {time.time() - t:6.1f}s", flush=True)
    if not ok:
        print((r.stdout + r.stderr)[-1500:])
    return aid, ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--yaw", type=float, default=0)
    ap.add_argument("--samples", type=int, default=24)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ids = sorted(p.stem for p in GLB.glob("*.glb"))
    if a.only:
        ids = [i for i in ids if i in a.only.split(",")]
    with ThreadPoolExecutor(a.jobs) as ex:
        results = list(ex.map(lambda i: render(i, a.yaw, a.samples), ids))
    manifest = {}
    for p in sorted(OUT.glob("*.json")):
        if p.name == "manifest.json": continue
        manifest[p.stem] = json.loads(p.read_text())
    (OUT / "manifest.json").write_text(json.dumps(manifest))
    print(f"manifest: {len(manifest)} sheets; failed: {[i for i, ok in results if not ok]}")


if __name__ == "__main__":
    main()
